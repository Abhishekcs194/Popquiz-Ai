import React, { useState, useEffect, useRef } from 'react';
import { GameStatus, Player, Question, GameState, GameSettings } from './types';
import { DEFAULT_QUESTIONS } from './constants';
import { generateQuestions } from './services/geminiService';
import { multiplayer, NetworkMessage } from './services/multiplayer';
import { LandingPage } from './components/LandingPage';
import { Lobby } from './components/Lobby';
import { GameRound } from './components/GameRound';
import { GameOver } from './components/GameOver';

// --- Default State ---
const INITIAL_SETTINGS: GameSettings = {
  roundDuration: 15,
  pointsToWin: 50,
  deckType: 'classic',
  aiTopic: ''
};

const App: React.FC = () => {
  // Local Player Info
  const [localPlayerId] = useState(() => Math.random().toString(36).substring(2, 9));
  
  // Refs
  const pendingJoinRef = useRef<{name: string, avatar: string} | null>(null);
  const isGeneratingMoreRef = useRef(false); // Flag to prevent concurrent generations
  const gameStateRef = useRef<GameState>({
    roomId: '',
    status: 'landing',
    players: [],
    currentQuestionIndex: 0,
    questions: [],
    settings: INITIAL_SETTINGS,
    roundStartTime: 0
  });

  // State (for rendering)
  const [gameState, setGameState] = useState<GameState>(gameStateRef.current);

  // Helper to update state and ref simultaneously
  const updateState = (updates: Partial<GameState> | ((prev: GameState) => Partial<GameState>)) => {
    let newState: GameState;
    if (typeof updates === 'function') {
      newState = { ...gameStateRef.current, ...updates(gameStateRef.current) };
    } else {
      newState = { ...gameStateRef.current, ...updates };
    }
    gameStateRef.current = newState;
    setGameState(newState);
    return newState;
  };

  (window as any).localPlayerId = localPlayerId;

  // Initial URL Check
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      updateState({ roomId: room });
    }
  }, []);

  // --- Networking & Logic ---

  // 1. Connection Lifecycle
  useEffect(() => {
    if (gameState.roomId) {
      multiplayer.connect(gameState.roomId, (msg) => handleNetworkMessage(msg));
    }
    return () => multiplayer.disconnect();
  }, [gameState.roomId]);

  // 2. Join Request Retry Loop
  useEffect(() => {
    let interval: number;

    if (gameState.status === 'lobby' && gameState.players.length === 0 && !isLocalHost(gameState.players)) {
      const tryJoin = () => {
         if (pendingJoinRef.current) {
             console.log("[App] Broadcasting JOIN_REQUEST to mesh...");
             multiplayer.send({
                 type: 'JOIN_REQUEST',
                 payload: pendingJoinRef.current,
                 senderId: localPlayerId
             });
         }
      };
      tryJoin();
      interval = window.setInterval(tryJoin, 1500);
    }
    return () => clearInterval(interval);
  }, [gameState.status, gameState.players.length, gameState.roomId]);

  // 3. Handle Incoming Messages
  const handleNetworkMessage = (msg: NetworkMessage) => {
    const current = gameStateRef.current;
    
    switch (msg.type) {
      case 'JOIN_REQUEST':
        if (isLocalHost(current.players)) {
          const newPlayer: Player = {
            id: msg.senderId!,
            name: msg.payload.name,
            avatar: msg.payload.avatar,
            score: 0,
            streak: 0,
            isHost: false,
            isReady: false,
            hasAnsweredRound: false,
            isBot: false
          };
          
          const playerExists = current.players.some(p => p.id === newPlayer.id);
          let nextState = current;

          if (!playerExists) {
             console.log(`[Host] Accepting new player: ${newPlayer.name}`);
             nextState = updateState({ 
                 players: [...current.players, newPlayer] 
             });
          }
          multiplayer.send({ type: 'STATE_UPDATE', payload: nextState });
        }
        break;

      case 'STATE_UPDATE':
        if (!isLocalHost(current.players) || current.players.length === 0) {
            updateState(msg.payload);
        }
        break;

      case 'PLAYER_ACTION':
        if (isLocalHost(current.players)) {
          handlePlayerAction(msg.senderId!, msg.payload.action, msg.payload.data);
        }
        break;
    }
  };

  const isLocalHost = (players: Player[]) => {
    const host = players.find(p => p.isHost);
    return host?.id === localPlayerId;
  };

  // 4. Host Logic: Handle Actions
  const handlePlayerAction = (playerId: string, action: string, data: any) => {
    let current = gameStateRef.current;
    let newPlayers = [...current.players];
    let stateChanged = false;

    if (action === 'READY_TOGGLE') {
        newPlayers = newPlayers.map(p => 
            p.id === playerId ? { ...p, isReady: !p.isReady } : p
        );
        stateChanged = true;
    } 
    else if (action === 'ANSWER_CORRECT') {
        const player = newPlayers.find(p => p.id === playerId);
        if (player && !player.hasAnsweredRound) {
            newPlayers = newPlayers.map(p => 
                p.id === playerId ? { ...p, score: p.score + 10, hasAnsweredRound: true } : p
            );
            stateChanged = true;
        }
    }
    else if (action === 'ANSWER_WRONG') {
        // data is the wrong guess string
        newPlayers = newPlayers.map(p => 
            p.id === playerId ? { ...p, lastWrongGuess: data } : p
        );
        stateChanged = true;
    }

    if (stateChanged) {
        const newState = updateState({ players: newPlayers });
        broadcast(newState);
    }
  };

  // 5. Host Logic: Game Loop
  useEffect(() => {
    const current = gameStateRef.current;
    if (!isLocalHost(current.players) || current.status !== 'playing') return;

    const interval = setInterval(() => {
        const now = Date.now();
        const liveState = gameStateRef.current; 
        
        if (liveState.status !== 'playing') return;

        const elapsed = (now - liveState.roundStartTime) / 1000;
        const allAnswered = liveState.players.every(p => p.hasAnsweredRound);
        const timeUp = elapsed >= liveState.settings.roundDuration;

        if (allAnswered || timeUp) {
            handleRoundEnd();
        }
    }, 500);

    return () => clearInterval(interval);
  }, [gameState.status]);

  // Infinite Generation Logic (Background)
  const checkForMoreQuestions = async () => {
      if (isGeneratingMoreRef.current) return;
      const current = gameStateRef.current;
      
      // If using AI deck and we have fewer than 5 questions left
      if (current.settings.deckType === 'ai' && 
          (current.questions.length - current.currentQuestionIndex) < 5) {
          
          console.log("[Host] Low on questions, generating more...");
          isGeneratingMoreRef.current = true;
          
          try {
              // Collect existing answers to avoid duplicates
              const existingAnswers = current.questions.map(q => q.answer);
              const newQs = await generateQuestions(current.settings.aiTopic, 15, existingAnswers);
              
              if (newQs.length > 0) {
                  const newState = updateState(prev => ({
                      questions: [...prev.questions, ...newQs]
                  }));
                  broadcast(newState);
              }
          } catch (e) {
              console.error("Bg Gen failed", e);
          } finally {
              isGeneratingMoreRef.current = false;
          }
      }
  };


  const handleRoundEnd = () => {
    // Check if we need more questions
    checkForMoreQuestions();

    // 1. Transition to Round Result (Pause for 3 seconds)
    const newState = updateState({ status: 'round_result' });
    broadcast(newState);

    // 2. Wait 3 seconds, then process logic
    setTimeout(() => {
        processNextRound();
    }, 3000);
  };

  const processNextRound = () => {
      const current = gameStateRef.current;
      
      // Determine if anyone has won
      const potentialWinners = current.players.filter(p => p.score >= current.settings.pointsToWin);
      let isGameOver = false;

      if (potentialWinners.length === 1) {
          isGameOver = true;
      } else if (potentialWinners.length > 1) {
          // Tie-breaker
          const sorted = potentialWinners.sort((a,b) => b.score - a.score);
          const topScore = sorted[0].score;
          const runnersUp = sorted.filter(p => p.score === topScore);
          
          if (runnersUp.length === 1) {
              isGameOver = true;
          } else {
              isGameOver = false; // Continue if tie
          }
      }

      // Hard stop only if we genuinely have 0 questions left (shouldn't happen with infinite mode)
      if (current.currentQuestionIndex >= current.questions.length - 1) {
          isGameOver = true;
      }

      if (isGameOver) {
          const newState = updateState({ status: 'game_over' });
          broadcast(newState);
      } else {
          // Reset for next question
          // Also clear lastWrongGuess
          const resetPlayers = current.players.map(p => ({
              ...p, 
              hasAnsweredRound: false,
              lastWrongGuess: undefined 
          }));
          
          const newState = updateState({
              players: resetPlayers,
              currentQuestionIndex: current.currentQuestionIndex + 1,
              status: 'playing',
              roundStartTime: Date.now()
          });
          broadcast(newState);
      }
  };

  const broadcast = (state: GameState) => {
    multiplayer.send({
      type: 'STATE_UPDATE',
      payload: state
    });
  };

  // --- User Interaction Handlers ---

  const handleCreateGame = (name: string, avatar: string) => {
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    const hostPlayer: Player = {
        id: localPlayerId,
        name,
        avatar,
        score: 0,
        streak: 0,
        isHost: true,
        isReady: true,
        hasAnsweredRound: false,
        isBot: false
    };

    updateState({
        roomId,
        status: 'lobby',
        players: [hostPlayer],
        questions: DEFAULT_QUESTIONS,
        settings: INITIAL_SETTINGS
    });
    
    window.history.pushState({}, '', `?room=${roomId}`);
  };

  const handleJoinGame = (name: string, avatar: string, code: string) => {
    pendingJoinRef.current = { name, avatar };
    updateState({ 
        roomId: code, 
        status: 'lobby',
        players: [] 
    });
  };

  const handleUpdateSettings = (newSettings: GameSettings) => {
    if (!isLocalHost(gameState.players)) return;
    const newState = updateState({ settings: newSettings });
    broadcast(newState);
  };

  const handleToggleReady = () => {
    if (isLocalHost(gameState.players)) return; 
    multiplayer.send({
        type: 'PLAYER_ACTION',
        payload: { action: 'READY_TOGGLE' },
        senderId: localPlayerId
    });
  };

  const handleStartGame = async () => {
    if (!isLocalHost(gameState.players)) return;
    
    let finalQuestions = gameState.questions;

    // Handle AI
    if (gameState.settings.deckType === 'ai' && gameState.settings.aiTopic) {
        try {
            updateState({ status: 'generating' as GameStatus }); 
            
            // Initial batch: Win Score / 10 + buffer
            const countNeeded = Math.ceil(gameState.settings.pointsToWin / 10) + 15;
            
            const generated = await generateQuestions(gameState.settings.aiTopic, countNeeded);
            if (generated.length > 0) finalQuestions = generated;
        } catch (e) {
            console.error("AI Gen failed, using default");
        }
    }

    const newState = updateState({
        status: 'playing',
        questions: finalQuestions,
        currentQuestionIndex: 0,
        roundStartTime: Date.now(),
        players: gameState.players.map(p => ({
            ...p, 
            score: 0, 
            hasAnsweredRound: false,
            lastWrongGuess: undefined
        }))
    });
    broadcast(newState);
  };

  const handleAnswer = (correct: boolean, guess?: string) => {
    if (correct) {
        if (isLocalHost(gameState.players)) {
            handlePlayerAction(localPlayerId, 'ANSWER_CORRECT', null);
        } else {
            multiplayer.send({
                type: 'PLAYER_ACTION',
                payload: { action: 'ANSWER_CORRECT' },
                senderId: localPlayerId
            });
        }
    } else if (guess) {
        // Broadcast wrong answer for display
        if (isLocalHost(gameState.players)) {
            handlePlayerAction(localPlayerId, 'ANSWER_WRONG', guess);
        } else {
             multiplayer.send({
                type: 'PLAYER_ACTION',
                payload: { action: 'ANSWER_WRONG', data: guess },
                senderId: localPlayerId
            });
        }
    }
  };

  const handleRestart = () => {
     // Return everyone to lobby
     const newState = updateState({
        status: 'lobby',
        players: gameState.players.map(p => ({
            ...p, 
            score: 0, 
            isReady: false, 
            hasAnsweredRound: false,
            lastWrongGuess: undefined
        }))
    });
    broadcast(newState);
  };
  
  const handleHome = () => {
    window.location.href = window.location.origin;
  };


  // --- Render ---

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-indigo-900 via-purple-900 to-fuchsia-900 text-white flex flex-col font-fredoka">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-32 h-32 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-10 right-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col p-4 md:p-6">
        
        {gameState.status === 'landing' && (
             <div className="flex-1 flex items-center justify-center">
                <LandingPage 
                    onCreate={handleCreateGame}
                    onJoin={handleJoinGame}
                    initialCode={gameState.roomId}
                />
            </div>
        )}

        {gameState.status === 'lobby' && (
          <div className="flex-1 flex items-center justify-center">
             {gameState.players.length === 0 && !isLocalHost(gameState.players) ? (
                 <div className="text-center animate-pulse flex flex-col items-center">
                     <div className="text-4xl mb-4">📡</div>
                     <h2 className="text-2xl font-bold">Connecting to Room...</h2>
                     <p className="text-white/50 text-sm mt-2">Establishing P2P Link...</p>
                     <p className="text-white/30 text-xs mt-1">This can take a few seconds</p>
                     <button onClick={() => window.location.reload()} className="mt-8 text-xs underline opacity-50 hover:opacity-100">
                        Stuck? Refresh
                     </button>
                 </div>
             ) : (
                <Lobby 
                    roomId={gameState.roomId}
                    isHost={isLocalHost(gameState.players)}
                    players={gameState.players}
                    settings={gameState.settings}
                    onUpdateSettings={handleUpdateSettings}
                    onReady={handleToggleReady}
                    onStart={handleStartGame}
                />
             )}
          </div>
        )}

        {(gameState.status === 'playing' || gameState.status === 'round_result') && (
          <GameRound 
            question={gameState.questions[gameState.currentQuestionIndex]}
            questionIndex={gameState.currentQuestionIndex}
            totalQuestions={gameState.questions.length}
            players={gameState.players}
            duration={gameState.settings.roundDuration}
            startTime={gameState.roundStartTime}
            onAnswer={handleAnswer}
            gameStatus={gameState.status}
          />
        )}

        {gameState.status === 'generating' && (
           <div className="flex-1 flex items-center justify-center flex-col animate-pulse">
               <div className="text-5xl mb-4">🤖</div>
               <h2 className="text-2xl font-bold">AI is Thinking...</h2>
               <p>Generating questions about "{gameState.settings.aiTopic}"</p>
           </div>
        )}

        {gameState.status === 'game_over' && (
          <div className="flex-1 flex items-center justify-center">
             <GameOver 
                players={gameState.players}
                onRestart={isLocalHost(gameState.players) ? handleRestart : () => {}}
                onHome={handleHome}
                isHost={isLocalHost(gameState.players)}
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