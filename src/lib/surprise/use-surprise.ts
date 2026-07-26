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

let surpriseCounter = 0;

// Create-a-surprise flow (Claude phrase → Polly audio → track), shared by any
// UI entry point. Errors surface both via `error` and in the chat feed.
export function useSurprise() {
  const appendChat = useSequencer((s) => s.appendChat);
  const pushSurpriseHistory = useSequencer((s) => s.pushSurpriseHistory);
  const addSurpriseTrack = useSequencer((s) => s.addSurpriseTrack);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async () => {
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

  return { create, loading, error };
}
