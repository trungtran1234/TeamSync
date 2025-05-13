const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { Pool } = require('pg');
const axios = require('axios');

// Initialize AWS services
const AWS_REGION = 'us-west-1';  // Hardcode to us-west-1 since that's where our Lambda is
const lambdaClient = new LambdaClient({ region: AWS_REGION });
const sesClient = new SESClient({ region: AWS_REGION });

// Initialize database pool
const createPool = () => {
  return new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: {
      rejectUnauthorized: false
    }
  });
};

let pool;

// Environment variables will be set in the Lambda configuration
const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'teamsync.group@gmail.com';

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
    
    // 1. Get all participants' emails from Zoom API
    let participantEmails = [];
    try {
      console.log('Fetching participants from Zoom API for meeting:', meetingId);
      const participantsResponse = await axios.get(
        `${API_BASE_URL}/meeting/${meetingId}/participants?email=${encodeURIComponent(hostEmail)}`,
        { timeout: 10000 }
      );
      
      if (!participantsResponse.data || !participantsResponse.data.participants) {
        console.log('No participants found, falling back to host email');
        participantEmails = [hostEmail];
      } else {
        // Extract unique emails from participants
        const participants = participantsResponse.data.participants;
        participantEmails = [...new Set(participants.map(p => p.user_email).filter(Boolean))];
        
        // // Add host email if not already in the list
        // if (!participantEmails.includes(hostEmail)) {
        //   participantEmails.push(hostEmail);
        // }
        console.log(`Found ${participantEmails.length} participants:`, participantEmails);
      }
    } catch (apiError) {
      console.error('Error fetching participants from Zoom:', apiError);
      // Fallback to just the host email
      console.log('Using host email as fallback');
      participantEmails = [hostEmail];
    }
    
    // 2. Fetch the transcript
    console.log('Fetching transcript...');
    const transcriptResponse = await axios.get(
      `${API_BASE_URL}/meeting/${meetingId}/transcript`,
      { timeout: 10000 }
    );
    
    if (!transcriptResponse.data) {
      throw new Error('Failed to fetch transcript');
    }
    
    const transcriptText = transcriptResponse.data;
    
    // 3. Generate summary using OpenAI
    console.log('Generating summary using OpenAI...');
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
    console.log('Storing summary in S3...');
    await axios.post(
      `${API_BASE_URL}/meeting/${meetingId}/summary-text`,
      { summary },
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );
    
    // 5. Send email to all participants
    console.log('Sending emails to all participants...');
    try {
      const emailParams = {
        Destination: {
          BccAddresses: participantEmails // Use BCC to hide other recipients' emails
        },
        Message: {
          Body: {
            Html: {
              Charset: "UTF-8",
              Data: `
                <h2>Meeting Summary</h2>
                <p>Here's the summary of your meeting (ID: ${meetingId}):</p>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
                  ${summary}
                </div>
                <p>Best regards,<br>TeamSync</p>
              `
            }
          },
          Subject: {
            Charset: "UTF-8",
            Data: `Meeting Summary - ${new Date().toLocaleDateString()}`
          }
        },
        Source: SENDER_EMAIL
      };

      await sesClient.send(new SendEmailCommand(emailParams));
      console.log('Emails sent successfully to all participants');
    } catch (emailError) {
      console.error('Error sending emails:', emailError);
      // Don't throw the error, just log it and continue
    }
    
    console.log(`Successfully generated, stored, and emailed summary for meeting ${meetingId}`);
    return true;
  } catch (error) {
    console.error(`Error generating summary for meeting ${meetingId}:`, error);
    throw error;
  } finally {
    // Clean up database connection
    if (pool) {
      try {
        await pool.end();
      } catch (err) {
        console.error('Error closing database pool:', err);
      }
    }
  }
}
