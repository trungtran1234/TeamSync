import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useParams, useNavigate } from "react-router-dom";
import SyncActionItems from "./components/SyncActionItems";
import { FaTasks, FaListUl, FaLightbulb, FaCheckCircle, FaRegDotCircle } from "react-icons/fa";

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

interface SectionContent {
  [key: string]: string[];
}

interface SectionStyle {
  borderColor: string;
  textColor: string;
  bgColor: string;
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

  const renderFormattedSummary = (summaryText: string) => {
    // Parse the summary to identify different sections
    const sections = parseSummaryIntoSections(summaryText);
    
    // Generate table of contents if there are sections
    const hasSections = Object.keys(sections).length > 0;
    
    return (
      <div className="formatted-summary">
        {hasSections && (
          <div className="summary-toc mb-6 p-4 bg-slate-700 rounded-lg">
            <h3 className="text-xl font-semibold mb-2">Table of Contents</h3>
            <ul className="list-disc list-inside">
              {Object.keys(sections).map((sectionTitle) => (
                <li key={sectionTitle} className="mb-1">
                  <a 
                    href={`#${sectionTitle.toLowerCase().replace(/\s+/g, '-')}`}
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {sectionTitle}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {hasSections ? (
          Object.entries(sections).map(([sectionTitle, content]) => (
            <div 
              key={sectionTitle}
              id={sectionTitle.toLowerCase().replace(/\s+/g, '-')}
              className={`summary-section mb-6 p-4 rounded-lg border-l-4 ${getSectionStyles(sectionTitle).borderColor}`}
            >
              <h3 className={`text-xl font-bold mb-3 flex items-center ${getSectionStyles(sectionTitle).textColor}`}>
                {getSectionIcon(sectionTitle)}
                <span className="ml-2">{sectionTitle}</span>
              </h3>
              <div className="section-content">
                {renderSectionContent(content, sectionTitle)}
              </div>
            </div>
          ))
        ) : (
          <div className="prose prose-invert text-lg">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
            >
              {summaryText}
            </ReactMarkdown>
          </div>
        )}
      </div>
    );
  };

  const parseSummaryIntoSections = (summaryText: string): SectionContent => {
    const sections: SectionContent = {};
    let currentSection = "Overview";
    let currentContent: string[] = [];
    
    // Common section titles in meeting summaries
    const sectionTitles = [
      "Action Items", "Action Points", "Tasks", "To-Dos",
      "Agenda", "Topics", "Discussion Points",
      "Key Points", "Main Points", "Highlights", "Notes",
      "Decisions", "Conclusions", "Outcomes", "Resolutions",
      "Attendees", "Participants"
    ];
    
    // Split the text into lines and process each line
    const lines = summaryText.split('\n');
    
    lines.forEach((line: string) => {
      // Check if the line is a section header
      const sectionMatch = line.match(/^#+\s+(.+)$/);
      const listHeaderMatch = line.match(/^[*-]\s+\*\*(.+?):\*\*/);
      const boldLineMatch = line.match(/^\*\*(.+?):\*\*/);
      
      if (sectionMatch) {
        // If it's a markdown header, use it as a section title
        const potentialTitle = sectionMatch[1].trim();
        
        // If it's a recognized section or ends with a colon
        if (sectionTitles.some(title => potentialTitle.includes(title)) || 
            potentialTitle.endsWith(':')) {
          currentSection = potentialTitle.replace(/:$/, '');
          currentContent = [];
          sections[currentSection] = currentContent;
        } else {
          // Just add it to the current section
          currentContent.push(line);
        }
      } else if (listHeaderMatch || boldLineMatch) {
        // If it's a list item with a bold prefix like "**Action Items:**"
        const potentialTitle = (listHeaderMatch ? listHeaderMatch[1] : boldLineMatch?.[1] || "").trim();
        
        if (sectionTitles.some(title => potentialTitle.includes(title))) {
          currentSection = potentialTitle;
          currentContent = [];
          sections[currentSection] = currentContent;
          
          // If there's content after the bold part, add it
          const contentAfterBold = line.replace(/^[*-]\s+\*\*(.+?):\*\*\s*/, '').trim();
          if (contentAfterBold) {
            currentContent.push(contentAfterBold);
          }
        } else {
          // Just add it to the current section
          currentContent.push(line);
        }
      } else {
        // Add the line to the current section
        currentContent.push(line);
      }
    });
    
    // If no sections were identified, put everything in Overview
    if (Object.keys(sections).length === 0 && currentContent.length > 0) {
      sections["Overview"] = currentContent;
    }
    
    return sections;
  };

  const renderSectionContent = (content: string[], sectionTitle: string) => {
    const contentText = content.join('\n');
    
    // Special handling for Action Items and other list-based sections
    if (sectionTitle.includes("Action") || sectionTitle.includes("Tasks") || sectionTitle.includes("To-Do")) {
      return (
        <ul className="list-none">
          {content.map((line: string, index: number) => {
            // Skip empty lines
            if (!line.trim()) return null;
            
            // Check for different action item formats
            // These patterns extract the actual title and description from the meeting summary
            const numberedTaskMatch = line.match(/^(\d+)\.\s+\*\*([^:]+):\*\*\s*(.*)/);
            const bulletTaskMatch = line.match(/^[*-]\s+\*\*([^:]+):\*\*\s*(.*)/);
            const simpleBulletMatch = line.match(/^[*-]\s+(.*)/);
            
            // Format: "1. **Actual Task Title:** Actual description text"
            if (numberedTaskMatch) {
              const [_, number, title, description] = numberedTaskMatch;
              
              // Clean any "Task Title" placeholder text
              const cleanTitle = title.replace(/Task Title/g, '').trim();
              const cleanDescription = description.replace(/^\*\*Description:\*\*\s*/i, '').trim();
              
              return (
                <li key={index} className="mb-5">
                  <div className="action-item-container">
                    <div className="flex items-center mb-2">
                      <div className="flex-shrink-0 h-6 w-6 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold mr-2 text-sm">
                        {number} {cleanTitle}
                      </div>
                      {/* <h4 className="text-amber-400 font-bold inline-block">{cleanTitle}</h4> */}
                    </div>
                    {cleanDescription && (
                      <div className="ml-8 text-white pl-3 border-l-2 border-slate-600">
                        <div className="flex items-start">
                          <FaRegDotCircle className="text-slate-400 mr-2 mt-1 flex-shrink-0 text-xs" />
                          <span>{cleanDescription}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            }
            
            // Format: "- **Actual Task Title:** Actual description text"
            else if (bulletTaskMatch) {
              const [_, title, description] = bulletTaskMatch;
              
              // Clean any "Task Title" placeholder text
              const cleanTitle = title.replace(/Task Title/g, '').trim();
              const cleanDescription = description.replace(/^\*\*Description:\*\*\s*/i, '').trim();
              
              return (
                <li key={index} className="mb-5">
                  <div className="action-item-container">
                    <div className="flex items-center mb-2">
      
                      <h4 className="text-amber-400 font-bold inline-block">{cleanTitle}</h4>
                    </div>
                    {cleanDescription && (
                      <div className="ml-8 text-white pl-3 border-l-2 border-slate-600">
                        <div className="flex items-start">
                          <FaRegDotCircle className="text-slate-400 mr-2 mt-1 flex-shrink-0 text-xs" />
                          <span>{cleanDescription}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            }
            
            // Case 3: Simple bullet point
            else if (simpleBulletMatch) {
              return (
                <li key={index} className="mb-3 p-3 bg-slate-700 rounded-md border-l-4 border-amber-500 flex items-start">
                  <FaRegDotCircle className="text-amber-500 mr-2 mt-1 flex-shrink-0" />
                  <span>{simpleBulletMatch[1]}</span>
                </li>
              );
            }
            
            // Default case: render as is
            else {
              return (
                <li key={index} className="mb-3 p-3 bg-slate-700 rounded-md border-l-4 border-amber-500 flex items-start">
                  <FaRegDotCircle className="text-amber-500 mr-2 mt-1 flex-shrink-0" />
                  <span>{line}</span>
                </li>
              );
            }
          })}
        </ul>
      );
    }
    
    // For other sections, just use ReactMarkdown
    return (
      <div className="prose prose-invert prose-li:my-2 text-lg">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={{
            // Customize list items
            li: ({children, ...props}) => (
              <li className="mb-2 flex items-start" {...props}>
                <FaRegDotCircle className="text-slate-400 mr-2 mt-1 flex-shrink-0 text-xs" />
                <span>{children}</span>
              </li>
            ),
            // Customize paragraphs
            p: ({children, ...props}) => (
              <p className="mb-3 text-lg" {...props}>{children}</p>
            )
          }}
        >
          {contentText}
        </ReactMarkdown>
      </div>
    );
  };

  const getSectionIcon = (sectionTitle: string) => {
    const title = sectionTitle.toLowerCase();
    
    if (title.includes("action") || title.includes("task") || title.includes("to-do")) {
      return <FaTasks className="flex-shrink-0" />;
    } else if (title.includes("agenda") || title.includes("topic")) {
      return <FaListUl className="flex-shrink-0" />;
    } else if (title.includes("key") || title.includes("highlight") || title.includes("main") || title.includes("note")) {
      return <FaLightbulb className="flex-shrink-0" />;
    } else if (title.includes("decision") || title.includes("conclusion") || title.includes("outcome") || title.includes("resolution")) {
      return <FaCheckCircle className="flex-shrink-0" />;
    } else {
      return <FaRegDotCircle className="flex-shrink-0" />;
    }
  };

  const getSectionStyles = (sectionTitle: string): SectionStyle => {
    const title = sectionTitle.toLowerCase();
    
    if (title.includes("action") || title.includes("task") || title.includes("to-do")) {
      return {
        borderColor: "border-amber-500",
        textColor: "text-amber-500",
        bgColor: "bg-slate-700"
      };
    } else if (title.includes("agenda") || title.includes("topic")) {
      return {
        borderColor: "border-blue-400",
        textColor: "text-blue-400",
        bgColor: "bg-slate-700"
      };
    } else if (title.includes("key") || title.includes("highlight") || title.includes("main") || title.includes("note")) {
      return {
        borderColor: "border-teal-400",
        textColor: "text-teal-400",
        bgColor: "bg-slate-700"
      };
    } else if (title.includes("decision") || title.includes("conclusion") || title.includes("outcome") || title.includes("resolution")) {
      return {
        borderColor: "border-green-400",
        textColor: "text-green-400",
        bgColor: "bg-slate-700"
      };
    } else {
      return {
        borderColor: "border-purple-400",
        textColor: "text-purple-400",
        bgColor: "bg-slate-700"
      };
    }
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

        <div className="flex flex-col">
          {/* Add Sync Action Items Component */}
          <SyncActionItems 
            meetingId={id || ""}
            userEmail={userEmail}
            hasSummary={summary !== ""}
          />

          {/* Meeting Summary Card */}
          <div className="bg-slate-800 p-6 rounded-lg h-full overflow-auto min-h-[300px]">
            <h2 className="text-2xl font-semibold mb-4">Meeting Summary</h2>
            {loading ? (
              <p>Loading summary...</p>
            ) : (
              <div className="meeting-summary-container text-lg">
                {summary ? (
                  renderFormattedSummary(summary)
                ) : (
                  "No summary available"
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetingDetails;
