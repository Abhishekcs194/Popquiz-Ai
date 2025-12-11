// Simple synth sounds using Web Audio API so we don't need external assets

const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

const playTone = (freq: number, type: OscillatorType, duration: number, delay = 0) => {
  if (ctx.state === 'suspended') ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
  
  gain.gain.setValueAtTime(0.1, ctx.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration);
};

export const playSound = {
  correct: () => {
    playTone(600, 'sine', 0.1);
    playTone(1200, 'sine', 0.2, 0.1); // Ding!
  },
  wrong: () => {
    playTone(150, 'sawtooth', 0.3);
    playTone(100, 'sawtooth', 0.3, 0.1); // Buzz
  },
  start: () => {
    playTone(400, 'triangle', 0.1);
    playTone(500, 'triangle', 0.1, 0.1);
    playTone(600, 'triangle', 0.4, 0.2);
  },
  pop: () => {
    playTone(800, 'sine', 0.05);
  }
};