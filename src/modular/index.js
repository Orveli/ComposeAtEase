import {
  modularState,
  subscribe,
  updateSelection,
  updateUiState,
  getPatchJson,
  loadPatchJson,
  updatePatch,
} from './store.js';
import {
  createBasePatch,
  applyPatch,
  setBase,
  setParamSlew,
  setRoute,
  removeRoute,
  addNode,
  removeNode,
  updateNodePosition,
  addEdge,
  removeEdge,
  triggerEnvelope,
  resetImuBaseline,
  setFreezeMode,
  getWaveformData,
  updateSourcePipe,
  getSourceState,
} from './engine.js';
import { NODE_LIBRARY, ROUTE_DEFAULTS, defaultImuPipe } from './definitions.js';
import { modularElements } from '../ui/elements.js';
import { formatFrequency, formatLevel, formatMilliseconds } from '../utils/formatters.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ROUTE_CURVES = ['lin', 'exp', 'log'];
const ROUTE_OPERATIONS = ['add', 'multiply', 'ring', 'crossfade'];
const AVAILABLE_IMU_SOURCES = [
  { id: 'imu.pitch', label: 'IMU Pitch', metric: 'pitch' },
  { id: 'imu.roll', label: 'IMU Roll', metric: 'roll' },
  { id: 'imu.yaw', label: 'IMU Yaw', metric: 'yaw' },
  { id: 'imu.acc', label: 'Accel |g|', metric: 'accMagnitude' },
  { id: 'imu.energy', label: 'Motion Energy', metric: 'motionEnergy' },
  { id: 'imu.tilt', label: 'Tilt', metric: 'tilt' },
  { id: 'imu.combo', label: 'Pitch × Roll', metric: 'composite' },
  { id: 'imu.accX', label: 'Accel X', metric: 'pureAcc.x' },
  { id: 'imu.accY', label: 'Accel Y', metric: 'pureAcc.y' },
  { id: 'imu.accZ', label: 'Accel Z', metric: 'pureAcc.z' },
  { id: 'imu.rotX', label: 'Gyro α', metric: 'rotation.alpha' },
  { id: 'imu.rotY', label: 'Gyro β', metric: 'rotation.beta' },
  { id: 'imu.rotZ', label: 'Gyro γ', metric: 'rotation.gamma' },
];

let unsubscribe = null;
let waveformHandle = null;
let pendingNodeDrag = null;
let pendingLink = null;
let panState = null;
let palettePlacement = { x: 80, y: 80 };

export function initializeModularSynth() {
  if (!modularElements?.panel) return;
  createBasePatch();
  applyPatch(modularState.patch);
  renderAll();
  unsubscribe = subscribe(handleStateChange);
  setupPalette();
  setupSourcesControls();
  setupMatrixActions();
  setupCanvasInteractions();
  setupToolbar();
  startWaveformLoop();
}

function handleStateChange(change) {
  if (change.type === 'patch') {
    applyPatch(modularState.patch);
    renderAll();
  } else if (change.type === 'selection' || change.type === 'ui') {
    renderAll();
  } else if (change.type === 'noteLog' || change.type === 'imu') {
    renderMeters();
  }
}

function renderAll() {
  renderCanvas();
  renderProperties();
  renderMatrix();
  renderSourcesList();
  renderMeters();
  renderPatchText();
}

function setupPalette() {
  if (!modularElements.palette) return;
  modularElements.palette.innerHTML = '';
  Object.values(NODE_LIBRARY).forEach((node) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'modular__palette-button';
    button.textContent = node.label;
    button.addEventListener('click', () => {
      const position = {
        x: palettePlacement.x,
        y: palettePlacement.y,
      };
      palettePlacement = { x: palettePlacement.x + 60, y: palettePlacement.y + 40 };
      addNode(node.id, position);
    });
    modularElements.palette.appendChild(button);
  });
}

function setupToolbar() {
  const { freezeBtn, resetImuBtn, exportBtn, importBtn, patchTextarea } = modularElements;
  if (freezeBtn) {
    freezeBtn.addEventListener('click', () => {
      const freeze = !freezeBtn.classList.contains('active');
      freezeBtn.classList.toggle('active', freeze);
      freezeBtn.textContent = freeze ? 'Unfreeze UI' : 'Freeze UI';
      setFreezeMode(freeze);
      updateUiState({ freeze });
      if (freeze) {
        modularElements.panel?.classList.add('modular--frozen');
      } else {
        modularElements.panel?.classList.remove('modular--frozen');
      }
    });
  }
  if (resetImuBtn) {
    resetImuBtn.addEventListener('click', () => {
      resetImuBaseline();
    });
  }
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const json = getPatchJson();
      if (patchTextarea) {
        patchTextarea.value = json;
        patchTextarea.focus();
        patchTextarea.select();
      }
      navigator.clipboard?.writeText(json).catch(() => {});
    });
  }
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      if (!patchTextarea) return;
      if (!patchTextarea.value.trim()) return;
      const loaded = loadPatchJson(patchTextarea.value.trim());
      if (loaded) {
        applyPatch(modularState.patch);
        renderAll();
      } else {
        patchTextarea.classList.add('error');
        setTimeout(() => patchTextarea.classList.remove('error'), 1600);
      }
    });
  }
}

function setupSourcesControls() {
  const { sources } = modularElements;
  if (!sources) return;
  const selector = document.createElement('select');
  selector.className = 'modular__source-select';
  selector.innerHTML = '<option value="">Add IMU Source…</option>';
  AVAILABLE_IMU_SOURCES.forEach((src) => {
    const option = document.createElement('option');
    option.value = src.id;
    option.textContent = src.label;
    selector.appendChild(option);
  });
  selector.addEventListener('change', (event) => {
    const value = event.target.value;
    if (!value) return;
    const existing = (modularState.patch.sources || []).some((source) => source.id === value);
    const config = AVAILABLE_IMU_SOURCES.find((item) => item.id === value);
    if (!existing && config) {
      updatePatchWithSource({
        id: config.id,
        kind: 'imu',
        metric: config.metric,
        label: config.label,
        pipe: defaultImuPipe(),
      });
    }
    selector.value = '';
  });
  sources.appendChild(selector);
}

function updatePatchWithSource(source) {
  updatePatch((patch) => {
    const sources = patch.sources || [];
    if (sources.some((item) => item.id === source.id)) {
      return patch;
    }
    return {
      ...patch,
      sources: [...sources, source],
    };
  });
}

function setupMatrixActions() {
  const { matrix } = modularElements;
  if (!matrix) return;
  matrix.addEventListener('click', (event) => {
    const cell = event.target.closest('[data-route-target]');
    if (!cell) return;
    const src = cell.dataset.routeSource;
    const target = cell.dataset.routeTarget;
    handleRouteCellInteraction(src, target);
  });
}

function setupCanvasInteractions() {
  const { canvas, canvasWrapper } = modularElements;
  if (!canvas) return;
  canvas.addEventListener('pointerdown', handleCanvasPointerDown);
  window.addEventListener('pointermove', handleCanvasPointerMove);
  window.addEventListener('pointerup', handleCanvasPointerUp);
  if (canvasWrapper) {
    canvasWrapper.addEventListener('wheel', (event) => {
      event.preventDefault();
      const nextZoom = clampZoom(modularState.ui.zoom * (event.deltaY > 0 ? 0.9 : 1.1));
      updateUiState({ zoom: nextZoom });
      renderCanvas();
    });
  }
}

function clampZoom(value) {
  return Math.min(2.4, Math.max(0.4, value));
}

function renderCanvas() {
  const { canvas } = modularElements;
  if (!canvas) return;
  const groupId = 'modularCanvasGroup';
  let group = canvas.querySelector(`#${groupId}`);
  if (!group) {
    group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('id', groupId);
    canvas.appendChild(group);
  }
  group.innerHTML = '';
  const { nodes = [], edges = [] } = modularState.patch;
  renderEdges(group, nodes, edges);
  nodes.forEach((node) => {
    renderNode(group, node);
  });
  const { zoom = 1, offset = { x: 0, y: 0 } } = modularState.ui;
  group.setAttribute('transform', `translate(${offset.x}, ${offset.y}) scale(${zoom})`);
  renderLinkPreview(group);
}

function renderEdges(group, nodes, edges) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  edges.forEach(([from, to]) => {
    const source = nodeMap.get(from);
    const target = nodeMap.get(to);
    if (!source || !target) return;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'modular__edge');
    const start = nodeAnchor(source, 'right');
    const end = nodeAnchor(target, 'left');
    const midX = (start.x + end.x) / 2;
    path.setAttribute('d', `M${start.x},${start.y} C${midX},${start.y} ${midX},${end.y} ${end.x},${end.y}`);
    path.dataset.edge = `${from}->${to}`;
    path.addEventListener('dblclick', () => removeEdge(from, to));
    group.appendChild(path);
  });
}

function renderNode(group, node) {
  const template = NODE_LIBRARY[node.type];
  if (!template) return;
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('data-node-id', node.id);
  g.setAttribute('class', 'modular__node');
  g.setAttribute('transform', `translate(${node.position?.x ?? 0}, ${node.position?.y ?? 0})`);

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('width', template.width);
  rect.setAttribute('height', template.height);
  rect.setAttribute('rx', 14);
  rect.setAttribute('ry', 14);
  rect.setAttribute('class', 'modular__node-body');
  g.appendChild(rect);

  const label = document.createElementNS(SVG_NS, 'text');
  label.textContent = `${template.label} (${node.id})`;
  label.setAttribute('x', 12);
  label.setAttribute('y', 22);
  label.setAttribute('class', 'modular__node-label');
  g.appendChild(label);

  const output = document.createElementNS(SVG_NS, 'circle');
  output.setAttribute('r', 6);
  output.setAttribute('cx', template.width);
  output.setAttribute('cy', template.height / 2);
  output.setAttribute('class', 'modular__port modular__port--out');
  output.dataset.nodeId = node.id;
  output.dataset.portType = 'out';
  g.appendChild(output);

  if (template.category !== 'source' && template.category !== 'modulator') {
    const input = document.createElementNS(SVG_NS, 'circle');
    input.setAttribute('r', 6);
    input.setAttribute('cx', 0);
    input.setAttribute('cy', template.height / 2);
    input.setAttribute('class', 'modular__port modular__port--in');
    input.dataset.nodeId = node.id;
    input.dataset.portType = 'in';
    g.appendChild(input);
  }

  group.appendChild(g);
}

function renderLinkPreview(group) {
  if (!pendingLink) return;
  const { start, current } = pendingLink;
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('class', 'modular__edge modular__edge--preview');
  const midX = (start.x + current.x) / 2;
  path.setAttribute('d', `M${start.x},${start.y} C${midX},${start.y} ${midX},${current.y} ${current.x},${current.y}`);
  group.appendChild(path);
}

function nodeAnchor(node, side) {
  const template = NODE_LIBRARY[node.type];
  const width = template?.width ?? 140;
  const height = template?.height ?? 100;
  const baseX = node.position?.x ?? 0;
  const baseY = node.position?.y ?? 0;
  if (side === 'left') {
    return { x: baseX, y: baseY + height / 2 };
  }
  return { x: baseX + width, y: baseY + height / 2 };
}

function renderProperties() {
  const { properties } = modularElements;
  if (!properties) return;
  const selectedNode = modularState.patch.nodes?.find((node) => node.id === modularState.selection.nodeId);
  properties.innerHTML = '';
  if (!selectedNode) {
    properties.innerHTML = '<p class="modular__empty">Select a node to edit parameters.</p>';
    return;
  }
  const template = NODE_LIBRARY[selectedNode.type];
  const title = document.createElement('h3');
  title.textContent = `${template?.label ?? selectedNode.type} · ${selectedNode.id}`;
  properties.appendChild(title);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = 'Remove Node';
  removeBtn.className = 'modular__danger';
  removeBtn.addEventListener('click', () => removeNode(selectedNode.id));
  properties.appendChild(removeBtn);

  if (selectedNode.type === 'env') {
    const triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.textContent = 'Trigger Envelope';
    triggerBtn.addEventListener('click', () => triggerEnvelope(selectedNode.id));
    properties.appendChild(triggerBtn);
  }

  const paramsContainer = document.createElement('div');
  paramsContainer.className = 'modular__params';

  Object.entries(template?.params || {}).forEach(([key, config]) => {
    const control = createParamControl(selectedNode, key, config);
    paramsContainer.appendChild(control);
  });

  properties.appendChild(paramsContainer);

  const connections = document.createElement('div');
  connections.className = 'modular__connections';
  const edgeList = modularState.patch.edges?.filter(([from, to]) => from === selectedNode.id || to === selectedNode.id) || [];
  if (edgeList.length) {
    const heading = document.createElement('h4');
    heading.textContent = 'Connections';
    connections.appendChild(heading);
    edgeList.forEach(([from, to]) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'modular__connection';
      item.textContent = `${from} → ${to}`;
      item.addEventListener('click', () => removeEdge(from, to));
      connections.appendChild(item);
    });
    properties.appendChild(connections);
  }
}

function createParamControl(node, paramKey, config) {
  const valueConfig = node.params?.[paramKey] || {};
  const wrapper = document.createElement('label');
  wrapper.className = 'modular__param';
  wrapper.dataset.paramKey = paramKey;

  const title = document.createElement('span');
  title.className = 'modular__param-label';
  title.textContent = config.label;
  wrapper.appendChild(title);

  const baseValue = valueConfig.base ?? config.default;

  if (config.type === 'select') {
    const select = document.createElement('select');
    select.className = 'modular__param-select';
    (config.options || []).forEach((optionValue) => {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = optionValue;
      select.appendChild(option);
    });
    select.value = baseValue;
    select.addEventListener('change', (event) => {
      setBase(`${node.id}.${paramKey}`, event.target.value);
      renderMatrix();
    });
    wrapper.appendChild(select);
    return wrapper;
  }

  if (config.type === 'boolean') {
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !!baseValue;
    toggle.addEventListener('change', (event) => {
      setBase(`${node.id}.${paramKey}`, event.target.checked);
      renderMatrix();
    });
    wrapper.appendChild(toggle);
    return wrapper;
  }

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'modular__param-slider';
  const { min, max } = config;
  input.min = String(min ?? 0);
  input.max = String(max ?? 1);
  input.step = determineStep(config);
  let numericBase = typeof baseValue === 'number' ? baseValue : Number(config.default ?? min ?? 0);
  if (!Number.isFinite(numericBase)) {
    numericBase = 0;
  }
  input.value = numericBase;
  input.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    setBase(`${node.id}.${paramKey}`, value);
    renderMatrix();
    updateParamValueDisplay(wrapper, config, value);
  });
  wrapper.appendChild(input);

  const valueLabel = document.createElement('span');
  valueLabel.className = 'modular__param-value';
  valueLabel.textContent = formatParamValue(config, numericBase);
  wrapper.appendChild(valueLabel);

  const slewWrapper = document.createElement('div');
  slewWrapper.className = 'modular__param-slew';
  const slewLabel = document.createElement('span');
  slewLabel.textContent = 'Slew (ms)';
  slewWrapper.appendChild(slewLabel);
  const slewInput = document.createElement('input');
  slewInput.type = 'number';
  slewInput.min = '0';
  slewInput.value = valueConfig.slewMs ?? config.slewMs ?? 30;
  slewInput.addEventListener('change', (event) => {
    const value = Math.max(0, Number(event.target.value));
    setParamSlew(`${node.id}.${paramKey}`, value);
  });
  slewWrapper.appendChild(slewInput);
  wrapper.appendChild(slewWrapper);

  return wrapper;
}

function determineStep(config) {
  switch (config.type) {
    case 'frequency':
      return '1';
    case 'time':
      return '0.01';
    case 'integer':
      return '1';
    case 'linear':
    default:
      return '0.01';
  }
}

function formatParamValue(config, value) {
  if (config.type === 'frequency') {
    return formatFrequency(value);
  }
  if (config.type === 'time') {
    return formatMilliseconds(value);
  }
  return formatLevel(value);
}

function updateParamValueDisplay(wrapper, config, value) {
  const valueLabel = wrapper.querySelector('.modular__param-value');
  if (valueLabel) {
    valueLabel.textContent = formatParamValue(config, value);
  }
}

function renderMatrix() {
  const { matrix } = modularElements;
  if (!matrix) return;
  const sources = modularState.patch.sources || [];
  const parameters = collectParameters();
  const table = document.createElement('table');
  table.className = 'modular__matrix-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(document.createElement('th'));
  parameters.forEach((param) => {
    const th = document.createElement('th');
    th.textContent = param.label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  sources.forEach((source) => {
    const row = document.createElement('tr');
    const labelCell = document.createElement('th');
    labelCell.textContent = source.label || source.id;
    row.appendChild(labelCell);
    parameters.forEach((param) => {
      row.appendChild(createMatrixCell(source, param));
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  matrix.innerHTML = '';
  matrix.appendChild(table);

  const editor = renderRouteEditor();
  if (editor) {
    matrix.appendChild(editor);
  }
}

function collectParameters() {
  const parameters = [];
  (modularState.patch.nodes || []).forEach((node) => {
    const template = NODE_LIBRARY[node.type];
    if (!template) return;
    Object.keys(template.params || {}).forEach((paramKey) => {
      parameters.push({
        id: `${node.id}.${paramKey}`,
        label: `${node.id} · ${template.params[paramKey].label}`,
        node,
        config: template.params[paramKey],
      });
    });
  });
  return parameters;
}

function createMatrixCell(source, param) {
  const td = document.createElement('td');
  td.dataset.routeTarget = param.id;
  td.dataset.routeSource = source.id;
  const route = (modularState.patch.routes || []).find(
    (item) => item.src === source.id && item.target === param.id,
  );
  if (route) {
    td.classList.add('modular__matrix-cell--active');
    td.textContent = `${route.amount.toFixed(2)}×`;
  } else {
    td.textContent = '·';
  }
  return td;
}

function handleRouteCellInteraction(src, target) {
  const existing = (modularState.patch.routes || []).find(
    (item) => item.src === src && item.target === target,
  );
  if (!existing) {
    const id = `route-${Date.now()}`;
    setRoute({
      id,
      src,
      target,
      ...ROUTE_DEFAULTS,
    });
    updateSelection({ routeId: id });
  } else {
    updateSelection({ routeId: existing.id, nodeId: target.split('.')[0] });
  }
  renderMatrix();
}

function renderRouteEditor() {
  const route = (modularState.patch.routes || []).find((item) => item.id === modularState.selection.routeId);
  if (!route) return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'modular__route-editor';

  const title = document.createElement('h4');
  title.textContent = `${route.src} → ${route.target}`;
  wrapper.appendChild(title);

  const controls = [
    createRouteNumber('Amount', 'amount', route.amount, 0, 2, 0.01),
    createRouteNumber('Range Min', 'rangeMin', route.range?.[0] ?? 0, -20000, 20000, 1),
    createRouteNumber('Range Max', 'rangeMax', route.range?.[1] ?? 1, -20000, 20000, 1),
    createRouteNumber('Slew (ms)', 'slewMs', route.slewMs ?? 30, 0, 2000, 1),
    createRouteNumber('Dead Zone', 'dead', route.dead ?? 0, 0, 1, 0.01),
    createRouteNumber('Smooth (ms)', 'smoothMs', route.smoothMs ?? 0, 0, 2000, 1),
    createRouteNumber('Hysteresis', 'hyst', route.hyst ?? 0, 0, 1, 0.01),
  ];

  controls.forEach((control) => wrapper.appendChild(control));

  const curveSelect = document.createElement('select');
  curveSelect.value = route.curve || 'lin';
  ROUTE_CURVES.forEach((curve) => {
    const option = document.createElement('option');
    option.value = curve;
    option.textContent = curve.toUpperCase();
    curveSelect.appendChild(option);
  });
  curveSelect.addEventListener('change', (event) => {
    setRoute({ ...route, curve: event.target.value });
    renderMatrix();
  });
  wrapper.appendChild(labeledControl('Curve', curveSelect));

  const opSelect = document.createElement('select');
  opSelect.value = route.op || 'add';
  ROUTE_OPERATIONS.forEach((op) => {
    const option = document.createElement('option');
    option.value = op;
    option.textContent = op;
    opSelect.appendChild(option);
  });
  opSelect.addEventListener('change', (event) => {
    setRoute({ ...route, op: event.target.value });
    renderMatrix();
  });
  wrapper.appendChild(labeledControl('Operation', opSelect));

  const invertToggle = document.createElement('input');
  invertToggle.type = 'checkbox';
  invertToggle.checked = !!route.invert;
  invertToggle.addEventListener('change', (event) => {
    setRoute({ ...route, invert: event.target.checked });
    renderMatrix();
  });
  wrapper.appendChild(labeledControl('Invert', invertToggle));

  const bipolarToggle = document.createElement('input');
  bipolarToggle.type = 'checkbox';
  bipolarToggle.checked = !!route.bipolar;
  bipolarToggle.addEventListener('change', (event) => {
    setRoute({ ...route, bipolar: event.target.checked });
    renderMatrix();
  });
  wrapper.appendChild(labeledControl('Bipolar', bipolarToggle));

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = 'Remove Route';
  removeBtn.className = 'modular__danger';
  removeBtn.addEventListener('click', () => {
    removeRoute(route.id);
    updateSelection({ routeId: null });
    renderMatrix();
  });
  wrapper.appendChild(removeBtn);

  return wrapper;
}

function createRouteNumber(label, key, value, min, max, step) {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value ?? 0;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.addEventListener('change', (event) => {
    const next = Number(event.target.value);
    applyRouteUpdate(key, next);
  });
  return labeledControl(label, input);
}

function applyRouteUpdate(key, value) {
  const route = (modularState.patch.routes || []).find((item) => item.id === modularState.selection.routeId);
  if (!route) return;
  const next = { ...route };
  if (key === 'rangeMin' || key === 'rangeMax') {
    const range = [...(route.range || [0, 1])];
    range[key === 'rangeMin' ? 0 : 1] = value;
    next.range = range;
  } else {
    next[key] = value;
  }
  setRoute(next);
  renderMatrix();
}

function labeledControl(label, control) {
  const wrapper = document.createElement('label');
  wrapper.className = 'modular__field';
  const span = document.createElement('span');
  span.textContent = label;
  wrapper.appendChild(span);
  wrapper.appendChild(control);
  return wrapper;
}

function renderSourcesList() {
  const { sources } = modularElements;
  if (!sources) return;
  const container = document.createElement('div');
  container.className = 'modular__sources-list';
  const entries = modularState.patch.sources || [];
  entries.forEach((source) => {
    container.appendChild(createSourceCard(source));
  });
  const selector = sources.querySelector('.modular__source-select');
  sources.innerHTML = '';
  sources.appendChild(container);
  if (selector) {
    sources.appendChild(selector);
  }
}

function createSourceCard(source) {
  const card = document.createElement('div');
  card.className = 'modular__source-card';
  const title = document.createElement('h4');
  title.textContent = source.label || source.id;
  card.appendChild(title);

  const valueDisplay = document.createElement('div');
  valueDisplay.className = 'modular__source-value';
  const state = getSourceState(source.id);
  const raw = state?.value ?? 0;
  valueDisplay.textContent = raw.toFixed(3);
  card.appendChild(valueDisplay);

  const pipe = { ...defaultImuPipe(), ...source.pipe };
  card.appendChild(createPipeNumber(source, 'offset', pipe.offset ?? 0, -10, 10, 0.01));
  card.appendChild(createPipeNumber(source, 'scale', pipe.scale ?? 1, -5, 5, 0.01));
  card.appendChild(createPipeNumber(source, 'dead', pipe.dead ?? 0, 0, 1, 0.01));
  card.appendChild(createPipeNumber(source, 'smoothMs', pipe.smoothMs ?? 0, 0, 2000, 1));
  card.appendChild(createPipeNumber(source, 'hyst', pipe.hyst ?? 0, 0, 1, 0.01));

  const invert = document.createElement('input');
  invert.type = 'checkbox';
  invert.checked = !!pipe.invert;
  invert.addEventListener('change', (event) => {
    updateSourcePipe(source.id, { invert: event.target.checked });
  });
  card.appendChild(labeledControl('Invert', invert));

  const bipolar = document.createElement('input');
  bipolar.type = 'checkbox';
  bipolar.checked = !!pipe.bipolar;
  bipolar.addEventListener('change', (event) => {
    updateSourcePipe(source.id, { bipolar: event.target.checked });
  });
  card.appendChild(labeledControl('Bipolar', bipolar));

  return card;
}

function createPipeNumber(source, key, value, min, max, step) {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.addEventListener('change', (event) => {
    updateSourcePipe(source.id, { [key]: Number(event.target.value) });
  });
  return labeledControl(key, input);
}

function renderMeters() {
  renderOscilloscope();
  renderImuReadings();
  renderNoteLog();
}

function renderOscilloscope() {
  const { scopeCanvas } = modularElements;
  if (!scopeCanvas) return;
  const ctx = scopeCanvas.getContext('2d');
  const data = getWaveformData();
  const width = scopeCanvas.width;
  const height = scopeCanvas.height;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);
  if (!data) return;
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((value, index) => {
    const x = (index / data.length) * width;
    const y = ((value + 1) / 2) * height;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
}

function renderImuReadings() {
  const { imuMeters } = modularElements;
  if (!imuMeters) return;
  const metrics = modularState.metrics.imu || {};
  imuMeters.innerHTML = '';
  const entries = [
    ['Pitch', metrics.pitch?.toFixed?.(2)],
    ['Roll', metrics.roll?.toFixed?.(2)],
    ['Yaw', metrics.yaw?.toFixed?.(2)],
    ['Accel |g|', metrics.accMagnitude?.toFixed?.(2)],
    ['Motion', metrics.motionEnergy?.toFixed?.(2)],
  ];
  entries.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'modular__meter-row';
    row.innerHTML = `<span>${label}</span><strong>${value ?? '--'}</strong>`;
    imuMeters.appendChild(row);
  });
}

function renderNoteLog() {
  const { noteLog } = modularElements;
  if (!noteLog) return;
  const entries = modularState.metrics.noteLog || [];
  noteLog.innerHTML = '';
  entries
    .slice()
    .reverse()
    .forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'modular__log-item';
      const time = new Date(entry.time).toLocaleTimeString();
      item.textContent = `${time} · ${entry.target}: ${entry.value.toFixed(2)}`;
      noteLog.appendChild(item);
    });
}

function renderPatchText() {
  const { patchTextarea } = modularElements;
  if (!patchTextarea) return;
  patchTextarea.value = getPatchJson();
}

function handleCanvasPointerDown(event) {
  const { canvas } = modularElements;
  if (!canvas) return;
  const port = event.target.closest('.modular__port');
  const nodeEl = event.target.closest('[data-node-id]');
  const zoom = modularState.ui.zoom || 1;
  if (port) {
    const nodeId = port.dataset.nodeId;
    const node = modularState.patch.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const anchor = nodeAnchor(node, port.dataset.portType === 'in' ? 'left' : 'right');
    pendingLink = {
      from: nodeId,
      type: port.dataset.portType,
      start: anchor,
      current: anchor,
    };
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (nodeEl) {
    const nodeId = nodeEl.dataset.nodeId;
    updateSelection({ nodeId });
    const node = modularState.patch.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    pendingNodeDrag = {
      nodeId,
      pointerId: event.pointerId,
      origin: { x: event.clientX, y: event.clientY },
      start: { x: node.position?.x ?? 0, y: node.position?.y ?? 0 },
    };
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  panState = {
    pointerId: event.pointerId,
    origin: { x: event.clientX, y: event.clientY },
    start: { ...modularState.ui.offset },
  };
  canvas.setPointerCapture(event.pointerId);
}

function handleCanvasPointerMove(event) {
  if (pendingNodeDrag && pendingNodeDrag.pointerId === event.pointerId) {
    const zoom = modularState.ui.zoom || 1;
    const dx = (event.clientX - pendingNodeDrag.origin.x) / zoom;
    const dy = (event.clientY - pendingNodeDrag.origin.y) / zoom;
    const x = pendingNodeDrag.start.x + dx;
    const y = pendingNodeDrag.start.y + dy;
    scheduleNodePositionUpdate(pendingNodeDrag.nodeId, { x, y });
    return;
  }
  if (pendingLink) {
    const zoom = modularState.ui.zoom || 1;
    const offset = modularState.ui.offset || { x: 0, y: 0 };
    const rect = modularElements.canvas?.getBoundingClientRect();
    pendingLink.current = {
      x: rect ? (event.clientX - rect.left - offset.x) / zoom : 0,
      y: rect ? (event.clientY - rect.top - offset.y) / zoom : 0,
    };
    renderCanvas();
    return;
  }
  if (panState && panState.pointerId === event.pointerId) {
    const dx = event.clientX - panState.origin.x;
    const dy = event.clientY - panState.origin.y;
    updateUiState({ offset: { x: panState.start.x + dx, y: panState.start.y + dy } });
    renderCanvas();
  }
}

function handleCanvasPointerUp(event) {
  const { canvas } = modularElements;
  if (!canvas) return;
  if (pendingNodeDrag && pendingNodeDrag.pointerId === event.pointerId) {
    pendingNodeDrag = null;
    canvas.releasePointerCapture(event.pointerId);
  }
  if (pendingLink) {
    const target = event.target.closest('.modular__port');
    if (target && target.dataset.portType === 'in' && pendingLink.type === 'out') {
      const from = pendingLink.from;
      const to = target.dataset.nodeId;
      if (from && to && from !== to) {
        addEdge(from, to);
      }
    }
    pendingLink = null;
    renderCanvas();
    canvas.releasePointerCapture(event.pointerId);
  }
  if (panState && panState.pointerId === event.pointerId) {
    panState = null;
    canvas.releasePointerCapture(event.pointerId);
  }
}

let nodePositionRaf = null;
let pendingPosition = null;

function scheduleNodePositionUpdate(nodeId, position) {
  pendingPosition = { nodeId, position };
  if (nodePositionRaf) return;
  nodePositionRaf = requestAnimationFrame(() => {
    if (pendingPosition) {
      updateNodePosition(pendingPosition.nodeId, pendingPosition.position);
      renderCanvas();
    }
    nodePositionRaf = null;
    pendingPosition = null;
  });
}

function startWaveformLoop() {
  const tick = () => {
    renderOscilloscope();
    waveformHandle = requestAnimationFrame(tick);
  };
  waveformHandle = requestAnimationFrame(tick);
}

function renderImuMeters() {
  renderImuReadings();
}

export function disposeModularSynth() {
  unsubscribe?.();
  if (waveformHandle) {
    cancelAnimationFrame(waveformHandle);
  }
}
