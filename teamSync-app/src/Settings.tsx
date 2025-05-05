import { useNavigate } from "react-router-dom";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import PlatformIntegrations from "./components/PlatformIntegrations";

const Settings = () => {
  const navigate = useNavigate();
  // This should be replaced with actual user email from auth context or state
  const userEmail = 'teamsync.group@gmail.com';
  
  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center mb-8">
          <button
            onClick={() => navigate(-1)}
            className="mr-4 p-2 hover:bg-slate-800 rounded-full transition"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-3xl font-bold flex items-center">
            <SettingsIcon className="mr-3 h-7 w-7" />
            Settings
          </h1>
        </div>
        
        <div className="space-y-8">
          <PlatformIntegrations userEmail={userEmail} />
          
          {/* Additional settings sections can be added here */}
        </div>
      </div>
    </div>
  );
};

export default Settings;
