import {
  NODE_LIBRARY,
  ROUTE_DEFAULTS,
  DEFAULT_SOURCES,
  defaultImuPipe,
} from './definitions.js';

const listeners = new Set();
const clone =
  typeof structuredClone === 'function'
    ? structuredClone
    : (value) => JSON.parse(JSON.stringify(value));

export const modularState = {
  patch: {
    nodes: [],
    edges: [],
    sources: [],
    routes: [],
  },
  selection: {
    nodeId: null,
    routeId: null,
    sourceId: null,
  },
  ui: {
    freeze: false,
    zoom: 1,
    offset: { x: 0, y: 0 },
  },
  metrics: {
    imu: {},
    noteLog: [],
  },
};

function notify(change) {
  listeners.forEach((listener) => listener(change));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPatch(patch) {
  modularState.patch = patch;
  notify({ type: 'patch' });
}

export function updatePatch(updater) {
  const next = typeof updater === 'function' ? updater(clone(modularState.patch)) : updater;
  if (!next) return;
  modularState.patch = next;
  notify({ type: 'patch' });
}

export function updateSelection(partial) {
  modularState.selection = { ...modularState.selection, ...partial };
  notify({ type: 'selection' });
}

export function updateUiState(partial) {
  modularState.ui = { ...modularState.ui, ...partial };
  notify({ type: 'ui' });
}

export function appendNoteLog(entry) {
  const items = modularState.metrics.noteLog.slice(-29);
  items.push({ ...entry, time: Date.now() });
  modularState.metrics.noteLog = items;
  notify({ type: 'noteLog' });
}

export function updateImuMetrics(metrics) {
  modularState.metrics.imu = metrics;
  notify({ type: 'imu' });
}

export function getPatchJson() {
  return JSON.stringify(modularState.patch, null, 2);
}

export function loadPatchJson(json) {
  try {
    const parsed = JSON.parse(json);
    const sanitized = sanitizePatch(parsed);
    if (!sanitized) return false;
    setPatch(sanitized);
    return true;
  } catch (error) {
    console.error('Failed to parse patch JSON', error);
    return false;
  }
}

function sanitizePatch(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const baseTime = Date.now();
  let uniqueCounter = 0;
  const nextId = (prefix) => `${prefix}-${baseTime}-${uniqueCounter++}`;

  const nodes = sanitizeNodes(parsed.nodes, nextId);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = sanitizeEdges(parsed.edges, nodeIds);
  const sources = sanitizeSources(parsed.sources, nextId);
  const routes = sanitizeRoutes(parsed.routes, nodeIds, sources, nextId);

  return {
    nodes,
    edges,
    sources,
    routes,
  };
}

function sanitizeNodes(nodesInput, nextId) {
  const fallbackPosition = { x: 120, y: 120 };
  if (!Array.isArray(nodesInput)) return [];
  const seen = new Set();
  return nodesInput
    .filter((node) => node && typeof node === 'object')
    .map((node, index) => {
      const template = NODE_LIBRARY[node.type];
      if (!template) return null;
      let id = typeof node.id === 'string' && node.id.trim() ? node.id.trim() : nextId(node.type);
      while (seen.has(id)) {
        id = nextId(node.type);
      }
      seen.add(id);
      const position = sanitizePosition(node.position, fallbackPosition, index);
      const params = sanitizeNodeParams(template, node.params);
      return { ...node, id, type: node.type, position, params };
    })
    .filter(Boolean);
}

function sanitizeEdges(edgesInput, nodeIds) {
  if (!Array.isArray(edgesInput)) return [];
  const validTargets = new Set([...nodeIds, 'out']);
  const seen = new Set();
  return edgesInput
    .filter((edge) => Array.isArray(edge) && edge.length >= 2)
    .map(([fromRaw, toRaw]) => {
      if (typeof fromRaw !== 'string' || typeof toRaw !== 'string') return null;
      const from = fromRaw.trim();
      const to = toRaw.trim();
      if (!nodeIds.has(from) && from !== 'out') return null;
      if (!validTargets.has(to)) return null;
      const key = `${from}->${to}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return [from, to];
    })
    .filter(Boolean);
}

function sanitizeSources(sourcesInput, nextId) {
  if (!Array.isArray(sourcesInput)) return [];
  const defaults = defaultImuPipe();
  const seen = new Set();
  return sourcesInput
    .filter((source) => source && typeof source === 'object')
    .map((source) => {
      let id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : nextId('source');
      while (seen.has(id)) {
        id = nextId('source');
      }
      seen.add(id);
      const pipe = sanitizePipe(source.pipe, defaults);
      return {
        id,
        kind: typeof source.kind === 'string' ? source.kind : 'imu',
        metric: typeof source.metric === 'string' ? source.metric : undefined,
        label: typeof source.label === 'string' ? source.label : id,
        pipe,
      };
    });
}

function sanitizeRoutes(routesInput, nodeIds, sources, nextId) {
  if (!Array.isArray(routesInput)) return [];
  const seen = new Set();
  const availableSources = new Set([
    ...DEFAULT_SOURCES.map((source) => source.id),
    ...sources.map((source) => source.id),
    ...nodeIds,
  ]);
  return routesInput
    .filter((route) => route && typeof route === 'object')
    .map((route) => {
      const target = typeof route.target === 'string' ? route.target.trim() : '';
      const src = typeof route.src === 'string' ? route.src.trim() : '';
      if (!target || !src) return null;
      const [nodeId, paramId] = target.split('.');
      if (!nodeIds.has(nodeId) || !paramId) return null;
      if (!availableSources.has(src)) return null;
      let id = typeof route.id === 'string' && route.id.trim() ? route.id.trim() : nextId('route');
      while (seen.has(id)) {
        id = nextId('route');
      }
      seen.add(id);
      const amount = sanitizeNumber(route.amount, ROUTE_DEFAULTS.amount);
      const slewMs = Math.max(0, sanitizeNumber(route.slewMs, ROUTE_DEFAULTS.slewMs));
      const range = sanitizeRange(route.range);
      const curve = sanitizeCurve(route.curve, ROUTE_DEFAULTS.curve);
      const op = sanitizeOperation(route.op, ROUTE_DEFAULTS.op);
      const bipolar = Boolean(route.bipolar);
      return {
        id,
        src,
        target,
        amount,
        range,
        curve,
        op,
        bipolar,
        slewMs,
      };
    })
    .filter(Boolean);
}

function sanitizePosition(position, fallback, index) {
  const baseX = fallback.x + index * 40;
  const baseY = fallback.y + index * 30;
  const x = sanitizeNumber(position?.x, baseX);
  const y = sanitizeNumber(position?.y, baseY);
  return { x, y };
}

function sanitizeNodeParams(template, paramsInput) {
  const params = {};
  const source = paramsInput && typeof paramsInput === 'object' ? paramsInput : {};
  Object.entries(template.params || {}).forEach(([key, config]) => {
    const param = source[key];
    const sanitized = {};
    const base = sanitizeParamBase(config, param?.base);
    if (base !== undefined) {
      sanitized.base = base;
    }
    const defaultSlew = typeof config.slewMs === 'number' ? config.slewMs : null;
    if (param && typeof param === 'object' && 'slewMs' in param) {
      const numeric = sanitizeNumber(param.slewMs, defaultSlew ?? 0);
      if (Number.isFinite(numeric)) {
        sanitized.slewMs = Math.max(0, numeric);
      }
    } else if (Number.isFinite(defaultSlew)) {
      sanitized.slewMs = Math.max(0, defaultSlew);
    }
    params[key] = sanitized;
  });
  return params;
}

function sanitizeParamBase(config, value) {
  switch (config.type) {
    case 'select': {
      if (typeof value === 'string' && config.options?.includes(value)) {
        return value;
      }
      return config.default;
    }
    case 'boolean':
      return Boolean(value);
    case 'integer': {
      const numberValue = sanitizeNumber(value, config.default ?? 0);
      let clamped = Math.round(numberValue);
      if (typeof config.min === 'number') clamped = Math.max(config.min, clamped);
      if (typeof config.max === 'number') clamped = Math.min(config.max, clamped);
      return clamped;
    }
    default: {
      const numberValue = sanitizeNumber(value, config.default ?? 0);
      let clamped = numberValue;
      if (typeof config.min === 'number') clamped = Math.max(config.min, clamped);
      if (typeof config.max === 'number') clamped = Math.min(config.max, clamped);
      return clamped;
    }
  }
}

function sanitizePipe(pipeInput, defaults) {
  const pipe = pipeInput && typeof pipeInput === 'object' ? pipeInput : {};
  const baseDefaults = { ...defaultImuPipe(), ...defaults };
  return {
    offset: sanitizeNumber(pipe.offset, baseDefaults.offset),
    scale: sanitizeNumber(pipe.scale, baseDefaults.scale),
    min: sanitizeNumber(pipe.min, baseDefaults.min),
    max: sanitizeNumber(pipe.max, baseDefaults.max),
    dead: Math.max(0, sanitizeNumber(pipe.dead, baseDefaults.dead)),
    invert: Boolean(pipe.invert),
    curve: sanitizeCurve(pipe.curve, baseDefaults.curve),
    smoothMs: Math.max(0, sanitizeNumber(pipe.smoothMs, baseDefaults.smoothMs)),
    hyst: Math.max(0, sanitizeNumber(pipe.hyst, baseDefaults.hyst)),
    bipolar: Boolean(pipe.bipolar),
  };
}

function sanitizeCurve(curve, fallback = 'lin') {
  return ['lin', 'exp', 'log'].includes(curve) ? curve : fallback;
}

function sanitizeOperation(operation, fallback = 'add') {
  return ['add', 'multiply', 'ring', 'crossfade'].includes(operation) ? operation : fallback;
}

function sanitizeNumber(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function sanitizeRange(rangeInput) {
  if (!Array.isArray(rangeInput) || rangeInput.length < 2) {
    return [...ROUTE_DEFAULTS.range];
  }
  const start = sanitizeNumber(rangeInput[0], ROUTE_DEFAULTS.range[0]);
  const end = sanitizeNumber(rangeInput[1], ROUTE_DEFAULTS.range[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return [...ROUTE_DEFAULTS.range];
  }
  return start <= end ? [start, end] : [end, start];
}
