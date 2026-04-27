"use client";

import { useCallback, useState } from "react";
import { getCurrentEngine } from "@/lib/audio/engine-registry";
import { createSurpriseSource } from "@/lib/audio/surprise";
import { registerSurpriseAudio } from "@/lib/audio/surprise-registry";
import type { SurpriseStyle } from "@/lib/claude/surprise-tool";
import { useSequencer } from "@/store/sequencer";

type SurpriseResponse = {
  phrase: string;
  language: string;
  voice_id: string;
  style: SurpriseStyle;
  steps: number[];
  volume_db: number;
  commentary: string;
  audio_base64: string;
};

const LOADING_MESSAGES = [
  "Inventando uma frase secreta…",
  "Treinando a voz do robô…",
  "Pegando emprestado o microfone…",
  "Remixando palavras no reverb…",
  "Cortando samples no tempo certo…",
];

let surpriseCounter = 0;

export function SurpriseButton() {
  const appendChat = useSequencer((s) => s.appendChat);
  const pushSurpriseHistory = useSequencer((s) => s.pushSurpriseHistory);
  const addSurpriseTrack = useSequencer((s) => s.addSurpriseTrack);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (loading) return;
    const engine = getCurrentEngine();
    if (!engine) {
      setError("engine não disponível");
      return;
    }
    setLoading(true);
    setError(null);
    const { pattern, vibeLabel, surpriseHistory } = useSequencer.getState();
    try {
      const res = await fetch("/api/surprise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern,
          vibeLabel,
          recentPhrases: surpriseHistory,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `http ${res.status}`);
      }
      const data = (await res.json()) as SurpriseResponse;
      const sampleId = `surprise_${++surpriseCounter}`;
      const source = await createSurpriseSource({
        sampleId,
        phrase: data.phrase,
        style: data.style,
        audioBase64: data.audio_base64,
      });
      engine.registerSurpriseSource(source);
      registerSurpriseAudio(sampleId, data.audio_base64);
      addSurpriseTrack({
        sampleId,
        phrase: data.phrase,
        style: data.style,
        voiceId: data.voice_id,
        language: data.language,
        steps: data.steps,
        volumeDb: data.volume_db,
      });
      pushSurpriseHistory(data.phrase);
      appendChat({
        role: "assistant",
        text: `🎤 "${data.phrase}" (${data.style}) — ${data.commentary}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      appendChat({ role: "assistant", text: `⚠️ surpresa falhou: ${msg}` });
    } finally {
      setLoading(false);
    }
  }, [addSurpriseTrack, appendChat, loading, pushSurpriseHistory]);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={[
          "relative px-8 py-4 rounded-2xl font-bold text-lg transition-all",
          "bg-gradient-to-br from-fuchsia-500 via-purple-500 to-indigo-500",
          "text-white shadow-lg shadow-fuchsia-500/30",
          "hover:scale-105 hover:shadow-fuchsia-500/50",
          "disabled:opacity-70 disabled:cursor-wait disabled:scale-100",
        ].join(" ")}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="inline-block animate-spin">🎲</span>
            <span>
              {LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]}
            </span>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span>🎤</span>
            <span>Surpresa</span>
          </span>
        )}
      </button>
      {error && <div className="text-xs text-rose-400">{error}</div>}
    </div>
  );
}
