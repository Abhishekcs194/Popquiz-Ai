import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { AVATARS } from '../constants';

interface LandingPageProps {
  onCreate: (name: string, avatar: string) => void;
  onJoin: (name: string, avatar: string, code: string) => void;
  initialCode?: string;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onCreate, onJoin, initialCode = '' }) => {
  // Try to load saved name/avatar from localStorage
  const [name, setName] = useState(() => {
    const saved = localStorage.getItem('popquiz-player-name');
    return saved || '';
  });
  const [avatar, setAvatar] = useState(() => {
    const saved = localStorage.getItem('popquiz-player-avatar');
    return saved || AVATARS[0];
  });
  const [roomCode, setRoomCode] = useState(initialCode);
  const [mode, setMode] = useState<'menu' | 'join'>(initialCode ? 'join' : 'menu');

  useEffect(() => {
    if (initialCode) {
        setRoomCode(initialCode);
        setMode('join');
        // Auto-focus name input if coming from URL
        setTimeout(() => {
          const nameInput = document.querySelector('input[placeholder="Enter nickname"]') as HTMLInputElement;
          if (nameInput) nameInput.focus();
        }, 100);
    }
  }, [initialCode]);

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name, avatar);
  };

  const handleJoin = () => {
    if (!name.trim() || !roomCode.trim()) return;
    onJoin(name, avatar, roomCode);
  };

  return (
    <div className="max-w-md w-full mx-auto bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl border border-white/20 p-6 md:p-8 animate-pop">
      <h1 className="text-4xl md:text-5xl font-black text-center mb-2 tracking-wider text-yellow-300 drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]">
        POPQUIZ
      </h1>
      <p className="text-center text-white/60 mb-6 md:mb-8 font-bold tracking-widest uppercase text-xs md:text-sm">
        Multiplayer Trivia
      </p>

      {/* Profile Setup */}
      <div className="mb-6 md:mb-8 space-y-4">
        <div>
          <label className="block text-xs font-bold mb-2 uppercase tracking-wide opacity-80">Your Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 bg-black/20 border-2 border-white/10 rounded-xl focus:border-yellow-400 focus:outline-none text-lg md:text-xl font-bold placeholder-white/30 text-center"
            placeholder="Enter nickname"
            maxLength={12}
          />
        </div>

        <div>
          <label className="block text-xs font-bold mb-2 uppercase tracking-wide opacity-80 text-center">Select Avatar</label>
          <div className="flex justify-center flex-wrap gap-2 pb-2">
            {AVATARS.map((av) => (
              <button
                key={av}
                onClick={() => setAvatar(av)}
                className={`text-2xl p-2 rounded-xl transition-all ${avatar === av ? 'bg-white/20 scale-110 ring-2 ring-yellow-400' : 'opacity-50 hover:opacity-100'}`}
              >
                {av}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      {mode === 'menu' ? (
        <div className="space-y-3 md:space-y-4">
          <Button fullWidth size="lg" onClick={handleCreate} disabled={!name.trim()}>
            Create Game
          </Button>
          <Button fullWidth variant="outline" onClick={() => setMode('join')}>
            Join Game
          </Button>
        </div>
      ) : (
        <div className="space-y-3 md:space-y-4 animate-pop">
           <div>
            <label className="block text-xs font-bold mb-2 uppercase tracking-wide opacity-80">Room Code</label>
            <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 bg-black/20 border-2 border-white/10 rounded-xl focus:border-yellow-400 focus:outline-none text-2xl font-black tracking-widest text-center placeholder-white/20"
                placeholder="ABCD"
                maxLength={6}
            />
          </div>
          <Button fullWidth size="lg" variant="success" onClick={handleJoin} disabled={!name.trim() || !roomCode.trim()}>
            {initialCode ? "Join Room" : "Enter Room"}
          </Button>
          {!initialCode && (
            <button onClick={() => setMode('menu')} className="w-full text-center text-white/50 text-sm hover:text-white mt-2">
                Back
            </button>
          )}
        </div>
      )}
    </div>
  );
};