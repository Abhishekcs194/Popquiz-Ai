import React, { useEffect, useRef } from 'react';
import { Button } from './Button';
import { Player } from '../types';
import { Scoreboard } from './Scoreboard';

interface GameOverProps {
  players: Player[];
  onRestart: () => void; // Available if Host
  onHome: () => void;
  isHost: boolean;
}

export const GameOver: React.FC<GameOverProps> = ({ players, onRestart, onHome, isHost }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Simple confetti implementation
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const particles: any[] = [];
        const colors = ['#f43f5e', '#ec4899', '#d946ef', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#eab308', '#f97316'];

        for(let i=0; i<150; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height - canvas.height,
                w: Math.random() * 10 + 5,
                h: Math.random() * 10 + 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                vy: Math.random() * 3 + 2,
                vx: Math.random() * 2 - 1,
                rotation: Math.random() * 360
            });
        }

        let animationId: number;
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.y += p.vy;
                p.x += p.vx;
                p.rotation += 2;
                
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
                ctx.restore();

                if(p.y > canvas.height) p.y = -20;
            });
            animationId = requestAnimationFrame(animate);
        };
        animate();

        return () => cancelAnimationFrame(animationId);
    }, []);

    const winner = [...players].sort((a,b) => b.score - a.score)[0];

  return (
    <div className="relative w-full max-w-4xl mx-auto flex flex-col items-center justify-center p-4">
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />
      
      <div className="relative z-10 w-full bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 md:p-12 animate-pop text-center">
        
        <div className="mb-8">
            <div className="text-8xl mb-4 animate-bounce">🏆</div>
            <h2 className="text-4xl md:text-6xl font-black text-white mb-2 uppercase tracking-widest drop-shadow-xl">
                WINNER!
            </h2>
            <div className="text-2xl md:text-4xl font-bold text-yellow-300 mb-2">{winner?.name}</div>
            <div className="text-white/60 font-bold uppercase tracking-widest">Score: {winner?.score}</div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-8 text-left">
            <div>
                 <h3 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-4 text-center">Final Standings</h3>
                 <Scoreboard players={players} compact />
            </div>
            
            <div className="flex flex-col justify-center space-y-4">
                {isHost && (
                    <Button onClick={onRestart} fullWidth variant="success" size="lg" className="animate-pulse shadow-xl">
                        Return to Lobby
                    </Button>
                )}
                <Button onClick={onHome} fullWidth variant="secondary">
                    Back to Home
                </Button>
                {!isHost && (
                    <div className="text-center text-sm text-white/40 mt-4">
                        Waiting for host to restart...
                    </div>
                )}
            </div>
        </div>

      </div>
    </div>
  );
};