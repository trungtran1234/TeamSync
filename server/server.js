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
      // 1) Exchange the code for initial tokens
      const tokenResponse = await axios.post(
        'https://zoom.us/oauth/token',
        null,
        {
          params: {
            grant_type: 'authorization_code',
            code: authorizationCode,
            redirect_uri: process.env.REDIRECT_URI,
          },
          auth: {
            username: process.env.CLIENT_ID,
            password: process.env.CLIENT_SECRET,
          },
        }
      );
  
      const {
        access_token,
        refresh_token,
      } = tokenResponse.data;
  
      // 2) Use the new access token to fetch user info from Zoom
      const meResponse = await axios.get('https://api.zoom.us/v2/users/me', {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });
      const { id: zoomUserId, email, pmi } = meResponse.data;
  
      let userId;
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE zoomid = $1',
        [zoomUserId]
      );
  
      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
  
        await pool.query(
          'UPDATE users SET email = $1, pmi = $2 WHERE id = $3',
          [email, pmi, userId]
        );
      } else {
        // Insert a new user row
        const newUser = await pool.query(
          'INSERT INTO users (email, zoomid, pmi) VALUES ($1, $2, $3) RETURNING id',
          [email, zoomUserId, pmi]
        );
        userId = newUser.rows[0].id;
      }
  
      await pool.query(
        'INSERT INTO tokens (user_id, access_token, refresh_token) VALUES ($1, $2, $3)',
        [userId, access_token, refresh_token]
      );
  
      // 5) Redirect to front-end
      res.redirect('http://localhost:5173/dashboard');
    } catch (error) {
      console.error(
        'Error exchanging authorization code for tokens:',
        error.response?.data || error.message
      );
      res.status(500).send({ error: 'OAuth process failed.' });
    }
  });
  
  const refreshAccessToken = async (userId, oldRefreshToken) => {
    try {
        // Exchange the old refresh token for a new pair of tokens
        const response = await axios.post('https://zoom.us/oauth/token', null, {
            params: {
                grant_type: 'refresh_token',
                refresh_token: oldRefreshToken,
            },
            auth: {
                username: process.env.CLIENT_ID,
                password: process.env.CLIENT_SECRET,
            },
        });

        const { access_token, refresh_token } = response.data;

        await pool.query(
            'INSERT INTO tokens (user_id, access_token, refresh_token) VALUES ($1, $2, $3)',
            [userId, access_token, refresh_token]
        );

        console.log('Tokens refreshed and stored successfully.');

        return response.data; 
    } catch (error) {
        console.error('Error refreshing access token:', error.response?.data || error.message);
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
            const response = await axios.get(`https://api.zoom.us/v2/users/${zoomUserId}/meetings?type=previous`, {
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
                    [userId, newTokens.access_token, newTokens.refresh_token]
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

app.get('/meeting/:id/summary', async (req, res) => {
    const meetingId = req.params.id;
    const userEmail = req.query.email;

    if (!meetingId || !userEmail) {
        return res.status(400).send({ error: 'Meeting ID and user email are required' });
    }

    try {
        // Retrieve user information from your database
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
        if (userResult.rows.length === 0) {
            return res.status(404).send({ error: 'User not found' });
        }
        const userId = userResult.rows[0].id;

        // Retrieve the latest access and refresh tokens
        const tokenResult = await pool.query('SELECT access_token, refresh_token FROM tokens WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
        if (tokenResult.rows.length === 0) {
            return res.status(401).send({ error: 'Access token is missing or expired' });
        }
        let { access_token: accessToken, refresh_token: refreshToken } = tokenResult.rows[0];

        try {
            // Fetch meeting summary
            console.log('im in ')
            const response = await axios.get(`https://api.zoom.us/v2/meetings/${meetingId}/meeting_summary`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            console.log('response!!! ', response.data);
            res.send(response.data);
        } catch (error) {
            if (error.response && error.response.status === 401) {
                // Refresh expired token
                const newTokens = await refreshAccessToken(refreshToken);
                accessToken = newTokens.access_token;
                refreshToken = newTokens.refresh_token;

                // Save the new tokens to the database
                await pool.query(
                    'INSERT INTO tokens (user_id, access_token, refresh_token) VALUES ($1, $2, $3)',
                    [userId, accessToken, refreshToken]
                );

                // Retry fetching meeting summary with the new access token
                const response = await axios.get(`https://api.zoom.us/v2/meetings/${meetingId}/meeting_summary`, {
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
        console.error('Error fetching meeting summary:', error.response || error.message);
        res.status(500).send({ error: 'Failed to fetch meeting summary' });
    }
});



app.get('/meeting/:id/recordings', async (req, res) => {
    const meetingId = req.params.id;
    const userEmail = req.query.email;

    if (!meetingId || !userEmail) {
        return res.status(400).send({ error: 'Meeting ID and user email are required' });
    }

    try {
        // Retrieve user information from your database
        const userResult = await pool.query('SELECT id, zoomid FROM users WHERE email = $1', [userEmail]);
        if (userResult.rows.length === 0) {
            return res.status(404).send({ error: 'User not found' });
        }
        const userId = userResult.rows[0].id;

        // Retrieve the latest access and refresh tokens
        const tokenResult = await pool.query('SELECT access_token, refresh_token FROM tokens WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
        if (tokenResult.rows.length === 0) {
            return res.status(401).send({ error: 'Access token is missing or expired' });
        }
        let { access_token: accessToken, refresh_token: refreshToken } = tokenResult.rows[0];

        try {
            // Fetch meeting recordings
            const response = await axios.get(`https://api.zoom.us/v2/meetings/${meetingId}/recordings`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            res.send(response.data);
        } catch (error) {
            if (error.response && error.response.status === 401) {
                // Refresh expired token
                const newTokens = await refreshAccessToken(refreshToken);
                accessToken = newTokens.access_token;
                refreshToken = newTokens.refresh_token;

                // Save the new tokens to the database
                await pool.query(
                    'INSERT INTO tokens (user_id, access_token, refresh_token) VALUES ($1, $2, $3)',
                    [userId, accessToken, refreshToken]
                );

                // Retry fetching meeting recordings with the new access token
                const response = await axios.get(`https://api.zoom.us/v2/meetings/${meetingId}/recordings`, {
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
        console.error('Error fetching meeting recordings:', error.response || error.message);
        res.status(500).send({ error: 'Failed to fetch meeting recordings' });
    }
});

app.get('/meeting/:id/participants', async (req, res) => {
    const meetingId = req.params.id;        
    const userEmail = req.query.email;        

    if (!meetingId || !userEmail) {
        console.log('Missing meetingId or userEmail');
        return res.status(400).send({ error: 'Meeting ID and user email are required' });
    }

    try {
        // 1. Retrieve user info from DB
        const userResult = await pool.query(
            'SELECT id, zoomid FROM users WHERE email = $1',
            [userEmail]
        );
        if (userResult.rows.length === 0) {
            console.log(`User not found for email: ${userEmail}`);
            return res.status(404).send({ error: 'User not found' });
        }
        const userId = userResult.rows[0].id;

        const tokenResult = await pool.query(
            'SELECT access_token, refresh_token FROM tokens WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
            [userId]
        );
        if (tokenResult.rows.length === 0) {
            console.log(`No tokens found for user ID: ${userId}`);
            return res.status(401).send({ error: 'Access token is missing or expired' });
        }

        let { access_token: accessToken, refresh_token: refreshToken } = tokenResult.rows[0];
        console.log(`Using access token: ${accessToken}`);

        try {
            // 3. Call Zoom API to fetch past meeting participants using meetingId
            const response = await axios.get(
                `https://api.zoom.us/v2/report/meetings/${meetingId}/participants`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );
            console.log(`Zoom API Response for meeting ${meetingId}:`, response.data);
            res.send(response.data);
        } catch (error) {
            console.error(`Error fetching participants for meeting ${meetingId}:`, error.response?.data || error.message);
            // If 401 (Unauthorized), attempt to refresh the token
            if (error.response && error.response.status === 401) {
                try {
                    const newTokens = await refreshAccessToken(userId, refreshToken);
                    console.log(`Refreshed tokens:`, newTokens);

                    // Save the new tokens to the database
                    await pool.query(
                        'INSERT INTO tokens (user_id, access_token, refresh_token) VALUES ($1, $2, $3)',
                        [userId, newTokens.access_token, newTokens.refresh_token]
                    );
                    console.log('New tokens saved to DB.');

                    // Retry with the new token
                    const retryResponse = await axios.get(
                        `https://api.zoom.us/v2/report/meetings/${meetingId}/participants`,
                        {
                            headers: {
                                Authorization: `Bearer ${newTokens.access_token}`,
                            },
                        }
                    );
                    console.log(`Zoom API Response after token refresh for meeting ${meetingId}:`, retryResponse.data);
                    res.send(retryResponse.data);
                } catch (refreshError) {
                    console.error(`Error refreshing token for user ID ${userId}:`, refreshError);
                    return res.status(500).send({
                        error: 'Failed to refresh access token',
                    });
                }
            } else {
                res.status(500).send({ error: 'Failed to fetch past meeting participants' });
            }
        }
    } catch (error) {
        console.error('Error in /meeting/:id/participants handler:', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});


app.get('/recordings', async (req, res) => {
    const userEmail = req.query.email;
    if (!userEmail) {
      return res.status(400).send({ error: 'User email is required' });
    }
  
    try {
      // 1. Find the user’s DB record
      const userResult = await pool.query('SELECT id, zoomid FROM users WHERE email = $1', [userEmail]);
      if (userResult.rows.length === 0) {
        return res.status(404).send({ error: 'User not found' });
      }
      const userId = userResult.rows[0].id;
      const zoomUserId = userResult.rows[0].zoomid;
  
      // 2. Fetch the latest tokens
      const tokenResult = await pool.query(
        'SELECT access_token, refresh_token FROM tokens WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
        [userId]
      );
      if (tokenResult.rows.length === 0) {
        return res.status(401).send({ error: 'Access token is missing or expired' });
      }
  
      let { access_token: accessToken, refresh_token: refreshToken } = tokenResult.rows[0];
  
      try {
        // 3. Call Zoom’s “List all recordings” endpoint
        //    Optionally add query params such as `?from=2023-01-01&to=2025-01-26`
        const response = await axios.get(
            `https://api.zoom.us/v2/users/${zoomUserId}/recordings?from=2023-01-01&to=2025-01-26`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
  
        // 4. Send the recordings back
        console.log('recordings response:', response.data);
        res.send(response.data);
      } catch (error) {
        // If token is expired, try refreshing
        if (error.response && error.response.status === 401) {
          const newTokens = await refreshAccessToken(refreshToken);
          accessToken = newTokens.access_token;
          refreshToken = newTokens.refresh_token;
  
          await pool.query(
            'INSERT INTO tokens (user_id, access_token, refresh_token) VALUES ($1, $2, $3)',
            [userId, accessToken, refreshToken]
          );
  
          // Retry the request
          const response = await axios.get(
            `https://api.zoom.us/v2/users/${zoomUserId}/recordings`, 
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          res.send(response.data);
        } else {
          console.error('Error fetching user recordings:', error.response || error.message);
          res.status(500).send({ error: 'Failed to fetch user recordings' });
        }
      }
    } catch (error) {
      console.error('Error in /recordings route:', error);
      res.status(500).send({ error: 'Internal server error' });
    }
  });
  

app.listen(PORT, async() => {
    console.log(`Server is running on port ${PORT}`);

});
