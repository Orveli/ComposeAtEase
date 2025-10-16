const SCALE_INTERVALS = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
};

const DRUM_LANES = [
  { id: 'kick', label: 'Kick' },
  { id: 'snare', label: 'Snare' },
  { id: 'hat', label: 'Hi-Hat' },
];

const state = {
  bpm: 100,
  bars: 1,
  grid: 8,
  root: 'C',
  scale: 'Major',
  visibleOctave: 4,
  melodyNotes: [],
  drumNotes: [],
  playing: false,
  melodyPart: null,
  drumPart: null,
  playheadRaf: null,
};

const pointerInteractions = new Map();

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

const masterVolume = new Tone.Volume(-8).toDestination();
const melodySynth = new Tone.PolySynth(Tone.Synth, {
  maxPolyphony: 16,
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.01, release: 0.2 },
}).connect(masterVolume);

const drumSynths = {
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

function getMelodyLanes() {
  const intervals = SCALE_INTERVALS[state.scale] || SCALE_INTERVALS.Major;
  const baseMidi = Tone.Frequency(`${state.root}${state.visibleOctave}`).toMidi();
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
  state.melodyNotes.forEach((note) => {
    note.slot = Math.max(0, Math.min(note.slot, Math.max(0, totalSlots - 1)));
    note.len = Math.max(1, Math.min(note.len, totalSlots - note.slot));
  });
  state.drumNotes.forEach((note) => {
    note.slot = Math.max(0, Math.min(note.slot, Math.max(0, totalSlots - 1)));
    note.len = Math.max(1, Math.min(note.len, totalSlots - note.slot));
  });
}

function normalizeMelodyLaneIndices() {
  const intervals = SCALE_INTERVALS[state.scale] || SCALE_INTERVALS.Major;
  const maxIndex = Math.max(0, intervals.length - 1);
  state.melodyNotes.forEach((note) => {
    note.laneIndex = Math.max(0, Math.min(note.laneIndex, maxIndex));
  });
}

function renderMelodyLanes() {
  normalizeMelodyLaneIndices();
  const lanes = getMelodyLanes();
  melodyLanesEl.innerHTML = '';
  melodyLanesEl.style.gridTemplateRows = `repeat(${lanes.length}, 1fr)`;
  lanes.forEach((lane, index) => {
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
  renderMelodyNotes();
  renderMelodyTicks();
}

function renderMelodyNotes() {
  const lanes = Array.from(melodyLanesEl.children);
  const totalSlots = getTotalSlots();
  const gridWidth = melodyGridEl.clientWidth || melodyGridEl.offsetWidth;
  const slotWidth = totalSlots > 0 ? gridWidth / totalSlots : 0;
  lanes.forEach((laneEl) => {
    Array.from(laneEl.querySelectorAll('.note-block')).forEach((child) => child.remove());
  });
  const laneData = getMelodyLanes();
  state.melodyNotes.forEach((note) => {
    const laneInfoIndex = laneData.findIndex((lane) => lane.laneIndex === note.laneIndex);
    if (laneInfoIndex < 0) return;
    const laneEl = lanes[laneInfoIndex];
    if (!laneEl) return;
    const block = document.createElement('div');
    block.className = 'note-block';
    block.dataset.id = note.id;
    block.dataset.type = 'melody';
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
    block.addEventListener('dblclick', () => deleteMelodyNote(note.id));

    handle.addEventListener('pointerdown', (event) => startMelodyResize(event, note));
    handle.addEventListener('pointermove', handleMelodyResizeMove);
    handle.addEventListener('pointerup', endBlockInteraction);
    handle.addEventListener('pointercancel', endBlockInteraction);
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

function renderDrumLanes() {
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
  renderDrumNotes();
  renderDrumTicks();
}

function renderDrumNotes() {
  const lanes = Array.from(drumLanesEl.children);
  const totalSlots = getTotalSlots();
  const gridWidth = drumGridEl.clientWidth || drumGridEl.offsetWidth;
  const slotWidth = totalSlots > 0 ? gridWidth / totalSlots : 0;
  lanes.forEach((laneEl) => {
    Array.from(laneEl.querySelectorAll('.note-block')).forEach((child) => child.remove());
  });
  state.drumNotes.forEach((note) => {
    const laneIndex = DRUM_LANES.findIndex((lane) => lane.id === note.lane);
    if (laneIndex < 0) return;
    const laneEl = lanes[laneIndex];
    if (!laneEl) return;
    const block = document.createElement('div');
    block.className = 'note-block drum-note';
    block.dataset.id = note.id;
    block.dataset.type = 'drum';
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
    block.addEventListener('dblclick', () => deleteDrumNote(note.id));

    handle.addEventListener('pointerdown', (event) => startDrumResize(event, note));
    handle.addEventListener('pointermove', handleDrumResizeMove);
    handle.addEventListener('pointerup', endBlockInteraction);
    handle.addEventListener('pointercancel', endBlockInteraction);
  });
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

function getBoundaryFromEvent(event, gridEl) {
  const totalSlots = getTotalSlots();
  if (totalSlots <= 0) return 0;
  const rect = gridEl.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
  const slotWidth = rect.width / totalSlots;
  return Math.round(x / slotWidth);
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
  });
  event.currentTarget.setPointerCapture(pointerId);
}

function handleMelodyBlockPointerMove(event) {
  const interaction = pointerInteractions.get(event.pointerId);
  if (!interaction || interaction.type !== 'melody-drag') return;
  const totalSlots = getTotalSlots();
  const pointerSlot = Math.max(0, Math.min(getBoundaryFromEvent(event, melodyGridEl), totalSlots));
  let newSlot = pointerSlot - interaction.offset;
  newSlot = Math.max(0, Math.min(totalSlots - interaction.note.len, newSlot));
  if (interaction.note.slot !== newSlot) {
    interaction.note.slot = newSlot;
    renderMelodyNotes();
  }
}

function startMelodyResize(event, note) {
  event.stopPropagation();
  const pointerId = event.pointerId;
  pointerInteractions.set(pointerId, { type: 'melody-resize', note });
  event.target.setPointerCapture(pointerId);
}

function handleMelodyResizeMove(event) {
  const interaction = pointerInteractions.get(event.pointerId);
  if (!interaction || interaction.type !== 'melody-resize') return;
  const totalSlots = getTotalSlots();
  const boundary = Math.max(0, Math.min(getBoundaryFromEvent(event, melodyGridEl), totalSlots));
  const endBoundary = Math.max(interaction.note.slot + 1, boundary);
  const newLen = Math.max(1, Math.min(totalSlots - interaction.note.slot, endBoundary - interaction.note.slot));
  if (interaction.note.len !== newLen) {
    interaction.note.len = newLen;
    renderMelodyNotes();
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
  });
  event.currentTarget.setPointerCapture(pointerId);
}

function handleDrumBlockPointerMove(event) {
  const interaction = pointerInteractions.get(event.pointerId);
  if (!interaction || interaction.type !== 'drum-drag') return;
  const totalSlots = getTotalSlots();
  const pointerSlot = Math.max(0, Math.min(getBoundaryFromEvent(event, drumGridEl), totalSlots));
  let newSlot = pointerSlot - interaction.offset;
  newSlot = Math.max(0, Math.min(totalSlots - interaction.note.len, newSlot));
  if (interaction.note.slot !== newSlot) {
    interaction.note.slot = newSlot;
    renderDrumNotes();
  }
}

function startDrumResize(event, note) {
  event.stopPropagation();
  const pointerId = event.pointerId;
  pointerInteractions.set(pointerId, { type: 'drum-resize', note });
  event.target.setPointerCapture(pointerId);
}

function handleDrumResizeMove(event) {
  const interaction = pointerInteractions.get(event.pointerId);
  if (!interaction || interaction.type !== 'drum-resize') return;
  const totalSlots = getTotalSlots();
  const boundary = Math.max(0, Math.min(getBoundaryFromEvent(event, drumGridEl), totalSlots));
  const endBoundary = Math.max(interaction.note.slot + 1, boundary);
  const newLen = Math.max(1, Math.min(totalSlots - interaction.note.slot, endBoundary - interaction.note.slot));
  if (interaction.note.len !== newLen) {
    interaction.note.len = newLen;
    renderDrumNotes();
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
  pointerInteractions.delete(pointerId);
  if (interaction.type.startsWith('melody')) {
    renderMelodyNotes();
  } else if (interaction.type.startsWith('drum')) {
    renderDrumNotes();
  }
  rebuildSequences();
}

function handleMelodyLanePointerDown(event) {
  const laneIndex = Number(event.currentTarget.dataset.laneIndex);
  const pointerId = event.pointerId;
  const totalSlots = getTotalSlots();
  if (!totalSlots) return;
  event.currentTarget.setPointerCapture(pointerId);
  const startBoundary = Math.min(totalSlots - 1, getBoundaryFromEvent(event, melodyGridEl));
  const note = {
    id: crypto.randomUUID(),
    laneIndex,
    octave: state.visibleOctave,
    slot: startBoundary,
    len: 1,
  };
  state.melodyNotes.push(note);
  pointerInteractions.set(pointerId, {
    type: 'melody-create',
    note,
    startBoundary,
  });
  renderMelodyNotes();
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
  const lane = event.currentTarget.dataset.lane;
  const pointerId = event.pointerId;
  const totalSlots = getTotalSlots();
  if (!totalSlots) return;
  event.currentTarget.setPointerCapture(pointerId);
  const startBoundary = Math.min(totalSlots - 1, getBoundaryFromEvent(event, drumGridEl));
  const note = {
    id: crypto.randomUUID(),
    lane,
    slot: startBoundary,
    len: 1,
  };
  state.drumNotes.push(note);
  pointerInteractions.set(pointerId, {
    type: 'drum-create',
    note,
    startBoundary,
  });
  renderDrumNotes();
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
  const totalSlots = getTotalSlots();
  const boundary = Math.max(0, Math.min(getBoundaryFromEvent(event, gridEl), totalSlots));
  const start = Math.min(interaction.startBoundary, totalSlots - 1);
  interaction.note.slot = start;
  const endBoundary = Math.max(start + 1, boundary);
  interaction.note.len = Math.max(1, Math.min(totalSlots - start, endBoundary - start));
  if (interaction.type.startsWith('melody')) {
    renderMelodyNotes();
  } else {
    renderDrumNotes();
  }
}

function finalizeLaneInteraction(event, cancel = false) {
  const pointerId = event.pointerId;
  if (event.currentTarget.hasPointerCapture(pointerId)) {
    event.currentTarget.releasePointerCapture(pointerId);
  }
  const interaction = pointerInteractions.get(pointerId);
  if (!interaction) return;
  if (cancel) {
    if (interaction.type.startsWith('melody')) {
      deleteMelodyNote(interaction.note.id);
    } else {
      deleteDrumNote(interaction.note.id);
    }
  } else {
    if (interaction.type.startsWith('melody')) {
      renderMelodyNotes();
    } else {
      renderDrumNotes();
    }
    rebuildSequences();
  }
  pointerInteractions.delete(pointerId);
}

function deleteMelodyNote(id) {
  state.melodyNotes = state.melodyNotes.filter((note) => note.id !== id);
  renderMelodyNotes();
  rebuildSequences();
}

function deleteDrumNote(id) {
  state.drumNotes = state.drumNotes.filter((note) => note.id !== id);
  renderDrumNotes();
  rebuildSequences();
}

function triggerMelody(note, time) {
  const duration = note.len * getGridDurationSeconds();
  melodySynth.triggerAttackRelease(
    Tone.Frequency(getMidiForLane(note.laneIndex, note.octave), 'midi'),
    duration,
    time,
  );
  flashNote(note.id);
}

function triggerDrum(note, time) {
  const synth = drumSynths[note.lane];
  if (!synth) return;
  const duration = note.len * getGridDurationSeconds();
  if (note.lane === 'kick') {
    synth.triggerAttackRelease('C2', duration, time);
  } else if (note.lane === 'snare') {
    synth.triggerAttackRelease(duration, time);
  } else {
    synth.triggerAttackRelease('C6', duration, time);
  }
  flashNote(note.id);
}

function flashNote(id) {
  const blocks = document.querySelectorAll(`.note-block[data-id="${id}"]`);
  blocks.forEach((block) => {
    block.classList.add('active');
    setTimeout(() => block.classList.remove('active'), 180);
  });
}

function rebuildSequences() {
  if (state.melodyPart) {
    state.melodyPart.dispose();
    state.melodyPart = null;
  }
  if (state.drumPart) {
    state.drumPart.dispose();
    state.drumPart = null;
  }
  Tone.Transport.cancel(0);
  const gridDur = getGridDurationSeconds();
  const loopDuration = getLoopDurationSeconds();
  const melodyEvents = [...state.melodyNotes]
    .sort((a, b) => a.slot - b.slot)
    .map((note) => ({ time: note.slot * gridDur, note }));
  if (melodyEvents.length) {
    const part = new Tone.Part((time, value) => triggerMelody(value.note, time), melodyEvents);
    part.loop = true;
    part.loopEnd = loopDuration;
    part.start(0);
    state.melodyPart = part;
  }
  const drumEvents = [...state.drumNotes]
    .sort((a, b) => a.slot - b.slot)
    .map((note) => ({ time: note.slot * gridDur, note }));
  if (drumEvents.length) {
    const part = new Tone.Part((time, value) => triggerDrum(value.note, time), drumEvents);
    part.loop = true;
    part.loopEnd = loopDuration;
    part.start(0);
    state.drumPart = part;
  }
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
  if (state.melodyPart) {
    state.melodyPart.stop();
  }
  if (state.drumPart) {
    state.drumPart.stop();
  }
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

function initControls() {
  playBtn.addEventListener('click', startPlayback);
  stopBtn.addEventListener('click', stopPlayback);

  gridSelect.addEventListener('change', (event) => {
    state.grid = Number(event.target.value);
    normalizeNotesForGrid();
    renderMelodyNotes();
    renderMelodyTicks();
    renderDrumNotes();
    renderDrumTicks();
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
    renderMelodyLanes();
    rebuildSequences();
  });

  rootSelect.addEventListener('change', (event) => {
    state.root = event.target.value;
    renderMelodyLanes();
    rebuildSequences();
  });

  masterVolumeInput.addEventListener('input', (event) => {
    masterVolume.volume.value = Number(event.target.value);
  });

  octaveUpBtn.addEventListener('click', () => updateOctave(1));
  octaveDownBtn.addEventListener('click', () => updateOctave(-1));
}

function updateOctave(delta) {
  state.visibleOctave = Math.min(6, Math.max(2, state.visibleOctave + delta));
  octaveLabel.textContent = `Oct ${state.visibleOctave}`;
  renderMelodyLanes();
  rebuildSequences();
}

function init() {
  bpmValue.textContent = `${state.bpm}`;
  gridSelect.value = `${state.grid}`;
  scaleSelect.value = state.scale;
  rootSelect.value = state.root;
  masterVolume.volume.value = Number(masterVolumeInput.value);
  octaveLabel.textContent = `Oct ${state.visibleOctave}`;
  renderMelodyLanes();
  renderDrumLanes();
  initControls();
}

init();

window.addEventListener('resize', () => {
  renderMelodyNotes();
  renderMelodyTicks();
  renderDrumNotes();
  renderDrumTicks();
});
