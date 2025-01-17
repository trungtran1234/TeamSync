import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import pool from './db.js';

dotenv.config();

const app = express();

app.use(bodyParser.json()); 
app.use(cors()); 
const PORT = 8080;


app.get('/', (req, res) => {
    res.send({ message: 'Welcome to the Express server!' });
});

app.get('/auth', (req, res) => {
    const authorizationUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${process.env.CLIENT_ID}&redirect_uri=${process.env.REDIRECT_URI}`;
    res.redirect(authorizationUrl);
});

app.get('/oauth/callback', async (req, res) => {
    const authorizationCode = req.query.code;

    if (!authorizationCode) {
        return res.status(400).send({ error: 'Authorization code is missing' });
    }

    try {
        const tokenResponse = await axios.post('https://zoom.us/oauth/token', null, {
            params: {
                grant_type: 'authorization_code',
                code: authorizationCode,
                redirect_uri: process.env.REDIRECT_URI,
            },
            auth: {
                username: process.env.CLIENT_ID,
                password: process.env.CLIENT_SECRET,
            },
        });

        const { access_token, refresh_token } = tokenResponse.data;
        const userProfileResponse = await axios.get('https://api.zoom.us/v2/users/me', {
            headers: {
                Authorization: `Bearer ${access_token}`,
            },
        });
        console.log('user profile', userProfileResponse.data);
        const userEmail = userProfileResponse.data.email;
        const userPMI = userProfileResponse.data.pmi;
        const zoomUserId = userProfileResponse.data.id;

        const userResult = await pool.query(
            'INSERT INTO users (zoomid, email, pmi) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET pmi = EXCLUDED.pmi, zoomId = EXCLUDED.zoomid RETURNING id',
            [zoomUserId, userEmail, userPMI]
        );
        const userId = userResult.rows[0].id;
        
        //need to replace old token in the future instead of adding new one
        await pool.query(
            'INSERT INTO tokens (user_id, access_token, refresh_token) VALUES ($1, $2, $3)',
            [userId, access_token, refresh_token]
        );

        res.send({
            message: 'OAuth flow completed successfully',
            access_token,
            refresh_token,
        });

    } catch (error) {
        console.error('Error exchanging authorization code for tokens:', error.response || error.message);
        res.status(500).send({ error: 'OAuth process failed.' });
    }
});
const refreshAccessToken = async (refreshToken) => {
    try {
        const response = await axios.post('https://zoom.us/oauth/token', null, {
            params: {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            },
            auth: {
                username: process.env.CLIENT_ID,
                password: process.env.CLIENT_SECRET,
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error refreshing access token:', error.response.data || error.message);
        throw new Error('Failed to refresh access token');
    }
};
app.get('/meetings', async (req, res) => {
    const userEmail = req.query.email; 

    if (!userEmail) {
        return res.status(400).send({ error: 'User email is required' });
    }

    try {
        const userResult = await pool.query('SELECT id, pmi, zoomid FROM users WHERE email = $1', [userEmail]);
        if (userResult.rows.length === 0) {
            return res.status(404).send({ error: 'User not found' });
        }
        const userId = userResult.rows[0].id;
        const userPMI = userResult.rows[0].pmi;
        const zoomUserId = userResult.rows[0].zoomid;
        console.log('zoooo', zoomUserId);

        const tokenResult = await pool.query('SELECT access_token, refresh_token FROM tokens WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
        if (tokenResult.rows.length === 0) {
            return res.status(401).send({ error: 'Access token is missing or expired' });
        }
        let { access_token: accessToken, refresh_token: refreshToken } = tokenResult.rows[0];

        try {
            //get list of meetings
            const response = await axios.get(`https://api.zoom.us/v2/users/${zoomUserId}/meetings`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            console.log('response', response.data);
            res.send(response.data);
        } catch (error) {
            if (error.response && error.response.status === 401) {
                // refresj expired token
                const newTokens = await refreshAccessToken(refreshToken);
                accessToken = newTokens.access_token;
                refreshToken = newTokens.refresh_token;

                await pool.query(
                    'INSERT INTO tokens (user_id, access_token, refresh_token) VALUES ($1, $2, $3)',
                    [userId, accessToken, refreshToken]
                );
                
                const response = await axios.get(`https://api.zoom.us/v2/users/${zoomUserId}/recordings`, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                });
                res.send(response.data);
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Error fetching meeting instances:', error.response || error.message);
        res.status(500).send({ error: 'Failed to fetch meeting instances' });
    }
});

app.listen(PORT, async() => {
    console.log(`Server is running on port ${PORT}`);

});
