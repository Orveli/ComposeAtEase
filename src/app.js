const SCALE_INTERVALS = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
};

const DRUM_LANES = [
  { id: 'kick', label: 'Kick' },
  { id: 'snare', label: 'Snare' },
  { id: 'hat', label: 'Hi-Hat' },
];

const DEFAULT_SYNTH_CONFIG = {
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 },
  filter: { type: 'lowpass', frequency: 1800, q: 0.8 },
  effects: {
    chorus: { enabled: false, rate: 1.6, depth: 0.45, mix: 0.35 },
    delay: { enabled: false, time: 0.24, feedback: 0.32, mix: 0.28 },
    reverb: { enabled: false, decay: 2.2, preDelay: 0.03, mix: 0.35 },
  },
};

const SYNTH_PRESETS = {
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

const DEFAULT_SYNTH_PRESET = 'Bright Keys';

const OSCILLATOR_TYPES = ['sine', 'triangle', 'sawtooth', 'square'];

const FILTER_TYPES = [
  { value: 'lowpass', label: 'Low-pass' },
  { value: 'highpass', label: 'High-pass' },
  { value: 'bandpass', label: 'Band-pass' },
];

const ENVELOPE_CONTROL_LIMITS = {
  attack: { min: 0, max: 2, step: 0.005 },
  decay: { min: 0, max: 2, step: 0.01 },
  sustain: { min: 0, max: 1, step: 0.01 },
  release: { min: 0, max: 4, step: 0.01 },
};

const FILTER_CONTROL_LIMITS = {
  frequency: { min: 80, max: 12000, step: 1 },
  q: { min: 0.1, max: 18, step: 0.1 },
};

const EFFECT_CONTROL_LIMITS = {
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

const EFFECT_LABELS = {
  chorus: 'Chorus',
  delay: 'Delay',
  reverb: 'Reverb',
};

const state = {
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

const masterVolume = new Tone.Volume(-8).toDestination();
const trackInstruments = new Map();
const trackParts = new Map();
const pointerInteractions = new Map();
const imuState = {
  active: false,
  samples: 0,
  stats: { accelerationPeak: 0, rotationPeak: 0 },
  intervalSum: 0,
  intervalCount: 0,
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
    interval: null,
    lastTimestamp: null,
  },
};

const melodyGridEl = document.getElementById('melodyGrid');
const melodyLanesEl = document.getElementById('melodyLanes');
const melodyTicksEl = document.getElementById('melodyTicks');
const melodyPlayheadEl = document.getElementById('melodyPlayhead');

const drumGridEl = document.getElementById('drumGrid');
const drumLanesEl = document.getElementById('drumLanes');
const drumTicksEl = document.getElementById('drumTicks');
const drumPlayheadEl = document.getElementById('drumPlayhead');

const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const gridSelect = document.getElementById('gridSelect');
const bpmInput = document.getElementById('bpm');
const bpmValue = document.getElementById('bpmValue');
const scaleSelect = document.getElementById('scaleSelect');
const rootSelect = document.getElementById('rootSelect');
const masterVolumeInput = document.getElementById('masterVolume');
const octaveLabel = document.getElementById('octaveLabel');
const octaveUpBtn = document.getElementById('octaveUp');
const octaveDownBtn = document.getElementById('octaveDown');
const presetSelect = document.getElementById('presetSelect');
const chordModeBtn = document.getElementById('chordModeBtn');
const trackTabsEl = document.getElementById('trackTabs');
const addSynthTrackBtn = document.getElementById('addSynthTrack');
const addDrumTrackBtn = document.getElementById('addDrumTrack');
const synthPanelEl = document.getElementById('synthPanel');
const drumPanelEl = document.getElementById('drumPanel');
const synthTitleEl = document.getElementById('synthTitle');
const drumTitleEl = document.getElementById('drumTitle');
const synthStatusEl = document.getElementById('synthStatus');
const oscillatorSelect = document.getElementById('oscillatorType');
const filterTypeSelect = document.getElementById('filterType');
const filterInputs = {
  frequency: document.getElementById('filterFrequency'),
  q: document.getElementById('filterQ'),
};
const filterValueEls = {
  frequency: document.getElementById('filterFrequencyValue'),
  q: document.getElementById('filterQValue'),
};
const envelopeInputs = {
  attack: document.getElementById('envelopeAttack'),
  decay: document.getElementById('envelopeDecay'),
  sustain: document.getElementById('envelopeSustain'),
  release: document.getElementById('envelopeRelease'),
};
const envelopeValueEls = {
  attack: document.getElementById('envelopeAttackValue'),
  decay: document.getElementById('envelopeDecayValue'),
  sustain: document.getElementById('envelopeSustainValue'),
  release: document.getElementById('envelopeReleaseValue'),
};
const customPresetNameInput = document.getElementById('customPresetName');
const saveCustomPresetBtn = document.getElementById('saveCustomPreset');
const effectControlElements = {
  chorus: {
    container: document.getElementById('chorusControls'),
    enabled: document.getElementById('chorusEnabled'),
    rateInput: document.getElementById('chorusRate'),
    rateValue: document.getElementById('chorusRateValue'),
    depthInput: document.getElementById('chorusDepth'),
    depthValue: document.getElementById('chorusDepthValue'),
    mixInput: document.getElementById('chorusMix'),
    mixValue: document.getElementById('chorusMixValue'),
  },
  delay: {
    container: document.getElementById('delayControls'),
    enabled: document.getElementById('delayEnabled'),
    timeInput: document.getElementById('delayTime'),
    timeValue: document.getElementById('delayTimeValue'),
    feedbackInput: document.getElementById('delayFeedback'),
    feedbackValue: document.getElementById('delayFeedbackValue'),
    mixInput: document.getElementById('delayMix'),
    mixValue: document.getElementById('delayMixValue'),
  },
  reverb: {
    container: document.getElementById('reverbControls'),
    enabled: document.getElementById('reverbEnabled'),
    decayInput: document.getElementById('reverbDecay'),
    decayValue: document.getElementById('reverbDecayValue'),
    preDelayInput: document.getElementById('reverbPreDelay'),
    preDelayValue: document.getElementById('reverbPreDelayValue'),
    mixInput: document.getElementById('reverbMix'),
    mixValue: document.getElementById('reverbMixValue'),
  },
};
const imuToggleBtn = document.getElementById('imuToggle');
const imuStatusEl = document.getElementById('imuStatus');
const imuValueEls = Array.from(document.querySelectorAll('[data-imu]')).reduce(
  (map, el) => {
    map[el.dataset.imu] = el;
    return map;
  },
  {},
);
const imuCubeEl = document.getElementById('imuCube');
const imuAccChartEl = document.getElementById('imuAccChart');
const imuRotChartEl = document.getElementById('imuRotChart');

const IMU_ACCEL_SERIES = [
  {
    key: 'x',
    label: 'X',
    border: 'rgba(248, 113, 113, 0.85)',
    background: 'rgba(248, 113, 113, 0.15)',
  },
  {
    key: 'y',
    label: 'Y',
    border: 'rgba(45, 212, 191, 0.85)',
    background: 'rgba(45, 212, 191, 0.15)',
  },
  {
    key: 'z',
    label: 'Z',
    border: 'rgba(59, 130, 246, 0.85)',
    background: 'rgba(59, 130, 246, 0.15)',
  },
];

const IMU_ROT_SERIES = [
  {
    key: 'alpha',
    label: 'α',
    border: 'rgba(251, 191, 36, 0.85)',
    background: 'rgba(251, 191, 36, 0.15)',
  },
  {
    key: 'beta',
    label: 'β',
    border: 'rgba(147, 197, 253, 0.85)',
    background: 'rgba(147, 197, 253, 0.15)',
  },
  {
    key: 'gamma',
    label: 'γ',
    border: 'rgba(236, 72, 153, 0.85)',
    background: 'rgba(236, 72, 153, 0.15)',
  },
];

const imuCharts = {
  acceleration: null,
  rotation: null,
  historyLimit: 120,
};

function getTotalSlots() {
  return state.bars * state.grid;
}

function getGridDurationSeconds() {
  const beatDur = Tone.Time('4n').toSeconds();
  return beatDur * (4 / state.grid);
}

function getLoopDurationSeconds() {
  return Tone.Time(`${state.bars}m`).toSeconds();
}

function getTrackById(id) {
  return state.tracks.find((track) => track.id === id) || null;
}

function getActiveTrack() {
  return getTrackById(state.activeTrackId);
}

function getSynthTracks() {
  return state.tracks.filter((track) => track.type === 'synth');
}

function cloneSynthConfig(config) {
  const source = config || DEFAULT_SYNTH_CONFIG;
  return {
    oscillator: {
      type: source?.oscillator?.type || DEFAULT_SYNTH_CONFIG.oscillator.type,
    },
    envelope: {
      attack: source?.envelope?.attack ?? DEFAULT_SYNTH_CONFIG.envelope.attack,
      decay: source?.envelope?.decay ?? DEFAULT_SYNTH_CONFIG.envelope.decay,
      sustain: source?.envelope?.sustain ?? DEFAULT_SYNTH_CONFIG.envelope.sustain,
      release: source?.envelope?.release ?? DEFAULT_SYNTH_CONFIG.envelope.release,
    },
    filter: {
      type: source?.filter?.type || DEFAULT_SYNTH_CONFIG.filter.type,
      frequency: source?.filter?.frequency ?? DEFAULT_SYNTH_CONFIG.filter.frequency,
      q: source?.filter?.q ?? DEFAULT_SYNTH_CONFIG.filter.q,
    },
    effects: {
      chorus: {
        enabled: source?.effects?.chorus?.enabled ?? DEFAULT_SYNTH_CONFIG.effects.chorus.enabled,
        rate: source?.effects?.chorus?.rate ?? DEFAULT_SYNTH_CONFIG.effects.chorus.rate,
        depth: source?.effects?.chorus?.depth ?? DEFAULT_SYNTH_CONFIG.effects.chorus.depth,
        mix: source?.effects?.chorus?.mix ?? DEFAULT_SYNTH_CONFIG.effects.chorus.mix,
      },
      delay: {
        enabled: source?.effects?.delay?.enabled ?? DEFAULT_SYNTH_CONFIG.effects.delay.enabled,
        time: source?.effects?.delay?.time ?? DEFAULT_SYNTH_CONFIG.effects.delay.time,
        feedback: source?.effects?.delay?.feedback ?? DEFAULT_SYNTH_CONFIG.effects.delay.feedback,
        mix: source?.effects?.delay?.mix ?? DEFAULT_SYNTH_CONFIG.effects.delay.mix,
      },
      reverb: {
        enabled: source?.effects?.reverb?.enabled ?? DEFAULT_SYNTH_CONFIG.effects.reverb.enabled,
        decay: source?.effects?.reverb?.decay ?? DEFAULT_SYNTH_CONFIG.effects.reverb.decay,
        preDelay:
          source?.effects?.reverb?.preDelay ?? DEFAULT_SYNTH_CONFIG.effects.reverb.preDelay,
        mix: source?.effects?.reverb?.mix ?? DEFAULT_SYNTH_CONFIG.effects.reverb.mix,
      },
    },
  };
}

function getPresetConfigById(presetId) {
  if (presetId && SYNTH_PRESETS[presetId]) {
    return SYNTH_PRESETS[presetId];
  }
  if (presetId && presetId.startsWith('custom:')) {
    const custom = state.customPresets.find((preset) => `custom:${preset.id}` === presetId);
    if (custom) {
      return custom.config;
    }
  }
  return SYNTH_PRESETS[DEFAULT_SYNTH_PRESET];
}

function synthConfigsEqual(a, b) {
  if (!a || !b) return false;
  const oscillatorMatch = a?.oscillator?.type === b?.oscillator?.type;
  if (!oscillatorMatch) return false;
  const envelopeKeys = ['attack', 'decay', 'sustain', 'release'];
  const approxEqual = (valueA, valueB) => Math.abs(Number(valueA) - Number(valueB)) < 0.0001;
  const envelopeMatch = envelopeKeys.every((key) =>
    approxEqual(a?.envelope?.[key], b?.envelope?.[key]),
  );
  if (!envelopeMatch) return false;
  const filterMatch =
    a?.filter?.type === b?.filter?.type &&
    approxEqual(a?.filter?.frequency, b?.filter?.frequency) &&
    approxEqual(a?.filter?.q, b?.filter?.q);
  if (!filterMatch) return false;
  const effectKeys = ['chorus', 'delay', 'reverb'];
  return effectKeys.every((key) => {
    const effectA = a?.effects?.[key];
    const effectB = b?.effects?.[key];
    if (!effectA || !effectB) return false;
    if (!!effectA.enabled !== !!effectB.enabled) return false;
    const params = Object.keys(effectA).filter((param) => param !== 'enabled');
    return params.every((param) => approxEqual(effectA[param], effectB[param]));
  });
}

function findMatchingPresetId(config) {
  const builtInEntry = Object.entries(SYNTH_PRESETS).find(([, presetConfig]) =>
    synthConfigsEqual(config, presetConfig),
  );
  if (builtInEntry) {
    return builtInEntry[0];
  }
  const customEntry = state.customPresets.find((preset) => synthConfigsEqual(config, preset.config));
  if (customEntry) {
    return `custom:${customEntry.id}`;
  }
  return null;
}

function getPresetDisplayName(presetId) {
  if (!presetId) {
    return 'Custom';
  }
  if (SYNTH_PRESETS[presetId]) {
    return presetId;
  }
  if (presetId.startsWith('custom:')) {
    const custom = state.customPresets.find((preset) => `custom:${preset.id}` === presetId);
    if (custom) {
      return custom.name;
    }
  }
  return 'Custom';
}

function getTrackPresetValue(track) {
  return track.presetId || '__custom';
}

function createSynthTrack(name, presetId = DEFAULT_SYNTH_PRESET) {
  const baseConfig = getPresetConfigById(presetId);
  return {
    id: crypto.randomUUID(),
    type: 'synth',
    name,
    notes: [],
    octave: 4,
    presetId,
    sourcePresetId: presetId,
    synthConfig: cloneSynthConfig(baseConfig),
    chordMode: false,
  };
}

function createDrumTrack(name) {
  return {
    id: crypto.randomUUID(),
    type: 'drum',
    name,
    notes: [],
  };
}

function disposeInstrument(trackId) {
  const instrument = trackInstruments.get(trackId);
  if (!instrument) return;
  if (instrument.type === 'synth') {
    if (instrument.nodes?.length) {
      instrument.nodes.forEach((node) => {
        if (typeof node.dispose === 'function') {
          node.dispose();
        }
      });
    } else {
      instrument.node.dispose();
    }
  } else if (instrument.type === 'drum') {
    Object.values(instrument.nodes).forEach((node) => node.dispose());
  }
  trackInstruments.delete(trackId);
}

function createSynthInstrument(config) {
  const nodes = [];
  const synth = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 16,
    oscillator: { ...config.oscillator },
    envelope: { ...config.envelope },
  });
  nodes.push(synth);
  let lastNode = synth;

  const filter = new Tone.Filter({
    type: config.filter?.type || DEFAULT_SYNTH_CONFIG.filter.type,
    frequency: config.filter?.frequency ?? DEFAULT_SYNTH_CONFIG.filter.frequency,
    Q: config.filter?.q ?? DEFAULT_SYNTH_CONFIG.filter.q,
  });
  nodes.push(filter);
  lastNode.connect(filter);
  lastNode = filter;

  const chorusConfig = config.effects?.chorus;
  if (chorusConfig?.enabled) {
    const chorus = new Tone.Chorus({
      frequency: chorusConfig.rate,
      depth: chorusConfig.depth,
      delayTime: 2.5,
      spread: 180,
      wet: chorusConfig.mix,
    }).start();
    nodes.push(chorus);
    lastNode.connect(chorus);
    lastNode = chorus;
  }

  const delayConfig = config.effects?.delay;
  if (delayConfig?.enabled) {
    const delay = new Tone.FeedbackDelay({
      delayTime: delayConfig.time,
      feedback: delayConfig.feedback,
      wet: delayConfig.mix,
    });
    nodes.push(delay);
    lastNode.connect(delay);
    lastNode = delay;
  }

  const reverbConfig = config.effects?.reverb;
  if (reverbConfig?.enabled) {
    const reverb = new Tone.Reverb({
      decay: reverbConfig.decay,
      preDelay: reverbConfig.preDelay,
      wet: reverbConfig.mix,
    });
    nodes.push(reverb);
    lastNode.connect(reverb);
    lastNode = reverb;
  }

  const output = new Tone.Gain(1);
  nodes.push(output);
  lastNode.connect(output);
  output.connect(masterVolume);

  return { synth, nodes };
}

function ensureInstrumentForTrack(track) {
  if (track.type === 'synth') {
    const config = track.synthConfig || cloneSynthConfig(getPresetConfigById(track.presetId));
    track.synthConfig = cloneSynthConfig(config);
    disposeInstrument(track.id);
    const { synth, nodes } = createSynthInstrument(track.synthConfig);
    trackInstruments.set(track.id, { type: 'synth', node: synth, nodes });
  } else if (track.type === 'drum') {
    disposeInstrument(track.id);
    const kit = {
      kick: new Tone.MembraneSynth({ envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 } }).connect(masterVolume),
      snare: new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15 },
      }).connect(masterVolume),
      hat: new Tone.MetalSynth({
        frequency: 400,
        envelope: { attack: 0.001, decay: 0.1, release: 0.05 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
      }).connect(masterVolume),
    };
    trackInstruments.set(track.id, { type: 'drum', nodes: kit });
  }
}

function getMelodyLanes(track) {
  const intervals = SCALE_INTERVALS[state.scale] || SCALE_INTERVALS.Major;
  const baseMidi = Tone.Frequency(`${state.root}${track.octave}`).toMidi();
  return intervals
    .map((interval, index) => {
      const midi = baseMidi + interval;
      return {
        laneIndex: index,
        interval,
        midi,
        name: Tone.Frequency(midi, 'midi').toNote(),
        isRoot: interval === 0,
      };
    })
    .sort((a, b) => b.midi - a.midi);
}

function getMidiForLane(laneIndex, octave) {
  const intervals = SCALE_INTERVALS[state.scale] || SCALE_INTERVALS.Major;
  const interval = intervals[laneIndex] ?? intervals[0] ?? 0;
  const baseMidi = Tone.Frequency(`${state.root}${octave}`).toMidi();
  return baseMidi + interval;
}

function normalizeNotesForGrid() {
  const totalSlots = getTotalSlots();
  state.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      note.slot = Math.max(0, Math.min(note.slot, Math.max(0, totalSlots - 1)));
      note.len = Math.max(1, Math.min(note.len, totalSlots - note.slot));
    });
  });
}

function normalizeMelodyLaneIndices() {
  const intervals = SCALE_INTERVALS[state.scale] || SCALE_INTERVALS.Major;
  const maxIndex = Math.max(0, intervals.length - 1);
  getSynthTracks().forEach((track) => {
    track.notes.forEach((note) => {
      note.laneIndex = Math.max(0, Math.min(note.laneIndex, maxIndex));
    });
  });
}

function renderMelodyTicks() {
  melodyTicksEl.innerHTML = '';
  const totalSlots = getTotalSlots();
  const beatSlots = state.grid / 4;
  for (let slot = 0; slot <= totalSlots; slot++) {
    const tick = document.createElement('div');
    tick.className = 'tick';
    if (slot % beatSlots === 0) {
      tick.classList.add('beat');
    }
    tick.style.left = `${(slot / totalSlots) * 100}%`;
    melodyTicksEl.appendChild(tick);
  }
}

function renderDrumTicks() {
  drumTicksEl.innerHTML = '';
  const totalSlots = getTotalSlots();
  const beatSlots = state.grid / 4;
  for (let slot = 0; slot <= totalSlots; slot++) {
    const tick = document.createElement('div');
    tick.className = 'tick';
    if (slot % beatSlots === 0) {
      tick.classList.add('beat');
    }
    tick.style.left = `${(slot / totalSlots) * 100}%`;
    drumTicksEl.appendChild(tick);
  }
}
function renderTrackTabs() {
  trackTabsEl.innerHTML = '';
  state.tracks.forEach((track) => {
    const tab = document.createElement('button');
    tab.className = `track-tab${track.id === state.activeTrackId ? ' active' : ''}`;
    tab.type = 'button';
    tab.textContent = track.name;
    tab.addEventListener('click', () => selectTrack(track.id));
    trackTabsEl.appendChild(tab);
  });
}

function selectTrack(trackId) {
  state.activeTrackId = trackId;
  renderTrackTabs();
  renderActiveTrack();
}

function renderActiveTrack() {
  const track = getActiveTrack();
  if (!track) return;
  if (track.type === 'synth') {
    synthPanelEl.classList.remove('hidden');
    drumPanelEl.classList.add('hidden');
    renderSynthPanel(track);
  } else {
    drumPanelEl.classList.remove('hidden');
    synthPanelEl.classList.add('hidden');
    renderDrumPanel(track);
  }
}

function updateChordModeButton(track) {
  const active = track.chordMode;
  chordModeBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
  chordModeBtn.textContent = active ? 'Chord Mode: On' : 'Chord Mode: Off';
}

function updateOctaveLabel(track) {
  octaveLabel.textContent = `Oct ${track.octave}`;
}

function formatSeconds(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return '0.000s';
  }
  if (amount >= 1) {
    return `${amount.toFixed(2)}s`;
  }
  return `${amount.toFixed(3)}s`;
}

function formatLevel(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return '0.00';
  }
  return amount.toFixed(2);
}

function formatFrequency(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return '0 Hz';
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(2)} kHz`;
  }
  return `${amount.toFixed(0)} Hz`;
}

function formatHertz(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return '0.00 Hz';
  }
  return `${amount.toFixed(2)} Hz`;
}

function formatPercent(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return '0%';
  }
  return `${Math.round(amount * 100)}%`;
}

function formatMilliseconds(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return '0 ms';
  }
  const ms = amount * 1000;
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  return `${ms.toFixed(ms < 100 ? 1 : 0)} ms`;
}

function refreshPresetOptions(selectedValue) {
  if (!presetSelect) return;
  const currentValue = selectedValue ?? presetSelect.value ?? DEFAULT_SYNTH_PRESET;
  const fragment = document.createDocumentFragment();
  Object.keys(SYNTH_PRESETS).forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    fragment.appendChild(option);
  });
  if (state.customPresets.length) {
    const separator = document.createElement('option');
    separator.disabled = true;
    separator.value = '';
    separator.textContent = '────────';
    fragment.appendChild(separator);
    state.customPresets.forEach((preset) => {
      const option = document.createElement('option');
      option.value = `custom:${preset.id}`;
      option.textContent = `${preset.name} (Custom)`;
      fragment.appendChild(option);
    });
  }
  const customOption = document.createElement('option');
  customOption.value = '__custom';
  customOption.textContent = 'Custom (unsaved)';
  fragment.appendChild(customOption);
  presetSelect.innerHTML = '';
  presetSelect.appendChild(fragment);
  const availableValues = Array.from(presetSelect.options).map((option) => option.value);
  if (!availableValues.includes(currentValue)) {
    presetSelect.value = DEFAULT_SYNTH_PRESET;
  } else {
    presetSelect.value = currentValue;
  }
}

function describeActiveEffects(config) {
  if (!config?.effects) {
    return 'FX: none';
  }
  const activeEffects = Object.entries(config.effects)
    .filter(([, effectConfig]) => effectConfig.enabled && Number(effectConfig.mix) > 0)
    .map(([key]) => EFFECT_LABELS[key] || key);
  if (!activeEffects.length) {
    return 'FX: none';
  }
  return `FX: ${activeEffects.join(' + ')}`;
}

function updateSynthStatus(track) {
  if (!synthStatusEl) return;
  const config = track.synthConfig || cloneSynthConfig(getPresetConfigById(track.presetId));
  const activeValue = getTrackPresetValue(track);
  synthStatusEl.classList.toggle('synth-status--custom', activeValue === '__custom');
  const presetLabel =
    activeValue === '__custom'
      ? `Tweaking ${getPresetDisplayName(track.sourcePresetId)}`
      : `Preset: ${getPresetDisplayName(activeValue)}`;
  synthStatusEl.textContent = `${presetLabel} • ${describeActiveEffects(config)}`;
}

function updateEnvelopeControl(param, value) {
  if (envelopeInputs[param]) {
    envelopeInputs[param].value = value;
  }
  if (envelopeValueEls[param]) {
    const formatter = param === 'sustain' ? formatLevel : formatSeconds;
    envelopeValueEls[param].textContent = formatter(value);
  }
}

function updateFilterControl(param, value) {
  if (filterInputs[param]) {
    filterInputs[param].value = value;
  }
  if (filterValueEls[param]) {
    const formatter = param === 'frequency' ? formatFrequency : formatLevel;
    filterValueEls[param].textContent = formatter(value);
  }
}

function getEffectControl(effectKey) {
  return effectControlElements[effectKey] || null;
}

function updateEffectControls(effectKey, effectConfig) {
  const controls = getEffectControl(effectKey);
  if (!controls || !effectConfig) return;
  if (controls.enabled) {
    controls.enabled.checked = !!effectConfig.enabled;
  }
  const isActive = !!effectConfig.enabled && Number(effectConfig.mix) > 0;
  if (controls.container) {
    controls.container.classList.toggle('synth-effects__group--active', isActive);
    controls.container.classList.toggle('synth-effects__group--disabled', !isActive);
  }
  const disableParams = !effectConfig.enabled;
  const assignValue = (key, formatter) => {
    const inputKey = `${key}Input`;
    const valueKey = `${key}Value`;
    const input = controls[inputKey];
    if (input) {
      input.value = effectConfig[key];
      input.disabled = disableParams;
    }
    const valueEl = controls[valueKey];
    if (valueEl) {
      valueEl.textContent = formatter(effectConfig[key]);
    }
  };

  if ('rate' in effectConfig) assignValue('rate', formatHertz);
  if ('depth' in effectConfig) assignValue('depth', formatPercent);
  if ('time' in effectConfig) assignValue('time', formatSeconds);
  if ('feedback' in effectConfig) assignValue('feedback', formatPercent);
  if ('decay' in effectConfig) assignValue('decay', formatSeconds);
  if ('preDelay' in effectConfig) assignValue('preDelay', formatMilliseconds);
  if ('mix' in effectConfig) assignValue('mix', formatPercent);
}

function updateSynthEditorControls(track) {
  const config = track.synthConfig || cloneSynthConfig(getPresetConfigById(track.presetId));
  if (oscillatorSelect) {
    oscillatorSelect.value = config.oscillator.type;
  }
  if (filterTypeSelect && config.filter?.type) {
    filterTypeSelect.value = config.filter.type;
  }
  Object.entries(config.envelope).forEach(([param, value]) => {
    updateEnvelopeControl(param, value);
  });
  if (config.filter) {
    updateFilterControl('frequency', config.filter.frequency);
    updateFilterControl('q', config.filter.q);
  }
  if (config.effects) {
    Object.entries(config.effects).forEach(([effectKey, effectConfig]) => {
      updateEffectControls(effectKey, effectConfig);
    });
  }
  const selectedValue = getTrackPresetValue(track);
  if (!Array.from(presetSelect.options).some((option) => option.value === selectedValue)) {
    refreshPresetOptions(selectedValue);
  } else {
    presetSelect.value = selectedValue;
  }
  updateSynthStatus(track);
}

function commitSynthConfigUpdate(track, updater) {
  if (!track || track.type !== 'synth') return;
  if (!track.synthConfig) {
    track.synthConfig = cloneSynthConfig(getPresetConfigById(track.presetId));
  }
  updater(track.synthConfig);
  const matchedPreset = findMatchingPresetId(track.synthConfig);
  if (matchedPreset) {
    track.presetId = matchedPreset;
    track.sourcePresetId = matchedPreset;
  } else {
    track.presetId = null;
  }
  ensureInstrumentForTrack(track);
  updateSynthEditorControls(track);
}

function saveCurrentSynthAsPreset() {
  const track = getActiveTrack();
  if (!track || track.type !== 'synth') return;
  if (!customPresetNameInput) return;
  const name = customPresetNameInput.value.trim();
  if (!name) {
    customPresetNameInput.focus();
    return;
  }
  const config = cloneSynthConfig(track.synthConfig || getPresetConfigById(track.presetId));
  const id = crypto.randomUUID();
  state.customPresets.push({ id, name, config });
  track.presetId = `custom:${id}`;
  track.sourcePresetId = track.presetId;
  track.synthConfig = cloneSynthConfig(config);
  refreshPresetOptions(track.presetId);
  updateSynthEditorControls(track);
  ensureInstrumentForTrack(track);
  customPresetNameInput.value = '';
}

function renderSynthPanel(track) {
  synthTitleEl.textContent = track.name;
  updateChordModeButton(track);
  updateOctaveLabel(track);
  refreshPresetOptions(getTrackPresetValue(track));
  updateSynthEditorControls(track);
  if (customPresetNameInput) {
    customPresetNameInput.value = '';
  }
  renderSynthLanes(track);
  renderMelodyTicks();
}

function renderSynthLanes(track) {
  normalizeMelodyLaneIndices();
  melodyLanesEl.innerHTML = '';
  const lanes = getMelodyLanes(track);
  melodyLanesEl.style.gridTemplateRows = `repeat(${lanes.length}, 1fr)`;
  lanes.forEach((lane) => {
    const laneEl = document.createElement('div');
    laneEl.className = 'lane';
    if (lane.isRoot) {
      laneEl.classList.add('root');
    }
    laneEl.dataset.laneIndex = lane.laneIndex;
    const label = document.createElement('strong');
    label.textContent = lane.name;
    laneEl.appendChild(label);
    laneEl.addEventListener('pointerdown', handleMelodyLanePointerDown);
    laneEl.addEventListener('pointermove', handleMelodyLanePointerMove);
    laneEl.addEventListener('pointerup', handleMelodyLanePointerUp);
    laneEl.addEventListener('pointercancel', handleMelodyLanePointerCancel);
    melodyLanesEl.appendChild(laneEl);
  });
  renderSynthNotes(track);
}

function renderSynthNotes(track) {
  const lanes = Array.from(melodyLanesEl.children);
  const totalSlots = getTotalSlots();
  const gridWidth = melodyGridEl.clientWidth || melodyGridEl.offsetWidth;
  const slotWidth = totalSlots > 0 ? gridWidth / totalSlots : 0;
  lanes.forEach((laneEl) => {
    Array.from(laneEl.querySelectorAll('.note-block')).forEach((child) => child.remove());
  });
  const laneData = getMelodyLanes(track);
  track.notes.forEach((note) => {
    const laneInfoIndex = laneData.findIndex((lane) => lane.laneIndex === note.laneIndex);
    if (laneInfoIndex < 0) return;
    const laneEl = lanes[laneInfoIndex];
    if (!laneEl) return;
    const block = document.createElement('div');
    block.classList.add('note-block', 'melody-note');
    block.dataset.id = note.id;
    block.dataset.groupId = getNoteGroupId(note);
    block.dataset.type = 'melody';
    block.dataset.trackId = track.id;
    block.textContent = laneData[laneInfoIndex].name;
    const left = note.slot * slotWidth;
    block.style.left = `${left}px`;
    block.style.width = `${Math.max(slotWidth * note.len, slotWidth * 0.8)}px`;
    laneEl.appendChild(block);

    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    block.appendChild(handle);

    block.addEventListener('pointerdown', (event) => startMelodyDrag(event, note));
    block.addEventListener('pointermove', handleMelodyBlockPointerMove);
    block.addEventListener('pointerup', endBlockInteraction);
    block.addEventListener('pointercancel', endBlockInteraction);

    handle.addEventListener('pointerdown', (event) => startMelodyResize(event, note));
    handle.addEventListener('pointermove', handleMelodyResizeMove);
    handle.addEventListener('pointerup', endBlockInteraction);
    handle.addEventListener('pointercancel', endBlockInteraction);
  });
}

function renderDrumPanel(track) {
  drumTitleEl.textContent = track.name;
  renderDrumLanes(track);
  renderDrumTicks();
}

function renderDrumLanes(track) {
  drumLanesEl.innerHTML = '';
  drumLanesEl.style.gridTemplateRows = `repeat(${DRUM_LANES.length}, 1fr)`;
  DRUM_LANES.forEach((lane) => {
    const laneEl = document.createElement('div');
    laneEl.className = 'lane label-drums';
    laneEl.dataset.lane = lane.id;
    const label = document.createElement('strong');
    label.textContent = lane.label;
    laneEl.appendChild(label);
    laneEl.addEventListener('pointerdown', handleDrumLanePointerDown);
    laneEl.addEventListener('pointermove', handleDrumLanePointerMove);
    laneEl.addEventListener('pointerup', handleDrumLanePointerUp);
    laneEl.addEventListener('pointercancel', handleDrumLanePointerCancel);
    drumLanesEl.appendChild(laneEl);
  });
  renderDrumNotes(track);
}

function renderDrumNotes(track) {
  const lanes = Array.from(drumLanesEl.children);
  const totalSlots = getTotalSlots();
  const gridWidth = drumGridEl.clientWidth || drumGridEl.offsetWidth;
  const slotWidth = totalSlots > 0 ? gridWidth / totalSlots : 0;
  lanes.forEach((laneEl) => {
    Array.from(laneEl.querySelectorAll('.note-block')).forEach((child) => child.remove());
  });
  track.notes.forEach((note) => {
    const laneIndex = DRUM_LANES.findIndex((lane) => lane.id === note.lane);
    if (laneIndex < 0) return;
    const laneEl = lanes[laneIndex];
    if (!laneEl) return;
    const block = document.createElement('div');
    block.className = 'note-block drum-note';
    block.dataset.id = note.id;
    block.dataset.type = 'drum';
    block.dataset.trackId = track.id;
    block.textContent = DRUM_LANES[laneIndex].label;
    const left = note.slot * slotWidth;
    block.style.left = `${left}px`;
    block.style.width = `${Math.max(slotWidth * note.len, slotWidth * 0.8)}px`;
    laneEl.appendChild(block);

    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    block.appendChild(handle);

    block.addEventListener('pointerdown', (event) => startDrumDrag(event, note));
    block.addEventListener('pointermove', handleDrumBlockPointerMove);
    block.addEventListener('pointerup', endBlockInteraction);
    block.addEventListener('pointercancel', endBlockInteraction);

    handle.addEventListener('pointerdown', (event) => startDrumResize(event, note));
    handle.addEventListener('pointermove', handleDrumResizeMove);
    handle.addEventListener('pointerup', endBlockInteraction);
    handle.addEventListener('pointercancel', endBlockInteraction);
  });
}
function getBoundaryFromEvent(event, gridEl) {
  const totalSlots = getTotalSlots();
  if (totalSlots <= 0) return 0;
  const rect = gridEl.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
  const slotWidth = rect.width / totalSlots;
  return Math.round(x / slotWidth);
}

function createNotesForLane(track, laneIndex, slot) {
  const intervals = SCALE_INTERVALS[state.scale] || SCALE_INTERVALS.Major;
  const maxIndex = Math.max(0, intervals.length - 1);
  const indices = track.chordMode ? [laneIndex, laneIndex + 2, laneIndex + 4] : [laneIndex];
  const groupId = crypto.randomUUID();
  return indices
    .filter((index) => index >= 0 && index <= maxIndex)
    .map((index) => ({
      id: crypto.randomUUID(),
      groupId,
      trackId: track.id,
      laneIndex: index,
      octave: track.octave,
      slot,
      len: 1,
    }));
}

function getNoteGroupId(note) {
  return note.groupId || note.id;
}

function findMelodyGroupAtSlot(track, laneIndex, slot) {
  const existing = track.notes.find(
    (note) =>
      note.laneIndex === laneIndex &&
      slot >= note.slot &&
      slot < note.slot + note.len,
  );
  return existing ? getNoteGroupId(existing) : null;
}

function removeMelodyGroup(track, groupId) {
  track.notes = track.notes.filter((note) => getNoteGroupId(note) !== groupId);
  renderSynthNotes(track);
  rebuildSequences();
}

function findDrumNoteAtSlot(track, lane, slot) {
  return track.notes.find(
    (note) =>
      note.lane === lane &&
      slot >= note.slot &&
      slot < note.slot + note.len,
  );
}

function handleMelodyLanePointerDown(event) {
  const track = getActiveTrack();
  if (!track || track.type !== 'synth') return;
  const laneIndex = Number(event.currentTarget.dataset.laneIndex);
  const pointerId = event.pointerId;
  const totalSlots = getTotalSlots();
  if (!totalSlots) return;
  const startBoundary = Math.min(totalSlots - 1, getBoundaryFromEvent(event, melodyGridEl));
  const existingGroupId = findMelodyGroupAtSlot(track, laneIndex, startBoundary);
  if (existingGroupId) {
    removeMelodyGroup(track, existingGroupId);
    return;
  }
  event.currentTarget.setPointerCapture(pointerId);
  const notes = createNotesForLane(track, laneIndex, startBoundary);
  if (!notes.length) return;
  notes.forEach((note) => track.notes.push(note));
  pointerInteractions.set(pointerId, {
    type: 'melody-create',
    notes,
    startBoundary,
    trackId: track.id,
  });
  renderSynthNotes(track);
}

function handleMelodyLanePointerMove(event) {
  const interaction = pointerInteractions.get(event.pointerId);
  if (!interaction || interaction.type !== 'melody-create') return;
  updateCreatedNote(interaction, event, melodyGridEl);
}

function handleMelodyLanePointerUp(event) {
  finalizeLaneInteraction(event);
}

function handleMelodyLanePointerCancel(event) {
  finalizeLaneInteraction(event, true);
}

function handleDrumLanePointerDown(event) {
  const track = getActiveTrack();
  if (!track || track.type !== 'drum') return;
  const lane = event.currentTarget.dataset.lane;
  const pointerId = event.pointerId;
  const totalSlots = getTotalSlots();
  if (!totalSlots) return;
  const startBoundary = Math.min(totalSlots - 1, getBoundaryFromEvent(event, drumGridEl));
  const existing = findDrumNoteAtSlot(track, lane, startBoundary);
  if (existing) {
    deleteDrumNote(existing.id, track.id);
    return;
  }
  event.currentTarget.setPointerCapture(pointerId);
  const note = {
    id: crypto.randomUUID(),
    trackId: track.id,
    lane,
    slot: startBoundary,
    len: 1,
  };
  track.notes.push(note);
  pointerInteractions.set(pointerId, {
    type: 'drum-create',
    notes: [note],
    startBoundary,
    trackId: track.id,
  });
  renderDrumNotes(track);
}

function handleDrumLanePointerMove(event) {
  const interaction = pointerInteractions.get(event.pointerId);
  if (!interaction || interaction.type !== 'drum-create') return;
  updateCreatedNote(interaction, event, drumGridEl);
}

function handleDrumLanePointerUp(event) {
  finalizeLaneInteraction(event);
}

function handleDrumLanePointerCancel(event) {
  finalizeLaneInteraction(event, true);
}

function updateCreatedNote(interaction, event, gridEl) {
  const track = getTrackById(interaction.trackId);
  if (!track) return;
  const totalSlots = getTotalSlots();
  const boundary = Math.max(0, Math.min(getBoundaryFromEvent(event, gridEl), totalSlots));
  const start = Math.min(interaction.startBoundary, totalSlots - 1);
  const endBoundary = Math.max(start + 1, boundary);
  const newLen = Math.max(1, Math.min(totalSlots - start, endBoundary - start));
  interaction.notes.forEach((note) => {
    note.slot = start;
    note.len = newLen;
  });
  if (track.type === 'synth') {
    renderSynthNotes(track);
  } else {
    renderDrumNotes(track);
  }
}

function finalizeLaneInteraction(event, cancel = false) {
  const pointerId = event.pointerId;
  if (event.currentTarget.hasPointerCapture(pointerId)) {
    event.currentTarget.releasePointerCapture(pointerId);
  }
  const interaction = pointerInteractions.get(pointerId);
  if (!interaction) return;
  const track = getTrackById(interaction.trackId);
  if (track) {
    if (cancel) {
      interaction.notes.forEach((note) => {
        if (track.type === 'synth') {
          deleteMelodyNote(note.id, track.id);
        } else {
          deleteDrumNote(note.id, track.id);
        }
      });
    } else {
      if (track.type === 'synth') {
        renderSynthNotes(track);
      } else {
        renderDrumNotes(track);
      }
      rebuildSequences();
    }
  }
  pointerInteractions.delete(pointerId);
}

function startMelodyDrag(event, note) {
  if (event.target.classList.contains('resize-handle')) return;
  event.stopPropagation();
  const pointerId = event.pointerId;
  const pointerSlot = getBoundaryFromEvent(event, melodyGridEl);
  pointerInteractions.set(pointerId, {
    type: 'melody-drag',
    note,
    offset: pointerSlot - note.slot,
    trackId: note.trackId,
    hasMoved: false,
  });
  event.currentTarget.setPointerCapture(pointerId);
}

function handleMelodyBlockPointerMove(event) {
  const interaction = pointerInteractions.get(event.pointerId);
  if (!interaction || interaction.type !== 'melody-drag') return;
  interaction.hasMoved = true;
  const track = getTrackById(interaction.trackId);
  if (!track) return;
  const totalSlots = getTotalSlots();
  const pointerSlot = Math.max(0, Math.min(getBoundaryFromEvent(event, melodyGridEl), totalSlots));
  let newSlot = pointerSlot - interaction.offset;
  newSlot = Math.max(0, Math.min(totalSlots - interaction.note.len, newSlot));
  if (interaction.note.slot !== newSlot) {
    interaction.note.slot = newSlot;
    renderSynthNotes(track);
  }
}

function startMelodyResize(event, note) {
  event.stopPropagation();
  const pointerId = event.pointerId;
  pointerInteractions.set(pointerId, {
    type: 'melody-resize',
    note,
    trackId: note.trackId,
    hasMoved: false,
  });
  event.target.setPointerCapture(pointerId);
}

function handleMelodyResizeMove(event) {
  const interaction = pointerInteractions.get(event.pointerId);
  if (!interaction || interaction.type !== 'melody-resize') return;
  interaction.hasMoved = true;
  const track = getTrackById(interaction.trackId);
  if (!track) return;
  const totalSlots = getTotalSlots();
  const boundary = Math.max(0, Math.min(getBoundaryFromEvent(event, melodyGridEl), totalSlots));
  const endBoundary = Math.max(interaction.note.slot + 1, boundary);
  const newLen = Math.max(1, Math.min(totalSlots - interaction.note.slot, endBoundary - interaction.note.slot));
  if (interaction.note.len !== newLen) {
    interaction.note.len = newLen;
    renderSynthNotes(track);
  }
}

function startDrumDrag(event, note) {
  if (event.target.classList.contains('resize-handle')) return;
  event.stopPropagation();
  const pointerId = event.pointerId;
  const pointerSlot = getBoundaryFromEvent(event, drumGridEl);
  pointerInteractions.set(pointerId, {
    type: 'drum-drag',
    note,
    offset: pointerSlot - note.slot,
    trackId: note.trackId,
    hasMoved: false,
  });
  event.currentTarget.setPointerCapture(pointerId);
}

function handleDrumBlockPointerMove(event) {
  const interaction = pointerInteractions.get(event.pointerId);
  if (!interaction || interaction.type !== 'drum-drag') return;
  interaction.hasMoved = true;
  const track = getTrackById(interaction.trackId);
  if (!track) return;
  const totalSlots = getTotalSlots();
  const pointerSlot = Math.max(0, Math.min(getBoundaryFromEvent(event, drumGridEl), totalSlots));
  let newSlot = pointerSlot - interaction.offset;
  newSlot = Math.max(0, Math.min(totalSlots - interaction.note.len, newSlot));
  if (interaction.note.slot !== newSlot) {
    interaction.note.slot = newSlot;
    renderDrumNotes(track);
  }
}

function startDrumResize(event, note) {
  event.stopPropagation();
  const pointerId = event.pointerId;
  pointerInteractions.set(pointerId, {
    type: 'drum-resize',
    note,
    trackId: note.trackId,
    hasMoved: false,
  });
  event.target.setPointerCapture(pointerId);
}

function handleDrumResizeMove(event) {
  const interaction = pointerInteractions.get(event.pointerId);
  if (!interaction || interaction.type !== 'drum-resize') return;
  interaction.hasMoved = true;
  const track = getTrackById(interaction.trackId);
  if (!track) return;
  const totalSlots = getTotalSlots();
  const boundary = Math.max(0, Math.min(getBoundaryFromEvent(event, drumGridEl), totalSlots));
  const endBoundary = Math.max(interaction.note.slot + 1, boundary);
  const newLen = Math.max(1, Math.min(totalSlots - interaction.note.slot, endBoundary - interaction.note.slot));
  if (interaction.note.len !== newLen) {
    interaction.note.len = newLen;
    renderDrumNotes(track);
  }
}

function endBlockInteraction(event) {
  const pointerId = event.pointerId;
  const target = event.currentTarget;
  if (target.hasPointerCapture(pointerId)) {
    target.releasePointerCapture(pointerId);
  }
  const interaction = pointerInteractions.get(pointerId);
  if (!interaction) return;
  const track = getTrackById(interaction.trackId);
  if (!track) return;
  const isCancel = event.type === 'pointercancel';
  const isNoteBlock = target.classList.contains('note-block');
  const shouldDelete =
    !isCancel &&
    isNoteBlock &&
    !interaction.hasMoved &&
    (interaction.type === 'melody-drag' || interaction.type === 'drum-drag');

  pointerInteractions.delete(pointerId);

  if (shouldDelete) {
    if (interaction.type === 'melody-drag') {
      deleteMelodyNote(target.dataset.id, track.id);
    } else {
      deleteDrumNote(target.dataset.id, track.id);
    }
    return;
  }

  if (interaction.type.startsWith('melody')) {
    renderSynthNotes(track);
  } else if (interaction.type.startsWith('drum')) {
    renderDrumNotes(track);
  }
  rebuildSequences();
}

function deleteMelodyNote(id, trackId) {
  const track = getTrackById(trackId);
  if (!track || track.type !== 'synth') return;
  track.notes = track.notes.filter((note) => note.id !== id);
  renderSynthNotes(track);
  rebuildSequences();
}

function deleteDrumNote(id, trackId) {
  const track = getTrackById(trackId);
  if (!track || track.type !== 'drum') return;
  track.notes = track.notes.filter((note) => note.id !== id);
  renderDrumNotes(track);
  rebuildSequences();
}
function flashNote(id) {
  const blocks = document.querySelectorAll(`.note-block[data-id="${id}"]`);
  blocks.forEach((block) => {
    block.classList.add('active');
    setTimeout(() => block.classList.remove('active'), 180);
  });
}

function triggerSynth(trackId, note, time) {
  const instrument = trackInstruments.get(trackId);
  if (!instrument || instrument.type !== 'synth') return;
  const duration = note.len * getGridDurationSeconds();
  instrument.node.triggerAttackRelease(
    Tone.Frequency(getMidiForLane(note.laneIndex, note.octave), 'midi'),
    duration,
    time,
  );
  flashNote(note.id);
}

function triggerDrum(trackId, note, time) {
  const instrument = trackInstruments.get(trackId);
  if (!instrument || instrument.type !== 'drum') return;
  const duration = note.len * getGridDurationSeconds();
  if (note.lane === 'kick') {
    instrument.nodes.kick.triggerAttackRelease('C2', duration, time);
  } else if (note.lane === 'snare') {
    instrument.nodes.snare.triggerAttackRelease(duration, time);
  } else {
    instrument.nodes.hat.triggerAttackRelease('C6', duration, time);
  }
  flashNote(note.id);
}

function rebuildSequences() {
  trackParts.forEach((part) => part.dispose());
  trackParts.clear();
  Tone.Transport.cancel(0);
  const gridDur = getGridDurationSeconds();
  const loopDuration = getLoopDurationSeconds();
  state.tracks.forEach((track) => {
    if (!track.notes.length) return;
    const events = [...track.notes]
      .sort((a, b) => a.slot - b.slot)
      .map((note) => ({ time: note.slot * gridDur, note }));
    if (!events.length) return;
    const part = new Tone.Part((time, value) => {
      if (track.type === 'synth') {
        triggerSynth(track.id, value.note, time);
      } else {
        triggerDrum(track.id, value.note, time);
      }
    }, events);
    part.loop = true;
    part.loopEnd = loopDuration;
    part.start(0);
    trackParts.set(track.id, part);
  });
  if (state.playing) {
    Tone.Transport.loopEnd = `${state.bars}m`;
  }
}

async function startPlayback() {
  await Tone.start();
  if (state.playheadRaf) {
    cancelAnimationFrame(state.playheadRaf);
    state.playheadRaf = null;
  }
  Tone.Transport.stop();
  Tone.Transport.position = 0;
  Tone.Transport.bpm.value = state.bpm;
  Tone.Transport.loop = true;
  Tone.Transport.loopStart = 0;
  Tone.Transport.loopEnd = `${state.bars}m`;
  rebuildSequences();
  Tone.Transport.start('+0.05');
  state.playing = true;
  updatePlayheads();
}

function stopPlayback() {
  Tone.Transport.stop();
  state.playing = false;
  trackParts.forEach((part) => part.stop());
  if (state.playheadRaf) {
    cancelAnimationFrame(state.playheadRaf);
    state.playheadRaf = null;
  }
  melodyPlayheadEl.style.left = '0%';
  drumPlayheadEl.style.left = '0%';
}

function updatePlayheads() {
  if (!state.playing) return;
  const loopDuration = getLoopDurationSeconds();
  if (!loopDuration) return;
  const elapsed = Tone.Transport.seconds % loopDuration;
  const progress = elapsed / loopDuration;
  melodyPlayheadEl.style.left = `${progress * 100}%`;
  drumPlayheadEl.style.left = `${progress * 100}%`;
  state.playheadRaf = requestAnimationFrame(updatePlayheads);
}

function formatImuValue(value, digits = 2, suffix = '') {
  if (value == null || Number.isNaN(value)) {
    return '--';
  }
  return `${value.toFixed(digits)}${suffix}`;
}

function updateImuStatus(message) {
  if (imuStatusEl) {
    imuStatusEl.textContent = message;
  }
}

function updateImuOrientationCube(orientation = {}) {
  if (!imuCubeEl) return;
  const alpha = Number.isFinite(orientation.alpha) ? orientation.alpha : 0;
  const beta = Number.isFinite(orientation.beta) ? orientation.beta : 0;
  const gamma = Number.isFinite(orientation.gamma) ? orientation.gamma : 0;
  imuCubeEl.style.transform = `rotateZ(${alpha}deg) rotateX(${beta}deg) rotateY(${gamma}deg)`;
}

function createImuChart(context, series, yTitle) {
  if (!context || typeof Chart === 'undefined') return null;
  const datasets = series.map((item) => ({
    label: item.label,
    data: [],
    borderColor: item.border,
    backgroundColor: item.background,
    borderWidth: 2,
    tension: 0.25,
    pointRadius: 0,
    fill: false,
    metaKey: item.key,
  }));

  return new Chart(context, {
    type: 'line',
    data: { labels: [], datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: 'nearest' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          borderColor: 'rgba(96, 165, 250, 0.35)',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#e2e8f0',
        },
      },
      elements: {
        line: { borderCapStyle: 'round', borderJoinStyle: 'round' },
      },
      layout: { padding: 4 },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Sample',
            color: 'rgba(148, 197, 253, 0.8)',
            font: { size: 11, weight: '600' },
          },
          ticks: {
            color: 'rgba(148, 163, 184, 0.85)',
            maxRotation: 0,
            autoSkipPadding: 14,
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.12)',
            drawBorder: false,
          },
        },
        y: {
          title: {
            display: true,
            text: yTitle,
            color: 'rgba(148, 197, 253, 0.8)',
            font: { size: 11, weight: '600' },
          },
          ticks: {
            color: '#e2e8f0',
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.12)',
            drawBorder: false,
          },
        },
      },
    },
  });
}

function setupImuCharts() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = '#e2e8f0';
  Chart.defaults.font.family = "'Manrope', sans-serif";
  Chart.defaults.font.size = 12;

  if (!imuCharts.acceleration && imuAccChartEl) {
    const context = imuAccChartEl.getContext('2d');
    imuCharts.acceleration = createImuChart(context, IMU_ACCEL_SERIES, 'm/s²');
  }
  if (!imuCharts.rotation && imuRotChartEl) {
    const context = imuRotChartEl.getContext('2d');
    imuCharts.rotation = createImuChart(context, IMU_ROT_SERIES, '°/s');
  }
}

function resetImuCharts() {
  if (imuCharts.acceleration) {
    imuCharts.acceleration.data.labels.length = 0;
    imuCharts.acceleration.data.datasets.forEach((dataset) => {
      dataset.data.length = 0;
    });
    imuCharts.acceleration.update('none');
  }
  if (imuCharts.rotation) {
    imuCharts.rotation.data.labels.length = 0;
    imuCharts.rotation.data.datasets.forEach((dataset) => {
      dataset.data.length = 0;
    });
    imuCharts.rotation.update('none');
  }
}

function resetImuVisuals() {
  resetImuCharts();
  updateImuOrientationCube({ alpha: 0, beta: 0, gamma: 0 });
}

function setupImuVisuals() {
  setupImuCharts();
  resetImuVisuals();
}

function pushSampleToChart(chart, sample, label) {
  if (!chart) return;
  chart.data.labels.push(label);
  if (chart.data.labels.length > imuCharts.historyLimit) {
    chart.data.labels.shift();
  }
  chart.data.datasets.forEach((dataset) => {
    const value = sample && Number.isFinite(sample[dataset.metaKey])
      ? sample[dataset.metaKey]
      : 0;
    dataset.data.push(value);
    if (dataset.data.length > imuCharts.historyLimit) {
      dataset.data.shift();
    }
  });
  chart.update('none');
}

function updateImuChartsData({ acceleration, rotation }) {
  if (!imuCharts.acceleration || !imuCharts.rotation) return;
  const label = `${imuState.samples}`;
  pushSampleToChart(imuCharts.acceleration, acceleration, label);
  pushSampleToChart(imuCharts.rotation, rotation, label);
}

function renderImuData() {
  const { acc, accG, rotation, orientation } = imuState.data;
  const avgInterval = imuState.intervalCount
    ? imuState.intervalSum / imuState.intervalCount
    : null;

  updateImuOrientationCube(orientation);

  if (imuValueEls['acc-x']) imuValueEls['acc-x'].textContent = formatImuValue(acc.x);
  if (imuValueEls['acc-y']) imuValueEls['acc-y'].textContent = formatImuValue(acc.y);
  if (imuValueEls['acc-z']) imuValueEls['acc-z'].textContent = formatImuValue(acc.z);
  if (imuValueEls['acc-mag'])
    imuValueEls['acc-mag'].textContent = formatImuValue(acc.magnitude);
  if (imuValueEls['acc-peak'])
    imuValueEls['acc-peak'].textContent = formatImuValue(
      imuState.stats.accelerationPeak,
    );

  if (imuValueEls['accg-x']) imuValueEls['accg-x'].textContent = formatImuValue(accG.x);
  if (imuValueEls['accg-y']) imuValueEls['accg-y'].textContent = formatImuValue(accG.y);
  if (imuValueEls['accg-z']) imuValueEls['accg-z'].textContent = formatImuValue(accG.z);
  if (imuValueEls['accg-mag'])
    imuValueEls['accg-mag'].textContent = formatImuValue(accG.magnitude);

  if (imuValueEls['rot-alpha'])
    imuValueEls['rot-alpha'].textContent = formatImuValue(rotation.alpha, 1);
  if (imuValueEls['rot-beta'])
    imuValueEls['rot-beta'].textContent = formatImuValue(rotation.beta, 1);
  if (imuValueEls['rot-gamma'])
    imuValueEls['rot-gamma'].textContent = formatImuValue(rotation.gamma, 1);
  if (imuValueEls['rot-mag'])
    imuValueEls['rot-mag'].textContent = formatImuValue(rotation.magnitude, 1);
  if (imuValueEls['rot-peak'])
    imuValueEls['rot-peak'].textContent = formatImuValue(
      imuState.stats.rotationPeak,
      1,
    );

  if (imuValueEls['ori-alpha'])
    imuValueEls['ori-alpha'].textContent = formatImuValue(orientation.alpha, 1, '°');
  if (imuValueEls['ori-beta'])
    imuValueEls['ori-beta'].textContent = formatImuValue(orientation.beta, 1, '°');
  if (imuValueEls['ori-gamma'])
    imuValueEls['ori-gamma'].textContent = formatImuValue(orientation.gamma, 1, '°');
  if (imuValueEls['ori-absolute']) {
    const orientationAvailable =
      orientation.alpha != null || orientation.beta != null || orientation.gamma != null;
    if (orientationAvailable) {
      const absoluteState = orientation.absolute ? 'Yes' : 'No';
      imuValueEls['ori-absolute'].textContent = orientation.headingSource
        ? `${absoluteState} (${orientation.headingSource})`
        : absoluteState;
    } else {
      imuValueEls['ori-absolute'].textContent = '--';
    }
  }

  if (imuValueEls.samples)
    imuValueEls.samples.textContent = `${imuState.samples}`;
  if (imuValueEls.interval) {
    imuValueEls.interval.textContent =
      avgInterval == null ? '--' : `${avgInterval.toFixed(0)} ms`;
  }
  if (imuValueEls.timestamp) {
    if (imuState.data.lastTimestamp) {
      const date = new Date(imuState.data.lastTimestamp);
      imuValueEls.timestamp.textContent = date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } else {
      imuValueEls.timestamp.textContent = '--';
    }
  }
}

async function queryGenericSensorPermissions(names = []) {
  if (!Array.isArray(names) || names.length === 0) {
    return true;
  }
  if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
    return true;
  }
  try {
    const results = await Promise.all(
      names.map((name) => navigator.permissions.query({ name }).catch(() => null)),
    );
    return results.every((result) => !result || result.state !== 'denied');
  } catch (error) {
    console.warn('Generic sensor permission query failed', error);
    return true;
  }
}

async function requestSensorPermission(SensorEvent, fallbackPermissions = []) {
  if (!SensorEvent || typeof SensorEvent.requestPermission !== 'function') {
    return queryGenericSensorPermissions(fallbackPermissions);
  }
  try {
    const response = await SensorEvent.requestPermission();
    if (response === 'granted') return true;
    if (response === 'prompt') {
      // Some browsers report "prompt" until the user responds – treat as success so listeners run.
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to request sensor permission', error);
    return false;
  }
}

async function startImuTracking() {
  const motionSupported = 'DeviceMotionEvent' in window;
  const orientationSupported = 'DeviceOrientationEvent' in window;
  if (!motionSupported && !orientationSupported) {
    updateImuStatus('IMU sensors are not supported on this device');
    return;
  }

  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  if (!window.isSecureContext && !isLocalhost) {
    updateImuStatus('Motion sensors require HTTPS or localhost access');
    return;
  }

  updateImuStatus('Requesting sensor access…');

  const motionGranted = await requestSensorPermission(window.DeviceMotionEvent, [
    'accelerometer',
    'gyroscope',
  ]);
  if (!motionGranted) {
    updateImuStatus('Motion sensor permission denied');
    return;
  }
  const orientationGranted = await requestSensorPermission(window.DeviceOrientationEvent, [
    'magnetometer',
  ]);
  if (!orientationGranted) {
    updateImuStatus('Orientation sensor permission denied');
    return;
  }

  imuState.active = true;
  imuState.samples = 0;
  imuState.stats.accelerationPeak = 0;
  imuState.stats.rotationPeak = 0;
  imuState.intervalSum = 0;
  imuState.intervalCount = 0;
  imuState.data.acc = { x: 0, y: 0, z: 0, magnitude: 0 };
  imuState.data.accG = { x: 0, y: 0, z: 0, magnitude: 0 };
  imuState.data.rotation = { alpha: 0, beta: 0, gamma: 0, magnitude: 0 };
  imuState.data.orientation = {
    alpha: null,
    beta: null,
    gamma: null,
    absolute: false,
    headingSource: null,
  };
  imuState.data.interval = null;
  imuState.data.lastTimestamp = null;
  resetImuVisuals();
  updateImuStatus('Waiting for motion data…');
  renderImuData();

  window.addEventListener('devicemotion', handleDeviceMotion);
  window.addEventListener('deviceorientation', handleDeviceOrientation);
  window.addEventListener('deviceorientationabsolute', handleDeviceOrientation);
  if (imuToggleBtn) {
    imuToggleBtn.textContent = 'Stop Tracking';
    imuToggleBtn.setAttribute('aria-pressed', 'true');
  }
}

function stopImuTracking() {
  if (!imuState.active) return;
  imuState.active = false;
  window.removeEventListener('devicemotion', handleDeviceMotion);
  window.removeEventListener('deviceorientation', handleDeviceOrientation);
  window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation);
  updateImuStatus('Tracking paused');
  if (imuToggleBtn) {
    imuToggleBtn.textContent = 'Start Tracking';
    imuToggleBtn.setAttribute('aria-pressed', 'false');
  }
}

async function toggleImuTracking() {
  if (imuState.active) {
    stopImuTracking();
  } else {
    await startImuTracking();
  }
}

function handleDeviceMotion(event) {
  if (!imuState.active) return;
  const accel = event.acceleration || {};
  const accelG = event.accelerationIncludingGravity || {};
  const rotationRate = event.rotationRate || {};

  const ax = typeof accel.x === 'number' ? accel.x : 0;
  const ay = typeof accel.y === 'number' ? accel.y : 0;
  const az = typeof accel.z === 'number' ? accel.z : 0;
  const gx = typeof accelG.x === 'number' ? accelG.x : 0;
  const gy = typeof accelG.y === 'number' ? accelG.y : 0;
  const gz = typeof accelG.z === 'number' ? accelG.z : 0;
  const ra = typeof rotationRate.alpha === 'number' ? rotationRate.alpha : 0;
  const rb = typeof rotationRate.beta === 'number' ? rotationRate.beta : 0;
  const rg = typeof rotationRate.gamma === 'number' ? rotationRate.gamma : 0;

  const accelMagnitude = Math.sqrt(ax * ax + ay * ay + az * az);
  const gravityMagnitude = Math.sqrt(gx * gx + gy * gy + gz * gz);
  const rotationMagnitude = Math.sqrt(ra * ra + rb * rb + rg * rg);

  imuState.data.acc = { x: ax, y: ay, z: az, magnitude: accelMagnitude };
  imuState.data.accG = { x: gx, y: gy, z: gz, magnitude: gravityMagnitude };
  imuState.data.rotation = { alpha: ra, beta: rb, gamma: rg, magnitude: rotationMagnitude };

  imuState.samples += 1;
  imuState.stats.accelerationPeak = Math.max(imuState.stats.accelerationPeak, accelMagnitude);
  imuState.stats.rotationPeak = Math.max(imuState.stats.rotationPeak, rotationMagnitude);
  if (typeof event.interval === 'number' && !Number.isNaN(event.interval)) {
    imuState.intervalSum += event.interval;
    imuState.intervalCount += 1;
    imuState.data.interval = event.interval;
  }
  imuState.data.lastTimestamp = Date.now();
  if (imuState.samples === 1) {
    updateImuStatus('Streaming motion data');
  }
  updateImuChartsData({
    acceleration: { x: ax, y: ay, z: az },
    rotation: { alpha: ra, beta: rb, gamma: rg },
  });
  renderImuData();
}

function normalizeHeadingFromEvent(event) {
  if (typeof event.webkitCompassHeading === 'number') {
    // webkitCompassHeading reports clockwise degrees starting at North.
    return (360 - event.webkitCompassHeading) % 360;
  }
  return typeof event.alpha === 'number' ? event.alpha : null;
}

function resolveOrientationAbsolute(event) {
  if (typeof event.webkitCompassAccuracy === 'number') {
    return event.webkitCompassAccuracy >= 0;
  }
  if (typeof event.absolute === 'boolean') {
    return event.absolute;
  }
  return false;
}

function handleDeviceOrientation(event) {
  if (!imuState.active) return;
  const alpha = normalizeHeadingFromEvent(event);
  const beta = typeof event.beta === 'number' ? event.beta : null;
  const gamma = typeof event.gamma === 'number' ? event.gamma : null;
  imuState.data.orientation = {
    alpha,
    beta,
    gamma,
    absolute: resolveOrientationAbsolute(event),
    headingSource: typeof event.webkitCompassHeading === 'number' ? 'compass' : null,
  };
  renderImuData();
}

function initializeImuPanel() {
  if (!imuToggleBtn || !imuStatusEl) return;
  setupImuVisuals();
  const supported = 'DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window;
  if (!supported) {
    imuToggleBtn.disabled = true;
    imuToggleBtn.setAttribute('aria-pressed', 'false');
    updateImuStatus('IMU sensors are not available in this browser');
    return;
  }
  imuToggleBtn.addEventListener('click', toggleImuTracking);
  imuToggleBtn.setAttribute('aria-pressed', 'false');
  updateImuStatus('Tap “Start Tracking” to enable sensors');
  renderImuData();
}

function scaleNotesForGridChange(oldGrid, newGrid) {
  if (!oldGrid || oldGrid === newGrid) return;
  const ratio = newGrid / oldGrid;
  state.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      note.slot = Math.round(note.slot * ratio);
      note.len = Math.max(1, Math.round(note.len * ratio));
    });
  });
  normalizeNotesForGrid();
}

function updateOctave(delta) {
  const track = getActiveTrack();
  if (!track || track.type !== 'synth') return;
  track.octave = Math.min(6, Math.max(2, track.octave + delta));
  updateOctaveLabel(track);
  renderSynthPanel(track);
  rebuildSequences();
}

function toggleChordMode() {
  const track = getActiveTrack();
  if (!track || track.type !== 'synth') return;
  track.chordMode = !track.chordMode;
  updateChordModeButton(track);
}

function populatePresetOptions() {
  refreshPresetOptions(presetSelect.value || DEFAULT_SYNTH_PRESET);
}

function populateOscillatorOptions() {
  if (!oscillatorSelect) return;
  oscillatorSelect.innerHTML = '';
  OSCILLATOR_TYPES.forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    oscillatorSelect.appendChild(option);
  });
}

function populateFilterOptions() {
  if (!filterTypeSelect) return;
  filterTypeSelect.innerHTML = '';
  FILTER_TYPES.forEach((filter) => {
    const option = document.createElement('option');
    option.value = filter.value;
    option.textContent = filter.label;
    filterTypeSelect.appendChild(option);
  });
}

function configureEnvelopeInputs() {
  Object.entries(envelopeInputs).forEach(([param, input]) => {
    if (!input) return;
    const limits = ENVELOPE_CONTROL_LIMITS[param];
    if (limits) {
      input.min = limits.min;
      input.max = limits.max;
      input.step = limits.step;
    }
  });
}

function configureFilterInputs() {
  Object.entries(filterInputs).forEach(([param, input]) => {
    if (!input) return;
    const limits = FILTER_CONTROL_LIMITS[param];
    if (limits) {
      input.min = limits.min;
      input.max = limits.max;
      input.step = limits.step;
    }
  });
}

function configureEffectInputs() {
  Object.entries(effectControlElements).forEach(([effectKey, controls]) => {
    const limits = EFFECT_CONTROL_LIMITS[effectKey];
    if (!limits) return;
    Object.entries(limits).forEach(([param, config]) => {
      const input = controls?.[`${param}Input`];
      if (input && config) {
        input.min = config.min;
        input.max = config.max;
        input.step = config.step;
      }
    });
  });
}

function getNextTrackName(type) {
  const count = state.tracks.filter((track) => track.type === type).length + 1;
  return type === 'synth' ? `Synth ${count}` : `Drums ${count}`;
}

function addSynthTrack() {
  const track = createSynthTrack(getNextTrackName('synth'));
  state.tracks.push(track);
  ensureInstrumentForTrack(track);
  selectTrack(track.id);
  rebuildSequences();
}

function addDrumTrack() {
  const track = createDrumTrack(getNextTrackName('drum'));
  state.tracks.push(track);
  ensureInstrumentForTrack(track);
  selectTrack(track.id);
  rebuildSequences();
}

function initControls() {
  playBtn.addEventListener('click', startPlayback);
  stopBtn.addEventListener('click', stopPlayback);

  gridSelect.addEventListener('change', (event) => {
    const newGrid = Number(event.target.value);
    const oldGrid = state.grid;
    state.grid = newGrid;
    scaleNotesForGridChange(oldGrid, newGrid);
    renderActiveTrack();
    rebuildSequences();
  });

  bpmInput.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    state.bpm = value;
    bpmValue.textContent = `${value}`;
    if (state.playing) {
      Tone.Transport.bpm.value = value;
    }
  });

  scaleSelect.addEventListener('change', (event) => {
    state.scale = event.target.value;
    renderActiveTrack();
    rebuildSequences();
  });

  rootSelect.addEventListener('change', (event) => {
    state.root = event.target.value;
    renderActiveTrack();
    rebuildSequences();
  });

  masterVolumeInput.addEventListener('input', (event) => {
    masterVolume.volume.value = Number(event.target.value);
  });

  octaveUpBtn.addEventListener('click', () => updateOctave(1));
  octaveDownBtn.addEventListener('click', () => updateOctave(-1));

  chordModeBtn.addEventListener('click', toggleChordMode);

  presetSelect.addEventListener('change', (event) => {
    const track = getActiveTrack();
    if (!track || track.type !== 'synth') return;
    const value = event.target.value;
    if (value === '__custom') {
      presetSelect.value = getTrackPresetValue(track);
      return;
    }
    const config = cloneSynthConfig(getPresetConfigById(value));
    track.presetId = value;
    track.sourcePresetId = value;
    track.synthConfig = cloneSynthConfig(config);
    ensureInstrumentForTrack(track);
    updateSynthEditorControls(track);
    rebuildSequences();
  });

  if (oscillatorSelect) {
    oscillatorSelect.addEventListener('change', (event) => {
      const track = getActiveTrack();
      if (!track || track.type !== 'synth') return;
      const type = event.target.value;
      commitSynthConfigUpdate(track, (config) => {
        config.oscillator.type = type;
      });
    });
  }

  if (filterTypeSelect) {
    filterTypeSelect.addEventListener('change', (event) => {
      const track = getActiveTrack();
      if (!track || track.type !== 'synth') return;
      const value = event.target.value;
      commitSynthConfigUpdate(track, (config) => {
        config.filter.type = value;
      });
    });
  }

  Object.entries(filterInputs).forEach(([param, input]) => {
    if (!input) return;
    input.addEventListener('input', (event) => {
      const track = getActiveTrack();
      if (!track || track.type !== 'synth') return;
      const value = Number(event.target.value);
      commitSynthConfigUpdate(track, (config) => {
        config.filter[param] = value;
      });
    });
  });

  Object.entries(envelopeInputs).forEach(([param, input]) => {
    if (!input) return;
    input.addEventListener('input', (event) => {
      const track = getActiveTrack();
      if (!track || track.type !== 'synth') return;
      const value = Number(event.target.value);
      commitSynthConfigUpdate(track, (config) => {
        config.envelope[param] = value;
      });
    });
  });

  Object.entries(effectControlElements).forEach(([effectKey, controls]) => {
    if (controls.enabled) {
      controls.enabled.addEventListener('change', (event) => {
        const track = getActiveTrack();
        if (!track || track.type !== 'synth') return;
        const enabled = event.target.checked;
        commitSynthConfigUpdate(track, (config) => {
          const effectConfig = config.effects[effectKey];
          if (!effectConfig) return;
          effectConfig.enabled = enabled;
          if (enabled && effectConfig.mix <= 0) {
            effectConfig.mix =
              DEFAULT_SYNTH_CONFIG.effects?.[effectKey]?.mix ?? 0.35;
          }
        });
      });
    }

    ['rate', 'depth', 'time', 'feedback', 'decay', 'preDelay', 'mix'].forEach((param) => {
      const input = controls?.[`${param}Input`];
      if (!input) return;
      input.addEventListener('input', (event) => {
        const track = getActiveTrack();
        if (!track || track.type !== 'synth') return;
        const value = Number(event.target.value);
        commitSynthConfigUpdate(track, (config) => {
          const effectConfig = config.effects[effectKey];
          if (!effectConfig) return;
          if (Number.isFinite(value)) {
            effectConfig[param] = value;
          }
        });
      });
    });
  });

  if (saveCustomPresetBtn) {
    saveCustomPresetBtn.addEventListener('click', saveCurrentSynthAsPreset);
  }

  if (customPresetNameInput) {
    customPresetNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveCurrentSynthAsPreset();
      }
    });
  }

  addSynthTrackBtn.addEventListener('click', addSynthTrack);
  addDrumTrackBtn.addEventListener('click', addDrumTrack);
}

function init() {
  populatePresetOptions();
  populateOscillatorOptions();
  populateFilterOptions();
  configureEnvelopeInputs();
  configureFilterInputs();
  configureEffectInputs();
  bpmValue.textContent = `${state.bpm}`;
  gridSelect.value = `${state.grid}`;
  scaleSelect.value = state.scale;
  rootSelect.value = state.root;
  masterVolume.volume.value = Number(masterVolumeInput.value);

  const defaultSynth = createSynthTrack(getNextTrackName('synth'));
  const defaultDrums = createDrumTrack(getNextTrackName('drum'));
  state.tracks.push(defaultSynth, defaultDrums);
  ensureInstrumentForTrack(defaultSynth);
  ensureInstrumentForTrack(defaultDrums);
  state.activeTrackId = defaultSynth.id;

  renderTrackTabs();
  renderActiveTrack();
  initControls();
  initializeImuPanel();
}

init();

window.addEventListener('resize', () => {
  const track = getActiveTrack();
  if (!track) return;
  if (track.type === 'synth') {
    renderSynthNotes(track);
    renderMelodyTicks();
  } else {
    renderDrumNotes(track);
    renderDrumTicks();
  }
});
