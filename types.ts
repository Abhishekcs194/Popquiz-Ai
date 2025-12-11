export interface Question {
  id: string;
  type: 'image' | 'text' | 'emoji';
  content: string; // URL for image, or text string
  answer: string;
  category?: string;
}

export type GameStatus = 'lobby' | 'generating' | 'playing' | 'round_result' | 'game_over';

export interface Player {
  id: string;
  name: string;
  avatar: string;
  score: number;
  streak: number;
  isBot?: boolean;
}

export interface GameConfig {
  roundDuration: number; // Seconds
  totalRounds: number;
  topic: string;
}
