import React from 'react';
import { Player } from '../types';

interface ScoreboardProps {
  players: Player[];
  compact?: boolean;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({ players, compact = false }) => {
  // Sort players by score descending
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className={`bg-black/20 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden flex flex-col ${compact ? 'w-full' : 'w-full max-w-md'}`}>
      {!compact && <div className="p-4 bg-black/20 font-bold text-center uppercase tracking-widest text-sm">Leaderboard</div>}
      
      <div className="p-2 space-y-2">
        {sortedPlayers.map((p, index) => {
          // Visual state logic
          const isWinner = p.hasAnsweredRound;
          let containerClass = "bg-white/5 border-white/5";
          
          if (index === 0 && !isWinner) {
             containerClass = "bg-yellow-500/10 border-yellow-500/40";
          }
          if (isWinner) {
             containerClass = "bg-green-500 text-white border-green-400 shadow-[0_0_15px_rgba(34,197,94,0.4)] scale-[1.02]";
          }

          return (
            <div 
              key={p.id} 
              className={`
                  relative flex items-center justify-between p-2 rounded-xl transition-all duration-300 border
                  ${containerClass}
              `}
            >
              <div className="flex items-center gap-3 relative z-10">
                <div className={`font-bold w-4 ${isWinner ? 'text-white' : 'text-white/50'}`}>{index + 1}</div>
                <div className="text-2xl">{p.avatar}</div>
                <div className="flex flex-col">
                    <div className="font-bold truncate max-w-[120px] md:max-w-[150px] leading-tight flex items-center gap-2">
                      {p.name}
                      {p.isBot && <span className="text-[10px] opacity-50 border border-white/20 px-1 rounded">BOT</span>}
                    </div>
                    
                    {/* Status Indicators */}
                    {isWinner && !compact && (
                        <div className="text-xs font-bold uppercase tracking-wider opacity-90 flex items-center gap-1">
                             ✓ Correct
                             {p.answerTime !== undefined && (
                                 <span className="ml-1 text-[10px] opacity-75">
                                     ({p.answerTime.toFixed(3)}s)
                                 </span>
                             )}
                        </div>
                    )}
                    
                    {!isWinner && p.lastWrongGuess && !compact && (
                        <div className="text-xs text-red-400 font-bold animate-pulse truncate max-w-[120px]">
                            ✖ {p.lastWrongGuess}
                        </div>
                    )}
                </div>
              </div>
              
              <div className="font-black text-xl relative z-10">
                {p.score}
              </div>

              {/* Success Flash Effect Overlay */}
              {isWinner && (
                  <div className="absolute inset-0 bg-white/20 animate-pulse rounded-xl"></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};