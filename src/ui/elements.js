const byId = (id) => document.getElementById(id);

export const melodyGridEl = byId('melodyGrid');
export const melodyLanesEl = byId('melodyLanes');
export const melodyTicksEl = byId('melodyTicks');
export const melodyPlayheadEl = byId('melodyPlayhead');

export const drumGridEl = byId('drumGrid');
export const drumLanesEl = byId('drumLanes');
export const drumTicksEl = byId('drumTicks');
export const drumPlayheadEl = byId('drumPlayhead');

export const playBtn = byId('playBtn');
export const stopBtn = byId('stopBtn');
export const gridSelect = byId('gridSelect');
export const bpmInput = byId('bpm');
export const bpmValue = byId('bpmValue');
export const scaleSelect = byId('scaleSelect');
export const rootSelect = byId('rootSelect');
export const masterVolumeInput = byId('masterVolume');
export const octaveLabel = byId('octaveLabel');
export const octaveUpBtn = byId('octaveUp');
export const octaveDownBtn = byId('octaveDown');
export const presetSelect = byId('presetSelect');
export const chordModeBtn = byId('chordModeBtn');
export const trackTabsEl = byId('trackTabs');
export const addSynthTrackBtn = byId('addSynthTrack');
export const addDrumTrackBtn = byId('addDrumTrack');
export const synthPanelEl = byId('synthPanel');
export const drumPanelEl = byId('drumPanel');
export const synthTitleEl = byId('synthTitle');
export const drumTitleEl = byId('drumTitle');
export const synthStatusEl = byId('synthStatus');
export const oscillatorSelect = byId('oscillatorType');
export const filterTypeSelect = byId('filterType');

export const filterInputs = {
  frequency: byId('filterFrequency'),
  q: byId('filterQ'),
};

export const filterValueEls = {
  frequency: byId('filterFrequencyValue'),
  q: byId('filterQValue'),
};

export const envelopeInputs = {
  attack: byId('envelopeAttack'),
  decay: byId('envelopeDecay'),
  sustain: byId('envelopeSustain'),
  release: byId('envelopeRelease'),
};

export const envelopeValueEls = {
  attack: byId('envelopeAttackValue'),
  decay: byId('envelopeDecayValue'),
  sustain: byId('envelopeSustainValue'),
  release: byId('envelopeReleaseValue'),
};

export const customPresetNameInput = byId('customPresetName');
export const saveCustomPresetBtn = byId('saveCustomPreset');

export const effectControlElements = {
  chorus: {
    container: byId('chorusControls'),
    enabled: byId('chorusEnabled'),
    rateInput: byId('chorusRate'),
    rateValue: byId('chorusRateValue'),
    depthInput: byId('chorusDepth'),
    depthValue: byId('chorusDepthValue'),
    mixInput: byId('chorusMix'),
    mixValue: byId('chorusMixValue'),
  },
  delay: {
    container: byId('delayControls'),
    enabled: byId('delayEnabled'),
    timeInput: byId('delayTime'),
    timeValue: byId('delayTimeValue'),
    feedbackInput: byId('delayFeedback'),
    feedbackValue: byId('delayFeedbackValue'),
    mixInput: byId('delayMix'),
    mixValue: byId('delayMixValue'),
  },
  reverb: {
    container: byId('reverbControls'),
    enabled: byId('reverbEnabled'),
    decayInput: byId('reverbDecay'),
    decayValue: byId('reverbDecayValue'),
    preDelayInput: byId('reverbPreDelay'),
    preDelayValue: byId('reverbPreDelayValue'),
    mixInput: byId('reverbMix'),
    mixValue: byId('reverbMixValue'),
  },
};

export const imuToggleBtn = byId('imuToggle');
export const imuStatusEl = byId('imuStatus');

export const imuValueEls = Array.from(document.querySelectorAll('[data-imu]')).reduce(
  (map, el) => {
    const key = el.dataset.imu;
    if (!map[key]) {
      map[key] = [];
    }
    map[key].push(el);
    return map;
  },
  {},
);

export const imuCubeEl = byId('imuCube');
export const imuCombinedChartEl = byId('imuAllChart');
