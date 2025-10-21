import { NODE_LIBRARY, ROUTE_DEFAULTS, DEFAULT_SOURCES, defaultImuPipe } from './definitions.js';
import {
  modularState,
  setPatch,
  updatePatch,
  updateSelection,
  updateImuMetrics,
  appendNoteLog,
} from './store.js';
import { masterVolume } from '../state.js';

const engineState = {
  audioNodes: new Map(),
  paramBindings: new Map(),
  routes: [],
  sourcePipes: new Map(),
  sourceRuntime: new Map(),
  modulators: new Map(),
  waveform: null,
  outputGain: null,
  limiter: null,
  updateHandle: null,
  lastFrame: null,
  imuBaseline: { pitch: 0, roll: 0, yaw: 0 },
  imuMetrics: {},
  freeze: false,
};

function disposeAudioNodes() {
  engineState.audioNodes.forEach((node) => {
    if (node.instance) {
      try {
        node.instance.dispose?.();
      } catch (error) {
        console.warn('Failed to dispose node', error);
      }
    }
    node.dispose?.();
  });
  engineState.audioNodes.clear();
  engineState.paramBindings.clear();
  engineState.modulators.clear();
  engineState.sourceRuntime.clear();
}

function ensureOutputChain() {
  if (!engineState.outputGain) {
    engineState.outputGain = new Tone.Gain(1);
  }
  if (!engineState.limiter) {
    engineState.limiter = new Tone.Limiter(-1);
    engineState.outputGain.connect(engineState.limiter);
    engineState.limiter.connect(masterVolume);
    engineState.waveform = new Tone.Waveform(256);
    engineState.outputGain.connect(engineState.waveform);
  }
}

function instantiateNode(node) {
  const template = NODE_LIBRARY[node.type];
  if (!template) {
    console.warn('Unknown node type', node.type);
    return;
  }
  let created = null;
  switch (node.type) {
    case 'osc':
      created = createOscNode(node);
      break;
    case 'filter':
      created = createFilterNode(node);
      break;
    case 'gain':
      created = createGainNode(node);
      break;
    case 'mixer':
      created = createMixerNode(node);
      break;
    case 'output':
      created = createOutputNode(node);
      break;
    case 'lfo':
      created = createLfoNode(node);
      break;
    case 'env':
      created = createEnvelopeNode(node);
      break;
    case 'noise':
      created = createNoiseNode(node);
      break;
    case 'delay':
      created = createDelayNode(node);
      break;
    case 'convolver':
      created = createConvolverNode(node);
      break;
    default:
      console.warn('Unhandled node type', node.type);
      break;
  }
  if (created) {
    engineState.audioNodes.set(node.id, created);
    if (created.params) {
      Object.entries(created.params).forEach(([key, binding]) => {
        engineState.paramBindings.set(`${node.id}.${key}`, binding);
      });
    }
  }
}

function createOscNode(node) {
  const freq = node.params?.freq?.base ?? 220;
  const detune = node.params?.detune?.base ?? 0;
  const gainLevel = node.params?.gain?.base ?? 0.2;
  const type = node.params?.type?.base ?? 'sawtooth';
  const osc = new Tone.OmniOscillator(freq, type);
  const gain = new Tone.Gain(gainLevel);
  osc.connect(gain);
  osc.start();
  const typeBinding = {
    base: type,
    apply(value) {
      osc.type = value;
      this.base = value;
    },
    setBase(value) {
      this.apply(value);
    },
  };
  return {
    id: node.id,
    input: osc,
    output: gain,
    dispose: () => {
      osc.stop();
      osc.dispose();
      gain.dispose();
    },
    params: {
      freq: createParamBinding(osc.frequency, freq, node.params?.freq),
      detune: createParamBinding(osc.detune, detune, node.params?.detune),
      gain: createParamBinding(gain.gain, gainLevel, node.params?.gain),
      type: typeBinding,
    },
  };
}

function createFilterNode(node) {
  const cutoff = node.params?.cutoff?.base ?? 1200;
  const resonance = node.params?.resonance?.base ?? 1;
  const type = node.params?.type?.base ?? 'lowpass';
  const filter = new Tone.Filter(cutoff, type);
  filter.Q.value = resonance;
  const typeBinding = {
    base: type,
    apply(value) {
      filter.type = value;
      this.base = value;
    },
    setBase(value) {
      this.apply(value);
    },
  };
  return {
    id: node.id,
    input: filter,
    output: filter,
    dispose: () => filter.dispose(),
    params: {
      cutoff: createParamBinding(filter.frequency, cutoff, node.params?.cutoff),
      resonance: createParamBinding(filter.Q, resonance, node.params?.resonance),
      type: typeBinding,
    },
  };
}

function createGainNode(node) {
  const level = node.params?.gain?.base ?? 0.5;
  const gain = new Tone.Gain(level);
  return {
    id: node.id,
    input: gain,
    output: gain,
    dispose: () => gain.dispose(),
    params: {
      gain: createParamBinding(gain.gain, level, node.params?.gain),
    },
  };
}

function createMixerNode(node) {
  const channels = node.params?.channels?.base ?? node.params?.channels?.default ?? 4;
  const gainLevel = node.params?.gain?.base ?? 0.8;
  const gain = new Tone.Gain(gainLevel);
  return {
    id: node.id,
    input: gain,
    output: gain,
    dispose: () => gain.dispose(),
    params: {
      gain: createParamBinding(gain.gain, gainLevel, node.params?.gain),
      channels: {
        base: channels,
        apply() {},
        setBase() {},
      },
    },
  };
}

function createOutputNode(node) {
  ensureOutputChain();
  const gainLevel = node.params?.gain?.base ?? 1;
  const gain = new Tone.Gain(gainLevel);
  gain.connect(engineState.outputGain);
  return {
    id: node.id,
    input: gain,
    output: gain,
    dispose: () => gain.dispose(),
    params: {
      gain: createParamBinding(gain.gain, gainLevel, node.params?.gain),
    },
  };
}

function createLfoNode(node) {
  const rate = node.params?.freq?.base ?? 1.2;
  const min = node.params?.min?.base ?? -1;
  const max = node.params?.max?.base ?? 1;
  const type = node.params?.type?.base ?? 'sine';
  const lfo = new Tone.LFO(rate, min, max);
  lfo.type = type;
  lfo.start();
  engineState.modulators.set(node.id, {
    kind: 'lfo',
    lfo,
    getValue() {
      return lfo.value;
    },
  });
  const typeBinding = {
    base: type,
    apply(value) {
      lfo.type = value;
      this.base = value;
    },
    setBase(value) {
      this.apply(value);
    },
  };
  return {
    id: node.id,
    input: null,
    output: null,
    dispose: () => lfo.dispose(),
    params: {
      freq: createParamBinding(lfo.frequency, rate, node.params?.freq),
      min: createParamBinding(null, min, node.params?.min, (value) => {
        lfo.min = value;
      }),
      max: createParamBinding(null, max, node.params?.max, (value) => {
        lfo.max = value;
      }),
      type: typeBinding,
    },
  };
}

function createEnvelopeNode(node) {
  const attack = node.params?.attack?.base ?? 0.02;
  const decay = node.params?.decay?.base ?? 0.3;
  const sustain = node.params?.sustain?.base ?? 0.6;
  const release = node.params?.release?.base ?? 1.2;
  const loop = node.params?.loop?.base ?? false;
  const envelope = new Tone.Envelope({ attack, decay, sustain, release });
  const signal = new Tone.Signal(0);
  envelope.connect(signal);
  const loopEvent = loop
    ? new Tone.Loop(() => {
        envelope.triggerAttackRelease('4n');
      }, '1m').start(0)
    : null;
  engineState.modulators.set(node.id, {
    kind: 'envelope',
    envelope,
    signal,
    loopEvent,
    trigger() {
      envelope.triggerAttackRelease('8n');
    },
    getValue() {
      return signal.value;
    },
  });
  const modRef = engineState.modulators.get(node.id);
  return {
    id: node.id,
    input: null,
    output: null,
    dispose: () => {
      loopEvent?.dispose();
      if (modRef?.loopEvent && modRef.loopEvent !== loopEvent) {
        modRef.loopEvent.dispose();
      }
      envelope.dispose();
      signal.dispose();
    },
    params: {
      attack: createParamBinding(null, attack, node.params?.attack, (value) => {
        envelope.attack = value;
      }),
      decay: createParamBinding(null, decay, node.params?.decay, (value) => {
        envelope.decay = value;
      }),
      sustain: createParamBinding(null, sustain, node.params?.sustain, (value) => {
        envelope.sustain = value;
      }),
      release: createParamBinding(null, release, node.params?.release, (value) => {
        envelope.release = value;
      }),
      loop: {
        base: loop,
        apply(value) {
          if (!modRef) return;
          if (value && !modRef.loopEvent) {
            modRef.loopEvent = new Tone.Loop(() => {
              envelope.triggerAttackRelease('4n');
            }, '1m').start(0);
          } else if (!value && modRef.loopEvent) {
            modRef.loopEvent.dispose();
            modRef.loopEvent = null;
          }
          this.base = value;
        },
        setBase(value) {
          this.apply(value);
        },
      },
    },
  };
}

function createNoiseNode(node) {
  const type = node.params?.type?.base ?? 'white';
  const gainLevel = node.params?.gain?.base ?? 0.4;
  const noise = new Tone.Noise(type);
  const gain = new Tone.Gain(gainLevel);
  noise.connect(gain);
  noise.start();
  const typeBinding = {
    base: type,
    apply(value) {
      noise.type = value;
      this.base = value;
    },
    setBase(value) {
      this.apply(value);
    },
  };
  return {
    id: node.id,
    input: noise,
    output: gain,
    dispose: () => {
      noise.stop();
      noise.dispose();
      gain.dispose();
    },
    params: {
      type: typeBinding,
      gain: createParamBinding(gain.gain, gainLevel, node.params?.gain),
    },
  };
}

function createDelayNode(node) {
  const time = node.params?.time?.base ?? 0.25;
  const feedback = node.params?.feedback?.base ?? 0.3;
  const wet = node.params?.wet?.base ?? 0.35;
  const delay = new Tone.FeedbackDelay(time, feedback);
  delay.wet.value = wet;
  return {
    id: node.id,
    input: delay,
    output: delay,
    dispose: () => delay.dispose(),
    params: {
      time: createParamBinding(delay.delayTime, time, node.params?.time),
      feedback: createParamBinding(delay.feedback, feedback, node.params?.feedback),
      wet: createParamBinding(delay.wet, wet, node.params?.wet),
    },
  };
}

function createImpulseBuffer(decay, reverse = false) {
  const sampleRate = Tone.getContext().sampleRate;
  const length = Math.floor(sampleRate * Math.max(decay, 0.2));
  const impulse = Tone.getContext().createBuffer(2, length, sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const n = reverse ? length - i : i;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, 2);
    }
  }
  return impulse;
}

function createConvolverNode(node) {
  const decay = node.params?.decay?.base ?? 1.5;
  const reverse = node.params?.reverse?.base ?? false;
  const wet = node.params?.wet?.base ?? 0.4;
  const convolver = new Tone.Convolver(createImpulseBuffer(decay, reverse));
  convolver.wet.value = wet;
  const state = { decay, reverse };
  return {
    id: node.id,
    input: convolver,
    output: convolver,
    dispose: () => convolver.dispose(),
    params: {
      decay: {
        base: decay,
        apply(value) {
          state.decay = value;
          convolver.buffer = createImpulseBuffer(state.decay, state.reverse);
          this.base = value;
        },
        setBase(value) {
          this.apply(value);
        },
      },
      reverse: {
        base: reverse,
        apply(value) {
          state.reverse = value;
          convolver.buffer = createImpulseBuffer(state.decay, state.reverse);
          this.base = value;
        },
        setBase(value) {
          this.apply(value);
        },
      },
      wet: createParamBinding(convolver.wet, wet, node.params?.wet),
    },
  };
}

function createParamBinding(target, base, meta = {}, setter) {
  const config = meta || {};
  const binding = {
    param: typeof target?.rampTo === 'function' ? target : null,
    base,
    slewMs: config.slewMs ?? 30,
    apply(value, slewMs = config.slewMs ?? 30) {
      const duration = Math.max(0, (slewMs ?? 0) / 1000);
      if (this.param) {
        this.param.rampTo(value, duration);
      } else if (setter) {
        setter(value);
      }
      this.base = this.base ?? value;
    },
    setBase(value) {
      this.base = value;
      this.apply(value, 0);
    },
  };
  return binding;
}

function connectNodes(patch) {
  const seen = new Set();
  patch.edges.forEach(([fromId, toId]) => {
    const from = engineState.audioNodes.get(fromId);
    const to = engineState.audioNodes.get(toId);
    if (!from || !to) return;
    try {
      if (from.output) {
        from.output.connect(to.input || to.output);
      }
    } catch (error) {
      console.warn('Failed to connect nodes', fromId, toId, error);
    }
    seen.add(`${fromId}->${toId}`);
  });
}

function rebuildRoutes(patch) {
  engineState.routes = (patch.routes || [])
    .map((route) => ({
      ...ROUTE_DEFAULTS,
      ...route,
      binding: engineState.paramBindings.get(route.target),
    }))
    .filter((route) => route.binding);
}

export function applyPatch(patch) {
  disposeAudioNodes();
  ensureOutputChain();
  patch.nodes.forEach((node) => instantiateNode(node));
  connectNodes(patch);
  rebuildRoutes(patch);
  engineState.sourcePipes.clear();
  const mergedSources = [...DEFAULT_SOURCES, ...(patch.sources || [])];
  mergedSources.forEach((source) => {
    engineState.sourcePipes.set(source.id, {
      ...source,
      pipe: { ...defaultImuPipe(), ...source.pipe },
    });
  });
  updateImuMetrics(engineState.imuMetrics);
  if (!engineState.updateHandle) {
    engineState.updateHandle = requestAnimationFrame(stepEngine);
  }
}

function stepEngine(timestamp) {
  const dt = engineState.lastFrame ? (timestamp - engineState.lastFrame) / 1000 : 0;
  engineState.lastFrame = timestamp;
  updateModulators(timestamp);
  applyRoutes();
  engineState.updateHandle = requestAnimationFrame(stepEngine);
}

function updateModulators(timestamp) {
  engineState.modulators.forEach((modulator, id) => {
    const value = modulator.getValue?.() ?? 0;
    const source = engineState.sourcePipes.get(id);
    const pipe = source?.pipe ?? defaultImuPipe({ bipolar: true });
    const runtime = engineState.sourceRuntime.get(id) || {};
    const processed = evaluatePipe(value, pipe, runtime, timestamp);
    processed.raw = value;
    engineState.sourceRuntime.set(id, processed);
  });
}

function applyRoutes() {
  const targetValues = new Map();
  engineState.routes.forEach((route) => {
    const binding = route.binding;
    if (!binding) return;
    const sourceState = getSourceValue(route.src);
    if (!sourceState) return;
    const normalized = clamp01(sourceState.normalized ?? 0);
    const bipolar = normalized * 2 - 1;
    const inputValue = route.bipolar ? bipolar : normalized;
    const shapedNormalized = route.bipolar ? (inputValue + 1) / 2 : inputValue;
    const curved = applyCurve(clamp01(shapedNormalized), route.curve);
    const [rangeMin, rangeMax] = route.range || [0, 1];
    const min = Number.isFinite(rangeMin) ? rangeMin : 0;
    const max = Number.isFinite(rangeMax) ? rangeMax : 1;
    const mapped = min + (max - min) * curved;
    const entry = targetValues.get(route.target) || {
      value: binding.base,
      base: binding.base,
      slewMs: binding.slewMs ?? 30,
    };
    entry.value = applyOperation(entry.value, entry.base, mapped, route, inputValue);
    entry.value = clampValue(entry.value, min, max);
    entry.slewMs = Math.max(entry.slewMs, route.slewMs ?? binding.slewMs ?? 0);
    targetValues.set(route.target, entry);
    if (shouldLogRoute(route, binding, mapped)) {
      appendNoteLog({ target: route.target, value: mapped });
    }
  });
  targetValues.forEach((entry, targetId) => {
    const binding = engineState.paramBindings.get(targetId);
    if (!binding) return;
    binding.apply(entry.value, entry.slewMs);
  });
}

function applyOperation(current, base, mapped, route, inputValue) {
  const amount = route.amount ?? 1;
  switch (route.op) {
    case 'multiply': {
      const factor = 1 + inputValue * amount;
      return current * factor;
    }
    case 'ring':
      return current + base * inputValue * amount;
    case 'crossfade':
      return base * (1 - amount) + mapped * amount;
    case 'add':
    default:
      return current + (mapped - base) * amount;
  }
}

function shouldLogRoute(route, binding, mapped) {
  return /freq/i.test(route.target) && Math.abs(mapped - (binding?.base ?? 0)) > 1;
}

function clampValue(value, min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return value;
  }
  if (min === max) return min;
  return Math.min(max, Math.max(min, value));
}

function getSourceValue(id) {
  if (engineState.sourceRuntime.has(id)) {
    return engineState.sourceRuntime.get(id).normalized;
  }
  const source = engineState.sourcePipes.get(id);
  if (!source) return null;
  const runtime = engineState.sourceRuntime.get(id);
  return runtime?.normalized ?? 0;
}

function applyCurve(value, curve) {
  switch (curve) {
    case 'exp':
      return Math.pow(value, 2);
    case 'log':
      return Math.sqrt(value);
    case 'lin':
    default:
      return value;
  }
}

function normalizeBipolar(value) {
  return clamp01((value + 1) / 2);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function computeImuMetrics(sample) {
  const acc = sample.accelerationIncludingGravity || sample.acceleration || { x: 0, y: 0, z: 0 };
  const pureAcc = sample.acceleration || { x: 0, y: 0, z: 0 };
  const rotation = sample.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
  const orientation = sample.orientation || { alpha: 0, beta: 0, gamma: 0 };
  const pitch = (orientation.beta ?? 0) - engineState.imuBaseline.pitch;
  const roll = (orientation.gamma ?? 0) - engineState.imuBaseline.roll;
  const yaw = (orientation.alpha ?? 0) - engineState.imuBaseline.yaw;
  const accMag = Math.sqrt(pureAcc.x ** 2 + pureAcc.y ** 2 + pureAcc.z ** 2);
  const rotMag = Math.sqrt(rotation.alpha ** 2 + rotation.beta ** 2 + rotation.gamma ** 2);
  const motionEnergy = accMag * 0.05 + rotMag * 0.01;
  const tilt = Math.sqrt(pitch * pitch + roll * roll);
  const composite = (pitch * roll) / 8100; // ~90^2
  return {
    pitch,
    roll,
    yaw,
    accMagnitude: accMag,
    rotationMagnitude: rotMag,
    motionEnergy,
    tilt,
    composite,
    acc,
    pureAcc,
    rotation,
    orientation,
    timestamp: sample.timestamp || performance.now(),
  };
}

function evaluatePipe(value, pipe, runtime, timestamp) {
  const config = { ...defaultImuPipe(), ...pipe };
  const min = Number.isFinite(config.min) ? config.min : -1;
  const max = Number.isFinite(config.max) ? config.max : 1;
  const offset = config.offset ?? 0;
  const scale = config.scale ?? 1;
  let scaled = (value + offset) * scale;
  if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
    scaled = Math.min(max, Math.max(min, scaled));
  }
  if (config.dead && Math.abs(scaled) < config.dead) {
    scaled = 0;
  }
  if (config.invert) {
    scaled *= -1;
  }
  const span = max - min || 1;
  let normalized = (scaled - min) / span;
  normalized = clamp01(normalized);
  normalized = applyCurve(normalized, config.curve ?? 'lin');
  const now = typeof timestamp === 'number' ? timestamp : performance.now();
  const previous = runtime?.output ?? normalized;
  let output = normalized;
  if (config.smoothMs && config.smoothMs > 0) {
    const elapsed = runtime?.timestamp ? Math.max(0, now - runtime.timestamp) / 1000 : 0;
    const alpha = Math.min(1, config.smoothMs > 0 ? elapsed / (config.smoothMs / 1000) : 1);
    output = previous + (normalized - previous) * (alpha || 1);
  }
  if (config.hyst && config.hyst > 0) {
    const last = runtime?.lastOutput ?? output;
    if (Math.abs(output - last) < config.hyst) {
      output = last;
    }
  }
  return {
    ...runtime,
    value: scaled,
    normalized: clamp01(output),
    output,
    lastOutput: output,
    timestamp: now,
    pipe: config,
  };
}

function readSourceMetric(source, metrics) {
  switch (source.kind) {
    case 'imu':
      return getMetricValue(metrics, source.metric);
    case 'lfo':
    case 'env':
      return engineState.modulators.get(source.id)?.getValue?.() ?? 0;
    default:
      return 0;
  }
}

function getMetricValue(metrics, key) {
  if (!key) return 0;
  if (key.includes('.')) {
    return key.split('.').reduce((value, segment) => {
      if (value == null) return 0;
      const next = value[segment];
      return typeof next === 'number' ? next : next ?? 0;
    }, metrics);
  }
  return metrics[key] ?? 0;
}

export function tickIMU(sample) {
  const metrics = computeImuMetrics(sample);
  engineState.imuMetrics = metrics;
  updateImuMetrics(metrics);
  engineState.sourcePipes.forEach((source) => {
    if (source.kind !== 'imu') return;
    const raw = readSourceMetric(source, metrics);
    const runtime = engineState.sourceRuntime.get(source.id) || {};
    const processed = evaluatePipe(raw, source.pipe, runtime, metrics.timestamp);
    processed.raw = raw;
    engineState.sourceRuntime.set(source.id, processed);
  });
}

export function resetImuBaseline() {
  const metrics = engineState.imuMetrics;
  if (!metrics) return;
  engineState.imuBaseline = {
    pitch: metrics.orientation?.beta ?? 0,
    roll: metrics.orientation?.gamma ?? 0,
    yaw: metrics.orientation?.alpha ?? 0,
  };
}

export function setBase(path, value) {
  const [nodeId, param] = path.split('.');
  updatePatch((patch) => {
    const nodes = patch.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      const params = { ...node.params };
      const existing = params[param] || {};
      params[param] = { ...existing, base: value };
      return { ...node, params };
    });
    return { ...patch, nodes };
  });
  const binding = engineState.paramBindings.get(path);
  if (binding) {
    binding.setBase?.(value);
  }
}

export function setParamSlew(path, slewMs) {
  const [nodeId, param] = path.split('.');
  updatePatch((patch) => {
    const nodes = patch.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      const params = { ...node.params };
      const existing = params[param] || {};
      params[param] = { ...existing, slewMs };
      return { ...node, params };
    });
    return { ...patch, nodes };
  });
  const binding = engineState.paramBindings.get(path);
  if (binding) {
    binding.slewMs = slewMs;
  }
}

export function setRoute(route) {
  const routeWithDefaults = { ...ROUTE_DEFAULTS, ...route };
  if (!routeWithDefaults.id) {
    routeWithDefaults.id = `route-${Date.now()}`;
  }
  updatePatch((patch) => {
    const routes = patch.routes.filter(
      (item) => !(item.src === routeWithDefaults.src && item.target === routeWithDefaults.target),
    );
    routes.push(routeWithDefaults);
    return { ...patch, routes };
  });
}

export function removeRoute(routeId) {
  updatePatch((patch) => ({
    ...patch,
    routes: patch.routes.filter((route) => route.id !== routeId),
  }));
}

export function createBasePatch() {
  const base = {
    nodes: [
      {
        id: 'osc1',
        type: 'osc',
        position: { x: 100, y: 120 },
        params: {
          freq: { base: 220, slewMs: 30 },
          gain: { base: 0.2, slewMs: 30 },
          detune: { base: 0 },
          type: { base: 'sawtooth' },
        },
      },
      {
        id: 'f1',
        type: 'filter',
        position: { x: 320, y: 120 },
        params: {
          cutoff: { base: 1200, slewMs: 30 },
          resonance: { base: 1 },
          type: { base: 'lowpass' },
        },
      },
      {
        id: 'g1',
        type: 'gain',
        position: { x: 520, y: 120 },
        params: {
          gain: { base: 0.2 },
        },
      },
      {
        id: 'out',
        type: 'output',
        position: { x: 720, y: 120 },
        params: {
          gain: { base: 1 },
        },
      },
    ],
    edges: [
      ['osc1', 'f1'],
      ['f1', 'g1'],
      ['g1', 'out'],
    ],
    sources: DEFAULT_SOURCES.map((source) => ({
      ...source,
      pipe: { ...source.pipe },
    })),
    routes: [
      {
        id: 'route-cutoff-imu',
        src: 'imu.pitch',
        target: 'f1.cutoff',
        amount: 0.6,
        range: [200, 6000],
        curve: 'exp',
        op: 'add',
        bipolar: false,
        slewMs: 30,
      },
    ],
  };
  setPatch(base);
  applyPatch(base);
  return base;
}

export function triggerEnvelope(nodeId) {
  const modulator = engineState.modulators.get(nodeId);
  if (modulator?.trigger) {
    modulator.trigger();
  }
}

export function setFreezeMode(freeze) {
  engineState.freeze = freeze;
}

export function getWaveformData() {
  if (!engineState.waveform) return null;
  return engineState.waveform.getValue();
}

export function updateSourcePipe(id, pipe) {
  updatePatch((patch) => {
    const sources = patch.sources.map((source) => {
      if (source.id !== id) return source;
      return { ...source, pipe: { ...source.pipe, ...pipe } };
    });
    return { ...patch, sources };
  });
  const existing = engineState.sourcePipes.get(id);
  if (existing) {
    existing.pipe = { ...existing.pipe, ...pipe };
  }
}

export function addNode(type, position) {
  const template = NODE_LIBRARY[type];
  if (!template) return;
  const id = `${type}${Math.floor(Math.random() * 10000)}`;
  const params = {};
  Object.entries(template.params || {}).forEach(([key, config]) => {
    params[key] = { base: config.default, slewMs: config.slewMs };
  });
  updatePatch((patch) => ({
    ...patch,
    nodes: [...patch.nodes, { id, type, position, params }],
    sources:
      type === 'lfo' || type === 'env'
        ? [
            ...(patch.sources || []),
            {
              id,
              kind: type,
              metric: type,
              label: `${template.label} ${id}`,
              pipe: defaultImuPipe({ bipolar: true, min: -1, max: 1 }),
            },
          ]
        : patch.sources,
  }));
  return id;
}

export function removeNode(nodeId) {
  updatePatch((patch) => ({
    ...patch,
    nodes: patch.nodes.filter((node) => node.id !== nodeId),
    edges: patch.edges.filter(([from, to]) => from !== nodeId && to !== nodeId),
    routes: patch.routes.filter((route) => !route.target.startsWith(`${nodeId}.`) && route.src !== nodeId),
    sources: (patch.sources || []).filter((source) => source.id !== nodeId),
  }));
}

export function updateNodePosition(nodeId, position) {
  updatePatch((patch) => ({
    ...patch,
    nodes: patch.nodes.map((node) =>
      node.id === nodeId ? { ...node, position: { ...node.position, ...position } } : node,
    ),
  }));
}

export function addEdge(fromId, toId) {
  updatePatch((patch) => {
    const key = `${fromId}->${toId}`;
    if (patch.edges.some(([f, t]) => f === fromId && t === toId)) {
      return patch;
    }
    return { ...patch, edges: [...patch.edges, [fromId, toId]] };
  });
}

export function removeEdge(fromId, toId) {
  updatePatch((patch) => ({
    ...patch,
    edges: patch.edges.filter(([f, t]) => !(f === fromId && t === toId)),
  }));
}

export function setRoutes(routes) {
  updatePatch((patch) => ({
    ...patch,
    routes,
  }));
}

export function setSources(sources) {
  updatePatch((patch) => ({
    ...patch,
    sources,
  }));
}

export function getSourceState(id) {
  return engineState.sourceRuntime.get(id);
}

export function setSelection(selection) {
  updateSelection(selection);
}

export function disposeEngine() {
  if (engineState.updateHandle) {
    cancelAnimationFrame(engineState.updateHandle);
  }
  disposeAudioNodes();
  engineState.waveform?.dispose?.();
  engineState.outputGain?.dispose?.();
  engineState.limiter?.dispose?.();
  engineState.updateHandle = null;
}
