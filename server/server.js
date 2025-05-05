import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import pool from "./db.js";
import { OpenAI } from "openai";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  getUserAndTokens,
  refreshAccessToken,
  makeZoomRequest,
} from "./zoomAPI.js";
import {
  getIntegrationStatus,
  getIntegrationDetails,
  connectToPlatform,
  disconnectFromPlatform,
  syncActionItems,
  syncActionItemsToAllPlatforms
} from "./platformIntegrations.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(cors());
const PORT = 8080;

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || "us-west-2",
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

// GET list of meetings
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

// GET meeting recordings status (used by Lambda functions)
// GET meeting recordings status (used by Lambda functions)
app.get("/meeting/:id/recordings", async (req, res) => {
  try {
    const meetingId = req.params.id;
    const userEmail = req.query.email;

    if (!userEmail) {
      return res.status(400).json({ error: "Missing user email." });
    }

    // Fetch recordings from Zoom
    const recordingsUrl = `https://api.zoom.us/v2/meetings/${meetingId}/recordings`;
    const recordingsData = await makeZoomRequest(recordingsUrl, userEmail);

    // Return the recordings data
    return res.json(recordingsData);
  } catch (error) {
    console.error("Error fetching recordings data:", error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// GET meeting recording files
app.get("/meeting/:id/recordings/files", async (req, res) => {
  try {
    const url = `https://api.zoom.us/v2/meetings/${req.params.id}/recordings`;
    const data = await makeZoomRequest(url, req.query.email);
    res.send(data);
  } catch (error) {
    res.status(error.status || 500).send({ error: error.message });
  }
});

// GET meeting participants
app.get("/meeting/:id/participants", async (req, res) => {
  try {
    const url = `https://api.zoom.us/v2/past_meetings/${req.params.id}/participants`;
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

app.post("/flagged-meetings", async (req, res) => {
  const { user_id, meeting_id } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO flagged_meetings (user_id, meeting_id) VALUES ($1, $2) RETURNING *",
      [user_id, meeting_id],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error saving flagged meeting:", error);
    res.status(500).json({ error: "Failed to save flagged meeting" });
  }
});

app.delete("/flagged-meetings", async (req, res) => {
  const { user_id, meeting_id } = req.body;

  try {
    await pool.query(
      "DELETE FROM flagged_meetings WHERE user_id = $1 AND meeting_id = $2",
      [user_id, meeting_id],
    );
    res.status(200).json({ message: "Flagged meeting removed" });
  } catch (error) {
    console.error("Error removing flagged meeting:", error);
    res.status(500).json({ error: "Failed to remove flagged meeting" });
  }
});

app.get("/flagged-meetings", async (req, res) => {
  const { user_id } = req.query;

  try {
    const result = await pool.query(
      "SELECT meeting_id FROM flagged_meetings WHERE user_id = $1",
      [user_id],
    );
    const flaggedMeetings = result.rows.map((row) => row.meeting_id);
    res.status(200).json(flaggedMeetings);
  } catch (error) {
    console.error("Error fetching flagged meetings:", error);
    res.status(500).json({ error: "Failed to fetch flagged meetings" });
  }
});

// POST transcript from zoom to S3
app.post("/meeting/:id/transcript", async (req, res) => {
  try {
    const meetingId = req.params.id;
    const userEmail = req.query.email; // e.g. ?email=user@example.com
    if (!userEmail) {
      return res.status(400).json({ error: "Missing user email." });
    }

    //fetch reocording files
    const recordingsUrl = `https://api.zoom.us/v2/meetings/${meetingId}/recordings`;
    const recordingsData = await makeZoomRequest(recordingsUrl, userEmail);

    //get transcript file
    const transcriptFile = recordingsData.recording_files?.find(
      (f) =>
        f.file_type === "TRANSCRIPT" || f.recording_type === "audio_transcript",
    );

    if (!transcriptFile) {
      return res
        .status(404)
        .json({ error: "transcript file not found for this meeting." });
    }

    // make download url w access token
    const { access_token } = await getUserAndTokens(userEmail);
    const transcriptDownloadUrl = `${transcriptFile.download_url}?access_token=${access_token}`;

    // downlaod file and put it on S3
    const transcriptResponse = await axios.get(transcriptDownloadUrl, {
      responseType: "arraybuffer",
    });
    const transcriptContents = transcriptResponse.data;
    const key = `transcripts/meeting-${meetingId}.vtt`;
    const putObjectCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: transcriptContents,
      ContentType: "text/vtt",
    });

    await s3Client.send(putObjectCommand);

    return res.json({
      message: "transcript uploaded to S3 successfully",
    });
  } catch (error) {
    console.error("Error fetching/uploading transcript:", error);
    res.status(500).json({ error: "Failed to retrieve transcript." });
  }
});

// GET transcript from S3
app.get("/meeting/:id/transcript", async (req, res) => {
  try {
    const meetingId = req.params.id;

    // file key
    const s3Key = `transcripts/meeting-${meetingId}.vtt`;

    // command to get file w key
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    });

    // get file
    const data = await s3Client.send(command);

    res.setHeader("Content-Type", "text/vtt");
    data.Body.pipe(res);
  } catch (error) {
    console.error("Error retrieving transcript:", error);
    res.status(500).json({ error: "Failed to retrieve transcript" });
  }
});

// Endpoint to summarize a transcript
app.post("/summarize", async (req, res) => {
  try {
    const { transcriptText } = req.body;

    if (!transcriptText) {
      return res.status(400).json({ error: "Transcript is required" });
    }

    const prompt = `You are an AI-powered meeting assistant. Your job is to analyze the following meeting transcript and generate a professional, structured summary that follows a STRICT FORMAT. 

The summary must have these CLEARLY SEPARATED SECTIONS with the exact headings shown below:

## Key Discussion Points
[Bullet points of the most important topics discussed]

## Action Items
[List of action items formatted EXACTLY as shown in the example below]

## Decisions Made
[Bullet points of decisions reached during the meeting]

## Participant Contributions
[Bullet points of key points made by each participant]

Most importantly, the Action Items section MUST follow this EXACT format to ensure they can be automatically parsed and synced to external task management systems:

## Action Items
1. **Task Title:** [Short, clear task title - 2-5 words]
   **Description:** [Brief, actionable description - 10-25 words]
2. **Task Title:** [Short, clear task title - 2-5 words]
   **Description:** [Brief, actionable description - 10-25 words]

Action items MUST be separated with numbers and each action item MUST have both a Task Title and Description field exactly as shown. Each action item should be clear, specific, and actionable.

**Meeting Transcript:**
"${transcriptText}"

Make your summary concise but complete. For the action items, focus on making them clear, specific tasks that can be directly converted into tickets in project management tools.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "system", content: prompt }],
      temperature: 0.5,
    });

    const summary = response.choices[0].message.content;

    res.json({ summary });
  } catch (error) {
    console.error("Error generating summary:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Store summary in S3
app.post("/meeting/:id/summary-text", async (req, res) => {
  try {
    const meetingId = req.params.id;
    const { summary } = req.body;

    if (!summary) {
      return res.status(400).json({ error: "Summary text is required" });
    }

    const key = `summaries/meeting-${meetingId}.json`;
    const putObjectCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify({ summary, timestamp: new Date().toISOString() }),
      ContentType: "application/json",
    });

    await s3Client.send(putObjectCommand);

    return res.json({
      message: "Summary stored successfully",
    });
  } catch (error) {
    console.error("Error storing summary:", error);
    res.status(500).json({ error: "Failed to store summary" });
  }
});

// Get summary from S3
app.get("/meeting/:id/summary-text", async (req, res) => {
  try {
    const meetingId = req.params.id;
    const s3Key = `summaries/meeting-${meetingId}.json`;

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    });

    try {
      const data = await s3Client.send(command);
      const summaryData = await streamToString(data.Body);
      res.json(JSON.parse(summaryData));
    } catch (s3Error) {
      // If summary doesn't exist, generate it
      if (s3Error.$metadata && s3Error.$metadata.httpStatusCode === 404) {
        // This means the summary needs to be generated
        res
          .status(404)
          .json({ error: "Summary not found", needsGeneration: true });
      } else {
        throw s3Error;
      }
    }
  } catch (error) {
    console.error("Error retrieving summary:", error);
    res.status(500).json({ error: "Failed to retrieve summary" });
  }
});

// Platform integration endpoints
app.get("/integrations/status", getIntegrationStatus);
app.get("/integrations/:platform", getIntegrationDetails);
app.post("/integrations/:platform", connectToPlatform);
app.delete("/integrations/:platform", disconnectFromPlatform);
app.post("/meeting/:id/sync-action-items", syncActionItems);
app.post("/meeting/:id/sync-action-items-all", syncActionItemsToAllPlatforms);

// POST recording from zoom to S3
app.post("/meeting/:id/recording", async (req, res) => {
  try {
    const meetingId = req.params.id;
    const userEmail = req.query.email;

    if (!userEmail) {
      return res.status(400).json({ error: "Missing user email." });
    }

    const recordingsUrl = `https://api.zoom.us/v2/meetings/${meetingId}/recordings`;
    const recordingsData = await makeZoomRequest(recordingsUrl, userEmail);

    const mp4File = recordingsData.recording_files?.find(
      (f) => f.file_type === "MP4",
    );

    if (!mp4File) {
      return res
        .status(404)
        .json({ error: "No MP4 recording file found for this meeting." });
    }

    const { access_token } = await getUserAndTokens(userEmail);
    const recordingDownloadUrl = `${mp4File.download_url}?access_token=${access_token}`;

    const recordingResponse = await axios.get(recordingDownloadUrl, {
      responseType: "arraybuffer",
    });
    const recordingContents = recordingResponse.data;

    const key = `recordings/meeting-${meetingId}.mp4`;

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: recordingContents,
      ContentType: "video/mp4",
    });

    await s3Client.send(command);

    return res.json({
      message: "Recording uploaded to S3",
    });
  } catch (error) {
    console.error("Error uploading recording:", error);
    res.status(500).json({ error: "Failed to upload recording." });
  }
});

app.get("/meeting/:id/recording", async (req, res) => {
  try {
    const meetingId = req.params.id;
    const s3Key = `recordings/meeting-${meetingId}.mp4`;
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    });

    const data = await s3Client.send(command);
    res.setHeader("Content-Type", "video/mp4");
    data.Body.pipe(res);
  } catch (error) {
    console.error("Error retrieving recording:", error);
    res.status(500).json({ error: "Failed to retrieve recording." });
  }
});

// Zoom webhook endpoint for meeting notifications
app.post("/zoom-webhook", async (req, res) => {
  try {
    const event = req.body;
    console.log("Received Zoom webhook event:", JSON.stringify(event));

    // Always return 200 OK to Zoom quickly to acknowledge receipt
    // This prevents Zoom from retrying the webhook
    const responsePromise = res.status(200).json({ success: true });

    // Process the webhook event asynchronously
    try {
      // Verify this is a meeting.ended or recording.completed event
      if (event.event === "recording.completed") {
        const meetingId = event.payload.object.id;
        const hostEmail = event.payload.object.host_email;

        if (!meetingId || !hostEmail) {
          console.error("Missing meeting ID or host email in webhook payload");
          return;
        }

        // Invoke AWS Lambda function to process the meeting data
        console.log(
          `Invoking Lambda function for meeting ${meetingId} hosted by ${hostEmail}`,
        );

        // Make sure we're using the correct region
        const lambdaRegion = process.env.AWS_REGION || "us-west-1";
        console.log(`Using Lambda region: ${lambdaRegion}`);

        // Create a Lambda client with the specific region
        const lambdaClient = new LambdaClient({
          region: lambdaRegion,
        });

        // Get the function name from environment variables
        const functionName =
          process.env.MEETING_PROCESSOR_LAMBDA || "teamSync-meeting-processor";
        console.log(`Invoking Lambda function: ${functionName}`);

        const params = {
          FunctionName: functionName,
          InvocationType: "Event", // Asynchronous invocation
          Payload: JSON.stringify({
            meetingId,
            hostEmail,
            eventType: event.event,
          }),
        };

        await lambdaClient.send(new InvokeCommand(params));
        console.log(`Successfully invoked Lambda for meeting ${meetingId}`);
      } else if (event.event === "meeting.ended") {
        console.log(
          "Meeting ended event received - waiting for recordings to be processed by Zoom",
        );
      }
    } catch (error) {
      console.error("Error processing webhook event:", error);
    }

    return responsePromise;
  } catch (error) {
    console.error("Error handling Zoom webhook:", error);
    // Still return 200 to Zoom to acknowledge receipt
    return res.status(200).json({ success: true });
  }
});

// Helper function to convert stream to string
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
