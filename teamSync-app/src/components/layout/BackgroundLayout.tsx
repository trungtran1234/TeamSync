import React, { ReactNode } from 'react';

// Define props type
interface BackgroundLayoutProps {
  children: ReactNode;
}

const BackgroundLayout: React.FC<BackgroundLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen relative bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute top-0 -left-4 w-72 h-72 bg-white rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"
          style={{ animation: 'blob 7s infinite' }}
        ></div>
        <div

          className="absolute top-1/2 -right-4 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"
          style={{ animation: 'blob 8s infinite' }}
        ></div>
        <div
          className="absolute -bottom-8 left-1/2 w-80 h-80 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"
          style={{ animation: 'blob 9s infinite' }}
        ></div>
      </div>

      {/* Fine grid pattern overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.1) 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }}
      ></div>

      {/* Content container */}
      <div className="relative min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          {/* Logo area */}
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-2">TeamSync</h1>
            <p className="text-blue-100">Streamline Your Virtual Meetings</p>
          </div>

          {/* Glass card */}
          <div className="backdrop-blur-lg bg-white/10 rounded-2xl p-1">
            <div className="bg-white rounded-xl shadow-sm p-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackgroundLayout;
