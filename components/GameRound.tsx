import React, { useState, useEffect, useRef } from 'react';
import { Question, Player } from '../types';
import { ProgressBar } from './ProgressBar';
import { Scoreboard } from './Scoreboard';

// --- Utility: Levenshtein Distance for Fuzzy Matching ---
const levenshtein = (a: string, b: string): number => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const checkSimilarity = (input: string, target: string): boolean => {
  const cleanInput = input.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanTarget = target.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (cleanTarget.length === 0) return false;
  if (cleanInput === cleanTarget) return true;

  const dist = levenshtein(cleanInput, cleanTarget);
  const maxLength = Math.max(cleanInput.length, cleanTarget.length);
  const similarity = (maxLength - dist) / maxLength;

  // 80% match threshold
  return similarity >= 0.8;
};

interface GameRoundProps {
  question: Question;
  questionIndex: number;
  totalQuestions: number;
  players: Player[];
  duration: number; // Duration from settings
  startTime: number; // When the round actually started (server time)
  onAnswer: (correct: boolean) => void;
  // Note: We don't handle "onTimeUp" locally to change state, 
  // we just use it to disable input. The App/Host controls the flow.
}

export const GameRound: React.FC<GameRoundProps> = ({ 
  question, 
  questionIndex, 
  totalQuestions, 
  players,
  duration,
  startTime,
  onAnswer
}) => {
  const [inputVal, setInputVal] = useState('');
  const [gameState, setGameState] = useState<'playing' | 'success' | 'failed' | 'waiting'>('playing');
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // If question ID changes, reset local state
  useEffect(() => {
    setInputVal('');
    setGameState('playing');
    setShake(false);
    setTimeout(() => {
        inputRef.current?.focus();
    }, 100);
  }, [question.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (gameState !== 'playing') return;

    if (checkSimilarity(inputVal, question.answer)) {
      setGameState('success');
      onAnswer(true);
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  const handleTimeComplete = () => {
    if (gameState === 'playing') {
       setGameState('failed');
       // Logic handled by Host
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row h-full gap-6 pb-6 p-4">
      
      {/* Main Game Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
            <div className="bg-black/30 px-4 py-2 rounded-full font-bold text-lg border border-white/10">
            Q: {questionIndex + 1} / {totalQuestions > 0 ? totalQuestions : '?'}
            </div>
            <div className="text-sm font-bold opacity-60 uppercase tracking-widest">
                {question.category || 'General'}
            </div>
        </div>

        {/* Timer */}
        <ProgressBar 
            duration={duration} 
            isActive={gameState === 'playing'} 
            startTime={startTime}
            onComplete={handleTimeComplete}
        />

        {/* Question Content */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[250px] mb-4 relative bg-black/10 rounded-3xl border border-white/5 p-4">
            <div className="animate-pop w-full max-w-2xl text-center">
                {question.type === 'image' && (
                    <div className="relative inline-block group mb-4">
                        <img 
                            src={question.content} 
                            alt="Question" 
                            className="max-h-[300px] w-auto mx-auto rounded-xl shadow-2xl border-4 border-white object-contain bg-white"
                        />
                    </div>
                )}
                {question.type === 'emoji' && (
                    <div className="text-8xl md:text-9xl tracking-widest drop-shadow-2xl bg-white/10 p-8 rounded-3xl border border-white/20 backdrop-blur-sm inline-block mb-4">
                        {question.content}
                    </div>
                )}
                {question.type === 'text' && (
                    <div className="text-3xl md:text-5xl font-black leading-tight drop-shadow-lg px-4 mb-8">
                        {question.content}
                    </div>
                )}
            </div>

            {/* Status Messages */}
            {gameState === 'success' && (
                <div className="animate-pop mt-4 bg-green-500/90 text-white px-8 py-4 rounded-xl shadow-2xl border-2 border-green-400 absolute bottom-10 z-10">
                    <div className="text-4xl font-black">CORRECT!</div>
                    <div className="text-sm font-bold text-center mt-1 opacity-80">Waiting for others...</div>
                </div>
            )}
             {gameState === 'failed' && (
                <div className="animate-pop mt-4 bg-red-500/90 text-white px-8 py-4 rounded-xl shadow-2xl border-2 border-red-400 absolute bottom-10 z-10">
                    <div className="text-4xl font-black">TIME UP!</div>
                    <div className="text-lg font-bold text-center mt-1">Answer: {question.answer}</div>
                </div>
            )}
        </div>

        {/* Input Area */}
        <div className="w-full max-w-2xl mx-auto">
            <form onSubmit={handleSubmit} className={`relative transition-transform ${shake ? 'translate-x-[-10px] md:translate-x-[-20px]' : ''}`}>
                <input
                    ref={inputRef}
                    type="text"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    disabled={gameState !== 'playing'}
                    className={`
                        w-full px-6 py-5 rounded-2xl text-2xl font-bold text-center outline-none border-4 shadow-2xl transition-all
                        placeholder-gray-400
                        ${gameState === 'playing' ? 'bg-white text-indigo-900 border-white focus:border-yellow-400' : ''}
                        ${gameState === 'success' ? 'bg-green-100 text-green-800 border-green-500' : ''}
                        ${gameState === 'failed' ? 'bg-red-100 text-red-800 border-red-500' : ''}
                    `}
                    placeholder="Type your answer..."
                    autoComplete="off"
                    autoFocus
                />
            </form>
            <div className="text-center mt-3 text-white/40 text-sm font-medium">
                10 Points per correct answer
            </div>
        </div>
      </div>

      {/* Scoreboard Sidebar */}
      <div className="w-full md:w-80 flex-shrink-0">
        <Scoreboard players={players} />
      </div>

    </div>
  );
};
