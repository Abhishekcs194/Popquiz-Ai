import React, { useEffect, useState, useRef } from 'react';

interface ProgressBarProps {
  duration: number; // seconds
  onComplete: () => void;
  startTime: number; // Timestamp when the timer started
  isActive: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ duration, onComplete, startTime, isActive }) => {
  const [width, setWidth] = useState(100);
  const [timeLeft, setTimeLeft] = useState(duration);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const update = () => {
      const now = Date.now();
      const elapsed = (now - startTime) / 1000;
      const remaining = Math.max(0, duration - elapsed);
      const percentage = (remaining / duration) * 100;
      
      setWidth(percentage);
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
  let color = "bg-green-500";
  if (width < 60) color = "bg-yellow-400";
  if (width < 30) color = "bg-red-500";

  return (
    <div className="flex items-center gap-4 mb-6 w-full">
      <div className="flex-1 h-6 bg-black/40 rounded-full overflow-hidden shadow-inner border border-white/10 relative">
        <div 
          className={`h-full ${color} transition-all duration-75 ease-linear shadow-[0_0_10px_rgba(255,255,255,0.3)]`} 
          style={{ width: `${width}%` }}
        />
        {/* Striped pattern overlay */}
        <div className="absolute inset-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg==')] opacity-20 pointer-events-none"></div>
      </div>
      <div className={`font-mono font-black text-2xl w-12 text-center drop-shadow-md ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
        {timeLeft}
      </div>
    </div>
  );
};