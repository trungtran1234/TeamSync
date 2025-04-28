const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const axios = require('axios');

// Initialize AWS services
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-west-2' });

// Environment variables will be set in the Lambda configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';

/**
 * AWS Lambda function to check if recordings are available for a meeting
 * This function is scheduled by the meeting-processor Lambda and will retry
 * until recordings are available or max attempts are reached
 */
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event));
  
  try {
    const { meetingId, hostEmail, attempts, maxAttempts } = event;
    
    if (!meetingId || !hostEmail) {
      throw new Error('Missing required parameters: meetingId and hostEmail');
    }
    
    const currentAttempt = attempts || 0;
    const maxAttemptCount = maxAttempts || 12; // Default to 12 attempts (1 hour)
    
    console.log(`Checking recordings for meeting ${meetingId}, attempt ${currentAttempt + 1}/${maxAttemptCount}`);
    
    // Check if recordings are available
    const recordingsAvailable = await checkRecordingsAvailable(meetingId, hostEmail);
    
    if (recordingsAvailable) {
      console.log(`Recordings available for meeting ${meetingId}, processing now`);
      
      // Invoke the meeting processor to handle the recordings
      const params = {
        FunctionName: process.env.MEETING_PROCESSOR_LAMBDA || 'teamSync-meeting-processor',
        InvocationType: 'Event',
        Payload: JSON.stringify({
          meetingId,
          hostEmail,
          eventType: 'recording.completed'
        })
      };
      
      await lambdaClient.send(new InvokeCommand(params));
      return { status: 'success', message: 'Recordings found and processing initiated' };
    }
    
    // If we've reached max attempts, give up
    if (currentAttempt >= maxAttemptCount - 1) {
      console.log(`Max attempts reached for meeting ${meetingId}, giving up`);
      return { status: 'failed', message: 'Max attempts reached, recordings not available' };
    }
    
    // Schedule another check in 5 minutes
    console.log(`Recordings not yet available for meeting ${meetingId}, scheduling another check`);
    
    const nextParams = {
      FunctionName: process.env.RECORDING_CHECKER_LAMBDA || 'teamSync-recording-checker',
      InvocationType: 'Event',
      Payload: JSON.stringify({
        meetingId,
        hostEmail,
        attempts: currentAttempt + 1,
        maxAttempts: maxAttemptCount
      })
    };
    
    await lambdaClient.send(new InvokeCommand(nextParams));
    return { status: 'scheduled', message: 'Scheduled another recording check' };
  } catch (error) {
    console.error('Error checking recordings:', error);
    return { status: 'error', message: error.message };
  }
};

/**
 * Check if recordings are available for a meeting
 */
async function checkRecordingsAvailable(meetingId, hostEmail) {
  try {
    console.log(`Checking if recordings are available for meeting ${meetingId}`);
    
    // Call the Zoom API through our server to check for recordings
    const recordingsUrl = `${API_BASE_URL}/meeting/${meetingId}/recordings?email=${encodeURIComponent(hostEmail)}`;
    const response = await axios.get(recordingsUrl, { timeout: 10000 });
    
    // Check if there are any recording files
    const recordingFiles = response.data?.recording_files || [];
    const hasRecordings = recordingFiles.length > 0;
    
    // Check if there's a transcript file
    const hasTranscript = recordingFiles.some(
      file => file.file_type === 'TRANSCRIPT' || file.recording_type === 'audio_transcript'
    );
    
    // Check if there's an MP4 file
    const hasMP4 = recordingFiles.some(file => file.file_type === 'MP4');
    
    console.log(`Recording status for meeting ${meetingId}:`, {
      hasRecordings,
      hasTranscript,
      hasMP4,
      fileCount: recordingFiles.length
    });
    
    // We need both transcript and MP4 to be available
    return hasRecordings && hasTranscript && hasMP4;
  } catch (error) {
    console.error(`Error checking recordings for meeting ${meetingId}:`, error);
    // If we get a 404, recordings are definitely not available yet
    if (error.response && error.response.status === 404) {
      return false;
    }
    // For other errors, re-throw to be handled by the caller
    throw error;
  }
}
