import React, { useState } from 'react';
import { Button } from './Button';
import { GameSettings, Player } from '../types';

interface LobbyProps {
  roomId: string;
  isHost: boolean;
  players: Player[];
  settings: GameSettings;
  onUpdateSettings: (settings: GameSettings) => void;
  onReady: () => void;
  onStart: () => void;
  onKickPlayer?: (playerId: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ 
  roomId, 
  isHost, 
  players, 
  settings, 
  onUpdateSettings, 
  onReady, 
  onStart,
  onKickPlayer
}) => {
  const [copied, setCopied] = useState(false);
  const localPlayer = players.find(p => p.id === (window as any).localPlayerId); // Hacky ID check
  
  const handleShare = () => {
    const url = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const allReady = players.every(p => p.isReady);
  const canStart = isHost && allReady && players.length > 0;

  return (
    <div className="max-w-5xl w-full mx-auto grid md:grid-cols-2 gap-4 md:gap-8 animate-pop p-2 md:p-4">
      
      {/* LEFT: Game Settings (Host Controls) */}
      <div className="bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl border border-white/20 p-5 md:p-6 flex flex-col order-2 md:order-1">
        <div className="flex items-center justify-between mb-4 md:mb-6">
            <h2 className="text-xl md:text-2xl font-black uppercase tracking-wide">Game Setup</h2>
            {!isHost && <span className="bg-blue-500 text-xs font-bold px-2 py-1 rounded">GUEST VIEW</span>}
        </div>

        <div className="space-y-4 md:space-y-6 flex-1">
            {/* Deck Selection */}
            <div>
                <label className="block text-xs font-bold mb-2 uppercase tracking-wide opacity-60">Deck Source</label>
                <div className="bg-black/20 p-1 rounded-xl flex">
                    <button
                        onClick={() => isHost && onUpdateSettings({...settings, deckType: 'classic'})}
                        className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${settings.deckType === 'classic' ? 'bg-blue-500 text-white shadow-md' : 'text-white/40'}`}
                        disabled={!isHost}
                    >
                        Classic
                    </button>
                    <button
                        onClick={() => isHost && onUpdateSettings({...settings, deckType: 'ai'})}
                        className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${settings.deckType === 'ai' ? 'bg-purple-500 text-white shadow-md' : 'text-white/40'}`}
                        disabled={!isHost}
                    >
                        AI Generator
                    </button>
                </div>
            </div>

            {settings.deckType === 'ai' && (
                <div className="animate-pop">
                    <label className="block text-xs font-bold mb-2 uppercase tracking-wide opacity-60">Topics (Comma Separated)</label>
                    <textarea
                        value={settings.aiTopic}
                        onChange={(e) => isHost && onUpdateSettings({...settings, aiTopic: e.target.value})}
                        disabled={!isHost}
                        className="w-full px-4 py-3 bg-black/20 border-2 border-purple-400/30 rounded-xl focus:border-purple-400 focus:outline-none font-bold placeholder-white/20 resize-none h-20 md:h-24 text-sm md:text-base"
                        placeholder="e.g. 80s Movies, Pizza, Science..."
                    />
                </div>
            )}

            {/* Sliders */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold mb-2 uppercase tracking-wide opacity-60">Timer (Sec)</label>
                    <div className="flex items-center gap-2">
                        <input 
                            type="range" min="5" max="60" step="5"
                            value={settings.roundDuration}
                            onChange={(e) => isHost && onUpdateSettings({...settings, roundDuration: parseInt(e.target.value)})}
                            disabled={!isHost}
                            className="flex-1 accent-yellow-400 h-2 bg-black/30 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="font-mono font-bold text-lg md:text-xl w-8">{settings.roundDuration}</span>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold mb-2 uppercase tracking-wide opacity-60">Win Score</label>
                    <div className="flex items-center gap-2">
                         <input 
                            type="range" min="30" max="300" step="10"
                            value={settings.pointsToWin}
                            onChange={(e) => isHost && onUpdateSettings({...settings, pointsToWin: parseInt(e.target.value)})}
                            disabled={!isHost}
                            className="flex-1 accent-yellow-400 h-2 bg-black/30 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="font-mono font-bold text-lg md:text-xl w-8">{settings.pointsToWin}</span>
                    </div>
                </div>
            </div>
        </div>

        <div className="mt-6 md:mt-8 pt-4 md:pt-6 border-t border-white/10">
            {isHost ? (
                <div className="space-y-3">
                     <Button 
                        fullWidth 
                        size="lg" 
                        variant={canStart ? 'success' : 'primary'}
                        onClick={onStart}
                        disabled={!canStart}
                        className={!canStart ? 'opacity-50 cursor-not-allowed' : 'animate-pulse'}
                     >
                        {players.length < 1 ? "Waiting for Players..." : !allReady ? "Waiting for Everyone..." : "START GAME"}
                     </Button>
                     
                     <div className="flex justify-center">
                        <button
                            onClick={onReady}
                            className={`text-xs font-bold uppercase tracking-widest py-2 px-4 rounded-lg transition-colors ${localPlayer?.isReady ? 'text-white/30 hover:text-white/50' : 'bg-red-500 text-white animate-pulse'}`}
                        >
                            {localPlayer?.isReady ? "Tap to Unready" : "⚠️ HOST NOT READY - TAP HERE"}
                        </button>
                     </div>
                </div>
            ) : (
                <Button 
                    fullWidth 
                    size="lg" 
                    variant={localPlayer?.isReady ? 'danger' : 'success'}
                    onClick={onReady}
                >
                    {localPlayer?.isReady ? "Cancel Ready" : "I'M READY!"}
                </Button>
            )}
        </div>
      </div>

      {/* RIGHT: Player List */}
      <div className="bg-black/20 backdrop-blur-md rounded-3xl shadow-xl border border-white/10 p-5 md:p-6 flex flex-col order-1 md:order-2">
        <div className="flex items-center justify-between mb-4 md:mb-6">
            <div>
                <div className="text-xs uppercase tracking-widest text-white/50">Room Code</div>
                <div className="text-3xl md:text-4xl font-black text-white tracking-widest">{roomId}</div>
            </div>
            <Button size="sm" variant="outline" onClick={handleShare}>
                {copied ? "Copied!" : "Share Link"}
            </Button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[300px] md:max-h-none">
            <div className="text-xs uppercase tracking-widest text-white/50 mb-3">Players ({players.length})</div>
            <div className="space-y-3">
                {players.map(p => (
                    <div key={p.id} className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${p.isReady ? 'bg-green-500/20 border-green-500/50' : 'bg-white/5 border-white/5'}`}>
                        <div className="text-3xl">{p.avatar}</div>
                        <div className="flex-1">
                            <div className="font-bold text-lg flex items-center gap-2">
                                {p.name}
                                {p.isHost && <span className="text-[10px] bg-yellow-400 text-black px-1.5 py-0.5 rounded font-black">HOST</span>}
                                {p.id === (window as any).localPlayerId && <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">YOU</span>}
                            </div>
                            <div className={`text-xs font-bold uppercase tracking-wider ${p.isReady ? 'text-green-400' : 'text-white/30'}`}>
                                {p.isReady ? 'Ready' : 'Not Ready'}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {p.isReady && <div className="text-xl">✅</div>}
                            {isHost && !p.isHost && onKickPlayer && (
                                <button
                                    onClick={() => onKickPlayer(p.id)}
                                    className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 transition-colors"
                                    title="Kick player"
                                >
                                    🚪
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>

    </div>
  );
};