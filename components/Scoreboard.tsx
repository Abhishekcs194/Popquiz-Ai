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
        {sortedPlayers.map((p, index) => (
          <div 
            key={p.id} 
            className={`
                relative flex items-center justify-between p-2 rounded-xl transition-all border
                ${index === 0 ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-white/5 border-white/5'}
            `}
          >
            <div className="flex items-center gap-3 relative z-10">
              <div className="font-bold text-white/50 w-4">{index + 1}</div>
              <div className="text-2xl">{p.avatar}</div>
              <div className="flex flex-col">
                  <div className="font-bold truncate max-w-[120px] md:max-w-[150px] leading-tight">
                    {p.name}
                    {p.isBot && <span className="ml-2 text-xs opacity-50 border border-white/20 px-1 rounded">BOT</span>}
                  </div>
                  {/* Wrong Guess Indicator */}
                  {p.lastWrongGuess && (
                      <div className="text-xs text-red-400 font-bold animate-pulse truncate max-w-[120px]">
                          ✖ {p.lastWrongGuess}
                      </div>
                  )}
              </div>
            </div>
            <div className="font-black text-xl text-white relative z-10">
              {p.score}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};