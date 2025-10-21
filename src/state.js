export const state = {
  bpm: 100,
  bars: 1,
  grid: 8,
  root: 'C',
  scale: 'Major',
  playing: false,
  playheadRaf: null,
  tracks: [],
  activeTrackId: null,
  customPresets: [],
};

const masterLimiter = new Tone.Limiter(-1).toDestination();
export const masterVolume = new Tone.Volume(-8);
masterVolume.connect(masterLimiter);
export const trackInstruments = new Map();
export const trackParts = new Map();
export const pointerInteractions = new Map();

export const imuState = {
  active: false,
  samples: 0,
  stats: { accelerationPeak: 0, rotationPeak: 0 },
  intervalSum: 0,
  intervalCount: 0,
  orientationBaseline: { alpha: null, beta: null, gamma: null },
  data: {
    acc: { x: 0, y: 0, z: 0, magnitude: 0 },
    accG: { x: 0, y: 0, z: 0, magnitude: 0 },
    rotation: { alpha: 0, beta: 0, gamma: 0, magnitude: 0 },
    orientation: {
      alpha: null,
      beta: null,
      gamma: null,
      absolute: false,
      headingSource: null,
    },
    orientationRaw: {
      alpha: null,
      beta: null,
      gamma: null,
      absolute: false,
      headingSource: null,
    },
    interval: null,
    lastTimestamp: null,
  },
};
