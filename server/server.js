import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import pool from "./db.js";

dotenv.config();

// Utility Functions
const getUserAndTokens = async (userEmail) => {
  if (!userEmail) {
    throw new Error("User email is required");
  }

  const userResult = await pool.query(
    "SELECT id, pmi, zoomid FROM users WHERE email = $1",
    [userEmail],
  );
  if (userResult.rows.length === 0) {
    throw new Error("User not found");
  }

  const tokenResult = await pool.query(
    "SELECT access_token, refresh_token FROM tokens WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
    [userResult.rows[0].id],
  );
  if (tokenResult.rows.length === 0) {
    throw new Error("Access token is missing or expired");
  }

  return {
    user: userResult.rows[0],
    tokens: tokenResult.rows[0],
  };
};

const refreshAccessToken = async (refreshToken) => {
  try {
    const response = await axios.post("https://zoom.us/oauth/token", null, {
      params: {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      },
      auth: {
        username: process.env.CLIENT_ID,
        password: process.env.CLIENT_SECRET,
      },
    });
    return response.data;
  } catch (error) {
    console.error(
      "Error refreshing access token:",
      error.response?.data || error.message,
    );
    throw new Error("Failed to refresh access token");
  }
};

const updateTokens = async (userId, accessToken, refreshToken) => {
  await pool.query(
    "INSERT INTO tokens (user_id, access_token, refresh_token) VALUES ($1, $2, $3)",
    [userId, accessToken, refreshToken],
  );
};

const makeZoomRequest = async (url, accessToken, refreshToken, userId) => {
  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      const newTokens = await refreshAccessToken(refreshToken);
      await updateTokens(
        userId,
        newTokens.access_token,
        newTokens.refresh_token,
      );

      const retryResponse = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${newTokens.access_token}`,
        },
      });
      return retryResponse.data;
    }
    throw error;
  }
};

// Express App Setup
const app = express();
app.use(bodyParser.json());
app.use(cors());
const PORT = 8080;

// Routes
app.get("/", (req, res) => {
  res.send({ message: "Welcome to the Express server!" });
});

app.get("/auth", (req, res) => {
  const authorizationUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${process.env.CLIENT_ID}&redirect_uri=${process.env.REDIRECT_URI}`;
  res.redirect(authorizationUrl);
});

app.get("/oauth/callback", async (req, res) => {
  const authorizationCode = req.query.code;

  if (!authorizationCode) {
    return res.status(400).send({ error: "Authorization code is missing" });
  }

  try {
    const tokenResponse = await axios.post(
      "https://zoom.us/oauth/token",
      null,
      {
        params: {
          grant_type: "authorization_code",
          code: authorizationCode,
          redirect_uri: process.env.REDIRECT_URI,
        },
        auth: {
          username: process.env.CLIENT_ID,
          password: process.env.CLIENT_SECRET,
        },
      },
    );

    const { access_token, refresh_token } = tokenResponse.data;
    const userProfileResponse = await axios.get(
      "https://api.zoom.us/v2/users/me",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      },
    );

    const {
      email: userEmail,
      pmi: userPMI,
      id: zoomUserId,
    } = userProfileResponse.data;

    const userResult = await pool.query(
      "INSERT INTO users (zoomid, email, pmi) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET pmi = EXCLUDED.pmi, zoomId = EXCLUDED.zoomid RETURNING id",
      [zoomUserId, userEmail, userPMI],
    );

    await updateTokens(userResult.rows[0].id, access_token, refresh_token);

    res.send({
      message: "OAuth flow completed successfully",
      access_token,
      refresh_token,
    });
  } catch (error) {
    console.error("Error in OAuth callback:", error.response || error.message);
    res.status(500).send({ error: "OAuth process failed." });
  }
});

app.get("/meetings", async (req, res) => {
  try {
    const { user, tokens } = await getUserAndTokens(req.query.email);
    const data = await makeZoomRequest(
      `https://api.zoom.us/v2/users/${user.zoomid}/meetings`,
      tokens.access_token,
      tokens.refresh_token,
      user.id,
    );
    res.send(data);
  } catch (error) {
    console.error("Error fetching meetings:", error.message);
    res
      .status(error.message.includes("required") ? 400 : 500)
      .send({ error: error.message });
  }
});

app.get("/meeting/:id/summary", async (req, res) => {
  try {
    const { user, tokens } = await getUserAndTokens(req.query.email);
    const data = await makeZoomRequest(
      `https://api.zoom.us/v2/meetings/${req.params.id}/meeting_summary`,
      tokens.access_token,
      tokens.refresh_token,
      user.id,
    );
    res.send(data);
  } catch (error) {
    console.error("Error fetching meeting summary:", error.message);
    res
      .status(error.message.includes("required") ? 400 : 500)
      .send({ error: error.message });
  }
});

app.get("/meeting/:id/recordings", async (req, res) => {
  try {
    const { user, tokens } = await getUserAndTokens(req.query.email);
    const data = await makeZoomRequest(
      `https://api.zoom.us/v2/meetings/${req.params.id}/recordings`,
      tokens.access_token,
      tokens.refresh_token,
      user.id,
    );
    res.send(data);
  } catch (error) {
    console.error("Error fetching meeting recordings:", error.message);
    res
      .status(error.message.includes("required") ? 400 : 500)
      .send({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
