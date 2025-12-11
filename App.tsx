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
  // We sync this with the ref manually when needed to trigger re-renders
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

  // Hack for components to access ID easily
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
      console.log(`[App] Connecting to channel: popquiz-${gameState.roomId}`);
      multiplayer.connect(gameState.roomId, (msg) => handleNetworkMessage(msg));
    }
    return () => multiplayer.disconnect();
  }, [gameState.roomId]);

  // 2. Join Request Retry Loop
  // This ensures that if we are in 'lobby' but have no players (meaning we haven't synced with host),
  // we keep trying to join.
  useEffect(() => {
    let interval: number;

    if (gameState.status === 'lobby' && gameState.players.length === 0 && !isLocalHost(gameState.players)) {
      const tryJoin = () => {
         if (pendingJoinRef.current) {
             console.log("[App] Sending JOIN_REQUEST...");
             multiplayer.send({
                 type: 'JOIN_REQUEST',
                 payload: pendingJoinRef.current,
                 senderId: localPlayerId
             });
         }
      };

      // Try immediately
      tryJoin();
      // And retry every 2 seconds
      interval = window.setInterval(tryJoin, 2000);
    }

    return () => clearInterval(interval);
  }, [gameState.status, gameState.players.length, gameState.roomId]);

  // 3. Handle Incoming Messages
  const handleNetworkMessage = (msg: NetworkMessage) => {
    const current = gameStateRef.current;
    
    switch (msg.type) {
      case 'JOIN_REQUEST':
        // Only the host responds to join requests
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
          
          // Prevent duplicates
          const playerExists = current.players.some(p => p.id === newPlayer.id);
          let nextState = current;

          if (!playerExists) {
             nextState = updateState({ 
                 players: [...current.players, newPlayer] 
             });
          }
          
          // ALWAYS broadcast state when receiving a join request, 
          // even if player exists (to help them re-sync)
          multiplayer.send({
              type: 'STATE_UPDATE',
              payload: nextState
          });
        }
        break;

      case 'STATE_UPDATE':
        // Guests receive the authoritative state
        // We only accept state updates if we are not the host (or if we are confused)
        // Note: We deliberately don't check isLocalHost here initially because when joining, 
        // we don't know who the host is yet until we receive the first state!
        updateState(msg.payload);
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
        // Prevent double scoring for same question
        const player = newPlayers.find(p => p.id === playerId);
        if (player && !player.hasAnsweredRound) {
            newPlayers = newPlayers.map(p => 
                p.id === playerId ? { ...p, score: p.score + 10, hasAnsweredRound: true } : p
            );
            stateChanged = true;
        }
    }

    if (stateChanged) {
        const newState = updateState({ players: newPlayers });
        multiplayer.send({
            type: 'STATE_UPDATE',
            payload: newState
        });
    }
  };

  // 5. Host Logic: Game Loop
  useEffect(() => {
    // Only Host runs the game loop
    const current = gameStateRef.current;
    if (!isLocalHost(current.players) || current.status !== 'playing') return;

    const interval = setInterval(() => {
        const now = Date.now();
        const liveState = gameStateRef.current; // access fresh ref inside interval
        
        // Safety check if status changed mid-interval
        if (liveState.status !== 'playing') return;

        const elapsed = (now - liveState.roundStartTime) / 1000;
        
        const allAnswered = liveState.players.every(p => p.hasAnsweredRound);
        const timeUp = elapsed >= liveState.settings.roundDuration;

        if (allAnswered || timeUp) {
            handleRoundEnd();
        }
    }, 500);

    return () => clearInterval(interval);
  }, [gameState.status]); // Re-bind if status changes

  const handleRoundEnd = () => {
    const current = gameStateRef.current;
    
    // Check Win Condition
    const winner = current.players.find(p => p.score >= current.settings.pointsToWin);
    
    if (winner || current.currentQuestionIndex >= current.questions.length - 1) {
        const newState = updateState({ status: 'game_over' });
        broadcast(newState);
    } else {
        // Next Question
        const resetPlayers = current.players.map(p => ({...p, hasAnsweredRound: false}));
        const newState = updateState({
            players: resetPlayers,
            currentQuestionIndex: current.currentQuestionIndex + 1,
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
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const hostPlayer: Player = {
        id: localPlayerId,
        name,
        avatar,
        score: 0,
        streak: 0,
        isHost: true,
        isReady: true, // Host is implicitly ready to configure
        hasAnsweredRound: false,
        isBot: false
    };

    const newState = updateState({
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
    
    // Just switch status to lobby. 
    // The "Join Request Retry Loop" useEffect will pick this up 
    // and send the request because players.length is 0.
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
            updateState({ status: 'generating' as GameStatus }); // Show loading if you want, or just wait
            const generated = await generateQuestions(gameState.settings.aiTopic);
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
        players: gameState.players.map(p => ({...p, score: 0, hasAnsweredRound: false}))
    });
    broadcast(newState);
  };

  const handleAnswer = (correct: boolean) => {
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
    }
  };

  const handleRestart = () => {
       const newState = updateState({
        status: 'lobby',
        players: gameState.players.map(p => ({...p, score: 0, isReady: false}))
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
                 <div className="text-center animate-pulse">
                     <div className="text-4xl mb-4">🔗</div>
                     <h2 className="text-2xl font-bold">Connecting to Room...</h2>
                     <p className="text-white/50">Attempting to reach Host...</p>
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

        {gameState.status === 'playing' && (
          <GameRound 
            question={gameState.questions[gameState.currentQuestionIndex]}
            questionIndex={gameState.currentQuestionIndex}
            totalQuestions={gameState.questions.length}
            players={gameState.players}
            duration={gameState.settings.roundDuration}
            startTime={gameState.roundStartTime}
            onAnswer={handleAnswer}
          />
        )}

        {gameState.status === 'game_over' && (
          <div className="flex-1 flex items-center justify-center">
             <GameOver 
                score={gameState.players.find(p => p.id === localPlayerId)?.score || 0}
                totalQuestions={gameState.questions.length} 
                player={gameState.players.find(p => p.id === localPlayerId)?.name || 'You'}
                onRestart={isLocalHost(gameState.players) ? handleRestart : undefined}
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