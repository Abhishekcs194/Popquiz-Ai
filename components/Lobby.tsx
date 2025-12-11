import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { AVATARS } from '../constants';
import { generateQuestions } from '../services/geminiService';
import { Question, Player } from '../types';

interface LobbyProps {
  onStartGame: (userName: string, avatar: string, questions: Question[]) => void;
  defaultQuestions: Question[];
  players: Player[]; // Show other players in lobby
}

export const Lobby: React.FC<LobbyProps> = ({ onStartGame, defaultQuestions, players }) => {
  const [name, setName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [mode, setMode] = useState<'classic' | 'ai'>('classic');
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  
  // Fake Room ID
  const [roomId] = useState(() => Math.random().toString(36).substring(2, 8).toUpperCase());

  const handleStart = async () => {
    if (!name.trim()) {
      setError('Please enter a name!');
      return;
    }

    if (mode === 'classic') {
      onStartGame(name, selectedAvatar, defaultQuestions);
    } else {
      if (!topic.trim()) {
        setError('Please enter a topic for the AI!');
        return;
      }
      setIsLoading(true);
      setError('');
      try {
        const questions = await generateQuestions(topic);
        if (questions.length === 0) {
          throw new Error("No questions generated");
        }
        onStartGame(name, selectedAvatar, questions);
      } catch (e) {
        setError("Failed to generate questions. Try a different topic or check API Key.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl w-full mx-auto grid md:grid-cols-2 gap-6 animate-pop p-4">
      
      {/* Left Column: Player Config */}
      <div className="bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl border border-white/20 p-6 flex flex-col">
        <h1 className="text-4xl font-black text-center mb-6 tracking-wider text-yellow-300 drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]">
            POPQUIZ AI
        </h1>

        <div className="space-y-6 flex-1">
            {/* Name Input */}
            <div>
            <label className="block text-sm font-bold mb-2 uppercase tracking-wide opacity-80">Your Name</label>
            <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-black/20 border-2 border-white/10 rounded-xl focus:border-yellow-400 focus:outline-none text-xl font-bold placeholder-white/30"
                placeholder="Enter nickname..."
                maxLength={12}
            />
            </div>

            {/* Avatar Selection */}
            <div>
            <label className="block text-sm font-bold mb-2 uppercase tracking-wide opacity-80">Choose Avatar</label>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {AVATARS.map((av) => (
                <button
                    key={av}
                    onClick={() => setSelectedAvatar(av)}
                    className={`text-3xl p-2 rounded-xl transition-transform hover:scale-110 ${selectedAvatar === av ? 'bg-white/20 scale-110 ring-2 ring-yellow-400' : 'opacity-60'}`}
                >
                    {av}
                </button>
                ))}
            </div>
            </div>

            {/* Game Mode */}
            <div>
                <label className="block text-sm font-bold mb-2 uppercase tracking-wide opacity-80">Game Deck</label>
                <div className="bg-black/20 p-1 rounded-xl flex mb-4">
                    <button
                        onClick={() => setMode('classic')}
                        className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${mode === 'classic' ? 'bg-blue-500 shadow-md text-white' : 'text-white/60 hover:text-white'}`}
                    >
                        Classic
                    </button>
                    <button
                        onClick={() => setMode('ai')}
                        className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${mode === 'ai' ? 'bg-purple-500 shadow-md text-white' : 'text-white/60 hover:text-white'}`}
                    >
                        AI Generator
                    </button>
                </div>

                {mode === 'ai' && (
                <div className="animate-pop">
                    <label className="block text-xs font-bold mb-1 uppercase tracking-wide opacity-60">Topics (Comma separated)</label>
                    <textarea
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        className="w-full px-4 py-3 bg-black/20 border-2 border-purple-400/50 rounded-xl focus:border-purple-400 focus:outline-none text-lg font-bold placeholder-white/30 min-h-[80px] resize-none"
                        placeholder="e.g. Science, 90s Music, Minecraft, History..."
                    />
                    <p className="text-xs mt-1 text-white/40">Enter multiple topics to create a mixed deck.</p>
                </div>
                )}
            </div>
        </div>

        {error && (
            <div className="bg-red-500/80 p-3 rounded-xl text-center text-sm font-bold border border-red-400 mt-4">
                {error}
            </div>
        )}

        <div className="mt-6">
            <Button 
                fullWidth 
                size="lg" 
                variant={mode === 'ai' ? 'secondary' : 'primary'}
                onClick={handleStart}
                disabled={isLoading}
            >
                {isLoading ? "Generating..." : "START GAME"}
            </Button>
        </div>
      </div>

      {/* Right Column: Room Info & Players */}
      <div className="bg-black/20 backdrop-blur-md rounded-3xl shadow-xl border border-white/10 p-6 flex flex-col">
         <div className="flex items-center justify-between mb-6">
            <div>
                <div className="text-xs uppercase tracking-widest text-white/50">Room Code</div>
                <div className="text-3xl font-black text-white">{roomId}</div>
            </div>
            <Button size="sm" variant="outline" onClick={handleShare}>
                {copied ? "Copied!" : "Share Link"}
            </Button>
         </div>

         <div className="flex-1">
            <div className="text-xs uppercase tracking-widest text-white/50 mb-3">Lobby ({players.length})</div>
            <div className="space-y-2">
                {players.map(p => (
                    <div key={p.id} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                        <span className="text-2xl">{p.avatar}</span>
                        <span className="font-bold">{p.name}</span>
                        {p.isBot && <span className="text-xs px-2 py-1 bg-white/10 rounded ml-auto">BOT</span>}
                    </div>
                ))}
                {players.length === 0 && (
                    <div className="text-white/30 italic text-center py-4">Waiting for players...</div>
                )}
            </div>
         </div>
      </div>

    </div>
  );
};