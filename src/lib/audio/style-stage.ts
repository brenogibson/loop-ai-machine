import * as Tone from "tone";
import { getMasterBus } from "./master-bus";
import { DEFAULT_STYLE, STYLES, type StyleId, type StyleColor, type StyleTexture } from "./styles";

// Per-style color + texture stage, inserted BEFORE the master bus:
//
//   sources → stage.input → [style color chain] → outTrim → masterBus.input
//                    ↑ texture also feeds input (so it's tinted + visible in FFT)
//
// The drop/gesture code keeps exclusive ownership of the master bus nodes
// (filter/tremolo/reverb) — this stage only ever touches its own nodes, so a
// Samba room reverb and the drop's bloom are different nodes that compose.
export type StyleStage = {
  input: Tone.Gain;
  setStyle: (id: StyleId) => void;
  getStyle: () => StyleId;
  setTextureEnabled: (on: boolean) => void;
  dispose: () => void;
};

let current: StyleStage | null = null;

export function getStyleStage(): StyleStage {
  if (current) return current;

  const input = new Tone.Gain(1);
  const outTrim = new Tone.Gain(1);
  outTrim.connect(getMasterBus().input);

  let styleId: StyleId = DEFAULT_STYLE;
  let color: StyleColor | null = null;
  let texture: StyleTexture | null = null;
  let textureEnabled = true;
  let transportRunning = false;

  const buildChain = (id: StyleId) => {
    color = STYLES[id].createColor();
    input.connect(color.input);
    color.output.connect(outTrim);
    texture = STYLES[id].createTexture();
    texture.output.connect(input);
    if (transportRunning && textureEnabled) texture.start();
  };

  const teardownChain = () => {
    if (color) {
      input.disconnect(color.input);
      color.dispose();
      color = null;
    }
    if (texture) {
      texture.stop();
      texture.dispose();
      texture = null;
    }
  };

  buildChain(styleId);

  // Texture follows the transport: a continuous bed while stopped would be
  // confusing. Also makes SharePlayer work for free.
  const onStart = () => {
    transportRunning = true;
    if (textureEnabled) texture?.start();
  };
  const onStop = () => {
    transportRunning = false;
    texture?.stop();
  };
  Tone.getTransport().on("start", onStart);
  Tone.getTransport().on("stop", onStop);

  current = {
    input,
    getStyle: () => styleId,
    setStyle: (id) => {
      if (id === styleId && color) return;
      styleId = id;
      // Click-free swap: dip the trim, rebuild, ramp back.
      outTrim.gain.rampTo(0, 0.03);
      setTimeout(() => {
        teardownChain();
        buildChain(id);
        outTrim.gain.rampTo(1, 0.03);
      }, 40);
    },
    setTextureEnabled: (on) => {
      textureEnabled = on;
      if (on && transportRunning) texture?.start();
      else texture?.stop();
    },
    dispose: () => {
      Tone.getTransport().off("start", onStart);
      Tone.getTransport().off("stop", onStop);
      teardownChain();
      input.dispose();
      outTrim.dispose();
      current = null;
    },
  };
  return current;
}
