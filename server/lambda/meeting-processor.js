const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { Pool } = require('pg');
const axios = require('axios');
const nodemailer = require('nodemailer');

// Initialize AWS services
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Initialize database pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Environment variables will be set in the Lambda configuration
const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';

/**
 * AWS Lambda function to process Zoom meeting data
 * This function is triggered by the webhook when a meeting ends or recording is completed
 */
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event));
  
  try {
    const { meetingId, hostEmail, eventType } = event;
    
    if (!meetingId || !hostEmail) {
      throw new Error('Missing required parameters: meetingId and hostEmail');
    }
    
    console.log(`Processing ${eventType} for meeting ${meetingId} hosted by ${hostEmail}`);
    
    // Wait for recordings to be available (Zoom can take some time to process recordings)
    if (eventType === 'meeting.ended') {
      // For meeting.ended events, we'll wait a bit and then check if recordings are available
      console.log('Meeting ended, scheduling recording check in 5 minutes');
      
      // Schedule another Lambda invocation after 5 minutes to check for recordings
      const params = {
        FunctionName: process.env.RECORDING_CHECKER_LAMBDA || 'teamSync-recording-checker',
        InvocationType: 'Event',
        Payload: JSON.stringify({
          meetingId,
          hostEmail,
          attempts: 0,
          maxAttempts: 12 // Will try for up to 1 hour (12 * 5 minutes)
        })
      };
      
      await lambdaClient.send(new InvokeCommand(params));
      return { status: 'scheduled_recording_check' };
    }
    
    // For recording.completed events, process immediately
    if (eventType === 'recording.completed') {
      await processRecordings(meetingId, hostEmail);
      return { status: 'success', message: 'Recordings processed successfully' };
    }
    
    return { status: 'ignored', message: 'Event type not handled' };
  } catch (error) {
    console.error('Error processing meeting data:', error);
    return { status: 'error', message: error.message };
  }
};

/**
 * Process recordings for a meeting
 */
async function processRecordings(meetingId, hostEmail) {
  try {
    console.log(`Processing recordings for meeting ${meetingId}`);
    
    // 1. Upload transcript to S3
    await uploadTranscript(meetingId, hostEmail);
    
    // 2. Upload recording to S3
    await uploadRecording(meetingId, hostEmail);
    
    // 3. Generate and store summary
    await generateSummary(meetingId, hostEmail);
    
    console.log(`Successfully processed all data for meeting ${meetingId}`);
    return true;
  } catch (error) {
    console.error(`Error processing recordings for meeting ${meetingId}:`, error);
    throw error;
  }
}

/**
 * Upload meeting transcript to S3
 */
async function uploadTranscript(meetingId, hostEmail) {
  try {
    console.log(`Uploading transcript for meeting ${meetingId}`);
    
    // Call the server endpoint to upload transcript
    const response = await axios.post(
      `${API_BASE_URL}/meeting/${meetingId}/transcript?email=${encodeURIComponent(hostEmail)}`,
      {},
      { timeout: 30000 } // 30 second timeout
    );
    
    console.log(`Transcript upload response:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error uploading transcript for meeting ${meetingId}:`, error);
    throw error;
  }
}

/**
 * Upload meeting recording to S3
 */
async function uploadRecording(meetingId, hostEmail) {
  try {
    console.log(`Uploading recording for meeting ${meetingId}`);
    
    // Call the server endpoint to upload recording
    const response = await axios.post(
      `${API_BASE_URL}/meeting/${meetingId}/recording?email=${encodeURIComponent(hostEmail)}`,
      {},
      { timeout: 60000 } // 60 second timeout for larger files
    );
    
    console.log(`Recording upload response:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error uploading recording for meeting ${meetingId}:`, error);
    throw error;
  }
}

/**
 * Generate and store meeting summary
 */
async function generateSummary(meetingId, hostEmail) {
  try {
    console.log(`Generating summary for meeting ${meetingId}`);
    
    // 1. Get user email from database
    const userQuery = await pool.query(
      'SELECT email FROM users WHERE zoomid = $1',
      [hostEmail]
    );
    
    if (userQuery.rows.length === 0) {
      throw new Error('User not found in database');
    }
    
    const userEmail = userQuery.rows[0].email;
    
    // 2. Fetch the transcript
    const transcriptResponse = await axios.get(
      `${API_BASE_URL}/meeting/${meetingId}/transcript`,
      { timeout: 10000 }
    );
    
    if (!transcriptResponse.data) {
      throw new Error('Failed to fetch transcript');
    }
    
    const transcriptText = transcriptResponse.data;
    
    // 3. Generate summary using OpenAI
    const summaryResponse = await axios.post(
      `${API_BASE_URL}/summarize`,
      { transcriptText },
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );
    
    if (!summaryResponse.data || !summaryResponse.data.summary) {
      throw new Error('Failed to generate summary');
    }
    
    const summary = summaryResponse.data.summary;
    
    // 4. Store summary in S3
    await axios.post(
      `${API_BASE_URL}/meeting/${meetingId}/summary-text`,
      { summary },
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );
    
    // 5. Send email with summary
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: `Meeting Summary - ${new Date().toLocaleDateString()}`,
      html: `
        <h2>Meeting Summary</h2>
        <p>Here's the summary of your meeting (ID: ${meetingId}):</p>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
          ${summary}
        </div>
        <p>Best regards,<br>TeamSync</p>
      `
    };

    await transporter.sendMail(mailOptions);
    
    console.log(`Successfully generated, stored, and emailed summary for meeting ${meetingId}`);
    return true;
  } catch (error) {
    console.error(`Error generating summary for meeting ${meetingId}:`, error);
    throw error;
  }
}
