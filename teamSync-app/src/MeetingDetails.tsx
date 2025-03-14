import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

const MeetingDetails = () => {
  const { id } = useParams<{ id: string }>(); // Get meeting id from the URL
  const [transcript, setTranscript] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    
    fetch(`http://localhost:8080/meeting/${id}/transcript`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch transcript");
        }
        return res.text();
      })
      .then((data) => setTranscript(data))
      .catch((err) => console.error(err));
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg"
      >
        Back
      </button>
      
      <h1 className="text-3xl font-bold mb-4">Meeting Details for {id}</h1>
      
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1">
          <video
            src={`http://localhost:8080/meeting/${id}/recording`}
            controls
            className="w-full max-w-5xl"
          >
            Your browser does not support the video tag.
          </video>
        </div>

        <div className="flex-1">
          <h2 className="text-2xl font-semibold mb-2">Transcript</h2>
          <pre className="bg-slate-800 p-4 rounded-lg whitespace-pre-wrap h-full overflow-auto">
            {transcript || "Loading transcript..."}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default MeetingDetails;
