export const NODE_LIBRARY = {
  osc: {
    id: 'osc',
    label: 'Oscillator',
    category: 'source',
    width: 160,
    height: 90,
    params: {
      freq: { label: 'Frequency', type: 'frequency', min: 20, max: 20000, default: 220, slewMs: 30 },
      detune: { label: 'Detune', type: 'linear', min: -1200, max: 1200, default: 0, slewMs: 40 },
      gain: { label: 'Gain', type: 'linear', min: 0, max: 1, default: 0.2, slewMs: 20 },
      type: {
        label: 'Waveform',
        type: 'select',
        options: ['sine', 'square', 'sawtooth', 'triangle'],
        default: 'sawtooth',
      },
    },
  },
  filter: {
    id: 'filter',
    label: 'SVF Filter',
    category: 'processor',
    width: 160,
    height: 100,
    params: {
      cutoff: { label: 'Cutoff', type: 'frequency', min: 40, max: 18000, default: 1200, slewMs: 25 },
      resonance: { label: 'Resonance', type: 'linear', min: 0.1, max: 20, default: 1, slewMs: 20 },
      type: {
        label: 'Mode',
        type: 'select',
        options: ['lowpass', 'bandpass', 'highpass'],
        default: 'lowpass',
      },
    },
  },
  gain: {
    id: 'gain',
    label: 'Gain',
    category: 'processor',
    width: 140,
    height: 80,
    params: {
      gain: { label: 'Level', type: 'linear', min: 0, max: 1, default: 0.5, slewMs: 30 },
    },
  },
  mixer: {
    id: 'mixer',
    label: 'Mixer',
    category: 'processor',
    width: 180,
    height: 110,
    params: {
      channels: { label: 'Channels', type: 'integer', min: 2, max: 6, default: 4 },
      gain: { label: 'Gain', type: 'linear', min: 0, max: 1, default: 0.8 },
    },
  },
  output: {
    id: 'out',
    label: 'Output',
    category: 'output',
    width: 140,
    height: 80,
    params: {
      gain: { label: 'Gain', type: 'linear', min: 0, max: 1, default: 1 },
    },
  },
  lfo: {
    id: 'lfo',
    label: 'LFO',
    category: 'modulator',
    width: 150,
    height: 110,
    params: {
      freq: { label: 'Rate', type: 'frequency', min: 0.1, max: 20, default: 1.2 },
      min: { label: 'Min', type: 'linear', min: -1, max: 1, default: -1 },
      max: { label: 'Max', type: 'linear', min: -1, max: 1, default: 1 },
      type: {
        label: 'Shape',
        type: 'select',
        options: ['sine', 'triangle', 'square', 'sawtooth'],
        default: 'sine',
      },
    },
  },
  env: {
    id: 'env',
    label: 'Envelope',
    category: 'modulator',
    width: 150,
    height: 110,
    params: {
      attack: { label: 'Attack', type: 'time', min: 0.001, max: 2, default: 0.02 },
      decay: { label: 'Decay', type: 'time', min: 0.001, max: 2, default: 0.3 },
      sustain: { label: 'Sustain', type: 'linear', min: 0, max: 1, default: 0.6 },
      release: { label: 'Release', type: 'time', min: 0.01, max: 4, default: 1.2 },
      loop: { label: 'Loop', type: 'boolean', default: false },
    },
  },
  noise: {
    id: 'noise',
    label: 'Noise',
    category: 'source',
    width: 140,
    height: 90,
    params: {
      type: {
        label: 'Color',
        type: 'select',
        options: ['white', 'pink', 'brown'],
        default: 'white',
      },
      gain: { label: 'Gain', type: 'linear', min: 0, max: 1, default: 0.4 },
    },
  },
  delay: {
    id: 'delay',
    label: 'Delay',
    category: 'processor',
    width: 170,
    height: 110,
    params: {
      time: { label: 'Time', type: 'time', min: 0.01, max: 2, default: 0.25 },
      feedback: { label: 'Feedback', type: 'linear', min: 0, max: 0.95, default: 0.3 },
      wet: { label: 'Mix', type: 'linear', min: 0, max: 1, default: 0.35 },
    },
  },
  convolver: {
    id: 'convolver',
    label: 'Convolver Reverb',
    category: 'processor',
    width: 190,
    height: 120,
    params: {
      decay: { label: 'Decay', type: 'time', min: 0.2, max: 6, default: 1.5 },
      reverse: { label: 'Reverse', type: 'boolean', default: false },
      wet: { label: 'Mix', type: 'linear', min: 0, max: 1, default: 0.4 },
    },
  },
};

export const DEFAULT_SOURCES = [
  { id: 'imu.pitch', kind: 'imu', metric: 'pitch', label: 'IMU Pitch', pipe: defaultImuPipe() },
  { id: 'imu.roll', kind: 'imu', metric: 'roll', label: 'IMU Roll', pipe: defaultImuPipe() },
  { id: 'imu.yaw', kind: 'imu', metric: 'yaw', label: 'IMU Yaw', pipe: defaultImuPipe() },
  { id: 'imu.acc', kind: 'imu', metric: 'accMagnitude', label: 'Accel |g|', pipe: defaultImuPipe({ scale: 0.05, dead: 0.05 }) },
  { id: 'imu.energy', kind: 'imu', metric: 'motionEnergy', label: 'Motion Energy', pipe: defaultImuPipe({ smoothMs: 120 }) },
];

export function defaultImuPipe(overrides = {}) {
  return {
    offset: 0,
    scale: overrides.scale ?? 1,
    min: overrides.min ?? -1,
    max: overrides.max ?? 1,
    dead: overrides.dead ?? 0.02,
    invert: overrides.invert ?? false,
    curve: overrides.curve ?? 'lin',
    smoothMs: overrides.smoothMs ?? 30,
    hyst: overrides.hyst ?? 0.01,
    bipolar: overrides.bipolar ?? false,
  };
}

export const ROUTE_DEFAULTS = {
  amount: 1,
  range: [0, 1],
  curve: 'lin',
  op: 'add',
  bipolar: false,
  slewMs: 30,
};
