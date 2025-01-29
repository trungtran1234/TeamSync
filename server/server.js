import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import pool from "./db.js";
import {
  getUserAndTokens,
  refreshAccessToken,
  makeZoomRequest,
} from "./zoomAPI.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(cors());
const PORT = 8080;

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
    const meResponse = await axios.get("https://api.zoom.us/v2/users/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const { id: zoomUserId, email, pmi } = meResponse.data;
    let userId;

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE zoomid = $1",
      [zoomUserId],
    );

    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
      await pool.query("UPDATE users SET email = $1, pmi = $2 WHERE id = $3", [
        email,
        pmi,
        userId,
      ]);
    } else {
      const newUser = await pool.query(
        "INSERT INTO users (email, zoomid, pmi) VALUES ($1, $2, $3) RETURNING id",
        [email, zoomUserId, pmi],
      );
      userId = newUser.rows[0].id;
    }

    await pool.query(
      "INSERT INTO tokens (user_id, access_token, refresh_token) VALUES ($1, $2, $3)",
      [userId, access_token, refresh_token],
    );

    res.redirect("http://localhost:5173/dashboard");
  } catch (error) {
    console.error(
      "Error in OAuth callback:",
      error.response?.data || error.message,
    );
    res.status(500).send({ error: "OAuth process failed." });
  }
});

app.get("/meetings", async (req, res) => {
  try {
    const userData = await getUserAndTokens(req.query.email);
    const url = `https://api.zoom.us/v2/users/${userData.zoomid}/meetings?type=previous`;
    const data = await makeZoomRequest(url, req.query.email);
    res.send(data);
  } catch (error) {
    res.status(error.status || 500).send({ error: error.message });
  }
});

app.get("/meeting/:id/summary", async (req, res) => {
  try {
    const url = `https://api.zoom.us/v2/meetings/${req.params.id}/meeting_summary`;
    const data = await makeZoomRequest(url, req.query.email);
    res.send(data);
  } catch (error) {
    res.status(error.status || 500).send({ error: error.message });
  }
});

app.get("/meeting/:id/recordings", async (req, res) => {
  try {
    const url = `https://api.zoom.us/v2/meetings/${req.params.id}/recordings`;
    const data = await makeZoomRequest(url, req.query.email);
    res.send(data);
  } catch (error) {
    res.status(error.status || 500).send({ error: error.message });
  }
});

app.get("/meeting/:id/participants", async (req, res) => {
  try {
    const url = `https://api.zoom.us/v2/report/meetings/${req.params.id}/participants`;
    const data = await makeZoomRequest(url, req.query.email);
    res.send(data);
  } catch (error) {
    res.status(error.status || 500).send({ error: error.message });
  }
});

app.get("/recordings", async (req, res) => {
  try {
    const userData = await getUserAndTokens(req.query.email);
    const url = `https://api.zoom.us/v2/users/${userData.zoomid}/recordings?from=2023-01-01&to=2025-01-26`;
    const data = await makeZoomRequest(url, req.query.email);
    res.send(data);
  } catch (error) {
    res.status(error.status || 500).send({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
