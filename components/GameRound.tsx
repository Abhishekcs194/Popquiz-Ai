import React, { useState, useEffect, useRef } from 'react';
import { Question, Player, GameStatus } from '../types';
import { ProgressBar } from './ProgressBar';
import { Scoreboard } from './Scoreboard';
import { playSound } from '../services/soundService';

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

const checkSingleSimilarity = (input: string, target: string): boolean => {
  const cleanInput = input.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanTarget = target.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (cleanTarget.length === 0) return false;
  if (cleanInput === cleanTarget) return true;

  const dist = levenshtein(cleanInput, cleanTarget);
  const maxLength = Math.max(cleanInput.length, cleanTarget.length);
  const similarity = (maxLength - dist) / maxLength;

  // STRICTER THRESHOLD: 95%
  return similarity >= 0.95;
};

const checkAnswer = (input: string, question: Question): boolean => {
    // Check main answer
    if (checkSingleSimilarity(input, question.answer)) return true;
    
    // Check accepted answers (abbreviations)
    if (question.acceptedAnswers && question.acceptedAnswers.length > 0) {
        return question.acceptedAnswers.some(alias => checkSingleSimilarity(input, alias));
    }
    
    return false;
};

interface GameRoundProps {
  question: Question;
  questionIndex: number;
  totalQuestions: number; 
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
  
  // Image Loading State
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [currentImageSrc, setCurrentImageSrc] = useState(question.content);
  const [imageError, setImageError] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const showResult = gameStatus === 'round_result';

  // --- Reset logic when question changes ---
  useEffect(() => {
    if (gameStatus === 'playing') {
        setInputVal('');
        setLocalState('playing');
        setShake(false);
        setCurrentImageSrc(question.content);
        setImageError(false);
        
        if (question.type === 'image') {
            setIsImageLoading(true);
        } else {
            setIsImageLoading(false);
            playSound.pop();
        }

        setTimeout(() => {
            inputRef.current?.focus();
        }, 100);
    }
  }, [question.id, gameStatus, question.type, question.content]);

  // Handle successful image load
  const handleImageLoad = () => {
      if (isImageLoading) {
          setIsImageLoading(false);
          playSound.pop();
      }
  };

  // Handle image load error (No AI Fallback)
  const handleImageError = () => {
      console.log(`[GameRound] Image failed to load: ${currentImageSrc}`);
      setIsImageLoading(false);
      setImageError(true);
      setCurrentImageSrc("https://placehold.co/600x400/202020/FFFFFF?text=Image+Load+Error"); 
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localState !== 'playing' || showResult || !inputVal.trim()) return;
    
    if (checkAnswer(inputVal, question)) {
      setLocalState('success');
      playSound.correct();
      onAnswer(true);
    } else {
      setShake(true);
      playSound.wrong();
      setTimeout(() => setShake(false), 500);
      onAnswer(false, inputVal.trim());
      setInputVal('');
    }
  };

  const handleTimeComplete = () => {
    if (localState === 'playing') {
       setLocalState('failed');
    }
  };

  const isTimerActive = gameStatus === 'playing' && localState === 'playing';

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row h-full gap-4 md:gap-6 pb-4 md:pb-6 p-2 md:p-4">
      
      {/* Main Game Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex justify-between items-center mb-2">
            <div className="bg-black/30 px-3 py-1 md:px-4 md:py-2 rounded-full font-bold text-sm md:text-lg border border-white/10">
             Question #{questionIndex + 1}
            </div>
            <div className="text-xs md:text-sm font-bold opacity-60 uppercase tracking-widest">
                {question.category || 'General'}
            </div>
        </div>

        {/* Timer */}
        <ProgressBar 
            duration={duration} 
            isActive={isTimerActive} 
            startTime={startTime}
            onComplete={handleTimeComplete}
        />

        {/* Question Content */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] md:min-h-[250px] mb-4 relative bg-black/10 rounded-3xl border border-white/5 p-2 md:p-4 overflow-hidden shadow-inner">
            
            {/* The Question */}
            <div className={`animate-pop w-full max-w-2xl text-center transition-all duration-500 ${showResult ? 'blur-sm scale-95 opacity-50' : ''}`}>
                {question.type === 'image' && (
                    <div className="flex flex-col items-center">
                        {/* Display Question Text */}
                        <div className="text-lg md:text-3xl font-bold mb-2 md:mb-6 text-white drop-shadow-md animate-pop">
                            {question.questionText || "What is this?"}
                        </div>
                        
                        <div className="relative inline-block group mb-2 md:mb-4 min-h-[150px] md:min-h-[200px] flex items-center justify-center w-full">
                             {/* Loading Spinner */}
                             {isImageLoading && !imageError && (
                                <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/20 backdrop-blur-sm rounded-xl">
                                    <div className="w-10 h-10 md:w-12 md:h-12 border-4 border-white/30 border-t-yellow-400 rounded-full animate-spin"></div>
                                </div>
                            )}
                            
                            {/* Image */}
                            <img 
                                key={currentImageSrc} 
                                src={currentImageSrc} 
                                onLoad={handleImageLoad}
                                onError={handleImageError} 
                                alt="Question" 
                                loading="eager"
                                crossOrigin="anonymous"
                                className={`
                                    max-h-[220px] md:max-h-[350px] w-auto mx-auto rounded-xl shadow-2xl border-4 border-white object-contain bg-white transition-opacity duration-300
                                    ${isImageLoading ? 'opacity-0' : 'opacity-100'}
                                    ${imageError ? 'grayscale opacity-50' : ''}
                                `}
                            />
                        </div>
                    </div>
                )}
                {/* Fallback for text */}
                {question.type === 'text' && (
                    <div className="text-2xl md:text-5xl font-black leading-tight drop-shadow-lg px-4 mb-4 md:mb-8">
                        {question.content}
                    </div>
                )}
            </div>

            {/* Status Messages / Round Result Overlay */}
            
            {showResult && (
                 <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-pop p-4">
                    <div className="text-sm md:text-xl uppercase tracking-widest font-bold text-white/60 mb-2">The Answer Was</div>
                    <div className="bg-white text-black px-6 py-4 md:px-8 md:py-6 rounded-2xl shadow-[0_0_50px_rgba(255,255,255,0.3)] text-center border-4 border-yellow-400 max-w-full">
                        <div className="text-2xl md:text-6xl font-black break-words">{question.answer}</div>
                    </div>
                     {question.acceptedAnswers && (
                        <div className="mt-4 text-white/60 text-xs md:text-sm font-bold text-center">
                            Also accepted: {question.acceptedAnswers.join(', ')}
                        </div>
                    )}
                </div>
            )}

            {!showResult && localState === 'success' && (
                <div className="animate-pop mt-2 md:mt-4 bg-green-500/90 text-white px-6 py-3 md:px-8 md:py-4 rounded-xl shadow-2xl border-2 border-green-400 absolute bottom-5 md:bottom-10 z-10">
                    <div className="text-2xl md:text-4xl font-black">CORRECT!</div>
                    <div className="text-xs md:text-sm font-bold text-center mt-1 opacity-80">Waiting for others...</div>
                </div>
            )}
            
            {!showResult && localState === 'failed' && (
                <div className="animate-pop mt-2 md:mt-4 bg-red-500/90 text-white px-6 py-3 md:px-8 md:py-4 rounded-xl shadow-2xl border-2 border-red-400 absolute bottom-5 md:bottom-10 z-10">
                    <div className="text-2xl md:text-4xl font-black">TIME UP!</div>
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
                        w-full px-4 py-3 md:px-6 md:py-5 rounded-2xl text-xl md:text-2xl font-bold text-center outline-none border-4 shadow-2xl transition-all
                        placeholder-white/20
                        ${(localState === 'playing' && !showResult) ? 'bg-white text-indigo-900 border-white focus:border-yellow-400' : ''}
                        ${localState === 'success' ? 'bg-green-100 text-green-800 border-green-500' : ''}
                        ${localState === 'failed' || showResult ? 'bg-gray-700 text-gray-400 border-gray-600' : ''}
                        ${isImageLoading ? 'opacity-50 cursor-progress' : ''}
                    `}
                    placeholder={showResult ? "Round Over" : isImageLoading ? "Loading Image..." : "Type your answer..."}
                    autoComplete="off"
                    autoFocus
                />
            </form>
            <div className="text-center mt-2 md:mt-3 text-white/40 text-xs md:text-sm font-medium">
                10 Points per correct answer
            </div>
        </div>
      </div>

      {/* Scoreboard Sidebar */}
      <div className="w-full md:w-80 flex-shrink-0 order-last md:order-none">
        <Scoreboard players={players} />
      </div>

    </div>
  );
};