const SCALE_INTERVALS = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
};

const DEGREE_SEQUENCE = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];

const state = {
  session: {
    bpm: 100,
    bars: 1,
    grid: 8,
    root: 'C',
    scale: 'Major',
  },
  tool: 'note',
  lengthMode: 'tap',
  chordIndex: 0,
  visibleOctave: 4,
  notes: [],
  recording: false,
  playing: false,
  pendingHold: new Map(),
  part: null,
  recordEnabled: true,
};

const gridEl = document.getElementById('grid');
const lanesEl = document.getElementById('lanes');
const ticksEl = document.getElementById('ticks');
const playheadEl = document.getElementById('playhead');
const recBtn = document.getElementById('recBtn');
const barsBtn = document.getElementById('barsBtn');
const toolBtn = document.getElementById('toolBtn');
const lengthBtn = document.getElementById('lengthBtn');
const degreeBtn = document.getElementById('degreeBtn');
const octaveUpBtn = document.getElementById('octaveUp');
const octaveDownBtn = document.getElementById('octaveDown');
const octaveLabel = document.getElementById('octaveLabel');
const drawerToggle = document.getElementById('drawerToggle');
const drawer = document.getElementById('drawer');
const bpmInput = document.getElementById('bpm');
const bpmValue = document.getElementById('bpmValue');
const scaleSelect = document.getElementById('scaleSelect');
const rootSelect = document.getElementById('rootSelect');
const gridSelect = document.getElementById('gridSelect');
const masterVolumeInput = document.getElementById('masterVolume');
const metronomeVolumeInput = document.getElementById('metronomeVolume');

const masterVolume = new Tone.Volume(-8).toDestination();
const synth = new Tone.PolySynth(Tone.Synth, {
  maxPolyphony: 16,
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.01, release: 0.2 },
}).connect(masterVolume);

const metronomeVolume = new Tone.Volume(-16).connect(masterVolume);
const metronomeSynth = new Tone.MembraneSynth({
  envelope: { attack: 0.001, decay: 0.05, sustain: 0.001, release: 0.01 },
  pitchDecay: 0.02,
}).connect(metronomeVolume);

const EARLY_WINDOW = 0.07;
const LATE_WINDOW = 0.07;
let countdownEl = null;
let metronomeEventId = null;
let rafId = null;
let countdownIntervalId = null;

function getScaleIntervals() {
  return SCALE_INTERVALS[state.session.scale] || SCALE_INTERVALS.Major;
}

function getGridDurationSeconds() {
  const beatDur = Tone.Time('4n').toSeconds();
  return beatDur * (4 / state.session.grid);
}

function getLoopDurationSeconds() {
  return Tone.Time(`${state.session.bars}m`).toSeconds();
}

function getVisibleLanes() {
  const intervals = getScaleIntervals();
  const baseMidi = Tone.Frequency(`${state.session.root}${state.visibleOctave}`).toMidi();
  const lanes = intervals.map((interval, idx) => ({
    laneId: idx,
    midi: baseMidi + interval,
    name: Tone.Frequency(baseMidi + interval, 'midi').toNote(),
    isRoot: interval === 0,
  }));
  // highest lane on top
  return lanes.sort((a, b) => b.midi - a.midi);
}

function renderLanes() {
  lanesEl.innerHTML = '';
  const lanes = getVisibleLanes();
  lanes.forEach((lane) => {
    const laneEl = document.createElement('div');
    laneEl.className = 'lane';
    laneEl.dataset.lane = lane.laneId;
    if (lane.isRoot) {
      laneEl.classList.add('root');
    }
    const label = document.createElement('strong');
    label.textContent = lane.name;
    laneEl.appendChild(label);
    laneEl.addEventListener('pointerdown', handleLanePointerDown);
    laneEl.addEventListener('pointerup', handleLanePointerUp);
    laneEl.addEventListener('pointercancel', cancelHold);
    laneEl.addEventListener('pointerleave', handleLanePointerLeave);
    lanesEl.appendChild(laneEl);
  });
  renderNotes();
  renderTicks();
}

function renderNotes() {
  const gridWidth = gridEl.clientWidth || gridEl.offsetWidth;
  const totalSlots = state.session.bars * (state.session.grid / 4) * 4;
  const slotWidth = gridWidth / totalSlots;
  const laneElements = Array.from(lanesEl.children);
  laneElements.forEach((laneEl) => {
    Array.from(laneEl.querySelectorAll('.note-block')).forEach((child) => child.remove());
  });
  state.notes.forEach((note) => {
    if (note.octave !== state.visibleOctave) return;
    const laneEl = laneElements.find((el) => Number(el.dataset.lane) === note.laneId);
    if (!laneEl) return;
    const block = document.createElement('div');
    block.className = 'note-block';
    block.dataset.id = note.id;
    const left = note.slot * slotWidth;
    const width = Math.max(slotWidth * note.len, slotWidth * 0.8);
    block.style.left = `${left}px`;
    block.style.width = `${width}px`;
    block.style.top = '12px';
    block.style.bottom = '12px';
    block.textContent = note.kind === 'chord' ? note.degree : '';
    laneEl.appendChild(block);
    setupBlockInteractions(block, note);

    if (note.kind === 'chord') {
      block.classList.add('chord-root');
      renderGhostNotes(note, left, width);
    }
  });
}

function renderGhostNotes(note, left, width) {
  const chordNotes = getChordMidis(note.degree, note.octave);
  chordNotes.slice(1).forEach((midi) => {
    const lane = findLaneForMidi(midi);
    if (!lane) return;
    const laneElement = lanesEl.querySelector(`.lane[data-lane="${lane.laneId}"]`);
    if (!laneElement) return;
    const ghost = document.createElement('div');
    ghost.className = 'note-block ghost';
    ghost.dataset.parent = note.id;
    ghost.style.left = `${left}px`;
    ghost.style.width = `${width}px`;
    ghost.style.top = '12px';
    ghost.style.bottom = '12px';
    laneElement.appendChild(ghost);
  });
}

function findLaneForMidi(midi) {
  const intervals = getScaleIntervals();
  const baseMidi = Tone.Frequency(`${state.session.root}${state.visibleOctave}`).toMidi();
  for (let i = 0; i < intervals.length; i++) {
    const laneMidi = baseMidi + intervals[i];
    const diff = Math.abs(midi - laneMidi);
    const mod = diff % 12;
    if (mod < 0.01 || Math.abs(mod - 12) < 0.01) {
      return { laneId: i };
    }
  }
  return null;
}

function renderTicks() {
  ticksEl.innerHTML = '';
  const totalSlots = state.session.bars * (state.session.grid / 4) * 4;
  const beatSlots = state.session.grid / 4;
  for (let slot = 0; slot <= totalSlots; slot++) {
    const tick = document.createElement('div');
    tick.className = 'tick';
    const percent = (slot / totalSlots) * 100;
    tick.style.left = `${percent}%`;
    if (slot % beatSlots === 0) {
      tick.classList.add('beat');
    } else {
      tick.classList.add('sub');
    }
    ticksEl.appendChild(tick);
  }
}

function setupBlockInteractions(block, note) {
  let pressTimer;
  block.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    block.setPointerCapture(event.pointerId);
    pressTimer = setTimeout(() => {
      deleteNote(note.id);
    }, 500);
  });
  const cancel = () => {
    clearTimeout(pressTimer);
  };
  block.addEventListener('pointerup', cancel);
  block.addEventListener('pointerleave', cancel);
  block.addEventListener('pointercancel', cancel);
}

function deleteNote(id) {
  state.notes = state.notes.filter((n) => n.id !== id);
  renderNotes();
  rebuildPart();
}

function handleLanePointerDown(event) {
  event.preventDefault();
  const laneId = Number(event.currentTarget.dataset.lane);
  const pointerId = event.pointerId;
  const data = createNoteOn(laneId);
  if (!data) return;
  event.currentTarget.setPointerCapture(pointerId);
  state.pendingHold.set(pointerId, data);
  if (state.lengthMode === 'tap') {
    finalizeNote(pointerId, data.note, 1);
  } else {
    renderNotes();
  }
}

function handleLanePointerUp(event) {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  finalizeHold(event.pointerId);
}

function handleLanePointerLeave(event) {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  if (state.lengthMode === 'hold') {
    finalizeHold(event.pointerId);
  }
}

function cancelHold(event) {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  finalizeHold(event.pointerId, true);
}

function finalizeHold(pointerId, cancel = false) {
  const data = state.pendingHold.get(pointerId);
  if (!data) return;
  if (cancel) {
    removePendingNote(pointerId, data.note);
  } else {
    const len = computeHoldLength(data);
    finalizeNote(pointerId, data.note, len);
  }
}

function removePendingNote(pointerId, note) {
  state.notes = state.notes.filter((n) => n.id !== note.id);
  state.pendingHold.delete(pointerId);
  renderNotes();
  rebuildPart();
}

function computeHoldLength(data) {
  const { note, createdAt } = data;
  const gridDur = getGridDurationSeconds();
  const elapsed = Math.max(0, Tone.Transport.seconds - createdAt);
  const slots = Math.max(1, Math.ceil(elapsed / gridDur));
  const totalSlots = state.session.bars * (state.session.grid / 4) * 4;
  return Math.min(slots, Math.max(1, totalSlots - note.slot));
}

function finalizeNote(pointerId, note, len) {
  note.len = Math.max(1, len);
  state.pendingHold.delete(pointerId);
  renderNotes();
  rebuildPart();
  scheduleOneShot(note);
}

function createNoteOn(laneId) {
  Tone.start();
  if (!state.playing) {
    startPlaybackLoop();
  }
  if (state.recording && !state.recordEnabled) {
    return null;
  }
  const loopDur = getLoopDurationSeconds();
  const gridDur = getGridDurationSeconds();
  const relative = Tone.Transport.seconds % loopDur;
  const rawSlot = relative / gridDur;
  let slot = Math.round(rawSlot);
  const diff = relative - slot * gridDur;
  if (diff < -EARLY_WINDOW) {
    slot = Math.floor(rawSlot);
  } else if (diff > LATE_WINDOW) {
    slot = Math.ceil(rawSlot);
  }
  if (slot < 0) slot = 0;
  const totalSlots = state.session.bars * (state.session.grid / 4) * 4;
  slot = slot % totalSlots;
  const id = crypto.randomUUID();
  const note = {
    id,
    laneId,
    octave: state.visibleOctave,
    slot,
    len: 1,
    kind: state.tool,
    degree: DEGREE_SEQUENCE[state.chordIndex],
  };
  state.notes.push(note);
  return { note, createdAt: Tone.Transport.seconds };
}

function scheduleOneShot(note) {
  if (!state.playing) return;
  const gridDur = getGridDurationSeconds();
  const loopDur = getLoopDurationSeconds();
  const relative = Tone.Transport.seconds % loopDur;
  let offset = note.slot * gridDur - relative;
  if (offset < 0) {
    offset += loopDur;
  }
  const when = Tone.Transport.seconds + offset;
  Tone.Transport.scheduleOnce((time) => triggerAudio(note, time), when);
}

function triggerAudio(note, time) {
  const duration = note.len * getGridDurationSeconds();
  if (note.kind === 'note') {
    const midi = getMidiForLane(note.laneId, note.octave);
    synth.triggerAttackRelease(Tone.Frequency(midi, 'midi'), duration, time);
  } else {
    const chordMidis = getChordMidis(note.degree, note.octave);
    chordMidis.forEach((midi) => {
      synth.triggerAttackRelease(Tone.Frequency(midi, 'midi'), duration, time);
    });
    flashGhosts(note.id);
  }
  activateVisual(note.id, duration);
}

function activateVisual(id, duration) {
  const blocks = document.querySelectorAll(`.note-block[data-id="${id}"]`);
  blocks.forEach((block) => block.classList.add('active'));
  setTimeout(() => {
    blocks.forEach((block) => block.classList.remove('active'));
  }, duration * 1000);
}

function flashGhosts(parentId) {
  const ghosts = document.querySelectorAll(`.note-block.ghost[data-parent="${parentId}"]`);
  ghosts.forEach((ghost) => {
    ghost.classList.add('active');
    setTimeout(() => ghost.classList.remove('active'), 180);
  });
}

function getMidiForLane(laneId, octave) {
  const intervals = getScaleIntervals();
  const baseMidi = Tone.Frequency(`${state.session.root}${octave}`).toMidi();
  return baseMidi + intervals[laneId];
}

function getChordMidis(degree, octave) {
  const intervals = getScaleIntervals();
  const index = DEGREE_SEQUENCE.indexOf(degree);
  const base = Tone.Frequency(`${state.session.root}${octave}`).toMidi();
  const rootInterval = intervals[index];
  const thirdIndex = (index + 2) % intervals.length;
  const fifthIndex = (index + 4) % intervals.length;
  const thirdOffset = intervals[thirdIndex] + (index + 2 >= intervals.length ? 12 : 0);
  const fifthOffset = intervals[fifthIndex] + (index + 4 >= intervals.length ? 12 : 0);
  return [base + rootInterval, base + thirdOffset, base + fifthOffset];
}

function startPlaybackLoop(force = false) {
  if (state.playing && !force) return;
  state.playing = false;
  Tone.Transport.stop();
  Tone.Transport.cancel(0);
  if (state.part) {
    state.part.dispose();
    state.part = null;
  }
  cancelAnimationFrame(rafId);
  Tone.Transport.position = 0;
  Tone.Transport.bpm.value = state.session.bpm;
  Tone.Transport.loop = true;
  Tone.Transport.loopStart = 0;
  Tone.Transport.loopEnd = `${state.session.bars}m`;
  startMetronome();
  rebuildPart();
  Tone.Transport.start('+0.01');
  state.playing = true;
  updatePlayhead();
}

function rebuildPart() {
  if (state.part) {
    state.part.dispose();
    state.part = null;
  }
  const gridDur = getGridDurationSeconds();
  const orderedNotes = [...state.notes].sort((a, b) => a.slot - b.slot);
  const events = orderedNotes.map((note) => ({ time: note.slot * gridDur, note }));
  if (!events.length) return;
  const part = new Tone.Part((time, value) => {
    triggerAudio(value.note, time);
  }, events);
  part.loop = true;
  part.loopEnd = getLoopDurationSeconds();
  part.start(0);
  state.part = part;
}

function startMetronome() {
  if (metronomeEventId) {
    Tone.Transport.clear(metronomeEventId);
    metronomeEventId = null;
  }
  let beatIndex = 0;
  metronomeEventId = Tone.Transport.scheduleRepeat((time) => {
    const accent = beatIndex % 4 === 0;
    metronomeSynth.triggerAttackRelease(accent ? 'A5' : 'A4', '32n', time);
    beatIndex = (beatIndex + 1) % (state.session.bars * 4);
  }, '4n');
}

function stopPlayback() {
  Tone.Transport.stop();
  state.playing = false;
  if (state.part) {
    state.part.stop();
  }
  if (metronomeEventId) {
    Tone.Transport.clear(metronomeEventId);
    metronomeEventId = null;
  }
  cancelAnimationFrame(rafId);
}

function toggleRecording() {
  if (state.recording) {
    finishRecording();
  } else {
    beginRecording();
  }
}

async function beginRecording() {
  await Tone.start();
  state.recording = true;
  state.recordEnabled = false;
  recBtn.classList.add('rec-on');
  showCountdown(4);
  startPlaybackLoop(true);
  setTimeout(() => {
    hideCountdown();
    state.recordEnabled = true;
  }, Tone.Time('1m').toMilliseconds());
}

function finishRecording() {
  state.recording = false;
  state.recordEnabled = true;
  recBtn.classList.remove('rec-on');
  hideCountdown();
}

function showCountdown(beats) {
  hideCountdown();
  if (!countdownEl) {
    countdownEl = document.createElement('div');
    countdownEl.className = 'countdown';
    gridEl.appendChild(countdownEl);
  }
  countdownEl.textContent = `COUNT ${beats}`;
  let remaining = beats;
  const beatDur = Tone.Time('4n').toMilliseconds();
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
  }
  countdownIntervalId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      countdownEl.textContent = 'GO';
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
      setTimeout(hideCountdown, 400);
    } else {
      countdownEl.textContent = `COUNT ${remaining}`;
    }
  }, beatDur);
}

function hideCountdown() {
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
  if (countdownEl) {
    countdownEl.remove();
    countdownEl = null;
  }
}

function updatePlayhead() {
  if (!state.playing) return;
  const loopDur = getLoopDurationSeconds();
  if (!loopDur) return;
  const elapsed = Tone.Transport.seconds % loopDur;
  const progress = elapsed / loopDur;
  playheadEl.style.left = `${progress * 100}%`;
  rafId = requestAnimationFrame(updatePlayhead);
}

function toggleTool() {
  state.tool = state.tool === 'note' ? 'chord' : 'note';
  toolBtn.textContent = `Tool: ${state.tool === 'note' ? 'Note' : 'Chord'}`;
  renderNotes();
}

function toggleLengthMode() {
  state.lengthMode = state.lengthMode === 'tap' ? 'hold' : 'tap';
  lengthBtn.textContent = `Length: ${state.lengthMode === 'tap' ? 'Tap' : 'Hold'}`;
}

function cycleBars() {
  const options = [1, 2, 4];
  const idx = options.indexOf(state.session.bars);
  state.session.bars = options[(idx + 1) % options.length];
  barsBtn.textContent = `Bars: ${state.session.bars}`;
  if (state.playing) {
    startPlaybackLoop(true);
  }
  renderNotes();
  renderTicks();
}

function cycleDegree() {
  state.chordIndex = (state.chordIndex + 1) % DEGREE_SEQUENCE.length;
  degreeBtn.textContent = `Degree: ${DEGREE_SEQUENCE[state.chordIndex]}`;
}

function updateOctave(delta) {
  state.visibleOctave = Math.min(6, Math.max(2, state.visibleOctave + delta));
  octaveLabel.textContent = `Oct ${state.visibleOctave}`;
  renderLanes();
}

function handleDrawerToggle() {
  drawer.classList.toggle('open');
  drawerToggle.textContent = drawer.classList.contains('open') ? '▼ Session' : '▲ Session';
}

function initControls() {
  recBtn.addEventListener('click', toggleRecording);
  barsBtn.addEventListener('click', cycleBars);
  toolBtn.addEventListener('click', toggleTool);
  lengthBtn.addEventListener('click', toggleLengthMode);
  degreeBtn.addEventListener('click', cycleDegree);
  octaveUpBtn.addEventListener('click', () => updateOctave(1));
  octaveDownBtn.addEventListener('click', () => updateOctave(-1));
  drawerToggle.addEventListener('click', handleDrawerToggle);

  bpmInput.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    state.session.bpm = value;
    bpmValue.textContent = `${value}`;
    Tone.Transport.bpm.value = value;
  });

  scaleSelect.addEventListener('change', (event) => {
    state.session.scale = event.target.value;
    renderLanes();
    rebuildPart();
  });

  rootSelect.addEventListener('change', (event) => {
    state.session.root = event.target.value;
    renderLanes();
    rebuildPart();
  });

  gridSelect.addEventListener('change', (event) => {
    state.session.grid = Number(event.target.value);
    renderNotes();
    renderTicks();
    rebuildPart();
    if (state.playing) {
      startPlaybackLoop(true);
    }
  });

  masterVolumeInput.addEventListener('input', (event) => {
    masterVolume.volume.value = Number(event.target.value);
  });

  metronomeVolumeInput.addEventListener('input', (event) => {
    metronomeVolume.volume.value = Number(event.target.value);
  });
}

function init() {
  initControls();
  renderLanes();
  renderTicks();
  octaveLabel.textContent = `Oct ${state.visibleOctave}`;
}

init();

window.addEventListener('resize', () => {
  renderNotes();
  renderTicks();
});
