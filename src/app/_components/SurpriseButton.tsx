"use client";

import { useCallback, useState } from "react";
import { getCurrentEngine } from "@/lib/audio/engine-registry";
import { createSurpriseSource } from "@/lib/audio/surprise";
import { registerSurpriseAudio } from "@/lib/audio/surprise-registry";
import type { SurpriseStyle } from "@/lib/claude/surprise-tool";
import { ApiError, fetchJson } from "@/lib/net/fetch-json";
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

const LANG_OPTIONS: { id: import("@/store/sequencer").SurpriseLang; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "pt-BR", label: "PT" },
  { id: "en-US", label: "EN" },
];

export function SurpriseButton() {
  const appendChat = useSequencer((s) => s.appendChat);
  const pushSurpriseHistory = useSequencer((s) => s.pushSurpriseHistory);
  const addSurpriseTrack = useSequencer((s) => s.addSurpriseTrack);
  const surpriseLang = useSequencer((s) => s.surpriseLang);
  const setSurpriseLang = useSequencer((s) => s.setSurpriseLang);
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
    const { pattern, vibeLabel, surpriseHistory, surpriseLang, surpriseTheme } =
      useSequencer.getState();
    try {
      const data = await fetchJson<SurpriseResponse>("/api/surprise", {
        body: {
          pattern,
          vibeLabel,
          recentPhrases: surpriseHistory,
          lang: surpriseLang,
          theme: surpriseTheme,
        },
      });
      const sampleId = `surprise_${++surpriseCounter}`;
      const source = await createSurpriseSource({
        sampleId,
        phrase: data.phrase,
        style: data.style,
        audioBase64: data.audio_base64,
        bpm: pattern.bpm,
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
      const msg =
        err instanceof ApiError
          ? err.friendly
          : "A surpresa não saiu. Tenta de novo.";
      setError(msg);
      appendChat({ role: "assistant", text: `⚠️ ${msg}` });
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
          "bg-gradient-to-br from-[rgb(var(--magenta))] to-purple-600",
          "text-white shadow-[0_0_25px_rgba(255,60,200,0.45)]",
          "hover:scale-105 hover:shadow-[0_0_40px_rgba(255,60,200,0.7)]",
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

      {/* Phrase language: Auto lets Claude pick per vibe, or force PT / EN. */}
      <div className="flex items-center gap-1 rounded-full bg-white/5 border border-white/10 p-0.5">
        {LANG_OPTIONS.map((opt) => {
          const active = surpriseLang === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSurpriseLang(opt.id)}
              className={[
                "px-3 py-1 text-xs rounded-full font-medium transition-colors",
                active
                  ? "bg-[rgb(var(--magenta))] text-white shadow-[0_0_12px_rgba(255,60,200,0.45)]"
                  : "text-zinc-400 hover:text-zinc-200",
              ].join(" ")}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {error && <div className="text-xs text-rose-400">{error}</div>}
    </div>
  );
}
