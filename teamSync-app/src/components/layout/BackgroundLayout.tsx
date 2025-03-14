import type React from "react"
import type { ReactNode } from "react"

interface BackgroundLayoutProps {
  children: ReactNode
}

const BackgroundLayout: React.FC<BackgroundLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen relative bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900">
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute top-0 -left-4 w-72 h-72 bg-violet-600 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"
          style={{ animation: "blob 7s infinite" }}
        ></div>
        <div
          className="absolute top-1/2 -right-4 w-96 h-96 bg-violet-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"
          style={{ animation: "blob 8s infinite" }}
        ></div>
        <div
          className="absolute -bottom-8 left-1/2 w-80 h-80 bg-violet-500 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"
          style={{ animation: "blob 9s infinite" }}
        ></div>
      </div>

      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)`,
          backgroundSize: "40px 40px",
        }}
      ></div>

      <div className="relative min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-violet-500 mb-2">TeamSync</h1>
            <p className="text-slate-300">Streamline Your Virtual Meetings</p>
          </div>
          <div className="backdrop-blur-lg bg-slate-800/50 rounded-2xl p-1">
            <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 p-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BackgroundLayout

