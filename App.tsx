import React, { useState, useEffect } from 'react';
import { GameStatus, Player, Question } from './types';
import { DEFAULT_QUESTIONS, AVATARS } from './constants';
import { Lobby } from './components/Lobby';
import { GameRound } from './components/GameRound';
import { GameOver } from './components/GameOver';

// Mock Bots for simulated multiplayer
const BOTS: Player[] = [
    { id: 'b1', name: 'QuizBot', avatar: '🤖', score: 0, streak: 0, isBot: true },
    { id: 'b2', name: 'Speedy', avatar: '⚡', score: 0, streak: 0, isBot: true },
    { id: 'b3', name: 'Smarty', avatar: '🧠', score: 0, streak: 0, isBot: true }
];

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>('lobby');
  const [questions, setQuestions] = useState<Question[]>(DEFAULT_QUESTIONS);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  
  // Players state includes the local user and bots
  const [players, setPlayers] = useState<Player[]>([...BOTS]);
  const [localPlayerId, setLocalPlayerId] = useState<string>('');

  // Handle URL params for room code (Visual only)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
        console.log("Joined room:", room);
        // In a real app, we would connect to websocket here
    }
  }, []);

  const handleStartGame = (name: string, avatar: string, newQuestions: Question[]) => {
    const myId = 'local-player';
    setLocalPlayerId(myId);
    
    const me: Player = { id: myId, name, avatar, score: 0, streak: 0 };
    
    // Reset bot scores
    const resetBots = BOTS.map(b => ({ ...b, score: 0, streak: 0 }));
    
    setPlayers([me, ...resetBots]);
    setQuestions(newQuestions);
    setCurrentQIndex(0);
    setStatus('playing');
  };

  const handleAnswer = (correct: boolean) => {
    if (correct) {
      updateScore(localPlayerId, true);
    } else {
      updateScore(localPlayerId, false);
    }
    // Note: In single player flow, we wait for answer to end round. 
    // In multiplayer usually round ends for everyone. 
    // Here we just proceed to next question after the delay in GameRound.
    handleNextQuestion();
  };

  const updateScore = (pid: string, success: boolean) => {
    setPlayers(prev => prev.map(p => {
        if (p.id === pid) {
            const newStreak = success ? p.streak + 1 : 0;
            const points = success ? 10 : 0;
            return { ...p, score: p.score + points, streak: newStreak };
        }
        return p;
    }));
  };

  const handleTimeUp = () => {
    updateScore(localPlayerId, false);
    handleNextQuestion();
  };

  const handleNextQuestion = () => {
    // Simulate Bot Answers for the COMPLETED round
    // We do this right before moving to next to simulate they played during the round
    simulateBotRound();

    if (currentQIndex + 1 < questions.length) {
      setCurrentQIndex(prev => prev + 1);
    } else {
      setStatus('game_over');
    }
  };

  // Logic to simulate bots getting points randomly
  const simulateBotRound = () => {
    setPlayers(prev => prev.map(p => {
        if (p.isBot) {
            // 40% chance bot gets it right
            const isCorrect = Math.random() > 0.6; 
            if (isCorrect) {
                return { ...p, score: p.score + 10 };
            }
        }
        return p;
    }));
  };

  const handleRestart = () => {
    // Reset scores
    setPlayers(prev => prev.map(p => ({ ...p, score: 0, streak: 0 })));
    setCurrentQIndex(0);
    setStatus('playing');
  };

  const handleHome = () => {
    setStatus('lobby');
  };

  const localPlayer = players.find(p => p.id === localPlayerId);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-indigo-900 via-purple-900 to-fuchsia-900 text-white flex flex-col">
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-32 h-32 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-10 right-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col p-4 md:p-6">
        
        {status === 'lobby' && (
          <div className="flex-1 flex items-center justify-center">
            <Lobby 
                onStartGame={handleStartGame} 
                defaultQuestions={DEFAULT_QUESTIONS}
                players={BOTS}
            />
          </div>
        )}

        {status === 'playing' && (
          <GameRound 
            question={questions[currentQIndex]}
            questionIndex={currentQIndex}
            totalQuestions={questions.length}
            players={players}
            onAnswer={handleAnswer}
            onTimeUp={handleTimeUp}
          />
        )}

        {status === 'game_over' && localPlayer && (
          <div className="flex-1 flex items-center justify-center">
            <GameOver 
                score={localPlayer.score} 
                totalQuestions={questions.length} 
                player={localPlayer.name}
                onRestart={handleRestart}
                onHome={handleHome}
            />
          </div>
        )}

      </div>
      
      <div className="fixed bottom-2 right-2 text-xs text-white/20 pointer-events-none">
        Powered by Gemini 2.5 Flash
      </div>
    </div>
  );
};

export default App;
