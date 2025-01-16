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
        
        const userEmail = userProfileResponse.data.email;

        const userResult = await pool.query(
            'INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id',
            [userEmail]
        );
        const userId = userResult.rows[0].id;

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

// Start the server
app.listen(PORT, async() => {
    console.log(`Server is running on port ${PORT}`);

});
