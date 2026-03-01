import React from 'react'

export default function QuantumLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4 w-full">
      {/* Quantum Orb Animation */}
      <div className="relative w-24 sm:w-32 h-24 sm:h-32 mb-6 sm:mb-8">
        {/* Outer rotating ring */}
        <div className="absolute inset-0 rounded-full border-3 sm:border-4 border-transparent border-t-cyan-400 border-r-blue-500 animate-spin"></div>
        
        {/* Middle rotating ring (opposite direction) */}
        <div className="absolute inset-2 rounded-full border-3 sm:border-4 border-transparent border-b-cyan-300 border-l-blue-400 animate-spin-reverse"></div>
        
        {/* Inner pulsing core */}
        <div className="absolute inset-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 animate-pulse-glow shadow-2xl shadow-cyan-500/50"></div>
        
        {/* Center quantum dot */}
        <div className="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 w-3 sm:w-4 h-3 sm:h-4 rounded-full bg-white animate-ping"></div>
      </div>

      {/* Loading Text */}
      <div className="text-center space-y-1 sm:space-y-2">
        <h3 className="text-base sm:text-xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-sky-600 bg-clip-text text-transparent animate-shimmer">
          Quantum recommendations loading...
        </h3>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          Analyzing your reading preferences with quantum algorithms
        </p>
      </div>

      {/* Quantum particles floating */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="quantum-particle quantum-particle-1"></div>
        <div className="quantum-particle quantum-particle-2"></div>
        <div className="quantum-particle quantum-particle-3"></div>
        <div className="quantum-particle quantum-particle-4"></div>
      </div>

      <style jsx>{`
        @keyframes spin-reverse {
          from {
            transform: rotate(360deg);
          }
          to {
            transform: rotate(0deg);
          }
        }

        @keyframes pulse-glow {
          0%, 100% {
            opacity: 1;
            box-shadow: 0 0 20px rgba(34, 211, 238, 0.5),
                        0 0 40px rgba(59, 130, 246, 0.3),
                        inset 0 0 20px rgba(34, 211, 238, 0.2);
          }
          50% {
            opacity: 0.8;
            box-shadow: 0 0 40px rgba(34, 211, 238, 0.8),
                        0 0 80px rgba(59, 130, 246, 0.5),
                        inset 0 0 40px rgba(34, 211, 238, 0.4);
          }
        }

        @keyframes shimmer {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0) translateX(0);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(-100vh) translateX(50px);
            opacity: 0;
          }
        }

        .animate-spin-reverse {
          animation: spin-reverse 2s linear infinite;
        }

        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }

        .animate-shimmer {
          background-size: 200% 200%;
          animation: shimmer 3s ease-in-out infinite;
        }

        .quantum-particle {
          position: absolute;
          width: 4px;
          height: 4px;
          background: radial-gradient(circle, rgba(34, 211, 238, 1) 0%, rgba(34, 211, 238, 0) 70%);
          border-radius: 50%;
          animation: float linear infinite;
        }

        .quantum-particle-1 {
          left: 20%;
          animation-duration: 4s;
          animation-delay: 0s;
        }

        .quantum-particle-2 {
          left: 40%;
          animation-duration: 5s;
          animation-delay: 1s;
        }

        .quantum-particle-3 {
          left: 60%;
          animation-duration: 6s;
          animation-delay: 2s;
        }

        .quantum-particle-4 {
          left: 80%;
          animation-duration: 7s;
          animation-delay: 1.5s;
        }
      `}</style>
    </div>
  )
}
