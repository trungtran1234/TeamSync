import React, { useState, useEffect } from 'react';
import { 
  Search, Calendar, Clock, ChevronDown, Activity, Archive, BarChart, Flag 
} from 'lucide-react';

interface ZoomMeeting {
  uuid: string;
  id: number;
  topic: string;
  type: number;
  status: string;
  start_time: string; 
  duration: number;    
  join_url: string;
}

const Dashboard = () => {
  const [meetings, setMeetings] = useState<ZoomMeeting[]>([]);
  const [participantsCounts, setParticipantsCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState('recent');
  const [flaggedMeetings, setFlaggedMeetings] = useState<Set<number>>(new Set());

  const userEmail = 'teamsync.group@gmail.com';

  // 1) Fetch your meetings
  useEffect(() => {
    console.log('Fetching meetings for user:', userEmail);
    fetch(`http://localhost:8080/meetings?email=${encodeURIComponent(userEmail)}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch meetings: ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        console.log('Meetings response:', data);
        // Zoom’s response is { page_count, page_number, total_records, meetings: [ ... ] }
        setMeetings(data.meetings || []);
      })
      .catch((err) => {
        console.error('Error fetching previous meetings:', err);
      });
  }, [userEmail]);

  // 2) For each meeting, get participant count
  useEffect(() => {
    // Only fetch if we actually have meetings
    if (meetings.length === 0) return;

    meetings.forEach(async (meeting) => {
      try {
        console.log(`Fetching participants for meeting ID: ${meeting.id}`);
        const res = await fetch(
          `http://localhost:8080/meeting/${encodeURIComponent(meeting.id)}/participants?email=${encodeURIComponent(userEmail)}`
        );
        if (!res.ok) {
          throw new Error(`Failed to fetch participants for meeting ${meeting.id}: ${res.statusText}`);
        }
        const data = await res.json();
        console.log(`Participants response for meeting ${meeting.id}:`, data);

        const participantCount =
          typeof data.total_records === 'number'
            ? data.total_records
            : (data.participants?.length || 0);

        // Update participantsCounts state, keyed by meeting.id
        setParticipantsCounts((prev) => ({
          ...prev,
          [meeting.id]: participantCount
        }));
      } catch (error) {
        console.error(`Error fetching participants for meeting ${meeting.id}:`, error);
      }
    });
  }, [meetings, userEmail]);

  // Toggle flagged state for a meeting
  const toggleFlag = (meetingId: number) => {
    setFlaggedMeetings((prev) => {
      const newFlaggedMeetings = new Set(prev);
      if (newFlaggedMeetings.has(meetingId)) {
        newFlaggedMeetings.delete(meetingId);
      } else {
        newFlaggedMeetings.add(meetingId);
      }
      return newFlaggedMeetings;
    });
  };

  // Filter meetings based on the active tab
  const filteredMeetings = meetings.filter((meeting) => {
    const meetingDate = new Date(meeting.start_time);
    const currentDate = new Date();
    const sevenDaysAgo = new Date(currentDate.setDate(currentDate.getDate() - 7));

    if (activeTab === 'recent') {
      return meetingDate >= sevenDaysAgo;
    } else if (activeTab === 'flagged') {
      return flaggedMeetings.has(meeting.id);
    }
    return true; // For 'all' and other tabs
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-white shadow-lg p-6">
        <h1 className="text-2xl font-bold text-blue-600 mb-10">TeamSync</h1>
        
        <nav className="space-y-6">
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-400">Overview</div>
            <button className="w-full flex items-center space-x-3 px-4 py-2.5 text-blue-600 bg-blue-50 rounded-xl">
              <Activity className="h-5 w-5" />
              <span>Dashboard</span>
            </button>
            <button className="w-full flex items-center space-x-3 px-4 py-2.5 text-gray-600 hover:bg-gray-50 rounded-xl">
              <BarChart className="h-5 w-5" />
              <span>Analytics</span>
            </button>
            <button className="w-full flex items-center space-x-3 px-4 py-2.5 text-gray-600 hover:bg-gray-50 rounded-xl">
              <Archive className="h-5 w-5" />
              <span>Archive</span>
            </button>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-400">Meetings</div>
            <button className="w-full flex items-center space-x-3 px-4 py-2.5 text-gray-600 hover:bg-gray-50 rounded-xl">
              <Calendar className="h-5 w-5" />
              <span>Calendar</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="ml-64 p-8">
        {/* Header Section */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Meeting Insights</h2>
            <p className="text-gray-500 mt-1">View and analyze your meeting recordings</p>
          </div>
          <div className="relative">
            <div className="flex items-center space-x-2">
              <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 flex items-center justify-center text-white font-medium">
                JD
              </div>
              <ChevronDown className="h-5 w-5 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-2xl mb-8">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search meeting content..."
            className="w-full pl-12 pr-4 py-3 bg-white rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Meeting Tabs */}
        <div className="flex space-x-6 mb-8 border-b border-gray-200">
          {['recent', 'flagged', 'all'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 px-2 text-sm font-medium capitalize ${
                activeTab === tab 
                  ? 'text-blue-600 border-b-2 border-blue-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab} Meetings
            </button>
          ))}
        </div>

        {/* Meetings Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredMeetings.length === 0 && (
            <p className="text-gray-500">No meetings found.</p>
          )}
          {filteredMeetings.map((m) => {
            const participantCount = participantsCounts[m.id] ?? null;
            const isFlagged = flaggedMeetings.has(m.id);

            return (
              <div 
                key={m.id} 
                className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow relative"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {m.topic || 'Untitled Meeting'}
                    </h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                      <span className="flex items-center">
                        <Clock className="h-4 w-4 mr-1" />
                        {m.start_time 
                          ? new Date(m.start_time).toLocaleString() 
                          : 'No start time'}
                      </span>
                      <span>•</span>
                      <span>{m.duration ? `${m.duration} min` : 'N/A'}</span>
                    </div>
                  </div>
                  <span className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-full">
                    {m.status === 'waiting' ? 'Scheduled' : 'Previous'}
                  </span>
                </div>
                
                <div className="text-sm text-gray-600">
                  <p>Meeting ID: {m.id}</p>

                  {/* Display # of participants */}
                  <p>Participants: 
                    {participantCount === null 
                      ? ' Loading...' 
                      : ` ${participantCount}`
                    }
                  </p>

                  <p className="mt-2">
                    <a 
                      href={m.join_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-block px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      View Details
                    </a>
                  </p>
                </div>

                {/* Flag Icon */}
                <button
                  onClick={() => toggleFlag(m.id)}
                  className="absolute bottom-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <Flag 
                    className={`h-5 w-5 ${isFlagged ? 'text-blue-600' : 'text-gray-400'}`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;