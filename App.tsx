import React, { useState, useEffect, useRef } from 'react';
import { GameStatus, Player, Question, GameState, GameSettings } from './types';
import { DEFAULT_QUESTIONS } from './constants';
import { generateQuestions } from './services/geminiService';
import { multiplayer, NetworkMessage } from './services/multiplayer';
import { playSound } from './services/soundService'; // Add sound service
import { LandingPage } from './components/LandingPage';
import { Lobby } from './components/Lobby';
import { GameRound } from './components/GameRound';
import { GameOver } from './components/GameOver';
import { Navbar } from './components/Navbar';

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
  const [localPlayerName, setLocalPlayerName] = useState(() => {
    return localStorage.getItem('popquiz-player-name') || 'Player';
  });
  const [localPlayerAvatar, setLocalPlayerAvatar] = useState(() => {
    return localStorage.getItem('popquiz-player-avatar') || '👤';
  });
  
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

  // Initial URL Check - Only set roomId, don't connect yet
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      // Set roomId but keep status as 'landing' so user can enter name
      updateState({ roomId: room, status: 'landing' });
    }
  }, []);

  // --- Pre-caching Images ---
  useEffect(() => {
      // Logic: Look ahead 3 questions and load images into browser cache
      if (gameState.status === 'playing' || gameState.status === 'generating') {
          const start = gameState.currentQuestionIndex + 1;
          const end = start + 3;
          const upcoming = gameState.questions.slice(start, end);
          
          upcoming.forEach(q => {
              if (q.type === 'image' && q.content) {
                  const img = new Image();
                  img.src = q.content;
              }
          });
      }
  }, [gameState.currentQuestionIndex, gameState.questions, gameState.status]);

  // --- Networking & Logic ---

  // 1. Connection Lifecycle - Only connect when in lobby, not on landing
  useEffect(() => {
    // Only connect if we have a roomId AND we're not on the landing page
    // This prevents auto-connecting when opening a share link
    if (gameState.roomId && gameState.status !== 'landing') {
      multiplayer.connect(gameState.roomId, (msg) => handleNetworkMessage(msg));
      
      // If we're the host, broadcast state periodically to help guests connect
      const broadcastState = () => {
        const current = gameStateRef.current;
        if (isLocalHost(current.players) && current.players.length > 0) {
          multiplayer.send({ 
            type: 'STATE_UPDATE', 
            payload: current,
            senderId: localPlayerId
          });
        }
      };
      
      // Listen for peer connections to broadcast state immediately
      (window as any).__onPeerConnected = (peerId: string) => {
        const current = gameStateRef.current;
        if (isLocalHost(current.players) && current.players.length > 0) {
          // Send state update multiple times to ensure delivery
          for (let i = 0; i < 3; i++) {
            setTimeout(() => {
              multiplayer.send({ 
                type: 'STATE_UPDATE', 
                payload: current,
                senderId: localPlayerId
              });
            }, i * 200);
          }
        }
      };
      
      // Broadcast state immediately and then periodically
      setTimeout(broadcastState, 500); // Start after 500ms
      const broadcastInterval = setInterval(broadcastState, 2000); // Then every 2 seconds
      
      // Cleanup: only clear interval, don't disconnect (let disconnect happen only when roomId changes or status goes to landing)
      return () => {
        clearInterval(broadcastInterval);
        // Don't disconnect here - let the roomId/status change handle disconnection
      };
    } else if (gameState.status === 'landing' || !gameState.roomId) {
      // Only disconnect if we're explicitly on landing or have no roomId
      multiplayer.disconnect();
    }
    // No cleanup needed if we're staying in the same room with same status
  }, [gameState.roomId, gameState.status]);

  // 2. Join Request Retry Loop (with connection readiness check)
  useEffect(() => {
    let interval: number;
    let timeout: number;
    let attemptCount = 0;
    const maxAttempts = 20; // 30 seconds max (20 * 1.5s)

    // Check if we're a guest (not host) and we're not in the players list yet
    const isGuest = !isLocalHost(gameState.players);
    const isInPlayersList = gameState.players.some(p => p.id === localPlayerId);
    const shouldSendJoinRequest = gameState.status === 'lobby' && isGuest && !isInPlayersList && pendingJoinRef.current;

    if (shouldSendJoinRequest) {
      const tryJoin = () => {
         attemptCount++;
         const connectionState = multiplayer.getConnectionState();
         
        if (pendingJoinRef.current) {
            // Always try to send JOIN_REQUEST - P2P needs messages to establish connection
            // Trystero will queue messages and deliver when peers connect
            try {
              const sent = multiplayer.send({
                  type: 'JOIN_REQUEST',
                  payload: pendingJoinRef.current,
                  senderId: localPlayerId
              });
              
              if (!sent) {
                console.warn(`[App] Failed to send JOIN_REQUEST, will retry`);
              }
            } catch (error) {
              console.error(`[App] Error sending JOIN_REQUEST:`, error);
            }
        }

        // Stop retrying if we're now in the players list
        const currentIsInPlayersList = gameStateRef.current.players.some(p => p.id === localPlayerId);
        if (currentIsInPlayersList) {
            clearInterval(interval);
            return;
        }

         // Stop retrying after max attempts
         if (attemptCount >= maxAttempts) {
             console.warn(`[App] Max join attempts reached. Stopping retry.`);
             clearInterval(interval);
             // Show error message to user
             console.error(`[App] Failed to connect to room after ${maxAttempts} attempts. Please check your network connection.`);
         }
      };
      
      // Start after a delay to let Trystero initialize
      setTimeout(tryJoin, 1000);
      // Then retry every 2 seconds (give P2P more time between attempts)
      interval = window.setInterval(tryJoin, 2000);
      
      // Set overall timeout
      timeout = window.setTimeout(() => {
        clearInterval(interval);
      }, maxAttempts * 1500);
    }
    
    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [gameState.status, gameState.players, gameState.roomId, localPlayerId]);

  // 3. Handle Incoming Messages
  const handleNetworkMessage = (msg: NetworkMessage) => {
    const current = gameStateRef.current;
    
    // Ignore messages from ourselves
    if (msg.senderId === localPlayerId) {
      return;
    }

    // Validate message has required fields
    if (!msg.type || !msg.senderId) {
      console.warn('[App] Received invalid message:', msg);
      return;
    }
    
    switch (msg.type) {
      case 'JOIN_REQUEST':
        if (isLocalHost(current.players)) {
          // Validate payload
          if (!msg.payload || !msg.payload.name || !msg.payload.avatar) {
            console.warn('[App] Invalid JOIN_REQUEST payload:', msg.payload);
            return;
          }

          const newPlayer: Player = {
            id: msg.senderId,
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

          if (!playerExists) {
             updateState({ 
                 players: [...current.players, newPlayer] 
             });
             
             // Send state update immediately and with retries to ensure it reaches the joining player
             const sendStateUpdate = (retryCount = 0) => {
               const stateToSend = gameStateRef.current;
               const sent = multiplayer.send({ 
                 type: 'STATE_UPDATE', 
                 payload: stateToSend,
                 senderId: localPlayerId
               });
               
               if (!sent && retryCount < 5) {
                 console.warn(`[Host] Failed to send STATE_UPDATE, retrying... (${retryCount + 1}/5)`);
                 setTimeout(() => sendStateUpdate(retryCount + 1), 500);
               } else if (sent) {
                 // Send a second time after a short delay to ensure delivery
                 setTimeout(() => {
                   const latestState = gameStateRef.current;
                   multiplayer.send({ 
                     type: 'STATE_UPDATE', 
                     payload: latestState,
                     senderId: localPlayerId
                   });
                 }, 1000);
               }
             };
             
             sendStateUpdate();
          }
        }
        break;

      case 'STATE_UPDATE':
        // Accept state updates if:
        // 1. We're not the host, OR
        // 2. We have no players (initial sync), OR
        // 3. We're waiting to join (status is lobby and no players)
        const shouldAcceptUpdate = !isLocalHost(current.players) || 
                                   current.players.length === 0 ||
                                   (current.status === 'lobby' && current.players.length === 0);
        
        if (shouldAcceptUpdate) {
            // Validate payload structure
            if (msg.payload && typeof msg.payload === 'object') {
                updateState(msg.payload);
            } else {
                console.warn('[App] Invalid STATE_UPDATE payload');
            }
        }
        break;

      case 'PLAYER_ACTION':
        if (isLocalHost(current.players)) {
          // Validate action payload
          if (msg.payload && msg.payload.action) {
            handlePlayerAction(msg.senderId, msg.payload.action, msg.payload.data);
          } else {
            console.warn('[App] Invalid PLAYER_ACTION payload:', msg.payload);
          }
        }
        break;

      case 'CHAT_MESSAGE':
        // Chat messages are handled by ChatSheet component
        // Broadcast to all players (including sender for consistency)
        if (msg.payload) {
          // Trigger chat callback if exists
          if ((window as any).__chatCallback) {
            (window as any).__chatCallback(msg);
          }
        }
        break;

      case 'PLAYER_UPDATE':
        // Handle player profile updates
        if (isLocalHost(current.players)) {
          const playerId = msg.senderId;
          const { name, avatar } = msg.payload || {};
          if (playerId && name && avatar) {
            const newPlayers = current.players.map(p =>
              p.id === playerId ? { ...p, name, avatar } : p
            );
            const newState = updateState({ players: newPlayers });
            broadcast(newState);
          }
        }
        break;

      case 'PING':
      case 'PONG':
        // Handled by multiplayer service
        break;

      default:
        console.warn('[App] Unknown message type:', msg.type);
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
            // Calculate time taken to answer correctly (in seconds, to 3 decimal places)
            const now = Date.now();
            const elapsed = (now - current.roundStartTime) / 1000;
            const answerTime = Math.round(elapsed * 1000) / 1000; // Round to 3 decimal places
            
            // data is the answer they typed (correct answer)
            newPlayers = newPlayers.map(p => 
                p.id === playerId ? { 
                    ...p, 
                    score: p.score + 10, 
                    hasAnsweredRound: true, 
                    answerTime,
                    finalAnswer: data || undefined // Store what they typed
                } : p
            );
            stateChanged = true;
            playSound.correct();
        }
    }
    else if (action === 'ANSWER_WRONG') {
        // data is the wrong guess string
        newPlayers = newPlayers.map(p => 
            p.id === playerId ? { 
                ...p, 
                lastWrongGuess: data,
                finalAnswer: data // Store what they typed
            } : p
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
          // Also clear lastWrongGuess, answerTime, and finalAnswer
          const resetPlayers = current.players.map(p => ({
              ...p, 
              hasAnsweredRound: false,
              lastWrongGuess: undefined,
              answerTime: undefined,
              finalAnswer: undefined
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
    setLocalPlayerName(name);
    setLocalPlayerAvatar(avatar);
    localStorage.setItem('popquiz-player-name', name);
    localStorage.setItem('popquiz-player-avatar', avatar);

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
    if (!name.trim()) {
      console.warn('[App] Cannot join: name is required');
      return;
    }

    setLocalPlayerName(name);
    setLocalPlayerAvatar(avatar);
    localStorage.setItem('popquiz-player-name', name);
    localStorage.setItem('popquiz-player-avatar', avatar);
    
    // Set pending join info BEFORE connecting
    pendingJoinRef.current = { name, avatar };
    
    // Update state to lobby and connect
    updateState({ 
        roomId: code, 
        status: 'lobby',
        players: [] 
    });
  };

  const handleUpdatePlayer = (name: string, avatar: string) => {
    setLocalPlayerName(name);
    setLocalPlayerAvatar(avatar);
    localStorage.setItem('popquiz-player-name', name);
    localStorage.setItem('popquiz-player-avatar', avatar);

    // Update in game state if player exists
    const current = gameStateRef.current;
    const playerIndex = current.players.findIndex(p => p.id === localPlayerId);
    if (playerIndex !== -1) {
      const newPlayers = [...current.players];
      newPlayers[playerIndex] = { ...newPlayers[playerIndex], name, avatar };
      const newState = updateState({ players: newPlayers });
      
      // Broadcast player update
      if (isLocalHost(current.players)) {
        broadcast(newState);
      } else {
        multiplayer.send({
          type: 'PLAYER_UPDATE',
          payload: { name, avatar },
          senderId: localPlayerId
        });
      }
    }
  };

  const handleUpdateSettings = (newSettings: GameSettings) => {
    if (!isLocalHost(gameState.players)) return;
    const newState = updateState({ settings: newSettings });
    broadcast(newState);
  };

  const handleToggleReady = () => {
    // Optimistically update local state immediately for instant UI feedback
    const current = gameStateRef.current;
    const localPlayer = current.players.find(p => p.id === localPlayerId);
    
    if (!localPlayer) return;
    
    // Update state immediately (optimistic update) for instant visual feedback
    const newPlayers = current.players.map(p => 
      p.id === localPlayerId ? { ...p, isReady: !p.isReady } : p
    );
    updateState({ players: newPlayers });
    
    // Then sync with network
    if (isLocalHost(gameState.players)) {
        // Host broadcasts updated state to all players
        const updatedState = gameStateRef.current;
        broadcast(updatedState);
    } else {
        // Guest sends action to host (host will process and broadcast back)
        multiplayer.send({
            type: 'PLAYER_ACTION',
            payload: { action: 'READY_TOGGLE' },
            senderId: localPlayerId
        });
    }
  };

  const handleStartGame = async () => {
    if (!isLocalHost(gameState.players)) return;
    
    let finalQuestions = gameState.questions;

    // Handle AI
    if (gameState.settings.deckType === 'ai' && gameState.settings.aiTopic) {
        
        // 1. BROADCAST 'generating' STATUS IMMEDIATELY
        const loadingState = updateState({ status: 'generating' as GameStatus });
        broadcast(loadingState);

        try {
            // Initial batch: Win Score / 10 + buffer
            const countNeeded = Math.ceil(gameState.settings.pointsToWin / 10) + 15;
            
            const generated = await generateQuestions(gameState.settings.aiTopic, countNeeded);
            if (generated.length > 0) finalQuestions = generated;
        } catch (e) {
            console.error("AI Gen failed, using default");
        }
    }

    // Start Game sound
    playSound.start();

    const newState = updateState({
        status: 'playing',
        questions: finalQuestions,
        currentQuestionIndex: 0,
        roundStartTime: Date.now(),
        players: gameState.players.map(p => ({
            ...p, 
            score: 0, 
            hasAnsweredRound: false,
            lastWrongGuess: undefined,
            answerTime: undefined,
            finalAnswer: undefined
        }))
    });
    broadcast(newState);
  };

  const handleAnswer = (correct: boolean, guess?: string) => {
    if (correct) {
        // Pass the guess (what they typed) even for correct answers
        if (isLocalHost(gameState.players)) {
            handlePlayerAction(localPlayerId, 'ANSWER_CORRECT', guess || '');
        } else {
            multiplayer.send({
                type: 'PLAYER_ACTION',
                payload: { action: 'ANSWER_CORRECT', data: guess || '' },
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
            lastWrongGuess: undefined,
            answerTime: undefined,
            finalAnswer: undefined
        }))
    });
    broadcast(newState);
  };
  
  const handleHome = () => {
    window.location.href = window.location.origin;
  };

  // Get local player object
  const localPlayer = gameState.players.find(p => p.id === localPlayerId) || null;

  const handleExitGame = () => {
    if (!isLocalHost(gameState.players)) return;
    // End the game and show game over screen with current scores
    const newState = updateState({ status: 'game_over' });
    broadcast(newState);
  };


  // --- Render ---

  return (
    <div className="min-h-screen w-full text-white flex flex-col font-fredoka">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-32 h-32 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-10 right-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Navbar - Show on all pages except landing */}
      {gameState.status !== 'landing' && (
        <Navbar
          onHome={handleHome}
          localPlayer={localPlayer || {
            id: localPlayerId,
            name: localPlayerName,
            avatar: localPlayerAvatar,
            score: 0,
            streak: 0,
            isHost: false,
            isReady: false,
            hasAnsweredRound: false
          }}
          onUpdatePlayer={handleUpdatePlayer}
          roomId={gameState.roomId || undefined}
        />
      )}

      <div className="relative z-10 flex-1 flex flex-col p-4 md:p-6 pt-20 md:pt-24">
        
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
            isHost={isLocalHost(gameState.players)}
            onExit={handleExitGame}
          />
        )}

        {gameState.status === 'generating' && (
           <div className="flex-1 flex items-center justify-center flex-col animate-pulse">
               <div className="text-5xl mb-4">🤖</div>
               <h2 className="text-2xl font-bold">AI is Thinking...</h2>
               <p>Generating questions about "{gameState.settings.aiTopic}"</p>
               <p className="text-sm opacity-50 mt-2">Creating images and trivia...</p>
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