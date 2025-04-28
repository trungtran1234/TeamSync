-- Create table for storing platform integration credentials
CREATE TABLE IF NOT EXISTS platform_integrations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL, -- 'jira', 'trello', or 'asana'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  -- Common fields
  is_active BOOLEAN DEFAULT TRUE,
  -- Jira specific fields
  jira_site_url TEXT,
  jira_email TEXT,
  jira_api_token TEXT,
  jira_project_key TEXT,
  jira_issue_type TEXT,
  -- Trello specific fields
  trello_api_key TEXT,
  trello_api_token TEXT,
  trello_board_id TEXT,
  trello_list_id TEXT,
  -- Asana specific fields
  asana_personal_access_token TEXT,
  asana_workspace_id TEXT,
  asana_project_id TEXT,
  -- Add a unique constraint to ensure one active integration per platform per user
  UNIQUE (user_id, platform)
);

-- Create table for tracking synced action items
CREATE TABLE IF NOT EXISTS synced_action_items (
  id SERIAL PRIMARY KEY,
  meeting_id BIGINT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL, -- 'jira', 'trello', or 'asana'
  platform_item_id TEXT NOT NULL, -- ID of the created item in the platform
  action_item_title TEXT NOT NULL,
  action_item_description TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  -- Add a unique constraint to prevent duplicate syncs
  UNIQUE (meeting_id, platform, action_item_title)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS platform_integrations_user_id_idx ON platform_integrations (user_id);
CREATE INDEX IF NOT EXISTS synced_action_items_meeting_id_idx ON synced_action_items (meeting_id);
CREATE INDEX IF NOT EXISTS synced_action_items_user_id_idx ON synced_action_items (user_id);
