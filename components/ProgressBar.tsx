import React, { useEffect, useState, useRef } from 'react';

interface ProgressBarProps {
  duration: number; // seconds
  onComplete: () => void;
  startTime: number; // Timestamp when the timer started
  isActive: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ duration, onComplete, startTime, isActive }) => {
  const [width, setWidth] = useState(100);
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
  let color = "bg-green-400";
  if (width < 60) color = "bg-yellow-400";
  if (width < 30) color = "bg-red-500";

  return (
    <div className="w-full h-4 bg-black/30 rounded-full overflow-hidden mb-6">
      <div 
        className={`h-full ${color} transition-all duration-75 ease-linear`} 
        style={{ width: `${width}%` }}
      />
    </div>
  );
};
