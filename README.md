# TeamSync
**GitHub Repository**: https://github.com/trungtran1234/TeamSync

**TeamSync** is a powerful Zoom extension designed to organize and streamline meeting agendas, ensuring everyone stays on the same page. Leveraging AI techniques, TeamSync automatically summarizes key points, action items, and generates meeting minutes, making virtual meetings more productive and organized.

## Features

- **Automatic Summaries**: AI-powered summaries of key points, action items, and decisions made during the meeting.
- **Meeting Minutes Generation**: Automatically generated meeting minutes distributed to participants via Email and Slack.
- **Task Syncing**: Action items synced with integrated project management tools like Jira, Trello, and Asana.
- **Categorized Repository**: Stores meeting recordings in a repository for post-meeting reviews
- **No Manual Note-taking**: Eliminates the need for manual note-taking or task syncing after meetings.

## Code Structure

The TeamSync project is organized into two main components: a React frontend and an Express.js backend.

### Frontend Structure (teamSync-app/)

```bash
teamSync-app/
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── PlatformIntegrations.tsx  # Platform integration UI
│   │   ├── SyncActionItems.tsx       # Action item sync component
│   │   └── layout/                   # Layout components
│   ├── forms/                # Authentication forms
│   │   ├── SignIn.tsx        # Login form
│   │   └── SignUp.tsx        # Registration form
│   ├── styles/               # CSS and styling files
│   ├── App.tsx               # Main application component
│   ├── Dashboard.tsx         # Dashboard view
│   ├── Calendar.tsx          # Calendar view
│   ├── MeetingDetails.tsx    # Meeting details view
│   ├── Settings.tsx          # User settings view
│   └── main.tsx              # Application entry point
├── .env                      # Environment variables
├── package.json              # Dependencies and scripts
└── vite.config.ts           # Vite configuration
```

### Backend Structure (server/)

```bash
server/
├── lambda/                  # AWS Lambda functions
│   ├── meeting-processor.js  # Processes meeting recordings
│   └── recording-checker.js  # Checks for new recordings
├── migrations/              # Database migration scripts
├── .env                     # Environment variables
├── config.js                # Zoom SDK configuration
├── db.js                    # Database connection setup
├── platformIntegrations.js  # Integration with external platforms
├── server.js                # Main Express server
├── zoomAPI.js               # Zoom API integration
└── package.json             # Dependencies and scripts
```

## Setup & Installation

TeamSync consists of two main components: a backend server and a frontend React application. Follow these steps to set up the project locally.

> **Important**: You will need to run three separate processes in three different terminal windows:
> 1. [Backend server](#backend-setup) - Handles API requests and database operations
> 2. [Frontend application](#frontend-setup) - Provides the user interface
> 3. [Ngrok tunnel](#ngrok-setup) - Exposes your local server to the internet for Zoom integration

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- ngrok installed ([Download from ngrok.com](https://ngrok.com/download))

### Environment Variables

The necessary environment files for both the server and client will be provided to you with the names `.env-server` and `.env-client`. You'll need to rename them to `.env` in their respective directories:

1. Copy `.env-server` to the server directory and rename it to `.env`
2. Copy `.env-client` to the teamSync-app directory and rename it to `.env`

### Backend Setup

1. Navigate to the server directory:

```bash
cd server
```

2. Install dependencies:

```bash
npm install
```

3. Run database migrations:

```bash
node run-migration.js
```

4. Start the development server:

```bash
npm run dev
```

The server will start on http://localhost:8080

### Frontend Setup

1. Navigate to the teamSync-app directory:

```bash
cd teamSync-app
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

The application will be available at http://localhost:5173.

### Ngrok Setup

To expose your local server to the internet (required for Zoom integration), use the provided ngrok URL:

```bash
ngrok http --url=bullfrog-ample-routinely.ngrok-free.app 8080
```

This will create a tunnel to your local server running on port 8080 using the pre-configured URL.

## Platform Integrations

TeamSync can synchronize meeting action items with several project management platforms. Here's how to set up and use these integrations:

### Supported Platforms

- **Jira**: Create issues directly from meeting action items
- **Trello**: Add cards to your boards from action items
- **Asana**: Create tasks in your Asana projects

### Setting Up Integrations

1. Navigate to the Platform Integrations page in the TeamSync application
2. Select the platform you want to integrate 
3. Enter the required information for the corresponding platform
4. Click on "Connect" for the platform you want to integrate with

### Using the Sync Feature

After a meeting is summarized, you can sync action items to your connected platforms in two ways:

1. **Individual Platform Sync**: Click the platform-specific sync button to send action items only to that platform
2. **Sync to All Platforms**: Use the "Sync to All" button to send action items to all connected platforms simultaneously

The system will provide feedback on which items were successfully synced and any errors that occurred.

## Development Team

- **Hasnain Mucklai -**  [LinkedIn](https://www.linkedin.com/in/hasnainmucklai) | [GitHub](https://github.com/Hasnain7861)
- **Trung Tran -**  [LinkedIn](https://www.linkedin.com/in/trung-tran1234) | [GitHub](https://github.com/trungtran1234)
- **Phuc Nguyen -**  [LinkedIn](https://www.linkedin.com/in/phuc-ngoc-tan-nguyen) | [GitHub](https://github.com/food0903)
- **Ahmet Mutlugun -**  [LinkedIn](https://www.linkedin.com/in/ahmet-mutlugun) | [GitHub](https://github.com/ahmetmutlugun)
