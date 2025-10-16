# Compose At Ease

Compose At Ease is a mobile-friendly tap-and-loop music toy built with vanilla JavaScript and [Tone.js](https://tonejs.github.io/). Draw notes or chords inside a quantised grid, capture 1–4 bar ideas, and loop them immediately.

## Quick start

1. Install any static file server (optional). The examples below use [`serve`](https://www.npmjs.com/package/serve):
   ```bash
   npm install --global serve
   ```
2. Launch the server from the project root:
   ```bash
   serve .
   ```
3. Open the reported URL (usually `http://localhost:3000`) and start composing.

You can also open `index.html` directly in a modern browser.

## Core experience

- **Scale lanes:** Each horizontal lane represents one note of the selected scale. Octave boundaries are emphasised with thicker separators and alternating backgrounds.
- **Playhead & ticks:** A beat-synced playhead sweeps across the grid while beat and subdivision ticks stay anchored to the top bar.
- **Drawing tools:** Use the bottom toolbar to toggle between the Note and Chord tools, and switch between Tap (1 slot) or Hold (click + drag) length capture modes.
- **Quantised capture:** On Record, a one-bar count-in precedes recording. Input is quantised to the current grid (1/8 or 1/16) using a tolerance window, ensuring early or late taps land on the nearest slot without sounding ahead of the beat.
- **Looping:** After 1, 2, or 4 bars (selectable), the Transport continues looping the captured phrase.

## Controls

| Area | Control | Description |
| --- | --- | --- |
| Top bar | **Settings** | Reveals tempo, scale, root, grid, metronome, and master volume controls. |
| Grid | **Tap** | Tap to place a note on the nearest grid slot. Long-press a note block to delete it. |
| Grid | **Hold** | Press and drag in Hold mode. Release snaps to the next grid boundary. |
| Bottom bar | **Rec** | Starts a one-bar count-in, records for the selected number of bars, then loops. Press again to stop recording early. |
| Bottom bar | **Bars** | Choose 1, 2, or 4 bar loop lengths. |
| Bottom bar | **Tool** | Switch between Note and Chord placement. |
| Bottom bar | **Length** | Toggle Tap (fixed one-slot) or Hold (press + drag). |
| Bottom bar | **Chord Degree** | Select the diatonic triad (I–vii°) used by the Chord tool. |
| Left rail | **▲ / ▼** | Scroll the visible octave window up or down. |

## Audio engine

- Powered by Tone.js `Transport`, `PolySynth`, and `MembraneSynth` instances.
- Quantised scheduling uses the transport tick grid. Notes are rendered with a triangle-based polysynth; chord ghost notes briefly layer a softer sine pad.
- A dedicated metronome channel accents downbeats during count-in and playback, and can be toggled from the settings drawer.
- Master level can be trimmed between -40 dB and 0 dB.

## Data model snapshot

```json
{
  "session": { "bpm": 100, "bars": 1, "grid": 8, "root": "C", "scale": "major" },
  "notes": [
    { "laneDegree": 5, "octave": 4, "slot": 6, "len": 1, "kind": "note" },
    { "laneDegree": 3, "octave": 4, "slot": 10, "len": 2, "kind": "chord", "degree": 5 }
  ]
}
```

## Implementation notes

- The grid is rendered with CSS Grid and responsive styling tuned for tablet/phone widths.
- Quantisation derives from the transport's PPQ to guarantee alignment with Tone.js scheduling.
- Playhead motion is animated via `requestAnimationFrame`, sampling transport ticks for smooth sync.
- Deleting clips relies on long-press detection for touch ergonomics; notes reflash on playback trigger to highlight timing.

## Roadmap ideas

- Session persistence and sharing
- Alternate synth engines and FX routing
- Swing, humanise, and MIDI export options
- Multi-track layering and performance recording

Enjoy experimenting! 🎶
