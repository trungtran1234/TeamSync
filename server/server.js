import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

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

        // TODO: Use the tokens securely in database or something idk
        res.send({
            message: 'OAuth flow completed successfully',
            access_token,
            refresh_token,
        });

    } catch (error) {
        console.error('Error exchanging authorization code for tokens:', error.response.data || error.message);
        res.status(500).send({ error: 'OAuth process failed.' });
    }
});

// Start the server
app.listen(PORT, async() => {
    console.log(`Server is running on port ${PORT}`);

});
