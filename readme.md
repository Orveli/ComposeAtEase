Goal

Tap-and-loop music toy for mobile. One screen. Text-light. Always in key.

Core UX

Horizontal lanes = notes of the chosen scale. Default view shows one octave (6–8 lanes).

Strong separators mark octave bounds. Alternating octave backgrounds.

Moving playhead with beat and subdivision ticks.

User draws with two tools: Note and Chord.

Two play styles: Tap (short) and Hold (sustained while pressed).

Smart quantization snaps timing but accepts early/late presses.

Flow

Press REC → 1-bar count-in → record 1 / 2 / 4 bars → loop plays.

Tap a lane to place a note at the nearest grid slot.

In Hold mode, note_off snaps to next grid boundary.

Long-press an existing block to delete.

Controls (bottom bar, icons)

REC.

Bars: 1–2–4.

Tool: Note ↔ Chord.

Length mode: Tap ↔ Hold.

Chord degree: I ii iii IV V vi vii°.
Hidden top drawer: BPM, scale, root, grid (1/8 or 1/16), volumes.

Quantization (smart)

Grid duration = beatDur * (1/2 or 1/4).

Window: ±40–70 ms around each slot (device-tuned).

For t_in:

Map to nearest slot q = round(t_in / gridDur).

If early but within window → schedule at q.

If late but within window → move back to q.

Hold: on → q_on, off → q_off >= q_on+1, both snapped.

Chords

In Chord tool, a tap places triad of the selected degree in the current octave.

Visual: solid root block + ghost blocks (30–60% opacity, dashed border) for third and fifth; they fill briefly at trigger time.

Octave navigation

Default: one octave visible.

Drag vertically to scroll by whole octaves (snaps to boundaries).

Small ▲/▼ arrows move one octave per tap.

Audio engine spans multiple octaves regardless of view.

Audio (MVP)

WebAudio or native module.

Simple synth or sampler.

Metronome on its own channel.

Polyphony ≥ 8.

Data model (minimal)
{
  "session": { "bpm": 100, "bars": 1, "grid": 8, "root": "C", "scale": "Major" },
  "notes": [
    { "laneId": 5, "octave": 4, "slot": 6, "len": 1, "kind": "note" },
    { "laneId": 3, "octave": 4, "slot": 10, "len": 2, "kind": "chord", "degree": 5 }
  ]
}

Visual language

Alternating octave backgrounds, bold octave borders.

Beat ticks tall; subdivision ticks faint.

Tap = short bar; Hold = stretched bar.

Root lane in each octave has a small marker.

UI icons only; tooltips optional later.

Defaults

Note + Tap.

1 bar, 1/8 grid, BPM 100, C major.

Metronome on.

Out-of-scope for MVP

Save/share, effects, swing/humanize, MIDI, multi-tracks.

Acceptance criteria

Recording and looping of 1–4 bars with correct snap and playback.

Early/late taps never sound before the quantized slot, yet are captured.

Hold notes end on the next grid boundary after release.

Chord degree maps to correct triads; ghost notes render and flash on trigger.

Octave scrolling snaps cleanly and does not disrupt timing.
