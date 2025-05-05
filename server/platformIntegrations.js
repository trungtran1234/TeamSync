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
  
  try {
    // First get the Action Items section
    const actionItemsSection = extractActionItemsSection(summary);
    if (!actionItemsSection) return [];
    
    console.log("Action Items Section:", actionItemsSection);
    
    // Handle the case where "Task Title:" and "Description:" are on separate lines
    // This is a common format in our meeting summaries
    const multiLinePattern = /(\d+\.\s+)?(?:\*\*)?Task Title:(?:\*\*)?\s*([^\n]+)\s*(?:\*\*)?Description:(?:\*\*)?\s*([^\n]+)/gi;
    const actionItems = [];
    
    let actionItemMatch;
    while ((actionItemMatch = multiLinePattern.exec(actionItemsSection)) !== null) {
      const title = actionItemMatch[2].trim();
      const description = actionItemMatch[3].trim();
      
      console.log("Found action item (multi-line):", { title, description });
      
      actionItems.push({
        title,
        description
      });
    }
    
    // If no matches found yet, try a more flexible pattern that can handle titles and descriptions
    // separated by newlines
    if (actionItems.length === 0) {
      // Convert newlines to spaces temporarily to help with regex
      const flattened = actionItemsSection.replace(/\n\s*/g, ' ');
      const flattenedPattern = /Task Title:\s*([^Description:]+)\s*Description:\s*([^Task Title:]+)/gi;
      
      while ((actionItemMatch = flattenedPattern.exec(flattened)) !== null) {
        const title = actionItemMatch[1].trim();
        const description = actionItemMatch[2].trim();
        
        console.log("Found action item (flattened):", { title, description });
        
        actionItems.push({
          title,
          description
        });
      }
    }
    
    // If still no items found, try the numbered list pattern
    if (actionItems.length === 0) {
      const numberedListPattern = /\d+\.\s+(?:\*\*)?([^:]+)(?:\*\*)?\s*:\s*([^\n]+)/gi;
      while ((actionItemMatch = numberedListPattern.exec(actionItemsSection)) !== null) {
        const title = actionItemMatch[1].trim();
        const description = actionItemMatch[2].trim();
        
        console.log("Found action item (numbered list):", { title, description });
        
        actionItems.push({
          title,
          description
        });
      }
    }
    
    // If still no items, look for Task Title/Description pairs anywhere in the text
    if (actionItems.length === 0) {
      // First find all Task Title instances
      const taskTitles = [];
      const titlePattern = /(?:\*\*)?Task Title:(?:\*\*)?\s*([^\n]+)/gi;
      
      while ((actionItemMatch = titlePattern.exec(actionItemsSection)) !== null) {
        taskTitles.push({
          title: actionItemMatch[1].trim(),
          index: actionItemMatch.index + actionItemMatch[0].length
        });
      }
      
      // Then find all Descriptions
      const descriptions = [];
      const descPattern = /(?:\*\*)?Description:(?:\*\*)?\s*([^\n]+)/gi;
      
      while ((actionItemMatch = descPattern.exec(actionItemsSection)) !== null) {
        descriptions.push({
          description: actionItemMatch[1].trim(),
          index: actionItemMatch.index
        });
      }
      
      // Match them up - each title is paired with the next description
      if (taskTitles.length > 0 && descriptions.length > 0) {
        for (let i = 0; i < taskTitles.length; i++) {
          // Find the closest description that follows this title
          const title = taskTitles[i];
          let closestDesc = null;
          let minDistance = Infinity;
          
          for (const desc of descriptions) {
            const distance = desc.index - title.index;
            if (distance > 0 && distance < minDistance) {
              closestDesc = desc;
              minDistance = distance;
            }
          }
          
          if (closestDesc) {
            console.log("Found action item (paired):", { 
              title: title.title, 
              description: closestDesc.description 
            });
            
            actionItems.push({
              title: title.title,
              description: closestDesc.description
            });
          }
        }
      }
    }
    
    // Last resort - just look for any colon-separated patterns
    if (actionItems.length === 0) {
      const colonSeparatedPattern = /([^:]+):\s*([^\n]+)/gi;
      while ((actionItemMatch = colonSeparatedPattern.exec(actionItemsSection)) !== null) {
        const title = actionItemMatch[1].trim();
        // Skip if this is a header or looks like a category, not an action item
        if (title.toLowerCase().includes('action') || 
            title.length > 50 || 
            title.toLowerCase() === 'description') continue;
        
        console.log("Found action item (colon-separated):", { 
          title, 
          description: actionItemMatch[2].trim() 
        });
        
        actionItems.push({
          title,
          description: actionItemMatch[2].trim()
        });
      }
    }
    
    console.log(`Total action items found: ${actionItems.length}`);
    return actionItems;
  } catch (error) {
    console.error("Error parsing action items:", error);
    return [];
  }
};

// Helper function to extract the Action Items section from the summary
function extractActionItemsSection(summary) {
  // Try multiple ways to identify the Action Items section
  const patterns = [
    /Action Items:[\s\S]*?((?=\n\s*\n\S)|\n*$)/i,  // Match until empty line followed by non-whitespace or end
    /Action Items:([\s\S]*?)(?:\n\s*\n\S|\n*$)/i,   // Another variation
    /Tasks:([\s\S]*?)(?:\n\s*\n\S|\n*$)/i,          // Look for "Tasks" instead
    /To-Do:([\s\S]*?)(?:\n\s*\n\S|\n*$)/i           // Look for "To-Do" instead
  ];
  
  for (const pattern of patterns) {
    const match = summary.match(pattern);
    if (match && match[0]) {
      return match[0];
    }
  }
  
  // If no section found, return the entire summary as a fallback
  return summary;
}

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
          try {
            const trelloItem = await syncToTrello(item, integration, meetingId);
            syncedItems.push(trelloItem);
            
            // Record the synced item
            await recordSyncedItem(userId, meetingId, platform, trelloItem.id, item.title, item.description);
          } catch (itemError) {
            console.error(`Error syncing individual Trello item:`, itemError);
            throw new Error(`Failed to sync to Trello: ${itemError.message}`);
          }
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
    res.status(500).json({ error: `Failed to sync action items to ${req.body.platform}: ${error.message}` });
  }
};

// Sync action items to all connected platforms
export const syncActionItemsToAllPlatforms = async (req, res) => {
  try {
    const { email } = req.body;
    const meetingId = req.params.id;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Get user ID
    const userId = await getUserIdFromEmail(email);
    
    // Get meeting summary
    const summaryResult = await pool.query(
      "SELECT summary FROM meeting_summaries WHERE meeting_id = $1",
      [meetingId]
    );
    
    if (summaryResult.rows.length === 0) {
      return res.status(404).json({ error: "Meeting summary not found" });
    }
    
    const summary = summaryResult.rows[0].summary;
    
    // Parse action items from summary
    const actionItems = parseActionItems(summary);
    
    if (actionItems.length === 0) {
      return res.status(404).json({ error: "No action items found in the meeting summary" });
    }
    
    // Get user's connected platforms
    const integrationsResult = await pool.query(
      "SELECT platform, id FROM platform_integrations WHERE user_id = $1 AND is_active = TRUE",
      [userId]
    );
    
    if (integrationsResult.rows.length === 0) {
      return res.status(404).json({ error: "No active platform integrations found" });
    }
    
    const connectedPlatforms = integrationsResult.rows.map(row => row.platform);
    
    // Initialize sync status for all platforms
    const syncStatus = {
      jira: false,
      trello: false,
      asana: false
    };
    
    // Track sync results for detailed reporting
    const syncResults = {
      successful: [],
      failed: []
    };
    
    // Process each platform in parallel
    await Promise.all(
      connectedPlatforms.map(async (platform) => {
        try {
          // Get integration details for this platform
          const integrationResult = await pool.query(
            `SELECT * FROM platform_integrations WHERE user_id = $1 AND platform = $2 AND is_active = TRUE`,
            [userId, platform]
          );
          
          if (integrationResult.rows.length === 0) {
            throw new Error(`${platform} integration not found or inactive`);
          }
          
          const integration = integrationResult.rows[0];
          
          // Process action items for this platform
          const platformResults = [];
          
          for (const actionItem of actionItems) {
            try {
              let result;
              
              // Call platform-specific sync function
              switch (platform) {
                case 'jira':
                  result = await syncToJira(actionItem, integration, meetingId);
                  break;
                case 'trello':
                  result = await syncToTrello(actionItem, integration, meetingId);
                  break;
                case 'asana':
                  result = await syncToAsana(actionItem, integration, meetingId);
                  break;
                default:
                  throw new Error(`Unsupported platform: ${platform}`);
              }
              
              // Record the synced item in our database
              await recordSyncedItem(
                userId,
                meetingId,
                platform,
                result.id,
                actionItem.title,
                actionItem.description
              );
              
              platformResults.push({
                platform,
                action: actionItem.title,
                result: 'success',
                itemId: result.id
              });
            } catch (error) {
              console.error(`Error syncing item "${actionItem.title}" to ${platform}:`, error);
              platformResults.push({
                platform,
                action: actionItem.title,
                result: 'error',
                error: error.message
              });
            }
          }
          
          // Update sync status based on results
          const allSuccessful = platformResults.every(result => result.result === 'success');
          syncStatus[platform] = allSuccessful;
          
          if (allSuccessful) {
            syncResults.successful.push({
              platform,
              itemsCount: platformResults.length
            });
          } else {
            const successCount = platformResults.filter(r => r.result === 'success').length;
            syncResults.failed.push({
              platform,
              successCount,
              totalCount: platformResults.length,
              errors: platformResults
                .filter(r => r.result === 'error')
                .map(r => ({ action: r.action, error: r.error }))
            });
          }
        } catch (error) {
          console.error(`Error syncing to ${platform}:`, error);
          syncStatus[platform] = false;
          syncResults.failed.push({
            platform,
            error: error.message
          });
        }
      })
    );
    
    // Return detailed results
    res.json({
      syncStatus,
      syncResults,
      message: "Action items sync process completed"
    });
  } catch (error) {
    console.error("Error syncing action items to all platforms:", error);
    res.status(500).json({ error: "Failed to sync action items" });
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
    
    console.log("Original title:", title);
    console.log("Original description:", description);
    
    // Fix the title and description extraction
    let cleanTitle = title;
    let cleanDescription = description;
    
    // If the title contains "Task Title:", it means we need to extract the actual title from it
    if (title.includes("Task Title:")) {
      // The title is in the format "Task Title: [actual title]"
      cleanTitle = title.replace(/^\s*Task Title:\s*/i, '').trim();
    }
    
    // If the description contains "Description:", extract the actual description
    if (description.includes("Description:")) {
      // The description is in the format "Description: [actual description]"
      cleanDescription = description.replace(/^\s*Description:\s*/i, '').trim();
    }
    
    // Remove any markdown formatting characters
    cleanTitle = cleanTitle.replace(/\*\*/g, '').trim();
    cleanDescription = cleanDescription.replace(/\*\*/g, '').trim();
    
    console.log("Clean title:", cleanTitle);
    console.log("Clean description:", cleanDescription);
    
    // Add more context to the Jira description
    const jiraDescription = `${cleanDescription}\n\nFrom TeamSync meeting: ${meetingId}`;
    
    const response = await axios.post(
      `${siteUrl}/rest/api/2/issue`,
      {
        fields: {
          project: {
            key: projectKey
          },
          summary: cleanTitle,
          description: jiraDescription,
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
      trello_list_id: listIdOrName 
    } = integration;
    
    const apiKey = decrypt(integration.trello_api_key);
    const apiToken = decrypt(integration.trello_api_token);
    
    // Verify that we have all required parameters
    if (!apiKey || !apiToken) {
      throw new Error("Missing Trello API credentials");
    }
    
    if (!listIdOrName) {
      throw new Error("Missing Trello List ID");
    }
    
    // Fix the title and description extraction
    let cleanTitle = title;
    let cleanDescription = description;
    
    // If the title contains "Task Title:", it means we need to extract the actual title from it
    if (title.includes("Task Title:")) {
      // The title is in the format "Task Title: [actual title]"
      cleanTitle = title.replace(/^\s*Task Title:\s*/i, '').trim();
    }
    
    // If the description contains "Description:", extract the actual description
    if (description.includes("Description:")) {
      // The description is in the format "Description: [actual description]"
      cleanDescription = description.replace(/^\s*Description:\s*/i, '').trim();
    }
    
    // Remove any markdown formatting characters
    cleanTitle = cleanTitle.replace(/\*\*/g, '').trim();
    cleanDescription = cleanDescription.replace(/\*\*/g, '').trim();
    
    // Add more context to the Trello description
    const trelloDescription = `${cleanDescription}\n\nFrom TeamSync meeting: ${meetingId}`;
    
    // Check if listIdOrName is an alphanumeric ID or a list name
    // If it's a name, we need to get the actual ID first
    let actualListId = listIdOrName;
    
    // If the stored value doesn't look like a Trello ID (which is typically alphanumeric and long),
    // it's probably a list name, so we need to fetch the actual ID
    if (!/^[a-f0-9]{24}$/i.test(listIdOrName)) {
      console.log(`List ID does not appear to be a valid Trello ID. Value: ${listIdOrName}`);
      console.log("Getting list ID from board...");
      
      // Get lists for the board to find the correct list ID
      const listsUrl = `https://api.trello.com/1/boards/${boardId}/lists?key=${apiKey}&token=${apiToken}`;
      const listsResponse = await axios.get(listsUrl);
      
      if (!listsResponse.data || !Array.isArray(listsResponse.data)) {
        throw new Error("Failed to retrieve lists from Trello board");
      }
      
      // Find the list by name
      const matchingList = listsResponse.data.find(
        list => list.name.toLowerCase() === listIdOrName.toLowerCase()
      );
      
      if (!matchingList) {
        console.error("Available lists:", listsResponse.data.map(l => l.name).join(", "));
        throw new Error(`Could not find a list named "${listIdOrName}" on the Trello board`);
      }
      
      actualListId = matchingList.id;
      console.log(`Found list "${listIdOrName}" with ID: ${actualListId}`);
    }
    
    console.log("Sending to Trello:", {
      listId: actualListId,
      name: cleanTitle,
      desc: trelloDescription.substring(0, 30) + "...", // Truncate for log
      key: "API_KEY_PRESENT", // Don't log the actual key
      token: "TOKEN_PRESENT"   // Don't log the actual token
    });
    
    const response = await axios.post(
      `https://api.trello.com/1/cards`,
      null,
      {
        params: {
          idList: actualListId,
          name: cleanTitle,
          desc: trelloDescription,
          key: apiKey,
          token: apiToken
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error("Error syncing to Trello:", error.response?.data || error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", JSON.stringify(error.response.data, null, 2));
    }
    throw new Error(`Failed to create Trello card: ${error.message}`);
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
    
    // Fix the title and description extraction
    let cleanTitle = title;
    let cleanDescription = description;
    
    // If the title contains "Task Title:", it means we need to extract the actual title from it
    if (title.includes("Task Title:")) {
      // The title is in the format "Task Title: [actual title]"
      cleanTitle = title.replace(/^\s*Task Title:\s*/i, '').trim();
    }
    
    // If the description contains "Description:", extract the actual description
    if (description.includes("Description:")) {
      // The description is in the format "Description: [actual description]"
      cleanDescription = description.replace(/^\s*Description:\s*/i, '').trim();
    }
    
    // Remove any markdown formatting characters
    cleanTitle = cleanTitle.replace(/\*\*/g, '').trim();
    cleanDescription = cleanDescription.replace(/\*\*/g, '').trim();
    
    // Add more context to the Asana description
    const asanaDescription = `${cleanDescription}\n\nFrom TeamSync meeting: ${meetingId}`;
    
    const response = await axios.post(
      `https://app.asana.com/api/1.0/tasks`,
      {
        data: {
          name: cleanTitle,
          notes: asanaDescription,
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
