import {
  SCALE_INTERVALS,
  DRUM_LANES,
  DEFAULT_SYNTH_CONFIG,
  SYNTH_PRESETS,
  DEFAULT_SYNTH_PRESET,
  OSCILLATOR_TYPES,
  FILTER_TYPES,
  ENVELOPE_CONTROL_LIMITS,
  FILTER_CONTROL_LIMITS,
  EFFECT_CONTROL_LIMITS,
  EFFECT_LABELS,
  IMU_SERIES,
  IMU_AXES,
} from './config.js';
import {
  state,
  masterVolume,
  trackInstruments,
  trackParts,
  pointerInteractions,
  imuState,
} from './state.js';
import {
  melodyGridEl,
  melodyLanesEl,
  melodyTicksEl,
  melodyPlayheadEl,
  drumGridEl,
  drumLanesEl,
  drumTicksEl,
  drumPlayheadEl,
  playBtn,
  stopBtn,
  gridSelect,
  bpmInput,
  bpmValue,
  scaleSelect,
  rootSelect,
  masterVolumeInput,
  octaveLabel,
  octaveUpBtn,
  octaveDownBtn,
  presetSelect,
  chordModeBtn,
  trackTabsEl,
  addSynthTrackBtn,
  addDrumTrackBtn,
  synthPanelEl,
  drumPanelEl,
  synthTitleEl,
  drumTitleEl,
  synthStatusEl,
  oscillatorSelect,
  filterTypeSelect,
  filterInputs,
  filterValueEls,
  envelopeInputs,
  envelopeValueEls,
  customPresetNameInput,
  saveCustomPresetBtn,
  effectControlElements,
  imuValueEls,
  imuCubeEl,
  imuCombinedChartEl,
  imuResetOrientationBtn,
  imuStartTrackingBtn,
} from './ui/elements.js';
import {
  formatSeconds,
  formatLevel,
  formatFrequency,
  formatHertz,
  formatPercent,
  formatMilliseconds,
  formatImuValue,
} from './utils/formatters.js';

let pendingSynthSequenceRefresh = null;

const DRUM_SAMPLE_LONG_PRESS_MS = 500;
let drumSampleMenuEl = null;
let drumSampleMenuCleanup = null;

const imuPlotter = {
  canvas: imuCombinedChartEl,
  ctx: null,
  width: 0,
  height: 0,
  pixelRatio: 1,
  historyLimit: 120,
  labels: [],
  series: IMU_SERIES.map((item) => ({
    key: item.key,
    label: item.label,
    color: item.border,
    fill: item.background,
    axisId: item.axisId,
    data: [],
  })),
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

function closeDrumSampleMenu() {
  if (drumSampleMenuCleanup) {
    document.removeEventListener('pointerdown', drumSampleMenuCleanup, true);
    drumSampleMenuCleanup = null;
  }
  if (drumSampleMenuEl?.parentElement) {
    drumSampleMenuEl.remove();
  }
  drumSampleMenuEl = null;
}

function openDrumSampleMenu(track, laneId, position) {
  closeDrumSampleMenu();
  const lane = getDrumLaneById(laneId);
  if (!lane || !DRUM_SAMPLE_LIBRARY.length) return;
  const host = document.querySelector('.app') || document.body;
  const menu = document.createElement('div');
  menu.className = 'drum-sample-menu';
  const header = document.createElement('div');
  header.className = 'drum-sample-menu__header';
  header.textContent = 'Select Drum Sample';
  menu.appendChild(header);
  const currentSelection = getDrumSampleSelection(track, laneId);
  DRUM_SAMPLE_LIBRARY.forEach((sample) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'drum-sample-menu__option';
    option.textContent = sample.label;
    const sourceLane = getDrumLaneById(sample.sourceLaneId);
    if (sourceLane?.label) {
      option.title = sourceLane.label;
    }
    if (sample.id === currentSelection) {
      option.classList.add('selected');
    }
    option.addEventListener('click', () => {
      track.drumSamples[laneId] = sample.id;
      ensureInstrumentForTrack(track);
      renderDrumLanes(track);
      rebuildSequences();
      closeDrumSampleMenu();
    });
    menu.appendChild(option);
  });
  host.appendChild(menu);
  requestAnimationFrame(() => {
    const hostRect = host.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const maxLeft = hostRect.width - menuRect.width - 12;
    const maxTop = hostRect.height - menuRect.height - 12;
    const offsetLeft = Math.min(
      Math.max(position.x - hostRect.left - menuRect.width / 2, 12),
      Math.max(12, maxLeft),
    );
    const offsetTop = Math.min(
      Math.max(position.y - hostRect.top - menuRect.height / 2, 12),
      Math.max(12, maxTop),
    );
    menu.style.left = `${offsetLeft}px`;
    menu.style.top = `${offsetTop}px`;
  });
  drumSampleMenuCleanup = (event) => {
    if (!menu.contains(event.target)) {
      closeDrumSampleMenu();
    }
  };
  document.addEventListener('pointerdown', drumSampleMenuCleanup, true);
  drumSampleMenuEl = menu;
}

function getSynthTracks() {
  return state.tracks.filter((track) => track.type === 'synth');
}

const DRUM_ENGINE_DEFAULTS = {
  membrane: {
    pitchDecay: 0.008,
    octaves: 4,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 },
  },
  noise: {
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15 },
  },
  metal: {
    frequency: 400,
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    envelope: { attack: 0.001, decay: 0.1, release: 0.05 },
  },
};

function mergeDrumOptions(base = {}, overrides = {}) {
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(overrides || {})]);
  const result = {};
  keys.forEach((key) => {
    const baseValue = base ? base[key] : undefined;
    const overrideValue = overrides ? overrides[key] : undefined;
    if (overrideValue && typeof overrideValue === 'object' && !Array.isArray(overrideValue)) {
      result[key] = mergeDrumOptions(baseValue, overrideValue);
    } else if (overrideValue !== undefined) {
      result[key] = overrideValue;
    } else if (baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue)) {
      result[key] = mergeDrumOptions(baseValue, {});
    } else {
      result[key] = baseValue;
    }
  });
  return result;
}

const DRUM_SAMPLE_LIBRARY = (() => {
  const entries = [];
  DRUM_LANES.forEach((lane) => {
    (lane.samples || []).forEach((sample) => {
      if (!sample?.id) return;
      entries.push({
        id: sample.id,
        label: sample.label || 'Sample',
        engine: sample.engine || lane.engine,
        settings: sample.settings ? mergeDrumOptions({}, sample.settings) : undefined,
        note: sample.note ?? lane.note ?? lane.defaultNote,
        sourceLaneId: lane.id,
      });
    });
  });
  return entries.sort((a, b) => a.label.localeCompare(b.label));
})();

const DRUM_SAMPLE_MAP = new Map(DRUM_SAMPLE_LIBRARY.map((sample) => [sample.id, sample]));

function getDefaultDrumSampleId(lane) {
  if (lane?.samples?.length) {
    const [first] = lane.samples;
    if (first?.id) {
      return first.id;
    }
  }
  return DRUM_SAMPLE_LIBRARY[0]?.id || null;
}

function getDrumLaneById(id) {
  return DRUM_LANES.find((lane) => lane.id === id) || null;
}

function ensureDrumSamples(track) {
  if (!track || track.type !== 'drum') return;
  if (!track.drumSamples) {
    track.drumSamples = {};
  }
  DRUM_LANES.forEach((lane) => {
    const currentId = track.drumSamples[lane.id];
    if (currentId && DRUM_SAMPLE_MAP.has(currentId)) {
      return;
    }
    track.drumSamples[lane.id] = getDefaultDrumSampleId(lane);
  });
}

function getDrumSampleSelection(track, laneId) {
  ensureDrumSamples(track);
  const selection = track?.drumSamples?.[laneId];
  if (selection && DRUM_SAMPLE_MAP.has(selection)) {
    return selection;
  }
  const lane = getDrumLaneById(laneId);
  const fallback = getDefaultDrumSampleId(lane);
  if (fallback) {
    track.drumSamples[laneId] = fallback;
  }
  return fallback;
}

function getDrumSampleById(sampleId) {
  return DRUM_SAMPLE_MAP.get(sampleId) || null;
}

function getDrumSampleDisplayName(sampleId, lane) {
  const sample = getDrumSampleById(sampleId);
  if (sample?.label) {
    return sample.label;
  }
  return lane?.label || 'Drum';
}

function createDrumVoice(lane, sample) {
  const engine = sample?.engine || lane?.engine || 'membrane';
  const defaults = DRUM_ENGINE_DEFAULTS[engine] || {};
  const settings = mergeDrumOptions(defaults, sample?.settings || {});
  const output = {};
  if (engine === 'noise') {
    const node = new Tone.NoiseSynth(settings).connect(masterVolume);
    output.node = node;
    output.trigger = (duration, time) => node.triggerAttackRelease(duration, time);
    return output;
  }
  if (engine === 'metal') {
    const node = new Tone.MetalSynth(settings).connect(masterVolume);
    const note = sample?.note || lane?.note || lane?.defaultNote || 'C6';
    output.node = node;
    output.trigger = (duration, time) => node.triggerAttackRelease(note, duration, time);
    return output;
  }
  const node = new Tone.MembraneSynth(settings).connect(masterVolume);
  const note = sample?.note || lane?.note || lane?.defaultNote || 'C2';
  output.node = node;
  output.trigger = (duration, time) => node.triggerAttackRelease(note, duration, time);
  return output;
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
  const drumSamples = {};
  DRUM_LANES.forEach((lane) => {
    drumSamples[lane.id] = getDefaultDrumSampleId(lane);
  });
  return {
    id: crypto.randomUUID(),
    type: 'drum',
    name,
    notes: [],
    drumSamples,
  };
}

function disposeInstrument(trackId) {
  const instrument = trackInstruments.get(trackId);
  if (!instrument) return;
  if (instrument.type === 'synth') {
    if (instrument.disposables?.length) {
      instrument.disposables.forEach((node) => {
        if (typeof node.dispose === 'function') {
          node.dispose();
        }
      });
    } else if (instrument.synth?.dispose) {
      instrument.synth.dispose();
    }
  } else if (instrument.type === 'drum') {
    Object.values(instrument.nodes).forEach((voice) => {
      if (voice?.node && typeof voice.node.dispose === 'function') {
        voice.node.dispose();
      }
    });
  }
  trackInstruments.delete(trackId);
}

function createSynthInstrument(config) {
  const normalized = cloneSynthConfig(config);

  const synth = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 16,
    oscillator: { ...normalized.oscillator },
    envelope: { ...normalized.envelope },
  });

  const filter = new Tone.Filter({
    type: normalized.filter?.type || DEFAULT_SYNTH_CONFIG.filter.type,
    frequency: normalized.filter?.frequency ?? DEFAULT_SYNTH_CONFIG.filter.frequency,
    Q: normalized.filter?.q ?? DEFAULT_SYNTH_CONFIG.filter.q,
  });

  const chorusSettings = normalized.effects?.chorus || DEFAULT_SYNTH_CONFIG.effects.chorus;
  const chorus = new Tone.Chorus({
    frequency: chorusSettings.rate,
    depth: chorusSettings.depth,
    delayTime: 2.5,
    spread: 180,
    wet: chorusSettings.enabled ? chorusSettings.mix : 0,
  }).start();

  const delaySettings = normalized.effects?.delay || DEFAULT_SYNTH_CONFIG.effects.delay;
  const delay = new Tone.FeedbackDelay({
    delayTime: delaySettings.time,
    feedback: delaySettings.feedback,
    wet: delaySettings.enabled ? delaySettings.mix : 0,
  });

  const reverbSettings = normalized.effects?.reverb || DEFAULT_SYNTH_CONFIG.effects.reverb;
  const reverb = new Tone.Reverb({
    decay: reverbSettings.decay,
    preDelay: reverbSettings.preDelay,
    wet: reverbSettings.enabled ? reverbSettings.mix : 0,
  });

  const output = new Tone.Gain(1);

  synth.connect(filter);
  filter.connect(chorus);
  chorus.connect(delay);
  delay.connect(reverb);
  reverb.connect(output);
  output.connect(masterVolume);

  return {
    synth,
    filter,
    effects: { chorus, delay, reverb },
    output,
    disposables: [synth, filter, chorus, delay, reverb, output],
  };
}

function applySynthConfigToInstrument(instrument, config) {
  if (!instrument || instrument.type !== 'synth') return;
  const normalized = cloneSynthConfig(config);

  instrument.synth.set({
    oscillator: { ...normalized.oscillator },
    envelope: { ...normalized.envelope },
  });

  if (instrument.filter) {
    instrument.filter.set({
      type: normalized.filter?.type || DEFAULT_SYNTH_CONFIG.filter.type,
      frequency: normalized.filter?.frequency ?? DEFAULT_SYNTH_CONFIG.filter.frequency,
      Q: normalized.filter?.q ?? DEFAULT_SYNTH_CONFIG.filter.q,
    });
  }

  const chorusConfig = normalized.effects?.chorus || DEFAULT_SYNTH_CONFIG.effects.chorus;
  const chorus = instrument.effects?.chorus;
  if (chorus) {
    chorus.frequency.value = chorusConfig.rate;
    chorus.depth = chorusConfig.depth;
    chorus.wet.value = chorusConfig.enabled ? chorusConfig.mix : 0;
  }

  const delayConfig = normalized.effects?.delay || DEFAULT_SYNTH_CONFIG.effects.delay;
  const delay = instrument.effects?.delay;
  if (delay) {
    delay.delayTime.value = delayConfig.time;
    delay.feedback.value = delayConfig.feedback;
    delay.wet.value = delayConfig.enabled ? delayConfig.mix : 0;
  }

  const reverbConfig = normalized.effects?.reverb || DEFAULT_SYNTH_CONFIG.effects.reverb;
  const reverb = instrument.effects?.reverb;
  if (reverb) {
    reverb.decay = reverbConfig.decay;
    reverb.preDelay = reverbConfig.preDelay;
    reverb.wet.value = reverbConfig.enabled ? reverbConfig.mix : 0;
  }
}

function ensureInstrumentForTrack(track) {
  if (track.type === 'synth') {
    const config = track.synthConfig || cloneSynthConfig(getPresetConfigById(track.presetId));
    track.synthConfig = cloneSynthConfig(config);
    const existing = trackInstruments.get(track.id);
    if (existing?.type === 'synth') {
      applySynthConfigToInstrument(existing, track.synthConfig);
    } else {
      disposeInstrument(track.id);
      const instrument = createSynthInstrument(track.synthConfig);
      trackInstruments.set(track.id, { type: 'synth', ...instrument });
    }
  } else if (track.type === 'drum') {
    ensureDrumSamples(track);
    disposeInstrument(track.id);
    const kit = {};
    DRUM_LANES.forEach((lane) => {
      const selectedSampleId = getDrumSampleSelection(track, lane.id);
      const sample = getDrumSampleById(selectedSampleId);
      kit[lane.id] = createDrumVoice(lane, sample);
    });
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
    closeDrumSampleMenu();
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

function scheduleSynthSequenceRefresh() {
  if (pendingSynthSequenceRefresh) {
    clearTimeout(pendingSynthSequenceRefresh);
  }
  pendingSynthSequenceRefresh = setTimeout(() => {
    pendingSynthSequenceRefresh = null;
    rebuildSequences();
  }, 0);
}

function commitSynthConfigUpdate(track, updater) {
  if (!track || track.type !== 'synth') return;
  if (!track.synthConfig) {
    track.synthConfig = cloneSynthConfig(getPresetConfigById(track.presetId));
  }
  const shouldApply = updater(track.synthConfig);
  if (shouldApply === false) {
    return;
  }
  const matchedPreset = findMatchingPresetId(track.synthConfig);
  if (matchedPreset) {
    track.presetId = matchedPreset;
    track.sourcePresetId = matchedPreset;
  } else {
    track.presetId = null;
  }
  ensureInstrumentForTrack(track);
  updateSynthEditorControls(track);
  scheduleSynthSequenceRefresh();
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
  closeDrumSampleMenu();
  ensureDrumSamples(track);
  drumTitleEl.textContent = track.name;
  renderDrumLanes(track);
  renderDrumTicks();
}

function renderDrumLanes(track) {
  ensureDrumSamples(track);
  drumLanesEl.innerHTML = '';
  drumLanesEl.style.gridTemplateRows = `repeat(${DRUM_LANES.length}, 1fr)`;
  DRUM_LANES.forEach((lane) => {
    const laneEl = document.createElement('div');
    laneEl.className = 'lane label-drums';
    laneEl.dataset.lane = lane.id;
    const selectionId = getDrumSampleSelection(track, lane.id);
    const label = document.createElement('strong');
    label.textContent = getDrumSampleDisplayName(selectionId, lane);
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
    const laneInfo = DRUM_LANES[laneIndex];
    const selectionId = getDrumSampleSelection(track, laneInfo.id);
    const sampleName = getDrumSampleDisplayName(selectionId, laneInfo);
    block.textContent = '';
    if (sampleName) {
      block.setAttribute('aria-label', sampleName);
    } else {
      block.removeAttribute('aria-label');
    }
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

function clearPendingDrumTimer(interaction) {
  if (interaction?.timer) {
    clearTimeout(interaction.timer);
    interaction.timer = null;
  }
}

function activateDrumSwipeInteraction(interaction) {
  const track = getTrackById(interaction.trackId);
  if (!track) return null;
  clearPendingDrumTimer(interaction);
  interaction.type = 'drum-swipe';
  const { lane, startSlot } = interaction;
  const existing = findDrumNoteAtSlot(track, lane, startSlot);
  if (interaction.mode === 'erase') {
    if (existing) {
      const existingIndex = track.notes.indexOf(existing);
      if (existingIndex >= 0) {
        const [removed] = track.notes.splice(existingIndex, 1);
        interaction.deleted.push(removed);
      }
    }
  } else if (!existing) {
    const note = {
      id: crypto.randomUUID(),
      trackId: track.id,
      lane,
      slot: startSlot,
      len: 1,
    };
    track.notes.push(note);
    interaction.created.push(note);
  }
  renderDrumNotes(track);
  return interaction;
}

function applyDrumTap(interaction) {
  const track = getTrackById(interaction.trackId);
  if (!track) return;
  const { lane, startSlot, mode } = interaction;
  const existing = findDrumNoteAtSlot(track, lane, startSlot);
  let changed = false;
  if (mode === 'erase') {
    if (existing) {
      const existingIndex = track.notes.indexOf(existing);
      if (existingIndex >= 0) {
        track.notes.splice(existingIndex, 1);
        changed = true;
      }
    }
  } else if (!existing) {
    const note = {
      id: crypto.randomUUID(),
      trackId: track.id,
      lane,
      slot: startSlot,
      len: 1,
    };
    track.notes.push(note);
    changed = true;
  }
  if (changed) {
    renderDrumNotes(track);
    rebuildSequences();
  }
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
  const startSlot = Math.min(totalSlots - 1, getBoundaryFromEvent(event, drumGridEl));
  const existing = findDrumNoteAtSlot(track, lane, startSlot);
  event.currentTarget.setPointerCapture(pointerId);
  const interaction = {
    type: 'pending-drum',
    mode: existing ? 'erase' : 'paint',
    lane,
    trackId: track.id,
    startSlot,
    pointerId,
    touchedSlots: new Set([startSlot]),
    created: [],
    deleted: [],
    timer: null,
    longPress: false,
    position: { x: event.clientX, y: event.clientY },
  };
  interaction.timer = window.setTimeout(() => {
    if (pointerInteractions.get(pointerId) !== interaction) return;
    interaction.timer = null;
    interaction.longPress = true;
    interaction.type = 'drum-long-press';
    const currentTrack = getTrackById(interaction.trackId);
    if (currentTrack) {
      openDrumSampleMenu(currentTrack, lane, interaction.position);
    }
  }, DRUM_SAMPLE_LONG_PRESS_MS);
  pointerInteractions.set(pointerId, interaction);
}

function handleDrumLanePointerMove(event) {
  const pointerId = event.pointerId;
  let interaction = pointerInteractions.get(pointerId);
  if (!interaction) return;
  const totalSlots = getTotalSlots();
  if (!totalSlots) return;
  const slot = Math.min(totalSlots - 1, Math.max(0, getBoundaryFromEvent(event, drumGridEl)));
  interaction.position = { x: event.clientX, y: event.clientY };
  if (interaction.type === 'pending-drum') {
    if (interaction.longPress) return;
    if (slot === interaction.startSlot) return;
    interaction = activateDrumSwipeInteraction(interaction) || interaction;
    if (!interaction || interaction.type !== 'drum-swipe') return;
  }
  if (interaction.type !== 'drum-swipe') return;
  const track = getTrackById(interaction.trackId);
  if (!track) return;
  if (interaction.touchedSlots.has(slot)) return;
  interaction.touchedSlots.add(slot);
  const existing = findDrumNoteAtSlot(track, interaction.lane, slot);
  if (interaction.mode === 'paint') {
    if (!existing) {
      const note = {
        id: crypto.randomUUID(),
        trackId: track.id,
        lane: interaction.lane,
        slot,
        len: 1,
      };
      track.notes.push(note);
      interaction.created.push(note);
      renderDrumNotes(track);
    }
  } else if (existing) {
    const existingIndex = track.notes.indexOf(existing);
    if (existingIndex >= 0) {
      const [removed] = track.notes.splice(existingIndex, 1);
      interaction.deleted.push(removed);
      renderDrumNotes(track);
    }
  }
}

function handleDrumLanePointerUp(event) {
  const pointerId = event.pointerId;
  const interaction = pointerInteractions.get(pointerId);
  if (!interaction) {
    finalizeLaneInteraction(event);
    return;
  }
  clearPendingDrumTimer(interaction);
  if (interaction.type === 'pending-drum') {
    if (!interaction.longPress) {
      applyDrumTap(interaction);
    }
    pointerInteractions.delete(pointerId);
    if (event.currentTarget.hasPointerCapture(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId);
    }
    return;
  }
  if (interaction.type === 'drum-long-press') {
    pointerInteractions.delete(pointerId);
    if (event.currentTarget.hasPointerCapture(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId);
    }
    return;
  }
  finalizeLaneInteraction(event);
}

function handleDrumLanePointerCancel(event) {
  const pointerId = event.pointerId;
  const interaction = pointerInteractions.get(pointerId);
  if (!interaction) {
    finalizeLaneInteraction(event, true);
    return;
  }
  clearPendingDrumTimer(interaction);
  if (interaction.type === 'pending-drum' || interaction.type === 'drum-long-press') {
    pointerInteractions.delete(pointerId);
    if (event.currentTarget.hasPointerCapture(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId);
    }
    return;
  }
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
    if (interaction.type === 'melody-create') {
      if (cancel) {
        interaction.notes.forEach((note) => deleteMelodyNote(note.id, track.id));
      } else {
        renderSynthNotes(track);
        rebuildSequences();
      }
    } else if (interaction.type === 'drum-swipe') {
      if (cancel) {
        if (interaction.mode === 'paint' && interaction.created.length) {
          const createdIds = new Set(interaction.created.map((note) => note.id));
          track.notes = track.notes.filter((note) => !createdIds.has(note.id));
        } else if (interaction.mode === 'erase' && interaction.deleted.length) {
          track.notes.push(...interaction.deleted);
        }
        renderDrumNotes(track);
      } else {
        renderDrumNotes(track);
        rebuildSequences();
      }
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
  instrument.synth.triggerAttackRelease(
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
  const voice = instrument.nodes[note.lane];
  if (!voice) return;
  if (typeof voice.trigger === 'function') {
    voice.trigger(duration, time);
  } else if (voice.node?.triggerAttackRelease) {
    voice.node.triggerAttackRelease(duration, time);
  }
  flashNote(note.id);
}

function rebuildSequences() {
  if (pendingSynthSequenceRefresh) {
    clearTimeout(pendingSynthSequenceRefresh);
    pendingSynthSequenceRefresh = null;
  }
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

function setImuValue(key, text) {
  const elements = imuValueEls[key];
  if (!elements) return;
  elements.forEach((el) => {
    el.textContent = text;
  });
}

function updateImuStatus(message) {
  if (!message) return;
  console.info(`[IMU] ${message}`);
}

function normalizeHeadingValue(angle) {
  if (!Number.isFinite(angle)) return null;
  const normalized = ((angle % 360) + 360) % 360;
  return normalized === 360 ? 0 : normalized;
}

function normalizeRelativeAngle(angle) {
  if (!Number.isFinite(angle)) return null;
  const normalized = ((angle + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 ? 180 : normalized;
}

function hasOrientationMeasurement(raw = {}) {
  return (
    Number.isFinite(raw.alpha) ||
    Number.isFinite(raw.beta) ||
    Number.isFinite(raw.gamma)
  );
}

function deriveOrientationWithBaseline(raw = {}) {
  const baseline = imuState.orientationBaseline || {};
  const alphaRaw = Number.isFinite(raw.alpha) ? raw.alpha : null;
  const betaRaw = Number.isFinite(raw.beta) ? raw.beta : null;
  const gammaRaw = Number.isFinite(raw.gamma) ? raw.gamma : null;

  const alpha =
    alphaRaw == null
      ? null
      : Number.isFinite(baseline.alpha)
      ? normalizeRelativeAngle(alphaRaw - baseline.alpha)
      : normalizeHeadingValue(alphaRaw);

  const beta =
    betaRaw == null
      ? null
      : Number.isFinite(baseline.beta)
      ? normalizeRelativeAngle(betaRaw - baseline.beta)
      : normalizeRelativeAngle(betaRaw);

  const gamma =
    gammaRaw == null
      ? null
      : Number.isFinite(baseline.gamma)
      ? normalizeRelativeAngle(gammaRaw - baseline.gamma)
      : normalizeRelativeAngle(gammaRaw);

  return {
    alpha,
    beta,
    gamma,
    absolute: Boolean(raw.absolute),
    headingSource: raw.headingSource || null,
  };
}

function setOrientationBaselineFromCurrent() {
  const raw = imuState.data.orientationRaw;
  if (!raw || !hasOrientationMeasurement(raw)) {
    return false;
  }

  imuState.orientationBaseline = {
    alpha: Number.isFinite(raw.alpha) ? raw.alpha : null,
    beta: Number.isFinite(raw.beta) ? raw.beta : null,
    gamma: Number.isFinite(raw.gamma) ? raw.gamma : null,
  };

  imuState.data.orientation = deriveOrientationWithBaseline(raw);
  renderImuData();
  updateImuStatus('Orientation baseline reset');
  return true;
}

function updateImuOrientationCube(orientation = {}) {
  if (!imuCubeEl) return;
  const alpha = Number.isFinite(orientation.alpha) ? orientation.alpha : 0;
  const beta = Number.isFinite(orientation.beta) ? orientation.beta : 0;
  const gamma = Number.isFinite(orientation.gamma) ? orientation.gamma : 0;
  imuCubeEl.style.transform = `rotateZ(${alpha}deg) rotateX(${beta}deg) rotateY(${gamma}deg)`;
}

function getImuAxisById(id) {
  return IMU_AXES.find((axis) => axis.id === id) || null;
}

function mapImuValueToY(value, axis, top, height) {
  if (!axis || height <= 0) {
    return top + height / 2;
  }
  const min = axis.min;
  const max = axis.max;
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return top + height / 2;
  }
  if (min === max) {
    return top + height / 2;
  }
  const clamped = Math.max(min, Math.min(max, value));
  const ratio = (clamped - min) / (max - min);
  return top + height - ratio * height;
}

function ensureImuPlotter() {
  if (!imuPlotter.canvas) {
    return false;
  }
  if (!imuPlotter.ctx) {
    const context = imuPlotter.canvas.getContext('2d');
    if (!context) {
      return false;
    }
    imuPlotter.ctx = context;
  }
  if (!imuPlotter.series || imuPlotter.series.length !== IMU_SERIES.length) {
    imuPlotter.series = IMU_SERIES.map((item) => ({
      key: item.key,
      label: item.label,
      color: item.border,
      fill: item.background,
      axisId: item.axisId,
      data: [],
    }));
  }
  return true;
}

function resizeImuPlotterCanvas() {
  if (!ensureImuPlotter()) return;
  const { canvas, ctx } = imuPlotter;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }
  const ratio = window.devicePixelRatio || 1;
  imuPlotter.pixelRatio = ratio;
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  imuPlotter.width = rect.width;
  imuPlotter.height = rect.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(ratio, ratio);
}

function clearImuPlotterData() {
  imuPlotter.labels.length = 0;
  if (imuPlotter.series) {
    imuPlotter.series.forEach((series) => {
      series.data.length = 0;
    });
  }
}

function drawImuPlotter() {
  if (!ensureImuPlotter()) return;
  if (!imuPlotter.width || !imuPlotter.height) {
    resizeImuPlotterCanvas();
    if (!imuPlotter.width || !imuPlotter.height) {
      return;
    }
  }

  const { ctx, width, height } = imuPlotter;
  ctx.clearRect(0, 0, width, height);

  const isCompact = width < 720;
  const isExtraCompact = width < 500;

  const labelColumnX = isExtraCompact ? 14 : isCompact ? 20 : 28;
  const labelColumnWidth = isExtraCompact
    ? Math.max(72, width * 0.28)
    : isCompact
      ? Math.max(84, width * 0.26)
      : 122;
  let leftPadding = Math.min(width * 0.42, labelColumnX + labelColumnWidth);
  const rightPadding = isExtraCompact ? Math.max(18, width * 0.05) : isCompact ? Math.max(24, width * 0.05) : 36;
  const topPadding = isExtraCompact ? 20 : isCompact ? 24 : 28;
  const bottomPadding = isExtraCompact ? 30 : isCompact ? 34 : 36;
  const axisGap = isExtraCompact ? 24 : isCompact ? 28 : 32;
  const axes = IMU_AXES;
  const axisCount = axes.length;
  const availableHeight = Math.max(
    0,
    height - topPadding - bottomPadding - axisGap * Math.max(0, axisCount - 1),
  );
  const axisHeight = axisCount > 0 ? availableHeight / axisCount : 0;
  const desiredPlotRatio = isExtraCompact ? 0.62 : isCompact ? 0.58 : 0.54;
  const minPlotWidth = Math.min(width * desiredPlotRatio, width - rightPadding - (labelColumnX + 48));
  if (minPlotWidth > 0) {
    const maxLeftPadding = Math.max(labelColumnX + 48, width - rightPadding - minPlotWidth);
    leftPadding = Math.min(leftPadding, maxLeftPadding);
  }
  leftPadding = Math.max(leftPadding, labelColumnX + 60);
  const dataLength = imuPlotter.labels.length;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const axisLabelFontSize = isExtraCompact ? 13 : isCompact ? 14 : 16;
  const axisValueFontSize = isExtraCompact ? 11 : isCompact ? 12 : 13;
  const axisValueOffset = axisLabelFontSize + 6;
  ctx.font = `600 ${axisLabelFontSize}px 'Manrope', sans-serif`;
  const maxLabelWidth = Math.max(
    0,
    ...axes.map((axis) => ctx.measureText(axis.label).width),
  );
  ctx.font = `500 ${axisValueFontSize}px 'Manrope', sans-serif`;
  const maxAxisValueWidth = Math.max(
    0,
    ...axes.flatMap((axis) => [
      ctx.measureText(`${axis.max}`).width,
      ctx.measureText(`${axis.min}`).width,
    ]),
  );
  const requiredLabelArea = Math.max(maxLabelWidth, maxAxisValueWidth) + 28;
  if (leftPadding < labelColumnX + requiredLabelArea) {
    leftPadding = labelColumnX + requiredLabelArea;
    if (minPlotWidth > 0) {
      const maxLeftPadding = Math.max(labelColumnX + 48, width - rightPadding - minPlotWidth);
      leftPadding = Math.min(leftPadding, maxLeftPadding);
    }
  }
  const plotWidth = Math.max(0, width - leftPadding - rightPadding);
  const seriesStrokeWidth = isExtraCompact ? 3 : isCompact ? 2.6 : 2.2;
  const pointRadius = isExtraCompact ? 5 : isCompact ? 4.5 : 4;

  axes.forEach((axis, index) => {
    const top = topPadding + index * (axisHeight + axisGap);
    const bottom = top + axisHeight;
    if (axisHeight <= 0) {
      return;
    }

    if (axis.background) {
      ctx.fillStyle = axis.background;
      ctx.fillRect(leftPadding - 16, top, plotWidth + 32, axisHeight);
    }

    // Grid lines
    if (axis.gridColor) {
      ctx.strokeStyle = axis.gridColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      const divisions = 4;
      for (let i = 1; i < divisions; i += 1) {
        const y = top + (axisHeight / divisions) * i;
        ctx.beginPath();
        ctx.moveTo(leftPadding, y);
        ctx.lineTo(leftPadding + plotWidth, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    if (
      axis.zero != null &&
      Number.isFinite(axis.zero) &&
      axis.zero >= axis.min &&
      axis.zero <= axis.max
    ) {
      const zeroY = mapImuValueToY(axis.zero, axis, top, axisHeight);
      ctx.strokeStyle = axis.zeroLine || 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(leftPadding, zeroY);
      ctx.lineTo(leftPadding + plotWidth, zeroY);
      ctx.stroke();
    }

    ctx.font = `600 ${axisLabelFontSize}px 'Manrope', sans-serif`;
    ctx.fillStyle = axis.labelColor || 'rgba(226, 232, 240, 0.85)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(axis.label, labelColumnX, top);

    ctx.font = `500 ${axisValueFontSize}px 'Manrope', sans-serif`;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
    ctx.textBaseline = 'top';
    ctx.fillText(`${axis.max}`, labelColumnX, top + axisValueOffset);
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${axis.min}`, labelColumnX, bottom - 4);

    const axisSeries = imuPlotter.series.filter((series) => series.axisId === axis.id);

    axisSeries.forEach((series) => {
      if (!dataLength) return;
      ctx.strokeStyle = series.color;
      ctx.lineWidth = seriesStrokeWidth;
      ctx.beginPath();
      let hasPoint = false;
      for (let i = 0; i < dataLength; i += 1) {
        const value = series.data[i];
        if (!Number.isFinite(value)) {
          hasPoint = false;
          continue;
        }
        const x =
          dataLength === 1
            ? leftPadding
            : leftPadding + (plotWidth * i) / (dataLength - 1);
        const y = mapImuValueToY(value, axis, top, axisHeight);
        if (!hasPoint) {
          ctx.moveTo(x, y);
          hasPoint = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      if (hasPoint) {
        ctx.stroke();
      }

      const lastValue = series.data[dataLength - 1];
      if (Number.isFinite(lastValue)) {
        const lastX =
          dataLength <= 1
            ? leftPadding
            : leftPadding + (plotWidth * (dataLength - 1)) / (dataLength - 1);
        const lastY = mapImuValueToY(lastValue, axis, top, axisHeight);
        ctx.fillStyle = series.color;
        ctx.beginPath();
        ctx.arc(lastX, lastY, pointRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    if (index === axisCount - 1 && dataLength) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(imuPlotter.labels[0], leftPadding, bottom + 6);
      if (dataLength > 2) {
        ctx.textAlign = 'center';
        const midIndex = Math.floor((dataLength - 1) / 2);
        const midX =
          dataLength === 1
            ? leftPadding
            : leftPadding + (plotWidth * midIndex) / (dataLength - 1);
        ctx.fillText(imuPlotter.labels[midIndex], midX, bottom + 6);
      }
      ctx.textAlign = 'right';
      ctx.fillText(
        imuPlotter.labels[dataLength - 1],
        leftPadding + plotWidth,
        bottom + 6,
      );
      ctx.textAlign = 'left';
    }
  });

  ctx.restore();
}

function setupImuCharts() {
  if (!ensureImuPlotter()) {
    return;
  }
  resizeImuPlotterCanvas();
  drawImuPlotter();
}

function resetImuCharts() {
  clearImuPlotterData();
  drawImuPlotter();
}

function resetImuVisuals() {
  resetImuCharts();
  updateImuOrientationCube({ alpha: 0, beta: 0, gamma: 0 });
}

function setupImuVisuals() {
  setupImuCharts();
  resetImuVisuals();
}

function pushSampleToPlotter(sample, label) {
  if (!ensureImuPlotter()) return;
  imuPlotter.labels.push(label);
  if (imuPlotter.labels.length > imuPlotter.historyLimit) {
    imuPlotter.labels.shift();
  }
  imuPlotter.series.forEach((series) => {
    const rawValue = sample ? sample[series.key] : null;
    const value = Number.isFinite(rawValue) ? rawValue : null;
    series.data.push(value);
    if (series.data.length > imuPlotter.historyLimit) {
      series.data.shift();
    }
  });
  drawImuPlotter();
}

function updateImuChartsData({ acceleration, rotation, orientation }) {
  if (!ensureImuPlotter()) return;
  const label = `${imuState.samples}`;
  const sample = {
    heading:
      orientation && Number.isFinite(orientation.alpha) ? orientation.alpha : null,
    tilt: orientation && Number.isFinite(orientation.beta) ? orientation.beta : null,
    roll: orientation && Number.isFinite(orientation.gamma) ? orientation.gamma : null,
    accX: acceleration && Number.isFinite(acceleration.x) ? acceleration.x : null,
    accY: acceleration && Number.isFinite(acceleration.y) ? acceleration.y : null,
    accZ: acceleration && Number.isFinite(acceleration.z) ? acceleration.z : null,
    rotAlpha: rotation && Number.isFinite(rotation.alpha) ? rotation.alpha : null,
    rotBeta: rotation && Number.isFinite(rotation.beta) ? rotation.beta : null,
    rotGamma: rotation && Number.isFinite(rotation.gamma) ? rotation.gamma : null,
  };
  pushSampleToPlotter(sample, label);
}

function renderImuData() {
  const { acc, accG, rotation, orientation } = imuState.data;
  const avgInterval = imuState.intervalCount
    ? imuState.intervalSum / imuState.intervalCount
    : null;

  updateImuOrientationCube(orientation);

  setImuValue('acc-x', formatImuValue(acc.x));
  setImuValue('acc-y', formatImuValue(acc.y));
  setImuValue('acc-z', formatImuValue(acc.z));
  setImuValue('acc-mag', formatImuValue(acc.magnitude));
  setImuValue('acc-peak', formatImuValue(imuState.stats.accelerationPeak));

  setImuValue('accg-x', formatImuValue(accG.x));
  setImuValue('accg-y', formatImuValue(accG.y));
  setImuValue('accg-z', formatImuValue(accG.z));
  setImuValue('accg-mag', formatImuValue(accG.magnitude));

  setImuValue('rot-alpha', formatImuValue(rotation.alpha, 1));
  setImuValue('rot-beta', formatImuValue(rotation.beta, 1));
  setImuValue('rot-gamma', formatImuValue(rotation.gamma, 1));
  setImuValue('rot-mag', formatImuValue(rotation.magnitude, 1));
  setImuValue('rot-peak', formatImuValue(imuState.stats.rotationPeak, 1));

  setImuValue('ori-alpha', formatImuValue(orientation.alpha, 1, '°'));
  setImuValue('ori-beta', formatImuValue(orientation.beta, 1, '°'));
  setImuValue('ori-gamma', formatImuValue(orientation.gamma, 1, '°'));
  const orientationAvailable =
    orientation.alpha != null || orientation.beta != null || orientation.gamma != null;
  if (orientationAvailable) {
    const absoluteState = orientation.absolute ? 'Yes' : 'No';
    const absoluteLabel = orientation.headingSource
      ? `${absoluteState} (${orientation.headingSource})`
      : absoluteState;
    setImuValue('ori-absolute', absoluteLabel);
  } else {
    setImuValue('ori-absolute', '--');
  }

  setImuValue('samples', `${imuState.samples}`);
  if (avgInterval == null) {
    setImuValue('interval', '--');
  } else {
    setImuValue('interval', `${avgInterval.toFixed(0)} ms`);
  }
  if (imuState.data.lastTimestamp) {
    const date = new Date(imuState.data.lastTimestamp);
    setImuValue(
      'timestamp',
      date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    );
  } else {
    setImuValue('timestamp', '--');
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
  let orientationGranted = true;
  if (orientationSupported) {
    orientationGranted = await requestSensorPermission(window.DeviceOrientationEvent, [
      'magnetometer',
    ]);
    if (!orientationGranted) {
      updateImuStatus('Orientation sensor permission denied; continuing with motion data only');
    }
  }

  imuState.active = true;
  imuState.samples = 0;
  imuState.stats.accelerationPeak = 0;
  imuState.stats.rotationPeak = 0;
  imuState.intervalSum = 0;
  imuState.intervalCount = 0;
  imuState.orientationBaseline = { alpha: null, beta: null, gamma: null };
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
  imuState.data.orientationRaw = {
    alpha: null,
    beta: null,
    gamma: null,
    absolute: false,
    headingSource: null,
  };
  imuState.data.interval = null;
  imuState.data.lastTimestamp = null;
  if (imuResetOrientationBtn) {
    imuResetOrientationBtn.disabled = true;
  }
  resetImuVisuals();
  updateImuStatus('Waiting for motion data…');
  renderImuData();

  window.addEventListener('devicemotion', handleDeviceMotion);
  if (orientationSupported) {
    window.addEventListener('deviceorientation', handleDeviceOrientation);
    window.addEventListener('deviceorientationabsolute', handleDeviceOrientation);
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
    orientation: imuState.data.orientation,
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
  const rawOrientation = {
    alpha,
    beta,
    gamma,
    absolute: resolveOrientationAbsolute(event),
    headingSource: typeof event.webkitCompassHeading === 'number' ? 'compass' : null,
  };
  imuState.data.orientationRaw = rawOrientation;
  imuState.data.orientation = deriveOrientationWithBaseline(rawOrientation);
  if (imuResetOrientationBtn) {
    imuResetOrientationBtn.disabled = !hasOrientationMeasurement(rawOrientation);
  }
  renderImuData();
}

async function initializeImuPanel() {
  if (!imuCombinedChartEl && !imuCubeEl) return;
  setupImuVisuals();

  if (imuResetOrientationBtn) {
    imuResetOrientationBtn.disabled = true;
    imuResetOrientationBtn.addEventListener('click', () => {
      if (!setOrientationBaselineFromCurrent()) {
        updateImuStatus('Orientation data unavailable for baseline reset');
      }
    });
  }

  const supported = 'DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window;
  if (!supported) {
    if (imuResetOrientationBtn) {
      imuResetOrientationBtn.disabled = true;
    }
    if (imuStartTrackingBtn) {
      imuStartTrackingBtn.hidden = true;
      imuStartTrackingBtn.disabled = true;
    }
    updateImuStatus('IMU sensors are not available in this browser');
    return;
  }

  renderImuData();

  const motionSupported = 'DeviceMotionEvent' in window;
  const orientationSupported = 'DeviceOrientationEvent' in window;
  const requiresUserGesture =
    (motionSupported &&
      window.DeviceMotionEvent &&
      typeof window.DeviceMotionEvent.requestPermission === 'function') ||
    (orientationSupported &&
      window.DeviceOrientationEvent &&
      typeof window.DeviceOrientationEvent.requestPermission === 'function');

  const showStartButton = () => {
    if (!imuStartTrackingBtn) return;
    imuStartTrackingBtn.hidden = false;
    imuStartTrackingBtn.disabled = false;
  };

  const hideStartButton = () => {
    if (!imuStartTrackingBtn) return;
    imuStartTrackingBtn.hidden = true;
  };

  const attemptImuStart = async (triggeredByUser = false) => {
    if (imuState.active) {
      hideStartButton();
      return;
    }
    if (imuStartTrackingBtn && triggeredByUser) {
      imuStartTrackingBtn.disabled = true;
    }
    try {
      await startImuTracking();
    } catch (error) {
      console.error('IMU start attempt failed', error);
    }
    if (imuState.active) {
      hideStartButton();
    } else if (imuStartTrackingBtn) {
      imuStartTrackingBtn.disabled = false;
      showStartButton();
    }
  };

  if (imuStartTrackingBtn) {
    imuStartTrackingBtn.addEventListener('click', () => {
      attemptImuStart(true);
    });
  }

  if (requiresUserGesture) {
    showStartButton();
    updateImuStatus('Tap Start Tracking to enable motion sensors');
    return;
  }

  await attemptImuStart(false);
  if (!imuState.active) {
    showStartButton();
    updateImuStatus('Automatic IMU start failed; tap Start Tracking to retry');
  }
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
        if (config.oscillator.type === type) {
          return false;
        }
        config.oscillator.type = type;
        return true;
      });
    });
  }

  if (filterTypeSelect) {
    filterTypeSelect.addEventListener('change', (event) => {
      const track = getActiveTrack();
      if (!track || track.type !== 'synth') return;
      const value = event.target.value;
      commitSynthConfigUpdate(track, (config) => {
        if (config.filter.type === value) {
          return false;
        }
        config.filter.type = value;
        return true;
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
        if (Number(config.filter[param]) === value) {
          return false;
        }
        config.filter[param] = value;
        return true;
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
        if (Number(config.envelope[param]) === value) {
          return false;
        }
        config.envelope[param] = value;
        return true;
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
          if (!effectConfig) return false;
          const previousEnabled = !!effectConfig.enabled;
          let changed = previousEnabled !== enabled;
          effectConfig.enabled = enabled;
          if (enabled && effectConfig.mix <= 0) {
            const defaultMix = DEFAULT_SYNTH_CONFIG.effects?.[effectKey]?.mix ?? 0.35;
            if (effectConfig.mix !== defaultMix) {
              changed = true;
              effectConfig.mix = defaultMix;
            }
          }
          return changed;
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
          if (!effectConfig || !Number.isFinite(value)) {
            return false;
          }
          if (Number(effectConfig[param]) === value) {
            return false;
          }
          effectConfig[param] = value;
          return true;
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
  if (track) {
    if (track.type === 'synth') {
      renderSynthNotes(track);
      renderMelodyTicks();
    } else {
      renderDrumNotes(track);
      renderDrumTicks();
    }
  }
  resizeImuPlotterCanvas();
  drawImuPlotter();
});
