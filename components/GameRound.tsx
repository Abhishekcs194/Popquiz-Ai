import React, { useState, useEffect, useRef } from 'react';
import { Question, Player, GameStatus } from '../types';
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
  totalQuestions: number; // Note: We might ignore this in display now
  players: Player[];
  duration: number; // Duration from settings
  startTime: number; // When the round actually started (server time)
  onAnswer: (correct: boolean, guess?: string) => void;
  gameStatus: GameStatus;
}

export const GameRound: React.FC<GameRoundProps> = ({ 
  question, 
  questionIndex, 
  players,
  duration,
  startTime,
  onAnswer,
  gameStatus
}) => {
  const [inputVal, setInputVal] = useState('');
  const [localState, setLocalState] = useState<'playing' | 'success' | 'failed'>('playing');
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showResult = gameStatus === 'round_result';

  // If question ID changes, reset local state
  useEffect(() => {
    if (gameStatus === 'playing') {
        setInputVal('');
        setLocalState('playing');
        setShake(false);
        setTimeout(() => {
            inputRef.current?.focus();
        }, 100);
    }
  }, [question.id, gameStatus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localState !== 'playing' || showResult || !inputVal.trim()) return;

    if (checkSimilarity(inputVal, question.answer)) {
      setLocalState('success');
      onAnswer(true);
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      
      // Notify parent of wrong answer (for display)
      onAnswer(false, inputVal.trim());
      
      // CLEAR INPUT immediately to allow rapid re-guessing
      setInputVal('');
    }
  };

  const handleTimeComplete = () => {
    if (localState === 'playing') {
       setLocalState('failed');
       // Logic handled by Host via App.tsx
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row h-full gap-6 pb-6 p-4">
      
      {/* Main Game Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-2">
            <div className="bg-black/30 px-4 py-2 rounded-full font-bold text-lg border border-white/10">
             Question #{questionIndex + 1}
            </div>
            <div className="text-sm font-bold opacity-60 uppercase tracking-widest">
                {question.category || 'General'}
            </div>
        </div>

        {/* Timer */}
        <ProgressBar 
            duration={duration} 
            isActive={gameStatus === 'playing' && localState === 'playing'} 
            startTime={startTime}
            onComplete={handleTimeComplete}
        />

        {/* Question Content */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[250px] mb-4 relative bg-black/10 rounded-3xl border border-white/5 p-4 overflow-hidden shadow-inner">
            
            {/* The Question */}
            <div className={`animate-pop w-full max-w-2xl text-center transition-all duration-500 ${showResult ? 'blur-sm scale-95 opacity-50' : ''}`}>
                {question.type === 'image' && (
                    <div className="relative inline-block group mb-4">
                        <img 
                            src={question.content} 
                            alt="Question" 
                            className="max-h-[300px] w-auto mx-auto rounded-xl shadow-2xl border-4 border-white object-contain bg-white"
                        />
                    </div>
                )}
                {/* Fallback for emoji if old questions exist, but mainly text now */}
                {question.type === 'text' && (
                    <div className="text-3xl md:text-5xl font-black leading-tight drop-shadow-lg px-4 mb-8">
                        {question.content}
                    </div>
                )}
            </div>

            {/* Status Messages / Round Result Overlay */}
            
            {showResult && (
                 <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-pop">
                    <div className="text-xl uppercase tracking-widest font-bold text-white/60 mb-2">The Answer Was</div>
                    <div className="bg-white text-black px-8 py-6 rounded-2xl shadow-[0_0_50px_rgba(255,255,255,0.3)] text-center border-4 border-yellow-400">
                        <div className="text-4xl md:text-6xl font-black">{question.answer}</div>
                    </div>
                </div>
            )}

            {!showResult && localState === 'success' && (
                <div className="animate-pop mt-4 bg-green-500/90 text-white px-8 py-4 rounded-xl shadow-2xl border-2 border-green-400 absolute bottom-10 z-10">
                    <div className="text-4xl font-black">CORRECT!</div>
                    <div className="text-sm font-bold text-center mt-1 opacity-80">Waiting for others...</div>
                </div>
            )}
            
            {!showResult && localState === 'failed' && (
                <div className="animate-pop mt-4 bg-red-500/90 text-white px-8 py-4 rounded-xl shadow-2xl border-2 border-red-400 absolute bottom-10 z-10">
                    <div className="text-4xl font-black">TIME UP!</div>
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
                    disabled={localState !== 'playing' || showResult}
                    className={`
                        w-full px-6 py-5 rounded-2xl text-2xl font-bold text-center outline-none border-4 shadow-2xl transition-all
                        placeholder-white/20
                        ${(localState === 'playing' && !showResult) ? 'bg-white text-indigo-900 border-white focus:border-yellow-400' : ''}
                        ${localState === 'success' ? 'bg-green-100 text-green-800 border-green-500' : ''}
                        ${localState === 'failed' || showResult ? 'bg-gray-700 text-gray-400 border-gray-600' : ''}
                    `}
                    placeholder={showResult ? "Round Over" : "Type your answer..."}
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