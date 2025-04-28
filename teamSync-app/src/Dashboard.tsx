"use client"

import { useState, useEffect } from "react"
import { Search, Calendar, Clock, ChevronDown, Activity, Archive, BarChart, Flag } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

interface ZoomMeeting {
  uuid: string
  id: number
  topic: string
  type: number
  status: string
  start_time: string
  duration: number
  join_url: string
}

const Dashboard: React.FC = () => {
  const [meetings, setMeetings] = useState<ZoomMeeting[]>([])
  const [participantsCounts, setParticipantsCounts] = useState<Record<number, number>>({})
  const [activeTab, setActiveTab] = useState<"recent" | "flagged" | "all">("recent")
  const [flaggedMeetings, setFlaggedMeetings] = useState<Set<number>>(new Set())
  const [menuOpen, setMenuOpen] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  const userEmail = "teamsync.group@gmail.com"
  const navigate = useNavigate()

  // 1) Fetch meetings
  useEffect(() => {
    fetch(`http://localhost:8080/meetings?email=${encodeURIComponent(userEmail)}`)
      .then(res => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then(data => setMeetings(data.meetings || []))
      .catch(console.error)
  }, [userEmail])

  // 2) Fetch participant counts
  useEffect(() => {
    if (!meetings.length) return

    meetings.forEach(async m => {
      try {
        const res = await fetch(
          `http://localhost:8080/meeting/${m.id}/participants?email=${encodeURIComponent(userEmail)}`
        )
        if (!res.ok) throw new Error(res.statusText)
        const data = await res.json()
        const count =
          typeof data.total_records === "number"
            ? data.total_records
            : data.participants?.length || 0

        setParticipantsCounts(prev => ({ ...prev, [m.id]: count }))
      } catch (err) {
        console.error(err)
      }
    })
  }, [meetings, userEmail])

  // Toggle flagged state
  const toggleFlag = (id: number) => {
    setFlaggedMeetings(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // 1) Make a sorted copy of meetings (descending: most recent first)
  const sortedMeetings = [...meetings].sort((a, b) =>
    new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  )

  // 2) Filter by active tab
  const tabFilteredMeetings = sortedMeetings.filter(m => {
    if (activeTab === "all") return true
    if (activeTab === "flagged") return flaggedMeetings.has(m.id)
    const started = new Date(m.start_time).getTime()
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    return started >= cutoff
  })

  // 3) Then filter by search term (meeting title)
  const filteredMeetings = tabFilteredMeetings.filter(m =>
    m.topic.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-slate-950 p-6 shadow-lg">
        <h1 className="text-2xl font-bold text-violet-400 mb-10">TeamSync</h1>
        <nav className="space-y-6">
          <div>
            <p className="text-sm font-medium text-slate-400 mb-2">Overview</p>
            <button className="w-full flex items-center space-x-3 px-4 py-2.5 bg-violet-600 text-white rounded-xl">
              <Activity className="h-5 w-5" />
              <span>Dashboard</span>
            </button>
            <button className="w-full flex items-center space-x-3 px-4 py-2.5 text-slate-300 hover:bg-slate-800 rounded-xl transition">
              <BarChart className="h-5 w-5" />
              <span>Analytics</span>
            </button>
            <button className="w-full flex items-center space-x-3 px-4 py-2.5 text-slate-300 hover:bg-slate-800 rounded-xl transition">
              <Archive className="h-5 w-5" />
              <span>Archive</span>
            </button>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400 mb-2">Meetings</p>
            <button className="w-full flex items-center space-x-3 px-4 py-2.5 text-slate-300 hover:bg-slate-800 rounded-xl transition">
              <Calendar className="h-5 w-5" />
              <span>Calendar</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="ml-64 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-semibold text-white">Meeting Insights</h2>
            <p className="text-slate-300">View and analyze your meeting recordings</p>
          </div>
          <div className="relative">
            <button onClick={() => setMenuOpen(o => !o)} className="flex items-center space-x-2">
              <div className="h-10 w-10 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 flex items-center justify-center text-white font-medium">
                JD
              </div>
              <ChevronDown className="h-5 w-5 text-slate-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-slate-800 rounded-md shadow-lg z-10">
                <button
                  onClick={() => { setShowProfileModal(true); setMenuOpen(false) }}
                  className="w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700"
                >
                  Profile
                </button>
                <button
                  onClick={() => navigate("/signin")}
                  className="w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Profile Modal */}
        {showProfileModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-20">
            <div className="bg-slate-800 rounded-xl p-8 w-full max-w-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">Linked accounts</h3>
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="text-slate-400 hover:text-white text-xl leading-none"
                >
                  &times;
                </button>
              </div>
              <div className="space-y-4">
                {['asana', 'jira', 'trello', 'email'].map(key => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-slate-200 capitalize">{key}</label>
                    <input
                      type="text"
                      className="mt-1 block w-full bg-slate-700 text-white placeholder-slate-400 border border-slate-600 rounded-md p-2 focus:ring-violet-500 focus:border-violet-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative max-w-2xl mb-8">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search meeting content..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-800/50 rounded-xl border border-slate-700 shadow-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-white"
          />
        </div>

        {/* Tabs */}
        <div className="flex space-x-6 mb-8 border-b border-slate-700">
          {["recent","flagged","all"].map(tab => (  
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`pb-4 px-2 text-sm font-medium capitalize ${
                activeTab === tab ? "text-violet-400 border-b-2 border-violet-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab} Meetings
            </button>
          ))}
        </div>

        {/* Meetings Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredMeetings.length === 0 && <p className="text-slate-400">No meetings found.</p>}
          {filteredMeetings.map(m => {
            const count = participantsCounts[m.id]
            const isFlagged = flaggedMeetings.has(m.id)
            return (
              <div key={m.id} className="bg-slate-800 rounded-xl p-6 shadow-md hover:shadow-lg border border-slate-700 relative">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-white">{m.topic || "Untitled Meeting"}</h3>
                    <div className="flex items-center space-x-4 text-sm text-slate-300 mt-1">
                      <span className="flex items-center">
                        <Clock className="h-4 w-4 mr-1" />
                        {m.start_time ? new Date(m.start_time).toLocaleString() : "No start time"}
                      </span>
                      <span>•</span>
                      <span>{m.duration ? `${m.duration} min` : "N/A"}</span>
                    </div>
                  </div>
                  <span className="px-3 py-1 text-xs font-medium text-violet-200 bg-violet-900/50 rounded-full">
                    {m.status === "waiting" ? "Scheduled" : "Previous"}
                  </span>
                </div>

                <div className="text-sm text-slate-300">
                  <p>Meeting ID: {m.id}</p>
                  <p>Participants: {count == null ? "Loading..." : count}</p>
                  <div className="mt-2">
                    <Link to={`/meeting/${m.id}`}>
                      <button className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition">
                        View Details
                      </button>
                    </Link>
                  </div>
                </div>

                <button
                  onClick={() => toggleFlag(m.id)}
                  className="absolute bottom-4 right-4 p-2 rounded-full hover:bg-slate-700 transition"
                >
                  <Flag className={`h-5 w-5 ${isFlagged ? "text-violet-400" : "text-slate-400"}`} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
