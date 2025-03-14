import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useParams, useNavigate } from "react-router-dom";

const MeetingDetails = () => {
  const { id } = useParams<{ id: string }>(); // Get meeting id from the URL
  const [summary, setSummary] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;

    const fetchAndSummarize = async () => {

      try {
        const transcript = await fetch(`http://localhost:8080/meeting/${id}/transcript`);
        if (!transcript) {
          throw new Error("Failed to fetch transcript");
        }

        const transcriptText = await transcript.text();

        const summaryResponse = await fetch("http://localhost:8080/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcriptText }),
        });

        if (!summaryResponse.ok) throw new Error("Failed to generate summary");

        const summaryData = await summaryResponse.json();
        setSummary(summaryData.summary);

      } catch (error) {
        console.error(error);
        setSummary("Failed to load transcript");
      }

    }

    fetchAndSummarize();
  }, [id]);

  const downloadTranscript = async () => {
    try {
      const response = await fetch(`http://localhost:8080/meeting/${id}/transcript`);
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

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg"
      >
        Back
      </button>

      <h1 className="text-3xl font-bold mb-4">Meeting Details for {id}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col items-center">
          <video
            src={`http://localhost:8080/meeting/${id}/recording`}
            controls
            className="w-full max-w-5xl mb-4"
          >
            Your browser does not support the video tag.
          </video>

          <button
            onClick={downloadTranscript}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg shadow-lg w-full"
          >
            Download Transcript
          </button>
        </div>

        <div className="bg-slate-800 p-4 rounded-lg h-full overflow-auto min-h-[300px]">
          <h2 className="text-2xl font-semibold mb-2">Meeting Summary</h2>
          <ReactMarkdown>{summary || "Loading summary..."}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default MeetingDetails;
