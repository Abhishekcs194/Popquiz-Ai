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
  
  // Game State (The "Truth")
  const [gameState, setGameState] = useState<GameState>({
    roomId: '',
    status: 'landing',
    players: [],
    currentQuestionIndex: 0,
    questions: [],
    settings: INITIAL_SETTINGS,
    roundStartTime: 0
  });

  // Hack for components to access ID easily
  (window as any).localPlayerId = localPlayerId;

  // Initial URL Check
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setGameState(prev => ({ ...prev, roomId: room }));
    }
  }, []);

  // --- Networking & Logic ---

  // 1. Listen for messages
  useEffect(() => {
    if (gameState.roomId) {
      multiplayer.connect(gameState.roomId, handleNetworkMessage);
    }
    return () => multiplayer.disconnect();
  }, [gameState.roomId]);

  // 2. Handle Messages
  const handleNetworkMessage = (msg: NetworkMessage) => {
    switch (msg.type) {
      case 'JOIN_REQUEST':
        // If I am the host, I receive join requests and reply with the full state
        if (isLocalHost()) {
          const newPlayer: Player = {
            id: msg.senderId!,
            name: msg.payload.name,
            avatar: msg.payload.avatar,
            score: 0,
            streak: 0,
            isHost: false,
            isReady: false,
            hasAnsweredRound: false
          };
          
          // Check if already exists
          const exists = gameState.players.find(p => p.id === newPlayer.id);
          let updatedPlayers = gameState.players;
          if (!exists) {
            updatedPlayers = [...gameState.players, newPlayer];
          }

          const newState = { ...gameState, players: updatedPlayers };
          updateAndBroadcastState(newState);
        }
        break;

      case 'STATE_UPDATE':
        // I am a guest, I receive the authoritative state from the host
        // Important: Don't overwrite my local player ID concept, just the data
        setGameState(msg.payload);
        break;

      case 'PLAYER_ACTION':
        if (isLocalHost()) {
          handlePlayerAction(msg.senderId!, msg.payload.action, msg.payload.data);
        }
        break;
    }
  };

  // Helper to check if THIS browser tab is the host
  const isLocalHost = () => {
    const host = gameState.players.find(p => p.isHost);
    return host?.id === localPlayerId;
  };

  // 3. Host Logic: Handle Actions
  const handlePlayerAction = (playerId: string, action: string, data: any) => {
    let newState = { ...gameState };

    if (action === 'READY_TOGGLE') {
      newState.players = newState.players.map(p => 
        p.id === playerId ? { ...p, isReady: !p.isReady } : p
      );
    } 
    else if (action === 'ANSWER_CORRECT') {
      newState.players = newState.players.map(p => 
        p.id === playerId ? { ...p, score: p.score + 10, hasAnsweredRound: true } : p
      );
    }

    updateAndBroadcastState(newState);
  };

  // 4. Host Logic: Game Loop / Timer
  // We use a ref to break the closure of setInterval so it sees fresh state
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  useEffect(() => {
    if (!isLocalHost() || gameState.status !== 'playing') return;

    const interval = setInterval(() => {
        const current = stateRef.current;
        const elapsed = (Date.now() - current.roundStartTime) / 1000;
        
        // Check 1: Did everyone answer?
        const allAnswered = current.players.every(p => p.hasAnsweredRound);
        
        // Check 2: Time up?
        const timeUp = elapsed >= current.settings.roundDuration;

        if (allAnswered || timeUp) {
            // End Round logic
            handleRoundEnd();
        }
    }, 500);

    return () => clearInterval(interval);
  }, [gameState.status, gameState.roundStartTime]); // Re-bind if status changes to playing

  const handleRoundEnd = () => {
    const current = stateRef.current;
    
    // Check Win Condition
    const winner = current.players.find(p => p.score >= current.settings.pointsToWin);
    
    if (winner || current.currentQuestionIndex >= current.questions.length - 1) {
        updateAndBroadcastState({
            ...current,
            status: 'game_over'
        });
    } else {
        // Next Question
        // Reset answered flags
        const resetPlayers = current.players.map(p => ({...p, hasAnsweredRound: false}));
        
        updateAndBroadcastState({
            ...current,
            players: resetPlayers,
            currentQuestionIndex: current.currentQuestionIndex + 1,
            roundStartTime: Date.now()
        });
    }
  };

  // 5. Utility: Update State locally AND send to everyone
  const updateAndBroadcastState = (newState: GameState) => {
    setGameState(newState);
    multiplayer.send({
      type: 'STATE_UPDATE',
      payload: newState
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
        isReady: true,
        hasAnsweredRound: false
    };

    setGameState({
        ...gameState,
        roomId,
        status: 'lobby',
        players: [hostPlayer],
        questions: DEFAULT_QUESTIONS,
        settings: INITIAL_SETTINGS
    });
    
    // Update URL without reload
    window.history.pushState({}, '', `?room=${roomId}`);
  };

  const handleJoinGame = (name: string, avatar: string, code: string) => {
    // Initial state is mostly empty, we wait for sync
    setGameState(prev => ({ ...prev, roomId: code, status: 'lobby' }));
    
    // Send request
    multiplayer.connect(code, handleNetworkMessage);
    multiplayer.send({
        type: 'JOIN_REQUEST',
        payload: { name, avatar },
        senderId: localPlayerId
    });
  };

  const handleUpdateSettings = (newSettings: GameSettings) => {
    if (!isLocalHost()) return;
    updateAndBroadcastState({ ...gameState, settings: newSettings });
  };

  const handleToggleReady = () => {
    if (isLocalHost()) return; // Host is always ready effectively (they start)
    multiplayer.send({
        type: 'PLAYER_ACTION',
        payload: { action: 'READY_TOGGLE' },
        senderId: localPlayerId
    });
  };

  const handleStartGame = async () => {
    if (!isLocalHost()) return;
    
    let finalQuestions = gameState.questions;

    // Handle AI Generation if needed
    if (gameState.settings.deckType === 'ai' && gameState.settings.aiTopic) {
        // Temporarily set status to generating to show loading UI if we wanted
        try {
            const generated = await generateQuestions(gameState.settings.aiTopic);
            if (generated.length > 0) finalQuestions = generated;
        } catch (e) {
            console.error("AI Gen failed, using default");
        }
    }

    updateAndBroadcastState({
        ...gameState,
        status: 'playing',
        questions: finalQuestions,
        currentQuestionIndex: 0,
        roundStartTime: Date.now(),
        players: gameState.players.map(p => ({...p, score: 0, hasAnsweredRound: false}))
    });
  };

  const handleAnswer = (correct: boolean) => {
    if (correct) {
        if (isLocalHost()) {
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
      // Return to lobby
       updateAndBroadcastState({
        ...gameState,
        status: 'lobby',
        players: gameState.players.map(p => ({...p, score: 0, isReady: false}))
    });
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
            <Lobby 
                roomId={gameState.roomId}
                isHost={isLocalHost()}
                players={gameState.players}
                settings={gameState.settings}
                onUpdateSettings={handleUpdateSettings}
                onReady={handleToggleReady}
                onStart={handleStartGame}
            />
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
                onRestart={isLocalHost() ? handleRestart : undefined}
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
