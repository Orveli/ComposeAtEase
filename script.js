(() => {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const scales = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10]
  };
  const degreeLabels = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];

  const ui = {
    lanes: document.getElementById("lanes"),
    tickTrack: document.getElementById("tick-track"),
    playhead: document.querySelector(".playhead"),
    record: document.getElementById("record"),
    status: document.getElementById("status"),
    drawerToggle: document.querySelector(".drawer-toggle"),
    drawer: document.getElementById("settings-drawer"),
    bpm: document.getElementById("bpm"),
    bpmDisplay: document.getElementById("bpm-display"),
    root: document.getElementById("root"),
    scale: document.getElementById("scale"),
    grid: document.getElementById("grid"),
    metronome: document.getElementById("metronome"),
    volume: document.getElementById("volume"),
    volumeDisplay: document.getElementById("volume-display"),
    barsGroup: document.querySelectorAll("[data-bars]"),
    toolGroup: document.querySelectorAll("[data-tool]"),
    lengthGroup: document.querySelectorAll("[data-length]"),
    degreeGroup: document.querySelectorAll("[data-degree]"),
    octaveUp: document.getElementById("octave-up"),
    octaveDown: document.getElementById("octave-down")
  };

  const state = {
    session: {
      bpm: 100,
      bars: 1,
      grid: 8,
      root: "C",
      scale: "major"
    },
    notes: [],
    tool: "note",
    lengthMode: "tap",
    chordDegree: 1,
    visibleOctave: 4,
    isRecording: false,
    isCountingIn: false,
    metronome: true,
    drawerOpen: false,
    laneData: [],
    pendingHolds: new Map(),
    nextId: 1
  };

  const transport = Tone.Transport;
  const ticksPerBeat = transport.PPQ;
  const volume = new Tone.Volume(-6).toDestination();
  const synth = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 8,
    voice: Tone.Synth
  }).connect(volume);
  synth.set({
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.45 },
    oscillator: { type: "triangle" }
  });

  const ghostSynth = new Tone.PolySynth(Tone.Synth).connect(volume);
  ghostSynth.set({
    volume: -12,
    envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.2 },
    oscillator: { type: "sine" }
  });

  const metronome = new Tone.MembraneSynth({
    volume: -14,
    envelope: { attack: 0.001, decay: 0.05, sustain: 0.1, release: 0.2 }
  }).connect(volume);

  let notePart = null;
  let metronomePart = null;
  let playheadRaf;
  let recordStopEvent = null;
  let countInEvent = null;

  function setStatus(text) {
    ui.status.textContent = text || "";
  }

  function getRootIndex() {
    return noteNames.indexOf(state.session.root);
  }

  function midiFromRoot(offsetSemitones, octave) {
    const rootIndex = getRootIndex();
    const octaveShift = Math.floor(offsetSemitones / 12);
    const semitone = ((offsetSemitones % 12) + 12) % 12;
    const midi = 12 * (octave + 1 + octaveShift) + ((rootIndex + semitone + 12) % 12);
    return midi;
  }

  function computeLaneData() {
    const scaleSteps = scales[state.session.scale];
    const lanes = [];
    const baseOctave = state.visibleOctave;
      for (let i = scaleSteps.length; i >= 0; i--) {
        const degreeIndex = i % scaleSteps.length;
        const octaveOffset = i === scaleSteps.length ? 1 : 0;
        const offset = scaleSteps[degreeIndex];
        const octave = baseOctave + octaveOffset;
        const midi = midiFromRoot(offset, octave);
        const name = noteNames[(getRootIndex() + offset) % 12];
        lanes.push({
          key: `${degreeIndex + 1}-${octave}`,
          noteName: name,
          octave,
          degree: degreeIndex + 1,
          midi,
          isOctaveBoundary: degreeIndex === 0
        });
      }
    state.laneData = lanes;
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function buildTickTrack() {
    clearChildren(ui.tickTrack);
    const totalSlots = getTotalSlots();
    ui.tickTrack.style.setProperty("--tick-columns", totalSlots);
    const slotsPerBeat = state.session.grid / 4;
    for (let i = 0; i < totalSlots; i++) {
      const div = document.createElement("div");
      div.classList.add("tick");
      if (i % slotsPerBeat === 0) {
        div.classList.add("beat");
      } else {
        div.classList.add("sub");
      }
      ui.tickTrack.appendChild(div);
    }
  }

  function buildLanes() {
    computeLaneData();
    clearChildren(ui.lanes);
    const totalSlots = getTotalSlots();
    ui.lanes.style.setProperty("--grid-columns", totalSlots);

    state.laneData.forEach((lane) => {
      const laneEl = document.createElement("div");
      laneEl.className = "lane";
      if (lane.isOctaveBoundary) laneEl.classList.add("octave-boundary");
      laneEl.dataset.key = lane.key;

      const label = document.createElement("div");
      label.className = "lane-label";
      if (lane.degree === 1) {
        const marker = document.createElement("span");
        marker.className = "marker";
        label.appendChild(marker);
      }
      const text = document.createElement("span");
      text.textContent = `${lane.noteName}${lane.octave}`;
      label.appendChild(text);
      laneEl.appendChild(label);

      const slotsPerBeat = state.session.grid / 4;
      for (let slot = 0; slot < totalSlots; slot++) {
        const slotEl = document.createElement("div");
        slotEl.className = "slot";
        if (slot % slotsPerBeat === 0) {
          slotEl.classList.add("beat");
        }
        laneEl.appendChild(slotEl);
      }
      ui.lanes.appendChild(laneEl);
    });
  }

  function getTicksPerSlot() {
    return (ticksPerBeat * 4) / state.session.grid;
  }

  function getTotalSlots() {
    return state.session.bars * state.session.grid;
  }

  function slotToPosition(slot) {
    const totalSlots = getTotalSlots();
    return (slot / totalSlots) * 100;
  }

  function createNoteElement(note) {
    const laneEl = ui.lanes.querySelector(`.lane[data-key="${note.laneDegree}-${note.octave}"]`);
    if (!laneEl) return null;
    const block = document.createElement("div");
    block.className = "note-block";
    if (note.len > 1) block.classList.add("hold");
    block.dataset.id = note.id;

    block.style.left = `${slotToPosition(note.slot)}%`;
    block.style.width = `${(note.len / getTotalSlots()) * 100}%`;

    if (note.kind === "note") {
      block.textContent = noteNames[(getRootIndex() + scales[state.session.scale][note.laneDegree - 1]) % 12];
    } else {
      block.textContent = degreeLabels[note.degree - 1];
      const ghostWrap = document.createElement("div");
      ghostWrap.className = "ghosts";
      for (let i = 0; i < 2; i++) {
        const ghost = document.createElement("div");
        ghost.className = "ghost";
        ghostWrap.appendChild(ghost);
      }
      block.appendChild(ghostWrap);
    }

    attachNoteDeletion(block, note.id);
    laneEl.appendChild(block);
    return block;
  }

  function attachNoteDeletion(block, id) {
    let timer = null;
    function clearTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
    block.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      block.setPointerCapture(event.pointerId);
      timer = setTimeout(() => {
        removeNote(id);
        clearTimer();
      }, 450);
    });
    block.addEventListener("pointerup", (event) => {
      clearTimer();
      block.releasePointerCapture(event.pointerId);
    });
    block.addEventListener("pointerleave", clearTimer);
    block.addEventListener("pointercancel", clearTimer);
  }

  function renderNotes() {
    document.querySelectorAll(".note-block").forEach((node) => node.remove());
    state.notes.forEach((note) => {
      createNoteElement(note);
    });
  }

  function getLaneFromEvent(event) {
    const laneEl = event.target.closest(".lane");
    if (!laneEl) return null;
    const [degree, octave] = laneEl.dataset.key.split("-").map(Number);
    return state.laneData.find((l) => l.degree === degree && l.octave === octave);
  }

  function pointerSlotFromPosition(event, laneEl, mode = "nearest", allowEnd = false) {
    const rect = laneEl.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const totalSlots = getTotalSlots();
    const raw = ratio * totalSlots;
    let slot;
    if (mode === "ceil") {
      slot = Math.ceil(raw);
    } else if (mode === "floor") {
      slot = Math.floor(raw);
    } else {
      slot = Math.round(raw);
    }
    if (allowEnd) {
      slot = Math.max(0, Math.min(totalSlots, slot));
    } else {
      slot = Math.max(0, Math.min(totalSlots - 1, slot));
    }
    return slot;
  }

  function quantizeTicks(ticks) {
    const totalSlots = getTotalSlots();
    const loopTicks = getTicksPerSlot() * totalSlots;
    const normalized = ((ticks % loopTicks) + loopTicks) % loopTicks;
    const ticksPerSlot = getTicksPerSlot();
    const slotFloat = normalized / ticksPerSlot;
    const slot = Math.round(slotFloat);
    return {
      slot: slot % totalSlots,
      snappedTicks: slot * ticksPerSlot
    };
  }

  function getCurrentQuantizedSlot() {
    const ticks = transport.ticks;
    return quantizeTicks(ticks);
  }

  function createNote({ lane, slot, len, kind, degree }) {
    const note = {
      id: `n${state.nextId++}`,
      laneDegree: lane.degree,
      octave: lane.octave,
      slot,
      len,
      kind,
      degree: degree || lane.degree
    };
    state.notes.push(note);
    const block = createNoteElement(note);
    if (block) block.classList.add("flash");
    rebuildPart();
  }

  function removeNote(id) {
    const index = state.notes.findIndex((n) => n.id === id);
    if (index !== -1) {
      state.notes.splice(index, 1);
      renderNotes();
      rebuildPart();
    }
  }

  function handleTap(event, lane) {
    const laneEl = event.target.closest(".lane");
    const { slot } = state.isRecording ? getCurrentQuantizedSlot() : { slot: pointerSlotFromPosition(event, laneEl) };
    createNote({ lane, slot, len: 1, kind: state.tool, degree: state.chordDegree });
    triggerSound(lane, state.tool, state.chordDegree);
  }

  function handleHoldStart(event, lane) {
    const laneEl = event.target.closest(".lane");
    let slot;
    if (state.isRecording) {
      slot = getCurrentQuantizedSlot().slot;
    } else {
      slot = pointerSlotFromPosition(event, laneEl);
    }
    const note = {
      lane,
      slot,
      pointerId: event.pointerId,
      id: `temp-${event.pointerId}`
    };
    state.pendingHolds.set(event.pointerId, note);
  }

  function handleHoldEnd(event) {
    const pending = state.pendingHolds.get(event.pointerId);
    if (!pending) return;
    const laneEl = ui.lanes.querySelector(`.lane[data-key="${pending.lane.degree}-${pending.lane.octave}"]`);
    const totalSlots = getTotalSlots();
    let endSlot;
    if (state.isRecording) {
      const quant = getCurrentQuantizedSlot();
      endSlot = quant.slot;
    } else if (event.target.closest(".lane")) {
      endSlot = pointerSlotFromPosition(event, laneEl || event.target.closest(".lane"), "ceil", true);
    } else {
      endSlot = pending.slot + 1;
    }
    if (endSlot <= pending.slot) {
      endSlot = pending.slot + 1;
    }
    const finalLen = Math.max(1, Math.min(endSlot, getTotalSlots()) - pending.slot);
    createNote({
      lane: pending.lane,
      slot: pending.slot,
      len: finalLen,
      kind: state.tool,
      degree: state.chordDegree
    });
    triggerSound(pending.lane, state.tool, state.chordDegree);
    state.pendingHolds.delete(event.pointerId);
  }

  function triggerSound(lane, kind, degree) {
    const frequency = Tone.Frequency(lane.midi, "midi").toFrequency();
    if (kind === "note") {
      synth.triggerAttackRelease(frequency, "8n");
    } else {
      const notes = triadForDegree(degree, lane.octave);
      synth.triggerAttackRelease(notes.map((n) => Tone.Frequency(n, "midi").toFrequency()), "8n");
      ghostSynth.triggerAttackRelease(notes.slice(1).map((n) => Tone.Frequency(n, "midi").toFrequency()), "16n");
    }
  }

  function triadForDegree(degree, octave) {
    const scaleSteps = scales[state.session.scale];
    const rootIndex = getRootIndex();
    const totalDegrees = scaleSteps.length;
    const degreeIndex = (degree - 1 + totalDegrees) % totalDegrees;
    const rootOffset = scaleSteps[degreeIndex];
    const thirdOffset = scaleSteps[(degreeIndex + 2) % totalDegrees] + Math.floor((degreeIndex + 2) / totalDegrees) * 12;
    const fifthOffset = scaleSteps[(degreeIndex + 4) % totalDegrees] + Math.floor((degreeIndex + 4) / totalDegrees) * 12;
    const baseMidi = midiFromRoot(rootOffset, octave);
    const thirdMidi = midiFromRoot(thirdOffset, octave);
    const fifthMidi = midiFromRoot(fifthOffset, octave);
    return [baseMidi, thirdMidi, fifthMidi];
  }

  function rebuildPart() {
    if (notePart) {
      notePart.dispose();
      notePart = null;
    }
    const ticksPerSlot = getTicksPerSlot();
    const events = state.notes.map((note) => ({
      time: note.slot * ticksPerSlot,
      note
    }));
    notePart = new Tone.Part((time, value) => {
      const lane = state.laneData.find((l) => l.degree === value.note.laneDegree && l.octave === value.note.octave);
      if (!lane) return;
      const duration = Tone.Ticks(value.note.len * ticksPerSlot).toSeconds();
      if (value.note.kind === "note") {
        synth.triggerAttackRelease(Tone.Frequency(lane.midi, "midi"), duration, time);
      } else {
        const chord = triadForDegree(value.note.degree, lane.octave);
        synth.triggerAttackRelease(chord.map((m) => Tone.Frequency(m, "midi")), duration, time);
        ghostSynth.triggerAttackRelease(
          chord.slice(1).map((m) => Tone.Frequency(m, "midi")),
          Math.min(duration, Tone.Time("16n").toSeconds()),
          time
        );
      }
      flashBlock(value.note.id);
    }, events);
    notePart.loop = true;
    notePart.loopStart = 0;
    notePart.loopEnd = Tone.Ticks(getTotalSlots() * ticksPerSlot);
    notePart.start(0);
  }

  function flashBlock(id) {
    const block = document.querySelector(`.note-block[data-id="${id}"]`);
    if (block) {
      block.classList.remove("flash");
      void block.offsetWidth;
      block.classList.add("flash");
    }
  }

  function rebuildMetronome() {
    if (metronomePart) {
      metronomePart.dispose();
      metronomePart = null;
    }
    metronomePart = new Tone.Part((time, value) => {
      if (!state.metronome) return;
      const pitch = value.isDownbeat ? "G4" : "D4";
      metronome.triggerAttackRelease(pitch, "16n", time);
    }, generateMetronomeEvents());
    metronomePart.loop = true;
    metronomePart.loopStart = 0;
    metronomePart.loopEnd = `${state.session.bars}m`;
    metronomePart.start(0);
  }

  function generateMetronomeEvents() {
    const events = [];
    for (let bar = 0; bar < state.session.bars; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        events.push({
          time: `${bar}m + ${beat}n`,
          isDownbeat: beat === 0
        });
      }
    }
    return events;
  }

  function configureTransport() {
    transport.bpm.value = state.session.bpm;
    transport.loop = true;
    transport.loopStart = 0;
    transport.loopEnd = `${state.session.bars}m`;
  }

  function animatePlayhead() {
    if (transport.state !== "started") {
      ui.playhead.style.left = "0%";
    } else {
      const ticksPerLoop = getTicksPerSlot() * getTotalSlots();
      const position = ((transport.ticks % ticksPerLoop) + ticksPerLoop) % ticksPerLoop;
      const ratio = position / ticksPerLoop;
      ui.playhead.style.left = `${ratio * 100}%`;
    }
    playheadRaf = requestAnimationFrame(animatePlayhead);
  }

  function cancelScheduledEvents() {
    if (recordStopEvent !== null) {
      transport.clear(recordStopEvent);
      recordStopEvent = null;
    }
    if (countInEvent !== null) {
      transport.clear(countInEvent);
      countInEvent = null;
    }
  }

  async function startCountIn() {
    await Tone.start();
    configureTransport();
    if (transport.state !== "started") {
      transport.start();
    }
    cancelScheduledEvents();
    state.isRecording = false;
    state.isCountingIn = true;
    setStatus("Count-in");
    countInEvent = transport.scheduleOnce(() => {
      state.isCountingIn = false;
      state.isRecording = true;
      setStatus("Recording");
      recordStopEvent = transport.scheduleOnce(() => {
        stopRecording();
      }, `+${state.session.bars}m`);
    }, "+1m");
  }

  function stopRecording() {
    state.isRecording = false;
    state.isCountingIn = false;
    setStatus("Looping");
    cancelScheduledEvents();
  }

  function toggleRecord() {
    if (state.isRecording || state.isCountingIn) {
      stopRecording();
      return;
    }
    startCountIn();
  }

  function activateToggle(nodes, activeValue, attribute) {
    nodes.forEach((node) => {
      if (node.dataset[attribute] === String(activeValue)) {
        node.classList.add("active");
      } else {
        node.classList.remove("active");
      }
    });
  }

  function updateSession() {
    configureTransport();
    buildTickTrack();
    buildLanes();
    renderNotes();
    rebuildPart();
    rebuildMetronome();
  }

  function initEvents() {
    ui.drawerToggle.addEventListener("click", () => {
      state.drawerOpen = !state.drawerOpen;
      ui.drawer.hidden = !state.drawerOpen;
      ui.drawerToggle.setAttribute("aria-expanded", String(state.drawerOpen));
    });

    ui.record.addEventListener("click", toggleRecord);

    ui.bpm.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      state.session.bpm = value;
      ui.bpmDisplay.textContent = value;
      configureTransport();
    });

    ui.root.addEventListener("change", (event) => {
      state.session.root = event.target.value;
      updateSession();
    });

    ui.scale.addEventListener("change", (event) => {
      state.session.scale = event.target.value;
      updateSession();
    });

    ui.grid.addEventListener("change", (event) => {
      state.session.grid = Number(event.target.value);
      updateSession();
    });

    ui.metronome.addEventListener("change", (event) => {
      state.metronome = event.target.checked;
    });

    ui.volume.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      volume.volume.value = value;
      ui.volumeDisplay.textContent = `${value} dB`;
    });

    ui.barsGroup.forEach((button) => {
      button.addEventListener("click", () => {
        state.session.bars = Number(button.dataset.bars);
        activateToggle(ui.barsGroup, state.session.bars, "bars");
        updateSession();
      });
    });

    ui.toolGroup.forEach((button) => {
      button.addEventListener("click", () => {
        state.tool = button.dataset.tool;
        activateToggle(ui.toolGroup, state.tool, "tool");
      });
    });

    ui.lengthGroup.forEach((button) => {
      button.addEventListener("click", () => {
        state.lengthMode = button.dataset.length;
        activateToggle(ui.lengthGroup, state.lengthMode, "length");
      });
    });

    ui.degreeGroup.forEach((button) => {
      button.addEventListener("click", () => {
        state.chordDegree = Number(button.dataset.degree);
        activateToggle(ui.degreeGroup, state.chordDegree, "degree");
      });
    });

    ui.octaveUp.addEventListener("click", () => {
      state.visibleOctave = Math.min(6, state.visibleOctave + 1);
      updateSession();
    });

    ui.octaveDown.addEventListener("click", () => {
      state.visibleOctave = Math.max(2, state.visibleOctave - 1);
      updateSession();
    });

    ui.lanes.addEventListener("pointerdown", (event) => {
      const lane = getLaneFromEvent(event);
      if (!lane) return;
      if (state.lengthMode === "tap") {
        handleTap(event, lane);
      } else {
        handleHoldStart(event, lane);
      }
    });

    window.addEventListener("pointerup", (event) => {
      if (state.lengthMode === "hold") {
        handleHoldEnd(event);
      }
    });

    window.addEventListener("blur", () => {
      state.pendingHolds.clear();
    });
  }

  function init() {
    buildTickTrack();
    buildLanes();
    renderNotes();
    rebuildMetronome();
    configureTransport();
    activateToggle(ui.barsGroup, state.session.bars, "bars");
    activateToggle(ui.toolGroup, state.tool, "tool");
    activateToggle(ui.lengthGroup, state.lengthMode, "length");
    activateToggle(ui.degreeGroup, state.chordDegree, "degree");
    animatePlayhead();
    initEvents();
    setStatus("Ready");
  }

  init();
})();
