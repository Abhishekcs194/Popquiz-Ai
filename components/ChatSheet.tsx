import React, { useState, useEffect, useRef } from 'react';
import { multiplayer, NetworkMessage } from '../services/multiplayer';

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'text' | 'emoji' | 'gif';
  timestamp: number;
}

interface ChatSheetProps {
  onClose: () => void;
  localPlayerId: string;
  localPlayerName: string;
}

const EMOJIS = ['😀', '😂', '😍', '🥳', '😎', '🤔', '😮', '👍', '👎', '❤️', '🔥', '💯', '🎉', '🎮', '🏆', '👏', '🙌', '🤝', '💪', '🎯'];

export const ChatSheet: React.FC<ChatSheetProps> = ({ onClose, localPlayerId, localPlayerName }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for chat messages via App's message handler
  useEffect(() => {
    const handleChatMessage = (msg: NetworkMessage) => {
      if (msg.type === 'CHAT_MESSAGE' && msg.payload) {
        // Don't add duplicate messages (check by id)
        setMessages((prev) => {
          const exists = prev.some(m => m.id === msg.payload.id);
          if (exists) return prev;
          return [...prev, msg.payload];
        });
      }
    };

    // Store callback for App.tsx to call
    (window as any).__chatCallback = handleChatMessage;

    return () => {
      delete (window as any).__chatCallback;
    };
  }, []);

  // Search GIFs from Tenor
  const searchGifs = async (query: string) => {
    if (!query.trim()) return;
    
    try {
      const API_KEY = (process.env as any).TENOR_API_KEY;
      if (!API_KEY) {
        console.error('TENOR_API_KEY is not set');
        return;
      }
      const response = await fetch(
        `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${API_KEY}&client_key=popquiz&limit=12`
      );
      const data = await response.json();
      setGifResults(data.results || []);
    } catch (error) {
      console.error('Error fetching GIFs:', error);
    }
  };

  const sendMessage = (content: string, type: 'text' | 'emoji' | 'gif' = 'text') => {
    if (!content.trim()) return;

    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random()}`,
      senderId: localPlayerId,
      senderName: localPlayerName,
      content,
      type,
      timestamp: Date.now()
    };

    // Add to local messages immediately
    setMessages((prev) => [...prev, message]);

    // Broadcast to other players
    multiplayer.send({
      type: 'CHAT_MESSAGE',
      payload: message,
      senderId: localPlayerId
    });

    setInput('');
    setShowEmojiPicker(false);
    setShowGifPicker(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input.trim(), 'text');
    }
  };

  const handleEmojiClick = (emoji: string) => {
    sendMessage(emoji, 'emoji');
  };

  const handleGifClick = (gifUrl: string) => {
    sendMessage(gifUrl, 'gif');
    setShowGifPicker(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white/10 backdrop-blur-xl rounded-t-3xl md:rounded-3xl border-t md:border border-white/20 w-full md:max-w-2xl h-[80vh] md:h-[600px] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-xl font-black text-white">Chat</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white text-xl"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-white/40 mt-8">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.senderId === localPlayerId ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl p-3 ${
                    msg.senderId === localPlayerId
                      ? 'bg-gradient-to-r from-yellow-400 to-pink-500 text-white'
                      : 'bg-white/10 text-white'
                  }`}
                >
                  {msg.senderId !== localPlayerId && (
                    <div className="text-xs font-bold mb-1 opacity-80">{msg.senderName}</div>
                  )}
                  {msg.type === 'gif' ? (
                    <img src={msg.content} alt="GIF" className="max-w-full rounded-lg" />
                  ) : (
                    <div className="text-sm md:text-base">{msg.content}</div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="border-t border-white/10 p-4 bg-black/20">
            <div className="grid grid-cols-10 gap-2 max-h-[120px] overflow-y-auto">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleEmojiClick(emoji)}
                  className="text-2xl hover:scale-125 transition-transform p-1"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* GIF Picker */}
        {showGifPicker && (
          <div className="border-t border-white/10 p-4 bg-black/20 max-h-[300px] flex flex-col">
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={gifSearch}
                onChange={(e) => {
                  setGifSearch(e.target.value);
                  if (e.target.value.trim()) {
                    searchGifs(e.target.value);
                  }
                }}
                placeholder="Search GIFs..."
                className="flex-1 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-yellow-400"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 overflow-y-auto">
              {gifResults.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => handleGifClick(gif.media_formats?.tinygif?.url || gif.media_formats?.gif?.url)}
                  className="aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
                >
                  <img
                    src={gif.media_formats?.tinygif?.url || gif.media_formats?.gif?.url}
                    alt={gif.content_description}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t border-white/10 p-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowEmojiPicker(!showEmojiPicker);
                setShowGifPicker(false);
              }}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-xl"
            >
              😀
            </button>
            <button
              type="button"
              onClick={() => {
                setShowGifPicker(!showGifPicker);
                setShowEmojiPicker(false);
              }}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-xl"
            >
              🎬
            </button>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-yellow-400"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-yellow-400 to-pink-500 hover:from-yellow-500 hover:to-pink-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

