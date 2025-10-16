const SCALE_INTERVALS = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
};

const DRUM_LANES = [
  { id: 'kick', label: 'Kick' },
  { id: 'snare', label: 'Snare' },
  { id: 'hat', label: 'Hi-Hat' },
];

const SYNTH_PRESETS = {
  'Bright Keys': {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 },
  },
  'Warm Pad': {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.3, decay: 0.2, sustain: 0.8, release: 1.6 },
  },
  'Soft Lead': {
    oscillator: { type: 'square' },
    envelope: { attack: 0.02, decay: 0.15, sustain: 0.5, release: 0.5 },
  },
  'Airy Pluck': {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.25, release: 0.4 },
  },
};

const DEFAULT_SYNTH_PRESET = 'Bright Keys';

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
};

const masterVolume = new Tone.Volume(-8).toDestination();
const trackInstruments = new Map();
const trackParts = new Map();
const pointerInteractions = new Map();
const suppressedNoteClicks = new Set();
const hasMotionSupport = typeof DeviceMotionEvent !== 'undefined';
const hasOrientationSupport = typeof DeviceOrientationEvent !== 'undefined';
const imuState = {
  active: false,
  supported: hasMotionSupport || hasOrientationSupport,
  sampleCount: 0,
  acceleration: { x: 0, y: 0, z: 0, magnitude: 0 },
  rotationRate: { alpha: 0, beta: 0, gamma: 0, magnitude: 0 },
  orientation: { alpha: null, beta: null, gamma: null },
  stats: {
    accel: { max: 0, total: 0 },
    rotation: { max: 0, total: 0 },
  },
  lastUpdate: null,
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
const toggleImuPanelBtn = document.getElementById('toggleImuPanel');
const imuPanelEl = document.getElementById('imuPanel');
const imuStatusEl = document.getElementById('imuStatus');
const imuStartBtn = document.getElementById('imuStartBtn');
const imuSampleCountEl = document.getElementById('imuSampleCount');
const imuLastUpdateEl = document.getElementById('imuLastUpdate');
const imuAccelPeakEl = document.getElementById('imuAccelPeak');
const imuRotationPeakEl = document.getElementById('imuRotationPeak');
const imuAccelXEl = document.getElementById('imuAccelX');
const imuAccelYEl = document.getElementById('imuAccelY');
const imuAccelZEl = document.getElementById('imuAccelZ');
const imuAccelMagEl = document.getElementById('imuAccelMag');
const imuAccelAvgEl = document.getElementById('imuAccelAvg');
const imuRotAlphaEl = document.getElementById('imuRotAlpha');
const imuRotBetaEl = document.getElementById('imuRotBeta');
const imuRotGammaEl = document.getElementById('imuRotGamma');
const imuRotMagEl = document.getElementById('imuRotMag');
const imuRotAvgEl = document.getElementById('imuRotAvg');
const imuOrientAlphaEl = document.getElementById('imuOrientAlpha');
const imuOrientBetaEl = document.getElementById('imuOrientBeta');
const imuOrientGammaEl = document.getElementById('imuOrientGamma');
const imuSupportMessageEl = document.getElementById('imuSupportMessage');

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

function createSynthTrack(name, preset = DEFAULT_SYNTH_PRESET) {
  return {
    id: crypto.randomUUID(),
    type: 'synth',
    name,
    notes: [],
    octave: 4,
    preset,
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
    instrument.node.dispose();
  } else if (instrument.type === 'drum') {
    Object.values(instrument.nodes).forEach((node) => node.dispose());
  }
  trackInstruments.delete(trackId);
}

function ensureInstrumentForTrack(track) {
  if (track.type === 'synth') {
    const presetConfig = SYNTH_PRESETS[track.preset] || SYNTH_PRESETS[DEFAULT_SYNTH_PRESET];
    disposeInstrument(track.id);
    const synth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 16,
      oscillator: { ...presetConfig.oscillator },
      envelope: { ...presetConfig.envelope },
    }).connect(masterVolume);
    trackInstruments.set(track.id, { type: 'synth', node: synth });
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

function renderSynthPanel(track) {
  synthTitleEl.textContent = track.name;
  updateChordModeButton(track);
  updateOctaveLabel(track);
  presetSelect.value = track.preset;
  renderSynthLanes(track);
  renderMelodyTicks();
}

function renderSynthLanes(track) {
  normalizeMelodyLaneIndices();
  melodyLanesEl.innerHTML = '';
  const lanes = getMelodyLanes(track);
  melodyLanesEl.style.gridTemplateRows = `repeat(${lanes.length}, minmax(64px, 1fr))`;
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
    laneEl.addEventListener('click', handleMelodyLaneClick);
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
    block.className = 'note-block';
    block.dataset.id = note.id;
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
    block.addEventListener('click', (event) => handleNoteBlockClick(event, note, 'melody'));

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
  drumLanesEl.style.gridTemplateRows = `repeat(${DRUM_LANES.length}, minmax(64px, 1fr))`;
  DRUM_LANES.forEach((lane) => {
    const laneEl = document.createElement('div');
    laneEl.className = 'lane label-drums';
    laneEl.dataset.lane = lane.id;
    const label = document.createElement('strong');
    label.textContent = lane.label;
    laneEl.appendChild(label);
    laneEl.addEventListener('click', handleDrumLaneClick);
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
    block.addEventListener('click', (event) => handleNoteBlockClick(event, note, 'drum'));

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

function getSlotFromEvent(event, gridEl) {
  const totalSlots = getTotalSlots();
  if (totalSlots <= 0) return 0;
  const rect = gridEl.getBoundingClientRect();
  const width = rect.width || 1;
  const clampedX = Math.min(Math.max(event.clientX - rect.left, 0), Math.max(width - 0.01, 0));
  const slotWidth = width / totalSlots;
  return Math.min(totalSlots - 1, Math.floor(clampedX / slotWidth));
}

function createNotesForLane(track, laneIndex, slot) {
  const intervals = SCALE_INTERVALS[state.scale] || SCALE_INTERVALS.Major;
  const maxIndex = Math.max(0, intervals.length - 1);
  const indices = track.chordMode ? [laneIndex, laneIndex + 2, laneIndex + 4] : [laneIndex];
  return indices
    .filter((index) => index >= 0 && index <= maxIndex)
    .map((index) => ({
      id: crypto.randomUUID(),
      trackId: track.id,
      laneIndex: index,
      octave: track.octave,
      slot,
      len: 1,
    }));
}

function handleMelodyLaneClick(event) {
  const track = getActiveTrack();
  if (!track || track.type !== 'synth') return;
  const laneIndex = Number(event.currentTarget.dataset.laneIndex);
  const slot = getSlotFromEvent(event, melodyGridEl);
  toggleMelodyNotes(track, laneIndex, slot);
}

function toggleMelodyNotes(track, laneIndex, slot) {
  const candidates = createNotesForLane(track, laneIndex, slot);
  if (!candidates.length) return;
  const laneIndices = candidates.map((note) => note.laneIndex);
  const existing = track.notes.filter(
    (note) => note.slot === slot && laneIndices.includes(note.laneIndex),
  );
  if (existing.length) {
    track.notes = track.notes.filter(
      (note) => !(note.slot === slot && laneIndices.includes(note.laneIndex)),
    );
  } else {
    candidates.forEach((candidate) => {
      const alreadyExists = track.notes.some(
        (note) => note.slot === candidate.slot && note.laneIndex === candidate.laneIndex,
      );
      if (!alreadyExists) {
        track.notes.push(candidate);
      }
    });
  }
  renderSynthNotes(track);
  rebuildSequences();
}

function handleDrumLaneClick(event) {
  const track = getActiveTrack();
  if (!track || track.type !== 'drum') return;
  const lane = event.currentTarget.dataset.lane;
  const slot = getSlotFromEvent(event, drumGridEl);
  const hasExisting = track.notes.some((note) => note.lane === lane && note.slot === slot);
  if (hasExisting) {
    track.notes = track.notes.filter((note) => !(note.lane === lane && note.slot === slot));
  } else {
    track.notes.push({
      id: crypto.randomUUID(),
      trackId: track.id,
      lane,
      slot,
      len: 1,
    });
  }
  renderDrumNotes(track);
  rebuildSequences();
}

function handleNoteBlockClick(event, note, type) {
  if (suppressedNoteClicks.has(note.id)) {
    event.stopPropagation();
    return;
  }
  event.stopPropagation();
  if (type === 'melody') {
    deleteMelodyNote(note.id, note.trackId);
  } else {
    deleteDrumNote(note.id, note.trackId);
  }
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
    preventClick: false,
  });
  event.currentTarget.setPointerCapture(pointerId);
}

function handleMelodyBlockPointerMove(event) {
  const interaction = pointerInteractions.get(event.pointerId);
  if (!interaction || interaction.type !== 'melody-drag') return;
  const track = getTrackById(interaction.trackId);
  if (!track) return;
  const totalSlots = getTotalSlots();
  const pointerSlot = Math.max(0, Math.min(getBoundaryFromEvent(event, melodyGridEl), totalSlots));
  let newSlot = pointerSlot - interaction.offset;
  newSlot = Math.max(0, Math.min(totalSlots - interaction.note.len, newSlot));
  if (interaction.note.slot !== newSlot) {
    interaction.preventClick = true;
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
    preventClick: false,
  });
  event.target.setPointerCapture(pointerId);
}

function handleMelodyResizeMove(event) {
  const interaction = pointerInteractions.get(event.pointerId);
  if (!interaction || interaction.type !== 'melody-resize') return;
  const track = getTrackById(interaction.trackId);
  if (!track) return;
  const totalSlots = getTotalSlots();
  const boundary = Math.max(0, Math.min(getBoundaryFromEvent(event, melodyGridEl), totalSlots));
  const endBoundary = Math.max(interaction.note.slot + 1, boundary);
  const newLen = Math.max(1, Math.min(totalSlots - interaction.note.slot, endBoundary - interaction.note.slot));
  if (interaction.note.len !== newLen) {
    interaction.preventClick = true;
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
    preventClick: false,
  });
  event.currentTarget.setPointerCapture(pointerId);
}

function handleDrumBlockPointerMove(event) {
  const interaction = pointerInteractions.get(event.pointerId);
  if (!interaction || interaction.type !== 'drum-drag') return;
  const track = getTrackById(interaction.trackId);
  if (!track) return;
  const totalSlots = getTotalSlots();
  const pointerSlot = Math.max(0, Math.min(getBoundaryFromEvent(event, drumGridEl), totalSlots));
  let newSlot = pointerSlot - interaction.offset;
  newSlot = Math.max(0, Math.min(totalSlots - interaction.note.len, newSlot));
  if (interaction.note.slot !== newSlot) {
    interaction.preventClick = true;
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
    preventClick: false,
  });
  event.target.setPointerCapture(pointerId);
}

function handleDrumResizeMove(event) {
  const interaction = pointerInteractions.get(event.pointerId);
  if (!interaction || interaction.type !== 'drum-resize') return;
  const track = getTrackById(interaction.trackId);
  if (!track) return;
  const totalSlots = getTotalSlots();
  const boundary = Math.max(0, Math.min(getBoundaryFromEvent(event, drumGridEl), totalSlots));
  const endBoundary = Math.max(interaction.note.slot + 1, boundary);
  const newLen = Math.max(1, Math.min(totalSlots - interaction.note.slot, endBoundary - interaction.note.slot));
  if (interaction.note.len !== newLen) {
    interaction.preventClick = true;
    interaction.note.len = newLen;
    renderDrumNotes(track);
  }
}

function endBlockInteraction(event) {
  const pointerId = event.pointerId;
  const target = event.currentTarget;
  if (target && target.hasPointerCapture(pointerId)) {
    target.releasePointerCapture(pointerId);
  }
  const interaction = pointerInteractions.get(pointerId);
  if (!interaction) return;
  pointerInteractions.delete(pointerId);
  if (interaction.preventClick && interaction.note) {
    suppressedNoteClicks.add(interaction.note.id);
    setTimeout(() => suppressedNoteClicks.delete(interaction.note.id), 0);
  }
  const track = getTrackById(interaction.trackId);
  if (!track) return;
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

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function resetImuStats() {
  imuState.sampleCount = 0;
  imuState.acceleration = { x: 0, y: 0, z: 0, magnitude: 0 };
  imuState.rotationRate = { alpha: 0, beta: 0, gamma: 0, magnitude: 0 };
  imuState.orientation = { alpha: null, beta: null, gamma: null };
  imuState.stats.accel = { max: 0, total: 0 };
  imuState.stats.rotation = { max: 0, total: 0 };
  imuState.lastUpdate = null;
  updateImuDisplay();
}

function updateImuDisplay() {
  if (!imuSampleCountEl) return;
  imuSampleCountEl.textContent = `${imuState.sampleCount}`;
  imuLastUpdateEl.textContent = imuState.lastUpdate
    ? new Date(imuState.lastUpdate).toLocaleTimeString()
    : '—';
  imuAccelPeakEl.textContent = formatNumber(imuState.stats.accel.max);
  imuRotationPeakEl.textContent = formatNumber(imuState.stats.rotation.max);
  imuAccelXEl.textContent = formatNumber(imuState.acceleration.x);
  imuAccelYEl.textContent = formatNumber(imuState.acceleration.y);
  imuAccelZEl.textContent = formatNumber(imuState.acceleration.z);
  imuAccelMagEl.textContent = formatNumber(imuState.acceleration.magnitude);
  const accelAvg = imuState.sampleCount
    ? imuState.stats.accel.total / imuState.sampleCount
    : 0;
  imuAccelAvgEl.textContent = formatNumber(accelAvg);
  imuRotAlphaEl.textContent = formatNumber(imuState.rotationRate.alpha);
  imuRotBetaEl.textContent = formatNumber(imuState.rotationRate.beta);
  imuRotGammaEl.textContent = formatNumber(imuState.rotationRate.gamma);
  imuRotMagEl.textContent = formatNumber(imuState.rotationRate.magnitude);
  const rotAvg = imuState.sampleCount
    ? imuState.stats.rotation.total / imuState.sampleCount
    : 0;
  imuRotAvgEl.textContent = formatNumber(rotAvg);
  imuOrientAlphaEl.textContent = formatNumber(imuState.orientation.alpha);
  imuOrientBetaEl.textContent = formatNumber(imuState.orientation.beta);
  imuOrientGammaEl.textContent = formatNumber(imuState.orientation.gamma);
}

function updateImuStatusText() {
  if (!imuStatusEl) return;
  if (imuPanelEl.classList.contains('hidden')) {
    imuStatusEl.textContent = 'Hidden';
  } else if (!imuState.supported) {
    imuStatusEl.textContent = 'Unsupported';
  } else if (imuState.active) {
    imuStatusEl.textContent = 'Live';
  } else {
    imuStatusEl.textContent = 'Ready';
  }
}

function refreshImuSupportMessage(message) {
  if (!imuSupportMessageEl) return;
  if (typeof message === 'string') {
    imuSupportMessageEl.textContent = message;
    return;
  }
  if (!imuState.supported) {
    imuSupportMessageEl.textContent = 'IMU sensors are not available in this browser.';
  } else if (imuState.active) {
    imuSupportMessageEl.textContent = 'Move your device to view live data.';
  } else {
    imuSupportMessageEl.textContent = 'Tap “Start Sensors” to stream motion and orientation data.';
  }
}

function updateImuControls() {
  if (!imuStartBtn) return;
  imuStartBtn.textContent = imuState.active ? 'Stop Sensors' : 'Start Sensors';
  imuStartBtn.setAttribute('aria-pressed', imuState.active ? 'true' : 'false');
  imuStartBtn.disabled = !imuState.supported && !imuState.active;
}

function stopImuMonitoring() {
  if (!imuState.active) return;
  window.removeEventListener('devicemotion', handleDeviceMotion);
  window.removeEventListener('deviceorientation', handleDeviceOrientation);
  imuState.active = false;
  updateImuControls();
  updateImuStatusText();
  refreshImuSupportMessage();
}

async function requestImuPermission() {
  const requests = [];
  if (hasMotionSupport && typeof DeviceMotionEvent.requestPermission === 'function') {
    requests.push(DeviceMotionEvent.requestPermission());
  }
  if (hasOrientationSupport && typeof DeviceOrientationEvent.requestPermission === 'function') {
    requests.push(DeviceOrientationEvent.requestPermission());
  }
  if (!requests.length) return;
  const results = await Promise.all(requests);
  const granted = results.every((result) => result === 'granted');
  if (!granted) {
    throw new Error('Motion sensor permission was denied.');
  }
}

async function startImuMonitoring() {
  if (!imuStartBtn) return;
  if (imuState.active) {
    stopImuMonitoring();
    return;
  }
  if (!imuState.supported) {
    refreshImuSupportMessage('IMU sensors are not supported on this device.');
    updateImuStatusText();
    updateImuControls();
    return;
  }
  updateImuStatusText();
  refreshImuSupportMessage('Grant motion sensor access to begin monitoring.');
  imuStartBtn.disabled = true;
  try {
    await requestImuPermission();
    resetImuStats();
    window.addEventListener('devicemotion', handleDeviceMotion);
    window.addEventListener('deviceorientation', handleDeviceOrientation);
    imuState.active = true;
    updateImuControls();
    updateImuStatusText();
    refreshImuSupportMessage();
  } catch (error) {
    const message = error?.message || 'Unable to access motion sensors.';
    refreshImuSupportMessage(message);
  } finally {
    imuStartBtn.disabled = !imuState.supported && !imuState.active;
  }
}

function handleDeviceMotion(event) {
  if (!imuState.active) return;
  const accelSource = event.acceleration || event.accelerationIncludingGravity || {};
  const ax = Number.isFinite(accelSource.x) ? accelSource.x : 0;
  const ay = Number.isFinite(accelSource.y) ? accelSource.y : 0;
  const az = Number.isFinite(accelSource.z) ? accelSource.z : 0;
  const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);
  imuState.acceleration = { x: ax, y: ay, z: az, magnitude };

  const rotation = event.rotationRate || {};
  const ra = Number.isFinite(rotation.alpha) ? rotation.alpha : 0;
  const rb = Number.isFinite(rotation.beta) ? rotation.beta : 0;
  const rg = Number.isFinite(rotation.gamma) ? rotation.gamma : 0;
  const rotationMagnitude = Math.sqrt(ra * ra + rb * rb + rg * rg);
  imuState.rotationRate = {
    alpha: ra,
    beta: rb,
    gamma: rg,
    magnitude: rotationMagnitude,
  };

  imuState.sampleCount += 1;
  imuState.stats.accel.max = Math.max(imuState.stats.accel.max, magnitude);
  imuState.stats.accel.total += magnitude;
  imuState.stats.rotation.max = Math.max(imuState.stats.rotation.max, rotationMagnitude);
  imuState.stats.rotation.total += rotationMagnitude;
  imuState.lastUpdate = Date.now();
  updateImuDisplay();
}

function handleDeviceOrientation(event) {
  if (!imuState.active) return;
  imuState.orientation = {
    alpha: Number.isFinite(event.alpha) ? event.alpha : imuState.orientation.alpha,
    beta: Number.isFinite(event.beta) ? event.beta : imuState.orientation.beta,
    gamma: Number.isFinite(event.gamma) ? event.gamma : imuState.orientation.gamma,
  };
  imuState.lastUpdate = Date.now();
  updateImuDisplay();
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
  presetSelect.innerHTML = '';
  Object.keys(SYNTH_PRESETS).forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    presetSelect.appendChild(option);
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
    track.preset = event.target.value;
    ensureInstrumentForTrack(track);
    rebuildSequences();
  });

  addSynthTrackBtn.addEventListener('click', addSynthTrack);
  addDrumTrackBtn.addEventListener('click', addDrumTrack);

  if (toggleImuPanelBtn && imuPanelEl) {
    toggleImuPanelBtn.addEventListener('click', () => {
      const shouldShow = imuPanelEl.classList.contains('hidden');
      if (shouldShow) {
        imuPanelEl.classList.remove('hidden');
        toggleImuPanelBtn.setAttribute('aria-pressed', 'true');
        toggleImuPanelBtn.textContent = 'Hide IMU Monitor';
      } else {
        imuPanelEl.classList.add('hidden');
        toggleImuPanelBtn.setAttribute('aria-pressed', 'false');
        toggleImuPanelBtn.textContent = 'IMU Monitor';
      }
      updateImuStatusText();
      refreshImuSupportMessage();
    });
  }

  if (imuStartBtn) {
    imuStartBtn.addEventListener('click', () => {
      startImuMonitoring();
    });
  }
}

function init() {
  populatePresetOptions();
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

  resetImuStats();
  updateImuControls();
  updateImuStatusText();
  refreshImuSupportMessage();
  if (toggleImuPanelBtn) {
    toggleImuPanelBtn.textContent = 'IMU Monitor';
    toggleImuPanelBtn.setAttribute('aria-pressed', 'false');
  }

  renderTrackTabs();
  renderActiveTrack();
  initControls();
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
