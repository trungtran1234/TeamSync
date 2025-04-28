import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useParams, useNavigate } from "react-router-dom";

interface Participant {
  name?: string;
  user_email?: string;
  join_time?: string;
  leave_time?: string;
}

interface MeetingDetails {
  topic?: string;
  start_time?: string;
  duration?: number;
  host_email?: string;
  id?: string;
  timezone?: string;
}

interface SummaryData {
  summary: string;
  timestamp: string;
}

const MeetingDetails = () => {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [meetingDetails] = useState<MeetingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // make endpoint to fetch email and use it later
  const userEmail = "teamsync.group@gmail.com";

  useEffect(() => {
    if (!id || !userEmail) {
      setError("Missing meeting ID or user email");
      setLoading(false);
      return;
    }

    const fetchMeetingData = async () => {
      setLoading(true);
      try {
        // Fetch meeting details and participants in parallel
        const [participantsResponse] = await Promise.all([
          fetch(
            `http://localhost:8080/meeting/${id}/participants?email=${userEmail}`,
          ),
        ]);

        if (participantsResponse.ok) {
          const participantsData = await participantsResponse.json();
          setParticipants(participantsData.participants || []);
        }

        // Try to fetch the stored summary
        const storedSummaryResponse = await fetch(
          `http://localhost:8080/meeting/${id}/summary-text`,
        );

        if (storedSummaryResponse.ok) {
          // If the summary exists, use it
          const summaryData: SummaryData = await storedSummaryResponse.json();
          setSummary(summaryData.summary);
        } else {
          // If the summary doesn't exist, generate it
          await generateAndStoreSummary();
        }
      } catch (error) {
        console.error("Error fetching meeting data:", error);
        setError("Failed to load meeting data");
      } finally {
        setLoading(false);
      }
    };

    const generateAndStoreSummary = async () => {
      try {
        // Make sure transcript is available
        await fetch(
          `http://localhost:8080/meeting/${id}/transcript?email=${userEmail}`,
          {
            method: "POST",
          },
        );

        // Fetch transcript
        const transcriptResponse = await fetch(
          `http://localhost:8080/meeting/${id}/transcript`,
        );

        if (!transcriptResponse.ok) {
          throw new Error("Failed to fetch transcript");
        }

        const transcriptText = await transcriptResponse.text();

        // Generate summary
        const summaryResponse = await fetch("http://localhost:8080/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcriptText }),
        });

        if (!summaryResponse.ok) {
          throw new Error("Failed to generate summary");
        }

        const summaryData = await summaryResponse.json();
        setSummary(summaryData.summary);

        // Store summary in S3
        await fetch(`http://localhost:8080/meeting/${id}/summary-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ summary: summaryData.summary }),
        });
      } catch (error) {
        console.error("Error generating summary:", error);
        setSummary("Failed to generate summary");
      }
    };

    fetchMeetingData();
  }, [id, userEmail]);

  const downloadTranscript = async () => {
    try {
      const response = await fetch(
        `http://localhost:8080/meeting/${id}/transcript`,
      );
      if (!response.ok) throw new Error("Failed to fetch transcript");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `meeting-${id}-transcript.vtt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading transcript:", error);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg"
        >
          Back
        </button>
        <div className="bg-red-800 p-4 rounded-lg">
          <h2 className="text-xl font-bold">Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg"
      >
        Back
      </button>

      <h1 className="text-3xl font-bold mb-4">Meeting Details</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col">
          <video
            src={`http://localhost:8080/meeting/${id}/recording`}
            controls
            className="w-full max-w-5xl mb-4"
          >
            Your browser does not support the video tag.
          </video>

          <button
            onClick={downloadTranscript}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg shadow-lg w-full mb-6"
          >
            Download Transcript
          </button>

          {/* Meeting Details Card */}
          <div className="bg-slate-800 p-6 rounded-lg mb-6">
            <h2 className="text-2xl font-semibold mb-4">Meeting Information</h2>

            {loading ? (
              <p>Loading meeting details...</p>
            ) : (
              <>
                {meetingDetails && (
                  <div className="mb-4">
                    <p className="text-lg">
                      <span className="font-semibold">Topic:</span>{" "}
                      {meetingDetails.topic || "Untitled"}
                    </p>
                    <p>
                      <span className="font-semibold">Start Time:</span>{" "}
                      {formatDate(meetingDetails.start_time)}
                    </p>
                    <p>
                      <span className="font-semibold">Duration:</span>{" "}
                      {meetingDetails.duration || "N/A"} minutes
                    </p>
                    {meetingDetails.host_email && (
                      <p>
                        <span className="font-semibold">Host:</span>{" "}
                        {meetingDetails.host_email}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <h3 className="text-xl font-semibold mb-2">
                    Participants ({participants.length})
                  </h3>
                  {participants.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {participants.map((participant, index) => (
                        <div
                          key={index}
                          className="bg-slate-700 p-2 rounded flex items-center"
                        >
                          <div className="h-8 w-8 bg-violet-600 rounded-full flex items-center justify-center mr-2">
                            {participant.name?.charAt(0).toUpperCase() || "?"}
                          </div>
                          <div>
                            <p className="font-medium">
                              {participant.name || "Anonymous"}
                            </p>
                            <p className="text-xs text-gray-300">
                              {participant.user_email || "No email provided"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No participants data available</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-slate-800 p-6 rounded-lg h-full overflow-auto min-h-[300px]">
          <h2 className="text-2xl font-semibold mb-4">Meeting Summary</h2>
          {loading ? (
            <p>Loading summary...</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {summary || "No summary available"}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
};

export default MeetingDetails;
