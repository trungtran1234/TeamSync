import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  BarChart,
  Activity,
  Archive,
} from "lucide-react";
import { Link } from "react-router-dom";

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

const Calendar = () => {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [userInitial, setUserInitial] = useState<string>("T");
  const [meetings, setMeetings] = useState<ZoomMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // For user testing - would come from auth system
  const userEmail = "teamsync.group@gmail.com";

  // Get current month and year
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Navigate between months
  const prevMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentMonth - 1);
    setCurrentDate(newDate);
  };

  const nextMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentMonth + 1);
    setCurrentDate(newDate);
  };

  // Fetch meetings
  useEffect(() => {
    setLoading(true);
    fetch(
      `http://localhost:8080/meetings?email=${encodeURIComponent(userEmail)}`,
    )
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((data) => {
        setMeetings(data.meetings || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching meetings:", err);
        setError("Failed to load meetings");
        setLoading(false);
      });

    // Set user initial from email
    if (userEmail) {
      setUserInitial(userEmail.charAt(0).toUpperCase());
    }
  }, [userEmail]);

  // Organize meetings by date
  const meetingsByDate: Record<string, ZoomMeeting[]> = {};
  meetings.forEach((meeting) => {
    const meetingDate = new Date(meeting.start_time);
    const dateKey = `${meetingDate.getFullYear()}-${meetingDate.getMonth()}-${meetingDate.getDate()}`;

    if (!meetingsByDate[dateKey]) {
      meetingsByDate[dateKey] = [];
    }
    meetingsByDate[dateKey].push(meeting);
  });

  // Generate days in month
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  // Create calendar grid
  const calendarDays = [];
  // Empty cells for days before the first of the month
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(
      <div
        key={`empty-${i}`}
        className="h-36 bg-slate-800/30 border border-slate-700/30"
      ></div>,
    );
  }

  // Actual days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday =
      new Date().getDate() === day &&
      new Date().getMonth() === currentMonth &&
      new Date().getFullYear() === currentYear;

    // Check if there are meetings on this day
    const dateKey = `${currentYear}-${currentMonth}-${day}`;
    const dailyMeetings = meetingsByDate[dateKey] || [];

    calendarDays.push(
      <div
        key={day}
        className={`h-36 p-2 border border-slate-700 relative overflow-hidden ${isToday ? "bg-violet-900/20" : "bg-slate-800/50"}`}
      >
        <div
          className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-sm ${isToday ? "bg-violet-500 text-white" : "text-slate-300"}`}
        >
          {day}
        </div>

        {/* Display meetings for this day */}
        <div className="absolute top-8 left-2 right-2 bottom-2 overflow-y-auto">
          {dailyMeetings.map((meeting, idx) => {
            const meetingTime = new Date(meeting.start_time);
            const hours = meetingTime.getHours();
            const minutes = meetingTime.getMinutes();
            const formattedTime = `${hours % 12 || 12}:${minutes.toString().padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;

            return (
              <Link
                to={`/meeting/${meeting.id}`}
                key={meeting.uuid || idx}
                className="block mb-1"
              >
                <div className="bg-violet-600 text-white text-xs p-1 rounded truncate hover:bg-violet-700">
                  {formattedTime} - {meeting.topic || "Untitled Meeting"}
                </div>
              </Link>
            );
          })}
        </div>
      </div>,
    );
  }

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-slate-950 p-6 shadow-lg">
        <h1 className="text-2xl font-bold text-violet-400 mb-10">TeamSync</h1>
        <nav className="space-y-6">
          <Link
            to="/dashboard"
            className="flex items-center space-x-3 text-slate-300 hover:text-white"
          >
            <BarChart className="h-5 w-5" />
            <span>Dashboard</span>
          </Link>
          <Link
            to="/calendar"
            className="flex items-center space-x-3 text-violet-400 font-medium"
          >
            <CalendarIcon className="h-5 w-5" />
            <span>Calendar</span>
          </Link>
          <Link
            to="/dashboard"
            className="flex items-center space-x-3 text-slate-300 hover:text-white"
          >
            <Activity className="h-5 w-5" />
            <span>Meetings</span>
          </Link>
          <Link
            to="/dashboard"
            className="flex items-center space-x-3 text-slate-300 hover:text-white"
          >
            <Archive className="h-5 w-5" />
            <span>Archive</span>
          </Link>
        </nav>
      </div>

      {/* Main Content */}
      <div className="ml-64 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              Meeting Calendar
            </h2>
            <p className="text-slate-300">
              Plan and schedule your upcoming meetings
            </p>
          </div>

          {/* User Avatar */}
          <div className="h-10 w-10 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 flex items-center justify-center text-white font-medium">
            {userInitial}
          </div>
        </div>

        {/* Calendar Controls */}
        <div className="flex items-center justify-between mb-6 bg-slate-800 p-4 rounded-lg">
          <div className="flex items-center space-x-4">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-slate-700 rounded-full"
            >
              <ChevronLeft className="h-5 w-5 text-slate-300" />
            </button>
            <h3 className="text-xl font-medium text-white">
              {monthNames[currentMonth]} {currentYear}
            </h3>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-slate-700 rounded-full"
            >
              <ChevronRight className="h-5 w-5 text-slate-300" />
            </button>
          </div>
          <button
            onClick={() => setShowEventModal(true)}
            className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>New Meeting</span>
          </button>
        </div>

        {/* Loading or Error States */}
        {loading && (
          <div className="bg-slate-800 rounded-lg p-6 mb-4 text-center">
            <p className="text-white">Loading your meetings...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-6 mb-4">
            <p className="text-white">{error}</p>
            <p className="text-slate-300 mt-2">
              Try refreshing the page or check your connection.
            </p>
          </div>
        )}

        {/* Calendar Grid */}
        <div className="bg-slate-800 rounded-lg shadow-xl overflow-hidden">
          {/* Day Headers */}
          <div className="grid grid-cols-7 bg-slate-900">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="py-3 text-center text-slate-300 font-medium"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7">{calendarDays}</div>
        </div>
      </div>

      {/* New Meeting Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-white mb-4">
              Schedule New Meeting
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Meeting Title
                </label>
                <input
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-violet-500"
                  placeholder="Enter meeting title"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Participants
                </label>
                <input
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-violet-500"
                  placeholder="Enter email addresses"
                />
              </div>
              <div className="flex space-x-4 pt-4">
                <button
                  onClick={() => setShowEventModal(false)}
                  className="w-1/2 py-2 border border-slate-600 rounded-lg text-white hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button className="w-1/2 py-2 bg-violet-600 rounded-lg text-white hover:bg-violet-700">
                  Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
