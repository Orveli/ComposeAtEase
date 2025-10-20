export const SCALE_INTERVALS = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
};

export const DRUM_LANES = [
  {
    id: 'hat',
    label: 'Hi-Hat',
    engine: 'metal',
    defaultNote: 'C6',
    samples: [
      {
        id: 'tightHat',
        label: 'Tight Hat',
        settings: {
          frequency: 620,
          harmonicity: 6.2,
          modulationIndex: 24,
          resonance: 8000,
          envelope: { attack: 0.001, decay: 0.08, release: 0.02 },
        },
      },
      {
        id: 'openHat',
        label: 'Open Hat',
        settings: {
          frequency: 520,
          harmonicity: 5.8,
          modulationIndex: 18,
          resonance: 6000,
          envelope: { attack: 0.001, decay: 0.32, release: 0.2 },
        },
      },
      {
        id: 'shaker',
        label: 'Shaker',
        settings: {
          frequency: 800,
          harmonicity: 5.4,
          modulationIndex: 30,
          resonance: 9000,
          envelope: { attack: 0.001, decay: 0.12, release: 0.05 },
        },
      },
    ],
  },
  {
    id: 'snare',
    label: 'Snare',
    engine: 'noise',
    samples: [
      {
        id: 'tightSnare',
        label: 'Tight Snare',
        settings: {
          noise: { type: 'white' },
          envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.18 },
        },
      },
      {
        id: 'brightSnare',
        label: 'Bright Snare',
        settings: {
          noise: { type: 'pink' },
          envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.22 },
          filterEnvelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.12, baseFrequency: 1800 },
        },
      },
      {
        id: 'deepSnare',
        label: 'Deep Snare',
        settings: {
          noise: { type: 'brown' },
          envelope: { attack: 0.001, decay: 0.34, sustain: 0, release: 0.28 },
          filterEnvelope: { attack: 0.001, decay: 0.24, sustain: 0, release: 0.18, baseFrequency: 900 },
        },
      },
    ],
  },
  {
    id: 'clap',
    label: 'Clap',
    engine: 'noise',
    samples: [
      {
        id: 'studioClap',
        label: 'Studio Clap',
        settings: {
          noise: { type: 'white' },
          envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.14 },
          filterEnvelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08, baseFrequency: 2200 },
        },
      },
      {
        id: 'wideClap',
        label: 'Wide Clap',
        settings: {
          noise: { type: 'pink' },
          envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.26 },
          filterEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15, baseFrequency: 1800 },
        },
      },
      {
        id: 'shortClap',
        label: 'Short Clap',
        settings: {
          noise: { type: 'white' },
          envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
          filterEnvelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.06, baseFrequency: 2600 },
        },
      },
    ],
  },
  {
    id: 'perc',
    label: 'Perc',
    engine: 'metal',
    defaultNote: 'C5',
    samples: [
      {
        id: 'chimePerc',
        label: 'Chime Perc',
        settings: {
          frequency: 760,
          harmonicity: 3.6,
          modulationIndex: 20,
          resonance: 5000,
          envelope: { attack: 0.001, decay: 0.25, release: 0.22 },
        },
      },
      {
        id: 'clickPerc',
        label: 'Click Perc',
        settings: {
          frequency: 920,
          harmonicity: 4.4,
          modulationIndex: 16,
          resonance: 7000,
          envelope: { attack: 0.001, decay: 0.12, release: 0.08 },
        },
      },
      {
        id: 'sparkPerc',
        label: 'Spark Perc',
        settings: {
          frequency: 680,
          harmonicity: 5.2,
          modulationIndex: 28,
          resonance: 6400,
          envelope: { attack: 0.001, decay: 0.18, release: 0.14 },
        },
      },
    ],
  },
  {
    id: 'tom',
    label: 'Tom',
    engine: 'membrane',
    defaultNote: 'G2',
    samples: [
      {
        id: 'lowTom',
        label: 'Low Tom',
        settings: {
          pitchDecay: 0.07,
          octaves: 5,
          envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.3 },
        },
        note: 'F2',
      },
      {
        id: 'midTom',
        label: 'Mid Tom',
        settings: {
          pitchDecay: 0.05,
          octaves: 4,
          envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.24 },
        },
        note: 'A2',
      },
      {
        id: 'highTom',
        label: 'High Tom',
        settings: {
          pitchDecay: 0.04,
          octaves: 3,
          envelope: { attack: 0.001, decay: 0.26, sustain: 0, release: 0.2 },
        },
        note: 'C3',
      },
    ],
  },
  {
    id: 'kick',
    label: 'Kick',
    engine: 'membrane',
    defaultNote: 'C1',
    samples: [
      {
        id: 'deepKick',
        label: 'Deep Kick',
        settings: {
          pitchDecay: 0.12,
          octaves: 8,
          envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.3 },
        },
        note: 'A0',
      },
      {
        id: 'punchKick',
        label: 'Punch Kick',
        settings: {
          pitchDecay: 0.09,
          octaves: 6,
          envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.22 },
        },
        note: 'C1',
      },
      {
        id: 'snappyKick',
        label: 'Snappy Kick',
        settings: {
          pitchDecay: 0.06,
          octaves: 5,
          envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.18 },
        },
        note: 'D1',
      },
    ],
  },
];

export const DEFAULT_SYNTH_CONFIG = {
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 },
  filter: { type: 'lowpass', frequency: 1800, q: 0.8 },
  effects: {
    chorus: { enabled: false, rate: 1.6, depth: 0.45, mix: 0.35 },
    delay: { enabled: false, time: 0.24, feedback: 0.32, mix: 0.28 },
    reverb: { enabled: false, decay: 2.2, preDelay: 0.03, mix: 0.35 },
  },
};

export const SYNTH_PRESETS = {
  'Bright Keys': {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 },
    filter: { type: 'highpass', frequency: 420, q: 0.9 },
    effects: {
      chorus: { enabled: false, rate: 1.8, depth: 0.4, mix: 0.25 },
      delay: { enabled: true, time: 0.22, feedback: 0.28, mix: 0.32 },
      reverb: { enabled: false, decay: 1.8, preDelay: 0.02, mix: 0.22 },
    },
  },
  'Warm Pad': {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.4, decay: 0.3, sustain: 0.85, release: 2.4 },
    filter: { type: 'lowpass', frequency: 1500, q: 0.7 },
    effects: {
      chorus: { enabled: true, rate: 0.7, depth: 0.55, mix: 0.45 },
      delay: { enabled: false, time: 0.3, feedback: 0.2, mix: 0.15 },
      reverb: { enabled: true, decay: 4.5, preDelay: 0.05, mix: 0.48 },
    },
  },
  'Soft Lead': {
    oscillator: { type: 'square' },
    envelope: { attack: 0.02, decay: 0.15, sustain: 0.5, release: 0.5 },
    filter: { type: 'lowpass', frequency: 2600, q: 1.1 },
    effects: {
      chorus: { enabled: false, rate: 1.2, depth: 0.3, mix: 0.2 },
      delay: { enabled: true, time: 0.32, feedback: 0.42, mix: 0.4 },
      reverb: { enabled: true, decay: 2.8, preDelay: 0.04, mix: 0.3 },
    },
  },
  'Airy Pluck': {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.25, release: 0.4 },
    filter: { type: 'bandpass', frequency: 1800, q: 2.4 },
    effects: {
      chorus: { enabled: true, rate: 2.2, depth: 0.65, mix: 0.38 },
      delay: { enabled: true, time: 0.28, feedback: 0.36, mix: 0.35 },
      reverb: { enabled: true, decay: 3.5, preDelay: 0.06, mix: 0.5 },
    },
  },
};

export const DEFAULT_SYNTH_PRESET = 'Bright Keys';

export const OSCILLATOR_TYPES = ['sine', 'triangle', 'sawtooth', 'square'];

export const FILTER_TYPES = [
  { value: 'lowpass', label: 'Low-pass' },
  { value: 'highpass', label: 'High-pass' },
  { value: 'bandpass', label: 'Band-pass' },
];

export const ENVELOPE_CONTROL_LIMITS = {
  attack: { min: 0, max: 2, step: 0.005 },
  decay: { min: 0, max: 2, step: 0.01 },
  sustain: { min: 0, max: 1, step: 0.01 },
  release: { min: 0, max: 4, step: 0.01 },
};

export const FILTER_CONTROL_LIMITS = {
  frequency: { min: 80, max: 12000, step: 1 },
  q: { min: 0.1, max: 18, step: 0.1 },
};

export const EFFECT_CONTROL_LIMITS = {
  chorus: {
    rate: { min: 0.1, max: 8, step: 0.1 },
    depth: { min: 0, max: 1, step: 0.01 },
    mix: { min: 0, max: 1, step: 0.01 },
  },
  delay: {
    time: { min: 0, max: 0.8, step: 0.01 },
    feedback: { min: 0, max: 0.95, step: 0.01 },
    mix: { min: 0, max: 1, step: 0.01 },
  },
  reverb: {
    decay: { min: 0.2, max: 8, step: 0.1 },
    preDelay: { min: 0, max: 0.2, step: 0.005 },
    mix: { min: 0, max: 1, step: 0.01 },
  },
};

export const EFFECT_LABELS = {
  chorus: 'Chorus',
  delay: 'Delay',
  reverb: 'Reverb',
};

export const IMU_SERIES = [
  {
    key: 'heading',
    label: 'Heading',
    border: 'rgba(251, 191, 36, 0.85)',
    background: 'rgba(251, 191, 36, 0.15)',
    axisId: 'orientation',
  },
  {
    key: 'tilt',
    label: 'Tilt',
    border: 'rgba(147, 197, 253, 0.85)',
    background: 'rgba(147, 197, 253, 0.15)',
    axisId: 'orientation',
  },
  {
    key: 'roll',
    label: 'Roll',
    border: 'rgba(236, 72, 153, 0.85)',
    background: 'rgba(236, 72, 153, 0.15)',
    axisId: 'orientation',
  },
  {
    key: 'accX',
    label: 'Acc X',
    border: 'rgba(248, 113, 113, 0.85)',
    background: 'rgba(248, 113, 113, 0.15)',
    axisId: 'acceleration',
  },
  {
    key: 'accY',
    label: 'Acc Y',
    border: 'rgba(45, 212, 191, 0.85)',
    background: 'rgba(45, 212, 191, 0.15)',
    axisId: 'acceleration',
  },
  {
    key: 'accZ',
    label: 'Acc Z',
    border: 'rgba(59, 130, 246, 0.85)',
    background: 'rgba(59, 130, 246, 0.15)',
    axisId: 'acceleration',
  },
  {
    key: 'rotAlpha',
    label: 'Rot α',
    border: 'rgba(94, 234, 212, 0.85)',
    background: 'rgba(94, 234, 212, 0.15)',
    axisId: 'rotation',
  },
  {
    key: 'rotBeta',
    label: 'Rot β',
    border: 'rgba(129, 140, 248, 0.85)',
    background: 'rgba(129, 140, 248, 0.15)',
    axisId: 'rotation',
  },
  {
    key: 'rotGamma',
    label: 'Rot γ',
    border: 'rgba(251, 146, 60, 0.85)',
    background: 'rgba(251, 146, 60, 0.15)',
    axisId: 'rotation',
  },
];

export const IMU_AXES = [
  {
    id: 'orientation',
    label: 'Orientation (°)',
    min: -200,
    max: 360,
    zero: 0,
    labelColor: 'rgba(251, 191, 36, 0.85)',
    background: 'rgba(30, 41, 59, 0.35)',
    gridColor: 'rgba(148, 163, 184, 0.18)',
    zeroLine: 'rgba(251, 191, 36, 0.45)',
  },
  {
    id: 'acceleration',
    label: 'Linear acceleration (m/s²)',
    min: -20,
    max: 20,
    zero: 0,
    labelColor: 'rgba(45, 212, 191, 0.85)',
    background: 'rgba(15, 118, 110, 0.18)',
    gridColor: 'rgba(45, 212, 191, 0.14)',
    zeroLine: 'rgba(45, 212, 191, 0.4)',
  },
  {
    id: 'rotation',
    label: 'Rotation rate (°/s)',
    min: -720,
    max: 720,
    zero: 0,
    labelColor: 'rgba(129, 140, 248, 0.85)',
    background: 'rgba(67, 56, 202, 0.18)',
    gridColor: 'rgba(129, 140, 248, 0.14)',
    zeroLine: 'rgba(129, 140, 248, 0.4)',
  },
];
