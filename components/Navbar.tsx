import React, { useState } from 'react';
import { useTheme, Theme } from '../contexts/ThemeContext';
import { ProfileModal } from './ProfileModal';
import { ChatSheet } from './ChatSheet';
import { Player } from '../types';

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'text' | 'emoji' | 'gif';
  timestamp: number;
}

interface NavbarProps {
  onHome: () => void;
  localPlayer: Player | null;
  onUpdatePlayer: (name: string, avatar: string) => void;
  roomId?: string;
  chatMessages?: ChatMessage[];
  onSendChatMessage?: (content: string, type?: 'text' | 'emoji' | 'gif') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onHome, localPlayer, onUpdatePlayer, roomId, chatMessages = [], onSendChatMessage }) => {
  const { theme, setTheme } = useTheme();
  const [showProfile, setShowProfile] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const themes: { value: Theme; label: string; icon: string }[] = [
    { value: 'default', label: 'Default', icon: '🎨' },
    { value: 'monochrome', label: 'Monochrome', icon: '⚫' },
    { value: 'high-contrast', label: 'High Contrast', icon: '⚡' },
    { value: 'ocean', label: 'Ocean', icon: '🌊' },
    { value: 'sunset', label: 'Sunset', icon: '🌅' },
    { value: 'forest', label: 'Forest', icon: '🌲' }
  ];

  const [showThemeMenu, setShowThemeMenu] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/30 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Left: Game Title */}
          <button
            onClick={onHome}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <span className="text-2xl md:text-3xl font-black bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500 bg-clip-text text-transparent">
              PopQuiz AI
            </span>
            <span className="text-lg">🧠</span>
          </button>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Theme Switcher */}
            <div className="relative">
              <button
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-xl"
                title="Change Theme"
              >
                🎨
              </button>
              
              {showThemeMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowThemeMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 bg-black/90 backdrop-blur-xl rounded-xl border border-white/20 p-2 min-w-[180px] z-50 shadow-2xl">
                    {themes.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => {
                          setTheme(t.value);
                          setShowThemeMenu(false);
                        }}
                        className={`w-full text-left px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                          theme === t.value
                            ? 'bg-white/20 text-white'
                            : 'hover:bg-white/10 text-white/80'
                        }`}
                      >
                        <span>{t.icon}</span>
                        <span className="font-medium">{t.label}</span>
                        {theme === t.value && <span className="ml-auto">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Profile Button */}
            <button
              onClick={() => setShowProfile(true)}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-xl"
              title="Profile"
            >
              {localPlayer?.avatar || '👤'}
            </button>

            {/* Chat Button */}
            {roomId && (
              <button
                onClick={() => setShowChat(true)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-xl relative"
                title="Chat"
              >
                💬
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Profile Modal */}
      {showProfile && (
        <ProfileModal
          currentName={localPlayer?.name || ''}
          currentAvatar={localPlayer?.avatar || '👤'}
          onClose={() => setShowProfile(false)}
          onSave={(name, avatar) => {
            onUpdatePlayer(name, avatar);
            setShowProfile(false);
          }}
        />
      )}

      {/* Chat Sheet */}
      {showChat && roomId && (
        <ChatSheet
          onClose={() => setShowChat(false)}
          localPlayerId={localPlayer?.id || ''}
          localPlayerName={localPlayer?.name || 'Player'}
          messages={chatMessages}
          onSendMessage={onSendChatMessage}
        />
      )}
    </>
  );
};

