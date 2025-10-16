# ComposeAtEase

ComposeAtEase is a compact loop sketchpad built with Tone.js. Lay down a melodic idea, add a drum groove, and let the one-bar loop keep you inspired.

## Features

- **Simple transport** – hit **Play** to start the loop from the top and **Stop** to reset.
- **Quantized editing** – pick 1/8 or 1/16 resolution from the front bar. All note starts and ends snap to the grid.
- **Melody lanes** – the visible octave shows the current scale. Tap to drop a short note or drag to stretch its length. Drag existing blocks to move them, or drag the right edge to resize. Double-tap any block to delete it.
- **Drum lanes** – three dedicated rows (kick, snare, hat) share the same grid and editing gestures as the melody lanes.
- **Scale aware** – choose a root note, switch between major and minor, and shift the visible octave without breaking the loop.
- **Tone.js sound engine** – a poly synth powers the melody while dedicated drum synths handle kick, snare, and hat voices.
- **Live feedback** – looping playheads, grid ticks, and note highlights make timing obvious.

## Usage

1. Open `index.html` in a modern browser.
2. Set your **Quantization**, **BPM**, **Scale**, **Root**, and **Volume** from the top bar.
3. Use the octave badges in the melody panel to show the pitches you want.
4. Tap or drag inside the melody or drum lanes to add notes. Drag notes around or stretch them to refine timing.
5. Press **Play** to hear the loop, **Stop** to reset to the start.

Everything runs directly in the browser – no build step required.

### IMU sensor streaming

The **Motion Sensor** panel streams accelerometer and gyroscope data when available. Modern mobile browsers require the page to
be served from `https://` (or `http://localhost`) before sensor events will fire, and iOS additionally asks for permission in
response to a user interaction. Use the **Start Tracking** button after loading the app over a secure connection to grant the
required access.
