import axios from "axios";
import pool from "./db.js";

export const getUserAndTokens = async (userEmail) => {
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

  const userId = userResult.rows[0].id;
  const tokenResult = await pool.query(
    "SELECT access_token, refresh_token FROM tokens WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
    [userId],
  );

  if (tokenResult.rows.length === 0) {
    throw new Error("Access token is missing or expired");
  }

  return {
    ...userResult.rows[0],
    ...tokenResult.rows[0],
  };
};

export const refreshAccessToken = async (userId, oldRefreshToken) => {
  try {
    const response = await axios.post("https://zoom.us/oauth/token", null, {
      params: {
        grant_type: "refresh_token",
        refresh_token: oldRefreshToken,
      },
      auth: {
        username: process.env.CLIENT_ID,
        password: process.env.CLIENT_SECRET,
      },
    });

    const { access_token, refresh_token } = response.data;

    await pool.query(
      "INSERT INTO tokens (user_id, access_token, refresh_token) VALUES ($1, $2, $3)",
      [userId, access_token, refresh_token],
    );

    return response.data;
  } catch (error) {
    console.error(
      "Error refreshing access token:",
      error.response?.data || error.message,
    );
    throw new Error("Failed to refresh access token");
  }
};

export const makeZoomRequest = async (url, userEmail, options = {}) => {
  try {
    const userData = await getUserAndTokens(userEmail);
    const { access_token, refresh_token, id: userId } = userData;

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
        ...options,
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        const newTokens = await refreshAccessToken(userId, refresh_token);
        const retryResponse = await axios.get(url, {
          headers: {
            Authorization: `Bearer ${newTokens.access_token}`,
          },
          ...options,
        });
        return retryResponse.data;
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error making Zoom request to ${url}:`, error);
    throw error;
  }
};
