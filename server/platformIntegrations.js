import axios from "axios";
import pool from "./db.js";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

// Helper function to encrypt sensitive data
const encrypt = (text) => {
  if (!text) return null;
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'teamsync-encryption-key-32-chars', 'utf8');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

// Helper function to decrypt sensitive data
const decrypt = (text) => {
  if (!text) return null;
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'teamsync-encryption-key-32-chars', 'utf8');
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// Get user ID from email
export const getUserIdFromEmail = async (email) => {
  try {
    const result = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      throw new Error("User not found");
    }
    return result.rows[0].id;
  } catch (error) {
    console.error("Error getting user ID:", error);
    throw error;
  }
};

// Get integration status for a user
export const getIntegrationStatus = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const userId = await getUserIdFromEmail(email);
    const result = await pool.query(
      "SELECT platform, is_active FROM platform_integrations WHERE user_id = $1",
      [userId]
    );

    const status = {
      jira: false,
      trello: false,
      asana: false
    };

    result.rows.forEach(row => {
      if (row.is_active && status.hasOwnProperty(row.platform)) {
        status[row.platform] = true;
      }
    });

    res.json(status);
  } catch (error) {
    console.error("Error getting integration status:", error);
    res.status(500).json({ error: "Failed to get integration status" });
  }
};

// Get integration details for a specific platform
export const getIntegrationDetails = async (req, res) => {
  try {
    const { email } = req.query;
    const { platform } = req.params;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    if (!['jira', 'trello', 'asana'].includes(platform)) {
      return res.status(400).json({ error: "Invalid platform" });
    }

    const userId = await getUserIdFromEmail(email);
    const result = await pool.query(
      `SELECT * FROM platform_integrations WHERE user_id = $1 AND platform = $2 AND is_active = TRUE`,
      [userId, platform]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const integration = result.rows[0];
    let response = {};

    // Return platform-specific fields (without sensitive data)
    switch (platform) {
      case 'jira':
        response = {
          siteUrl: integration.jira_site_url,
          email: integration.jira_email,
          projectKey: integration.jira_project_key,
          issueType: integration.jira_issue_type
        };
        break;
      case 'trello':
        response = {
          boardId: integration.trello_board_id,
          listId: integration.trello_list_id
        };
        break;
      case 'asana':
        response = {
          workspaceId: integration.asana_workspace_id,
          projectId: integration.asana_project_id
        };
        break;
    }

    res.json(response);
  } catch (error) {
    console.error(`Error getting ${req.params.platform} details:`, error);
    res.status(500).json({ error: `Failed to get ${req.params.platform} details` });
  }
};

// Connect to a platform
export const connectToPlatform = async (req, res) => {
  try {
    const { email, ...platformData } = req.body;
    const { platform } = req.params;
    
    // For Jira, make sure the jira email is available
    if (platform === 'jira' && platformData.email) {
      // Use jira email for auth, nothing changes here
    } else if (platform === 'jira') {
      // If missing, use the TeamSync user email as fallback
      platformData.email = email;
    }


    const userId = await getUserIdFromEmail(email);

    // Validate the connection by making a test API call
    try {
      await testPlatformConnection(platform, platformData);
    } catch (error) {
      return res.status(400).json({ error: `Could not connect to ${platform}: ${error.message}` });
    }

    // Check if integration already exists
    const existingResult = await pool.query(
      "SELECT id FROM platform_integrations WHERE user_id = $1 AND platform = $2",
      [userId, platform]
    );

    let query, params;

    if (existingResult.rows.length > 0) {
      // Update existing integration
      const integrationId = existingResult.rows[0].id;
      
      switch (platform) {
        case 'jira':
          query = `
            UPDATE platform_integrations 
            SET jira_site_url = $1, jira_email = $2, jira_api_token = $3, 
                jira_project_key = $4, jira_issue_type = $5, is_active = TRUE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
          `;
          params = [
            platformData.siteUrl,
            platformData.email,
            encrypt(platformData.apiToken),
            platformData.projectKey,
            platformData.issueType || 'Task',
            integrationId
          ];
          break;
        case 'trello':
          query = `
            UPDATE platform_integrations 
            SET trello_api_key = $1, trello_api_token = $2, 
                trello_board_id = $3, trello_list_id = $4, is_active = TRUE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
          `;
          params = [
            encrypt(platformData.apiKey),
            encrypt(platformData.apiToken),
            platformData.boardId,
            platformData.listId,
            integrationId
          ];
          break;
        case 'asana':
          query = `
            UPDATE platform_integrations 
            SET asana_personal_access_token = $1, asana_workspace_id = $2, 
                asana_project_id = $3, is_active = TRUE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
          `;
          params = [
            encrypt(platformData.personalAccessToken),
            platformData.workspaceId,
            platformData.projectId,
            integrationId
          ];
          break;
      }
    } else {
      // Create new integration
      switch (platform) {
        case 'jira':
          query = `
            INSERT INTO platform_integrations 
            (user_id, platform, jira_site_url, jira_email, jira_api_token, jira_project_key, jira_issue_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `;
          params = [
            userId,
            platform,
            platformData.siteUrl,
            platformData.email,
            encrypt(platformData.apiToken),
            platformData.projectKey,
            platformData.issueType || 'Task'
          ];
          break;
        case 'trello':
          query = `
            INSERT INTO platform_integrations 
            (user_id, platform, trello_api_key, trello_api_token, trello_board_id, trello_list_id)
            VALUES ($1, $2, $3, $4, $5, $6)
          `;
          params = [
            userId,
            platform,
            encrypt(platformData.apiKey),
            encrypt(platformData.apiToken),
            platformData.boardId,
            platformData.listId
          ];
          break;
        case 'asana':
          query = `
            INSERT INTO platform_integrations 
            (user_id, platform, asana_personal_access_token, asana_workspace_id, asana_project_id)
            VALUES ($1, $2, $3, $4, $5)
          `;
          params = [
            userId,
            platform,
            encrypt(platformData.personalAccessToken),
            platformData.workspaceId,
            platformData.projectId
          ];
          break;
      }
    }

    await pool.query(query, params);
    res.json({ success: true, message: `Connected to ${platform} successfully` });
  } catch (error) {
    console.error(`Error connecting to ${req.params.platform}:`, error);
    res.status(500).json({ error: `Failed to connect to ${req.params.platform}` });
  }
};

// Disconnect from a platform
export const disconnectFromPlatform = async (req, res) => {
  try {
    const { email } = req.body;
    const { platform } = req.params;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    if (!['jira', 'trello', 'asana'].includes(platform)) {
      return res.status(400).json({ error: "Invalid platform" });
    }

    const userId = await getUserIdFromEmail(email);

    await pool.query(
      "UPDATE platform_integrations SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND platform = $2",
      [userId, platform]
    );

    res.json({ success: true, message: `Disconnected from ${platform} successfully` });
  } catch (error) {
    console.error(`Error disconnecting from ${req.params.platform}:`, error);
    res.status(500).json({ error: `Failed to disconnect from ${req.params.platform}` });
  }
};

// Test platform connection
const testPlatformConnection = async (platform, platformData) => {
  switch (platform) {
    case 'jira':
      return testJiraConnection(platformData);
    case 'trello':
      return testTrelloConnection(platformData);
    case 'asana':
      return testAsanaConnection(platformData);
    default:
      throw new Error("Invalid platform");
  }
};
const testJiraConnection = async ({ siteUrl, email, apiToken, projectKey }) => {
  try {
    // Log all input parameters (redacting the token partially)
    console.log('DEBUG: Jira connection test parameters:');
    console.log('- siteUrl:', siteUrl);
    console.log('- email:', email);
    console.log('- apiToken:', apiToken.substring(0, 3) + '...' + apiToken.substring(apiToken.length - 3));
    
    // Remove any trailing slashes from the URL
    const baseUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;
    const url = `${baseUrl}/rest/api/3/myself`;
    
    // Create auth string EXACTLY as Postman would
    const authString = `${email}:${apiToken}`;
    console.log('DEBUG: Auth string (before encoding):', email + ':' + apiToken.substring(0, 3) + '...');
    
    // Log the raw auth string length to check for extra spaces or characters
    console.log('DEBUG: Auth string length:', authString.length);
    
    // Base64 encode using Buffer
    const auth = Buffer.from(authString).toString('base64');
    console.log('DEBUG: Encoded auth (first 10 chars):', auth.substring(0, 10) + '...');
    
    // Try URL encoding the email and token first (in case of special characters)
    const encodedEmail = encodeURIComponent(email);
    const encodedToken = encodeURIComponent(apiToken);
    
    // Create a collection of auth approaches to try
    const authMethods = [
      // Method 1: Standard Buffer encoding (what we've been using)
      {
        name: 'Standard Buffer encoding',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json'
        }
      },
      // Method 2: Using URL encoded values first
      {
        name: 'URL encoded values',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${encodedEmail}:${encodedToken}`).toString('base64')}`,
          'Accept': 'application/json'
        }
      },
      // Method 3: Using btoa (browser standard) if available
      {
        name: 'Global btoa (if available)',
        headers: {
          'Authorization': `Basic ${global.btoa ? global.btoa(authString) : auth}`,
          'Accept': 'application/json'
        }
      }
    ];
    
    // Try each auth method in sequence
    let response;
    let successMethod;
    
    for (const method of authMethods) {
      try {
        console.log(`DEBUG: Trying auth method: ${method.name}`);
        
        // Make the request with this auth method
        response = await axios.get(url, { headers: method.headers });
        
        // If we got here, it worked!
        console.log(`DEBUG: Auth success with method: ${method.name}`);
        successMethod = method.name;
        break;
      } catch (error) {
        console.error(`DEBUG: Auth method ${method.name} failed:`, 
                     error.response?.status, 
                     error.response?.statusText);
      }
    }
    
    if (!response) {
      throw new Error('All authentication methods failed');
    }
    
    console.log(`Jira authentication successful using method: ${successMethod}`);
    
    // Process project check if needed
    if (projectKey) {
      // Use the successful auth method for the project check
      try {
        console.log(`Checking if project ${projectKey} exists...`);
        const projectUrl = `${baseUrl}/rest/api/3/project/${projectKey}`;
        
        await axios.get(projectUrl, { 
          headers: authMethods.find(m => m.name === successMethod).headers 
        });
        
        console.log(`Project ${projectKey} found`);
      } catch (projectError) {
        console.error("Project check failed:", projectError.response?.data || projectError.message);
        throw new Error(projectError.response?.data?.errorMessages?.[0] || "Project not found");
      }
    }
    
    return response.data;
  } catch (error) {
    console.error("Jira connection test failed:", error.response?.data || error.message);
    throw new Error(error.response?.data?.errorMessages?.[0] || error.message || "Could not connect to Jira");
  }
};
// Test Trello connection
const testTrelloConnection = async ({ apiKey, apiToken, boardId }) => {
  try {
    const url = `https://api.trello.com/1/boards/${boardId}?key=${apiKey}&token=${apiToken}`;
    
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Trello connection test failed:", error.response?.data || error.message);
    throw new Error("Could not connect to Trello");
  }
};

// Test Asana connection
const testAsanaConnection = async ({ personalAccessToken, workspaceId }) => {
  try {
    const url = `https://app.asana.com/api/1.0/workspaces/${workspaceId}`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${personalAccessToken}`,
        'Accept': 'application/json'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error("Asana connection test failed:", error.response?.data || error.message);
    throw new Error("Could not connect to Asana");
  }
};

// Parse action items from meeting summary
export const parseActionItems = (summary) => {
  if (!summary) return [];
  
  const actionItemsRegex = /\*\*Action Items:\*\*\s*([\s\S]*?)(?:\n\s*\n|\*\*|$)/;
  const match = summary.match(actionItemsRegex);
  
  if (!match || !match[1]) return [];
  
  const actionItemsSection = match[1];
  const actionItemRegex = /\d+\.\s+\*\*([^:]+):\*\*\s*([^\n]*)/g;
  const actionItems = [];
  
  let actionItemMatch;
  while ((actionItemMatch = actionItemRegex.exec(actionItemsSection)) !== null) {
    actionItems.push({
      title: actionItemMatch[1].trim(),
      description: actionItemMatch[2].trim()
    });
  }
  
  return actionItems;
};

// Sync action items to a platform
export const syncActionItems = async (req, res) => {
  try {
    const { email, platform } = req.body;
    const { id: meetingId } = req.params;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    if (!['jira', 'trello', 'asana'].includes(platform)) {
      return res.status(400).json({ error: "Invalid platform" });
    }

    const userId = await getUserIdFromEmail(email);

    // Get integration details
    const integrationResult = await pool.query(
      "SELECT * FROM platform_integrations WHERE user_id = $1 AND platform = $2 AND is_active = TRUE",
      [userId, platform]
    );

    if (integrationResult.rows.length === 0) {
      return res.status(404).json({ error: `${platform} integration not found` });
    }

    const integration = integrationResult.rows[0];

    // Get meeting summary
    const s3Key = `summaries/meeting-${meetingId}.json`;
    const command = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    };

    // This part would normally use AWS SDK to get the summary from S3
    // For this implementation, we'll use a direct fetch from the endpoint
    const summaryResponse = await axios.get(`http://localhost:8080/meeting/${meetingId}/summary-text`);
    const { summary } = summaryResponse.data;

    if (!summary) {
      return res.status(404).json({ error: "Meeting summary not found" });
    }

    // Parse action items from the summary
    const actionItems = parseActionItems(summary);

    if (actionItems.length === 0) {
      return res.status(400).json({ error: "No action items found in the meeting summary" });
    }

    // Sync action items to the platform
    const syncedItems = [];
    
    switch (platform) {
      case 'jira':
        for (const item of actionItems) {
          const jiraItem = await syncToJira(item, integration, meetingId);
          syncedItems.push(jiraItem);
          
          // Record the synced item
          await recordSyncedItem(userId, meetingId, platform, jiraItem.id, item.title, item.description);
        }
        break;
      case 'trello':
        for (const item of actionItems) {
          const trelloItem = await syncToTrello(item, integration, meetingId);
          syncedItems.push(trelloItem);
          
          // Record the synced item
          await recordSyncedItem(userId, meetingId, platform, trelloItem.id, item.title, item.description);
        }
        break;
      case 'asana':
        for (const item of actionItems) {
          const asanaItem = await syncToAsana(item, integration, meetingId);
          syncedItems.push(asanaItem);
          
          // Record the synced item
          await recordSyncedItem(userId, meetingId, platform, asanaItem.gid, item.title, item.description);
        }
        break;
    }

    res.json({ 
      success: true, 
      message: `Synced ${syncedItems.length} action items to ${platform}`,
      items: syncedItems
    });
  } catch (error) {
    console.error(`Error syncing action items to ${req.body.platform}:`, error);
    res.status(500).json({ error: `Failed to sync action items to ${req.body.platform}` });
  }
};

// Record a synced action item
const recordSyncedItem = async (userId, meetingId, platform, platformItemId, title, description) => {
  try {
    await pool.query(
      `INSERT INTO synced_action_items 
       (user_id, meeting_id, platform, platform_item_id, action_item_title, action_item_description)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (meeting_id, platform, action_item_title) 
       DO UPDATE SET platform_item_id = $4, action_item_description = $6, synced_at = CURRENT_TIMESTAMP`,
      [userId, meetingId, platform, platformItemId, title, description]
    );
  } catch (error) {
    console.error("Error recording synced item:", error);
    throw error;
  }
};

// Sync an action item to Jira
const syncToJira = async (actionItem, integration, meetingId) => {
  try {
    const { title, description } = actionItem;
    const { 
      jira_site_url: siteUrl, 
      jira_email: email, 
      jira_project_key: projectKey, 
      jira_issue_type: issueType 
    } = integration;
    
    const apiToken = decrypt(integration.jira_api_token);
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    
    const response = await axios.post(
      `${siteUrl}/rest/api/2/issue`,
      {
        fields: {
          project: {
            key: projectKey
          },
          summary: title,
          description: `${description}\n\nFrom TeamSync meeting: ${meetingId}`,
          issuetype: {
            name: issueType || 'Task'
          }
        }
      },
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error("Error syncing to Jira:", error.response?.data || error.message);
    throw new Error("Failed to create Jira issue");
  }
};

// Sync an action item to Trello
const syncToTrello = async (actionItem, integration, meetingId) => {
  try {
    const { title, description } = actionItem;
    const { 
      trello_board_id: boardId, 
      trello_list_id: listId 
    } = integration;
    
    const apiKey = decrypt(integration.trello_api_key);
    const apiToken = decrypt(integration.trello_api_token);
    
    const response = await axios.post(
      `https://api.trello.com/1/cards`,
      null,
      {
        params: {
          idList: listId,
          name: title,
          desc: `${description}\n\nFrom TeamSync meeting: ${meetingId}`,
          key: apiKey,
          token: apiToken
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error("Error syncing to Trello:", error.response?.data || error.message);
    throw new Error("Failed to create Trello card");
  }
};

// Sync an action item to Asana
const syncToAsana = async (actionItem, integration, meetingId) => {
  try {
    const { title, description } = actionItem;
    const { 
      asana_workspace_id: workspaceId, 
      asana_project_id: projectId 
    } = integration;
    
    const personalAccessToken = decrypt(integration.asana_personal_access_token);
    
    const response = await axios.post(
      `https://app.asana.com/api/1.0/tasks`,
      {
        data: {
          name: title,
          notes: `${description}\n\nFrom TeamSync meeting: ${meetingId}`,
          workspace: workspaceId,
          projects: [projectId]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${personalAccessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.data;
  } catch (error) {
    console.error("Error syncing to Asana:", error.response?.data || error.message);
    throw new Error("Failed to create Asana task");
  }
};
