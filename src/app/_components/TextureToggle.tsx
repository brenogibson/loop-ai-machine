"use client";

import { useSequencer } from "@/store/sequencer";

// Toggles the style's continuous background texture bed (tape hiss, rumble,
// shaker…). It's a bus-level layer, not a grid track — hence a global switch.
export function TextureToggle() {
  const textureOn = useSequencer((s) => s.textureOn);
  const setTextureOn = useSequencer((s) => s.setTextureOn);

  return (
    <button
      type="button"
      onClick={() => setTextureOn(!textureOn)}
      aria-pressed={textureOn}
      title="Camada de textura de fundo do estilo"
      className={[
        "px-5 py-2 rounded-full border font-medium text-sm transition-all",
        textureOn
          ? "bg-white/10 border-[rgb(var(--synth))]/60 text-[rgb(var(--synth))]"
          : "bg-white/5 border-white/10 text-zinc-500 hover:text-zinc-300",
      ].join(" ")}
    >
      🌫️ Textura {textureOn ? "on" : "off"}
    </button>
  );
}
