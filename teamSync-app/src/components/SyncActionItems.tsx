import { useState } from "react";
import { ArrowUpCircle, Check, AlertCircle, Loader2 } from "lucide-react";

interface SyncActionItemsProps {
  meetingId: string;
  userEmail: string;
  hasSummary: boolean;
}

interface SyncStatus {
  jira: boolean;
  trello: boolean;
  asana: boolean;
}

const SyncActionItems: React.FC<SyncActionItemsProps> = ({ meetingId, userEmail, hasSummary }) => {
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ jira: false, trello: false, asana: false });
  const [integrationStatus, setIntegrationStatus] = useState<SyncStatus>({ jira: false, trello: false, asana: false });
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Fetch integration status on component mount
  useState(() => {
    if (!userEmail) return;
    
    const fetchIntegrationStatus = async () => {
      try {
        const response = await fetch(`http://localhost:8080/integrations/status?email=${encodeURIComponent(userEmail)}`);
        if (response.ok) {
          const data = await response.json();
          setIntegrationStatus(data);
        }
      } catch (error) {
        console.error("Error fetching integration status:", error);
      }
    };
    
    fetchIntegrationStatus();
  });

  const handleSync = async (platform: "jira" | "trello" | "asana") => {
    if (!hasSummary) {
      setMessage({ type: "error", text: "Please generate a meeting summary first" });
      return;
    }
    
    setSyncing(true);
    setMessage(null);
    
    try {
      const response = await fetch(`http://localhost:8080/meeting/${meetingId}/sync-action-items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: userEmail,
          platform
        })
      });
      
      if (response.ok) {
        setSyncStatus(prev => ({ ...prev, [platform]: true }));
        setMessage({ 
          type: "success", 
          text: `Action items successfully synced to ${platform.charAt(0).toUpperCase() + platform.slice(1)}!` 
        });
      } else {
        const error = await response.json();
        setMessage({ 
          type: "error", 
          text: error.message || `Failed to sync action items to ${platform}` 
        });
      }
    } catch (error) {
      console.error(`Error syncing to ${platform}:`, error);
      setMessage({ type: "error", text: `Error syncing action items to ${platform}` });
    } finally {
      setSyncing(false);
    }
  };

  // If no integrations are connected, show a message
  if (!integrationStatus.jira && !integrationStatus.trello && !integrationStatus.asana) {
    return (
      <div className="bg-slate-800 p-4 rounded-lg mb-4">
        <h3 className="text-lg font-medium text-white mb-2">Sync Action Items</h3>
        <p className="text-slate-300 mb-4">Connect to Jira, Trello, or Asana to sync action items from this meeting.</p>
        <a 
          href="/settings" 
          className="inline-block px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg"
        >
          Go to Settings
        </a>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 p-4 rounded-lg mb-4">
      <h3 className="text-lg font-medium text-white mb-2">Sync Action Items</h3>
      
      {message && (
        <div className={`mb-4 p-3 rounded-lg flex items-center ${message.type === "success" ? "bg-green-800/50 text-green-200" : "bg-red-800/50 text-red-200"}`}>
          {message.type === "success" ? <Check className="mr-2 h-5 w-5" /> : <AlertCircle className="mr-2 h-5 w-5" />}
          <span>{message.text}</span>
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {integrationStatus.jira && (
          <button
            onClick={() => handleSync("jira")}
            disabled={syncing || syncStatus.jira || !hasSummary}
            className={`flex items-center justify-center p-3 rounded-lg transition ${
              syncStatus.jira 
                ? "bg-green-800/50 text-green-200" 
                : "bg-slate-700 hover:bg-slate-600 text-white"
            } disabled:opacity-50`}
          >
            {syncing ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : syncStatus.jira ? (
              <Check className="mr-2 h-5 w-5" />
            ) : (
              <ArrowUpCircle className="mr-2 h-5 w-5" />
            )}
            {syncStatus.jira ? "Synced to Jira" : "Sync to Jira"}
          </button>
        )}
        
        {integrationStatus.trello && (
          <button
            onClick={() => handleSync("trello")}
            disabled={syncing || syncStatus.trello || !hasSummary}
            className={`flex items-center justify-center p-3 rounded-lg transition ${
              syncStatus.trello 
                ? "bg-green-800/50 text-green-200" 
                : "bg-slate-700 hover:bg-slate-600 text-white"
            } disabled:opacity-50`}
          >
            {syncing ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : syncStatus.trello ? (
              <Check className="mr-2 h-5 w-5" />
            ) : (
              <ArrowUpCircle className="mr-2 h-5 w-5" />
            )}
            {syncStatus.trello ? "Synced to Trello" : "Sync to Trello"}
          </button>
        )}
        
        {integrationStatus.asana && (
          <button
            onClick={() => handleSync("asana")}
            disabled={syncing || syncStatus.asana || !hasSummary}
            className={`flex items-center justify-center p-3 rounded-lg transition ${
              syncStatus.asana 
                ? "bg-green-800/50 text-green-200" 
                : "bg-slate-700 hover:bg-slate-600 text-white"
            } disabled:opacity-50`}
          >
            {syncing ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : syncStatus.asana ? (
              <Check className="mr-2 h-5 w-5" />
            ) : (
              <ArrowUpCircle className="mr-2 h-5 w-5" />
            )}
            {syncStatus.asana ? "Synced to Asana" : "Sync to Asana"}
          </button>
        )}
      </div>
    </div>
  );
};

export default SyncActionItems;
