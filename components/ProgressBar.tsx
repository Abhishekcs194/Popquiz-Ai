import React, { useEffect, useState, useRef } from 'react';

interface ProgressBarProps {
  duration: number; // seconds
  onComplete: () => void;
  startTime: number; // Timestamp when the timer started
  isActive: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ duration, onComplete, startTime, isActive }) => {
  const [percentage, setPercentage] = useState(100);
  const [timeLeft, setTimeLeft] = useState(duration);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive) {
      setPercentage(100);
      return;
    }

    const update = () => {
      const now = Date.now();
      const elapsed = (now - startTime) / 1000;
      const remaining = Math.max(0, duration - elapsed);
      const newPct = (remaining / duration) * 100;
      
      setPercentage(newPct);
      setTimeLeft(Math.ceil(remaining));

      if (remaining <= 0) {
        onComplete();
      } else {
        animationFrameRef.current = requestAnimationFrame(update);
      }
    };

    animationFrameRef.current = requestAnimationFrame(update);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive, duration, startTime, onComplete]);

  // Determine color based on time remaining
  let barColor = "bg-gradient-to-r from-emerald-400 to-emerald-600";
  let textColor = "text-white";
  
  if (percentage < 60) {
      barColor = "bg-gradient-to-r from-yellow-400 to-orange-500";
  }
  if (percentage < 30) {
      barColor = "bg-gradient-to-r from-red-500 to-red-700";
      textColor = "text-red-400 animate-pulse";
  }

  return (
    <div className="flex flex-col w-full mb-6">
      <div className="flex justify-between items-end mb-1 px-1">
        <span className="text-xs font-bold uppercase tracking-widest text-white/50">Time Remaining</span>
        <span className={`font-mono font-black text-3xl leading-none ${textColor}`}>{timeLeft}s</span>
      </div>
      <div className="h-4 bg-black/40 rounded-full overflow-hidden border border-white/10 p-0.5">
        <div 
          className={`h-full rounded-full ${barColor} transition-all duration-75 ease-linear shadow-[0_0_15px_rgba(255,255,255,0.2)] relative`} 
          style={{ width: `${percentage}%` }}
        >
            <div className="absolute inset-0 bg-white/20" style={{ backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)', backgroundSize: '1rem 1rem' }}></div>
        </div>
      </div>
    </div>
  );
};