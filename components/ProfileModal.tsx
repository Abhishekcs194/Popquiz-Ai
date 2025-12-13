import React, { useState } from 'react';

interface ProfileModalProps {
  currentName: string;
  currentAvatar: string;
  onClose: () => void;
  onSave: (name: string, avatar: string) => void;
}

const AVATARS = ['👤', '😀', '😎', '🤖', '🦄', '🐱', '🐶', '🦁', '🐼', '🐸', '🦊', '🐺', '🐯', '🦉', '🐨', '🦋', '🐝', '🦄', '🎮', '🎯', '🎨', '🎭', '🎪', '🎸', '🎺', '🎻', '🥁', '🎤', '🎧', '🎬'];

export const ProfileModal: React.FC<ProfileModalProps> = ({ currentName, currentAvatar, onClose, onSave }) => {
  const [name, setName] = useState(currentName);
  const [selectedAvatar, setSelectedAvatar] = useState(currentAvatar);

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim(), selectedAvatar);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-6 md:p-8 max-w-md w-full shadow-2xl">
        <h2 className="text-2xl md:text-3xl font-black text-white mb-6 text-center">Edit Profile</h2>
        
        {/* Name Input */}
        <div className="mb-6">
          <label className="block text-white/80 font-bold mb-2 text-sm uppercase tracking-wider">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-yellow-400 transition-colors font-medium"
            placeholder="Enter your name"
            autoFocus
          />
        </div>

        {/* Avatar Selection */}
        <div className="mb-6">
          <label className="block text-white/80 font-bold mb-3 text-sm uppercase tracking-wider">
            Avatar
          </label>
          <div className="grid grid-cols-8 gap-2 max-h-[200px] overflow-y-auto p-2 bg-black/20 rounded-xl">
            {AVATARS.map((avatar) => (
              <button
                key={avatar}
                onClick={() => setSelectedAvatar(avatar)}
                className={`text-3xl p-2 rounded-lg transition-all hover:scale-110 ${
                  selectedAvatar === avatar
                    ? 'bg-yellow-400/30 border-2 border-yellow-400 scale-110'
                    : 'hover:bg-white/10'
                }`}
              >
                {avatar}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="mb-6 p-4 bg-black/20 rounded-xl text-center">
          <div className="text-5xl mb-2">{selectedAvatar}</div>
          <div className="text-white font-bold">{name || 'Your Name'}</div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-pink-500 hover:from-yellow-500 hover:to-pink-600 text-white font-black transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

