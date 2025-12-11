import React from 'react';
import { Button } from './Button';

interface GameOverProps {
  score: number;
  totalQuestions: number;
  player: string;
  onRestart: () => void;
  onHome: () => void;
}

export const GameOver: React.FC<GameOverProps> = ({ score, totalQuestions, player, onRestart, onHome }) => {
    // Calculate rating
    const percentage = (score / (totalQuestions * 100)) * 100; // Assuming ~100 max points per question
    
    let message = "Good Effort!";
    let emoji = "🙂";
    
    // Rough estimation based on potential max score (1000 per q is usually impossible, let's say 100 per q is max base, + speed bonus)
    // Let's simplify: Display raw score.
    
    if (score > totalQuestions * 80) {
        message = "LEGENDARY!";
        emoji = "🏆";
    } else if (score > totalQuestions * 50) {
        message = "Great Job!";
        emoji = "🔥";
    }

  return (
    <div className="max-w-md w-full mx-auto p-8 bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl border border-white/20 animate-pop text-center">
      <div className="text-6xl mb-4">{emoji}</div>
      <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-widest">{message}</h2>
      <p className="text-white/60 mb-8">{player}</p>

      <div className="bg-black/30 rounded-2xl p-6 mb-8 border border-white/5">
        <div className="text-sm uppercase tracking-widest text-white/50 mb-1">Final Score</div>
        <div className="text-6xl font-black text-yellow-400 drop-shadow-md">{score}</div>
      </div>

      <div className="space-y-3">
        <Button onClick={onRestart} fullWidth variant="success" size="lg">
            Play Again (Same Deck)
        </Button>
        <Button onClick={onHome} fullWidth variant="secondary">
            Back to Home
        </Button>
      </div>
    </div>
  );
};
