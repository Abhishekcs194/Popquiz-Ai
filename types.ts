export interface Question {
  id: string;
  type: 'image' | 'text';
  content: string; // URL for image, or text string
  questionText?: string; // Specific question to display above images (e.g. "What logo is this?")
  answer: string;
  acceptedAnswers?: string[]; // Array of valid aliases/abbreviations
  category?: string;
  imageType?: 'pokemon' | 'anime' | 'flag' | 'logo' | 'art' | 'general'; // Routing hint
}

export type GameStatus = 'landing' | 'lobby' | 'generating' | 'playing' | 'round_result' | 'game_over';

export interface Player {
  id: string;
  name: string;
  avatar: string;
  score: number;
  streak: number;
  isHost: boolean;
  isReady: boolean;
  hasAnsweredRound: boolean; // Did they answer the current question correctly?
  lastWrongGuess?: string; // The text of their last wrong answer
  isBot?: boolean;
}

export interface GameSettings {
  roundDuration: number; // Seconds (e.g. 10, 15, 20)
  pointsToWin: number; // e.g. 50, 100
  deckType: 'classic' | 'ai';
  aiTopic: string;
}

export interface GameState {
  roomId: string;
  status: GameStatus;
  players: Player[];
  currentQuestionIndex: number;
  questions: Question[];
  settings: GameSettings;
  roundStartTime: number;
}