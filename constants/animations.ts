export const AnimationConfig = {
  orb: {
    idlePulseDuration: 3000,
    listeningPulseDuration: 800,
    thinkingRotationDuration: 1200,
    executingBurstDuration: 400,
    scaleIdle: 1.0,
    scaleListening: 1.12,
    scaleThinking: 1.06,
  },
  spring: {
    gentle: { damping: 20, stiffness: 150 },
    bouncy: { damping: 14, stiffness: 200 },
    stiff: { damping: 30, stiffness: 400 },
  },
  timing: {
    fast: 150,
    normal: 300,
    slow: 600,
  },
};
