"use client";

import { useCallback, useState } from "react";
import { renderLoopToMp3 } from "@/lib/audio/offline-render";
import { fetchCatalog } from "@/lib/samples/catalog";
import { useSequencer } from "@/store/sequencer";

function slugify(s: string | null): string {
  if (!s) return "loop";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "loop";
}

export function ExportButton() {
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (rendering) return;
    setRendering(true);
    setError(null);
    try {
      const { pattern, vibeLabel, vibeId } = useSequencer.getState();
      const catalog = await fetchCatalog();
      const blob = await renderLoopToMp3({ pattern, catalog, bars: 2 });
      const url = URL.createObjectURL(blob);
      const vibePart = slugify(vibeLabel ?? vibeId);
      const filename = `loop-ai-${vibePart}-${pattern.bpm}bpm.mp3`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error("export failed", err);
    } finally {
      setRendering(false);
    }
  }, [rendering]);

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={rendering}
        className={[
          "px-5 py-2 rounded-full border font-medium text-sm transition-all",
          "bg-zinc-900 border-zinc-700 text-zinc-200",
          "hover:border-emerald-500 hover:text-emerald-300",
          "disabled:opacity-60 disabled:cursor-wait",
        ].join(" ")}
      >
        {rendering ? "Renderizando…" : "⬇ Baixar MP3"}
      </button>
      {error && <div className="text-xs text-rose-400">{error}</div>}
    </div>
  );
}
