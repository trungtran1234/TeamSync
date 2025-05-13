import { useState, useEffect } from "react";
import { Check, AlertCircle, Info, X } from "lucide-react";

interface IntegrationProps {
  userEmail: string;
}

interface IntegrationStatus {
  jira: boolean;
  trello: boolean;
  asana: boolean;
}

interface IntegrationFormData {
  jira: {
    siteUrl: string;
    email: string;
    apiToken: string;
    projectKey: string;
    issueType: string;
  };
  trello: {
    apiKey: string;
    apiToken: string;
    boardId: string;
    listId: string;
  };
  asana: {
    personalAccessToken: string;
    workspaceId: string;
    projectId: string;
  };
}

const PlatformIntegrations: React.FC<IntegrationProps> = ({ userEmail }) => {
  const [activeTab, setActiveTab] = useState<"jira" | "trello" | "asana">("jira");
  const [status, setStatus] = useState<IntegrationStatus>({
    jira: false,
    trello: false,
    asana: false,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showInfo, setShowInfo] = useState<boolean>(false);

  const [formData, setFormData] = useState<IntegrationFormData>({
    jira: { siteUrl: "", email: "", apiToken: "", projectKey: "", issueType: "Task" },
    trello: { apiKey: "", apiToken: "", boardId: "", listId: "" },
    asana: { personalAccessToken: "", workspaceId: "", projectId: "" },
  });

  const infoMessages: Record<"jira" | "trello" | "asana", string> = {
    jira:
      "1. Go to https://id.atlassian.com/manage/api-tokens to create an API token.\n" +
      "2. Copy and paste your Jira site URL (e.g., https://yourcompany.atlassian.net).\n" +
      "3. Enter the email associated with your Atlassian account.\n" +
      "4. Paste the generated API token.\n" +
      "5. Input the Project Key and choose the Issue Type you want to use.",
    trello:
      "1. Visit https://trello.com/app-key to get your API Key.\n" +
      "2. Generate a Token on the same page and copy it.\n" +
      "3. Navigate to your Trello Board, copy its Board ID from the URL.\n" +
      "4. Open the desired list and copy its List ID.\n" +
      "5. Paste all values to connect to Trello.",
    asana:
      "1. Log in at https://app.asana.com and go to My Profile Settings > Apps.\n" +
      "2. Create a Personal Access Token under Developer Apps.\n" +
      "3. Copy the Workspace ID from your Asana workspace URL.\n" +
      "4. Open the target Project and copy its Project ID from the URL.\n" +
      "5. Fill in the token, workspace, and project IDs.",
  };

  // Fetch integration status on mount
  useEffect(() => {
    if (!userEmail) return;
    const fetchStatus = async () => {
      try {
        const res = await fetch(
          `http://localhost:8080/integrations/status?email=${encodeURIComponent(userEmail)}`
        );
        if (res.ok) {
          const data: IntegrationStatus = await res.json();
          setStatus(data);
          if (data.jira) fetchDetails("jira");
          if (data.trello) fetchDetails("trello");
          if (data.asana) fetchDetails("asana");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, [userEmail]);

  const fetchDetails = async (platform: "jira" | "trello" | "asana") => {
    try {
      const res = await fetch(
        `http://localhost:8080/integrations/${platform}?email=${encodeURIComponent(userEmail)}`
      );
      if (res.ok) {
        const data = await res.json();
        setFormData(prev => ({ ...prev, [platform]: { ...prev[platform], ...data } }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleInputChange = (platform: keyof IntegrationFormData, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [platform]: { ...prev[platform], [field]: value },
    }));
  };

  const handleSubmit = async (platform: "jira" | "trello" | "asana") => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`http://localhost:8080/integrations/${platform}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, ...formData[platform] }),
      });
      if (res.ok) {
        setStatus(prev => ({ ...prev, [platform]: true }));
        setMessage({
          type: "success",
          text: `${platform.charAt(0).toUpperCase() + platform.slice(1)} connected successfully!`,
        });
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: err.message ?? `Failed to connect to ${platform}` });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: `Error connecting to ${platform}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (platform: "jira" | "trello" | "asana") => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`http://localhost:8080/integrations/${platform}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      if (res.ok) {
        setStatus(prev => ({ ...prev, [platform]: false }));
        setFormData(prev => ({
          ...prev,
          [platform]: { ...prev[platform], apiToken: "", apiKey: "", personalAccessToken: "" },
        }));
        setMessage({
          type: "success",
          text: `${platform.charAt(0).toUpperCase() + platform.slice(1)} disconnected successfully!`,
        });
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: err.message ?? `Failed to disconnect from ${platform}` });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: `Error disconnecting from ${platform}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-800 rounded-xl p-6 shadow-lg relative">
      {/* Info Icon */}
      <button
        onClick={() => setShowInfo(!showInfo)}
        className="absolute top-4 right-4 text-slate-400 hover:text-white"
      >
        <Info className="h-6 w-6" />
      </button>

      {/* Styled Info Panel positioned under form */}
      {showInfo && (
        <div className="absolute left-1/2 transform -translate-x-1/2 top-full mt-4 bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl p-6 w-96 z-50">
          <button
            onClick={() => setShowInfo(false)}
            className="absolute top-3 right-3 text-slate-300 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <h3 className="text-white text-xl font-bold mb-4 capitalize">
            How to connect {activeTab}
          </h3>
          <pre className="text-base text-white leading-loose whitespace-pre-wrap">
            {infoMessages[activeTab]}
          </pre>
        </div>
      )}

      <h2 className="text-2xl font-bold text-white mb-6">Platform Integrations</h2>

      {/* Feedback Message */}
      {message && (
        <div
          className={`mb-4 p-3 rounded-lg flex items-center ${
            message.type === "success" ? "bg-green-800/50 text-green-200" : "bg-red-800/50 text-red-200"
          }`}
        >
          {message.type === "success" ? (
            <Check className="mr-2 h-5 w-5" />
          ) : (
            <AlertCircle className="mr-2 h-5 w-5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-4 mb-6 border-b border-slate-700">
        {(["jira", "trello", "asana"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 px-4 ${
              activeTab === tab
                ? "text-violet-400 border-b-2 border-violet-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}{" "}
            {status[tab] && (
              <span className="ml-2 text-xs bg-green-800 text-green-200 px-2 py-0.5 rounded-full">
                Connected
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Jira Form */}
      {activeTab === "jira" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Site URL */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Jira Site URL
              </label>
              <input
                type="text"
                placeholder="https://yourcompany.atlassian.net"
                value={formData.jira.siteUrl}
                onChange={e => handleInputChange("jira", "siteUrl", e.target.value)}
                className="w-full bg-slate-700 text-white border border-slate-600 rounded-md p-2 focus:ring-violet-500 focus:border-violet-500"
                disabled={status.jira || loading}
              />
            </div>
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                placeholder="your.email@company.com"
                value={formData.jira.email}
                onChange={e => handleInputChange("jira", "email", e.target.value)}
                className="w-full bg-slate-700 text-white border border-slate-600 rounded-md p-2 focus:ring-violet-500 focus:border-violet-500"
                disabled={status.jira || loading}
              />

            </div>
            
            {/* API Token */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                API Token
              </label>
              <input
                type="password"
                placeholder="Your Jira API token"
                value={formData.jira.apiToken}
                onChange={e => handleInputChange("jira", "apiToken", e.target.value)}
                className="w-full bg-slate-700 text-white border border-slate-600 rounded-md p-2 focus:ring-violet-500 focus:border-violet-500"
                disabled={status.jira || loading}
              />
            </div>
            {/* Project Key */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Project Key
              </label>
              <input
                type="text"
                placeholder="PROJ"
                value={formData.jira.projectKey}
                onChange={e => handleInputChange("jira", "projectKey", e.target.value)}
                className="w-full bg-slate-700 text-white border border-slate-600 rounded-md p-2 focus:ring-violet-500 focus:border-violet-500"
                disabled={status.jira || loading}
              />
            </div>
            {/* Issue Type */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Issue Type
              </label>
              <select
                value={formData.jira.issueType}
                onChange={e => handleInputChange("jira", "issueType", e.target.value)}
                className="w-full bg-slate-700 text-white border border-slate-600 rounded-md p-2 focus:ring-violet-500 focus:border-violet-500"
                disabled={status.jira || loading}
              >
                <option value="Task">Task</option>
                <option value="Story">Story</option>
                <option value="Bug">Bug</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            {status.jira ? (
              <button
                onClick={() => handleDisconnect("jira")}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
                disabled={loading}
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => handleSubmit("jira")}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50"
                disabled={
                  loading ||
                  !formData.jira.siteUrl ||
                  !formData.jira.email ||
                  !formData.jira.apiToken ||
                  !formData.jira.projectKey
                }
              >
                Connect
              </button>
            )}
          </div>
        </div>
      )}

      {/* Trello Form */}
      {activeTab === "trello" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                API Key
              </label>
              <input
                type="text"
                placeholder="Your Trello API Key"
                value={formData.trello.apiKey}
                onChange={e => handleInputChange("trello", "apiKey", e.target.value)}
                className="w-full bg-slate-700 text-white	border border-slate-600 rounded-md p-2 focus:ring-violet-500 focus:border-violet-500"
                disabled={status.trello || loading}
              />
            </div>
            {/* API Token */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                API Token
              </label>
              <input
                type="password"
                placeholder="Your Trello API Token"
                value={formData.trello.apiToken}
                onChange={e => handleInputChange("trello", "apiToken", e.target.value)}
                className="w-full bg-slate-700 text-white	border border-slate-600 rounded-md p-2 focus:ring-violet-500 focus:border-violet-500"
                disabled={status.trello || loading}
              />
            </div>
            {/* Board ID */}
            <div>
              <label className="block text-sm	font-medium text-slate-300 mb-1">
                Board ID
              </label>
              <input
                type="text"
                placeholder="Trello Board ID"
                value={formData.trello.boardId}
                onChange={e => handleInputChange("trello", "boardId", e.target.value)}
                className="w-full bg-slate-700 text-white	border border-slate-600 rounded-md p-2 focus:ring-violet-500 focus:border-violet-500"
                disabled={status.trello || loading}
              />
            </div>
            {/* List ID */}
            <div>
              <label className="block text-sm	font-medium text-slate-300 mb-1">
                List ID
              </label>
              <input
                type="text"
                placeholder="Trello List ID"
                value={formData.trello.listId}
                onChange={e => handleInputChange("trello", "listId", e.target.value)}
                className="w-full bg-slate-700 text-white	border border-slate-600 rounded-md p-2 focus:ring-violet-500 focus:border-violet-500"
                disabled={status.trello || loading}
              />
            </div>
          </div>
          <div className="flex justify-end">
            {status.trello ? (
              <button
                onClick={() => handleDisconnect("trello")}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
                disabled={loading}
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => handleSubmit("trello")}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50"
                disabled={
                  loading ||
                  !formData.trello.apiKey ||
                  !formData.trello.apiToken ||
                  !formData.trello.boardId ||
                  !formData.trello.listId
                }
              >
                Connect
              </button>
            )}
          </div>
        </div>
      )}

      {/* Asana Form */}
      {activeTab === "asana" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Personal Access Token */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Personal Access Token
              </label>
              <input
                type="password"
                placeholder="Your Asana Personal Access Token"
                value={formData.asana.personalAccessToken}
                onChange={e => handleInputChange("asana", "personalAccessToken", e.target.value)}
                className="w-full bg-slate-700 text-white	border border-slate-600 rounded-md p-2 focus:ring-violet-500 focus:border-violet-500"
                disabled={status.asana || loading}
              />
            </div>
            {/* Workspace ID */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Workspace ID
              </label>
              <input
                type="text"
                placeholder="Asana Workspace ID"
                value={formData.asana.workspaceId}
                onChange={e => handleInputChange("asana", "workspaceId", e.target.value)}
                className="w-full bg-slate-700 text-white	border border-slate-600 rounded-md p-2 focus:ring-violet-500 focus:border-violet-500"
                disabled={status.asana || loading}
              />
            </div>
            {/* Project ID */}
            <div>
              <label className="block text-sm	font-medium text-slate-300 mb-1">
                Project ID
              </label>
              <input
                type="text"
                placeholder="Asana Project ID"
                value={formData.asana.projectId}
                onChange={e => handleInputChange("asana", "projectId", e.target.value)}
                className="w-full bg-slate-700 text-white	border border-slate-600 rounded-md p-2 focus:ring-violet-500 focus:border-violet-500"
                disabled={status.asana || loading}
              />
            </div>
          </div>
          <div className="flex justify-end">
            {status.asana ? (
              <button
                onClick={() => handleDisconnect("asana")}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
                disabled={loading}
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => handleSubmit("asana")}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-50"
                disabled={
                  loading ||
                  !formData.asana.personalAccessToken ||
                  !formData.asana.workspaceId ||
                  !formData.asana.projectId
                }
              >
                Connect
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformIntegrations;
