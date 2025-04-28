# TeamSync Meeting Processing Automation

This directory contains AWS Lambda functions that automatically process Zoom meeting recordings and transcripts when a meeting ends.

## Overview

The system works as follows:

1. Zoom sends a webhook notification to our server when a meeting ends or when recordings are completed
2. Our server receives the webhook and triggers the `meeting-processor` Lambda function
3. The Lambda function processes the meeting data:
   - For `meeting.ended` events, it schedules a check for recordings in 5 minutes
   - For `recording.completed` events, it immediately processes the recordings
4. The `recording-checker` Lambda function periodically checks if recordings are available
5. Once recordings are available, it triggers the processing to:
   - Upload the transcript to S3
   - Upload the recording to S3
   - Generate and store the meeting summary

## Setup Instructions

### 1. Create AWS Lambda Functions

Create two Lambda functions in AWS:

#### meeting-processor

1. Create a new Lambda function named `teamSync-meeting-processor`
2. Upload the `meeting-processor.js` file
3. Set the handler to `meeting-processor.handler`
4. Set the runtime to Node.js 18.x
5. Configure environment variables:
   - `S3_BUCKET_NAME`: Your S3 bucket name
   - `API_BASE_URL`: URL to your TeamSync server (e.g., http://your-server.com)

#### recording-checker

1. Create a new Lambda function named `teamSync-recording-checker`
2. Upload the `recording-checker.js` file
3. Set the handler to `recording-checker.handler`
4. Set the runtime to Node.js 18.x
5. Configure environment variables:
   - `API_BASE_URL`: URL to your TeamSync server
   - `MEETING_PROCESSOR_LAMBDA`: Name of the meeting processor Lambda function

### 2. Set Up IAM Permissions

Ensure both Lambda functions have:

1. Permission to invoke other Lambda functions
2. Permission to access the S3 bucket
3. Basic Lambda execution role

### 3. Configure Zoom Webhook

1. Go to the [Zoom App Marketplace](https://marketplace.zoom.us/)
2. Navigate to your app's settings
3. Under "Feature" select "Event Subscriptions"
4. Add a new event subscription:
   - Subscription Name: "Meeting Processing"
   - Event notification endpoint URL: `https://your-server.com/zoom-webhook`
5. Subscribe to the following events:
   - `meeting.ended`
   - `recording.completed`
6. Save your changes

### 4. Update Server Environment Variables

Make sure your server's `.env` file includes:

```
# AWS Configuration
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
S3_BUCKET_NAME=teamsync-meeting-data

# Lambda Function Names
MEETING_PROCESSOR_LAMBDA=teamSync-meeting-processor
RECORDING_CHECKER_LAMBDA=teamSync-recording-checker

# API Base URL (for Lambda to call back to server)
API_BASE_URL=http://your-server.com
```

### 5. Deploy Your Server

Make sure your server is publicly accessible so Zoom can send webhook notifications to it.

## Testing

To test the webhook integration:

1. Start a Zoom meeting
2. Record the meeting and include a transcript
3. End the meeting
4. Check your server logs for webhook events
5. Verify that the Lambda functions are being triggered
6. Check S3 to ensure the transcript and recording are uploaded

## Troubleshooting

- **Webhook not receiving events**: Make sure your server is publicly accessible and the webhook URL is correctly configured in Zoom
- **Lambda functions not triggering**: Check the IAM permissions and ensure the function names match in your environment variables
- **Recordings not being processed**: Check the Zoom API access and ensure the meeting has recordings enabled
