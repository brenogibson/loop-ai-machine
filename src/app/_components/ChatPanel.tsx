"use client";

import { useCallback, useRef, useState } from "react";
import { getCurrentEngine } from "@/lib/audio/engine-registry";
import { createSurpriseSource } from "@/lib/audio/surprise";
import { registerSurpriseAudio } from "@/lib/audio/surprise-registry";
import type { SurpriseStyle } from "@/lib/claude/surprise-tool";
import type { SynthInstrument, Track } from "@/lib/audio/pattern";
import { ApiError, fetchJson } from "@/lib/net/fetch-json";
import { useSequencer } from "@/store/sequencer";

type SurpriseData = {
  phrase: string;
  language: string;
  voice_id: string;
  style: SurpriseStyle;
  steps: number[];
  volume_db: number;
  commentary: string;
  audio_base64: string;
};

type SynthData = {
  instrument: SynthInstrument;
  tracks: Track[];
  root: string;
  scale: import("@/lib/audio/scale").ScaleName;
  vibe_label: string;
  commentary: string;
};

type ClaudeResponse =
  | {
      kind: "pattern";
      pattern: import("@/lib/audio/pattern").Pattern;
      vibe_label: string;
      commentary: string;
      usage: unknown;
    }
  | { kind: "surprise"; surprise: SurpriseData; usage: unknown }
  | { kind: "synth"; synth: SynthData; usage: unknown };

let chatSurpriseCounter = 0;

const SUGGESTIONS = [
  "deixa mais agressivo",
  "bota um baixo pesado",
  "adiciona uma melodia por cima",
  'fala "que pancada" picotado no ritmo',
  'voz gritando "sobe o som" com eco',
];

export function ChatPanel() {
  const chat = useSequencer((s) => s.chat);
  const appendChat = useSequencer((s) => s.appendChat);
  const applyClaudePattern = useSequencer((s) => s.applyClaudePattern);
  const addSurpriseTrack = useSequencer((s) => s.addSurpriseTrack);
  const pushSurpriseHistory = useSequencer((s) => s.pushSurpriseHistory);
  const setSynthTracks = useSequencer((s) => s.setSynthTracks);
  const setMusicalKey = useSequencer((s) => s.setMusicalKey);
  const vibeLabel = useSequencer((s) => s.vibeLabel);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Mirror the grid's "+ Surpresa" flow: build the audio source, register it,
  // add the track.
  const applySurprise = useCallback(
    async (s: SurpriseData) => {
      const engine = getCurrentEngine();
      if (!engine) throw new Error("engine não disponível");
      const { pattern } = useSequencer.getState();
      const sampleId = `surprise_${++chatSurpriseCounter}`;
      const source = await createSurpriseSource({
        sampleId,
        phrase: s.phrase,
        style: s.style,
        audioBase64: s.audio_base64,
        bpm: pattern.bpm,
      });
      engine.registerSurpriseSource(source);
      registerSurpriseAudio(sampleId, s.audio_base64);
      addSurpriseTrack({
        sampleId,
        phrase: s.phrase,
        style: s.style,
        voiceId: s.voice_id,
        language: s.language,
        steps: s.steps,
        volumeDb: s.volume_db,
      });
      pushSurpriseHistory(s.phrase);
    },
    [addSurpriseTrack, pushSurpriseHistory],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setError(null);
      appendChat({ role: "user", text: trimmed });
      setInput("");
      setLoading(true);
      try {
        const { pattern: currentPattern, surpriseLang, musicalKey } =
          useSequencer.getState();
        const data = await fetchJson<ClaudeResponse>("/api/claude", {
          body: {
            message: trimmed,
            pattern: currentPattern,
            surpriseLang,
            musicalKey,
          },
        });
        if (data.kind === "surprise") {
          await applySurprise(data.surprise);
          const s = data.surprise;
          appendChat({
            role: "assistant",
            text: `🎤 "${s.phrase}" (${s.style}) — ${s.commentary}`,
          });
        } else if (data.kind === "synth") {
          setSynthTracks(data.synth.instrument, data.synth.tracks);
          // Lock the session key on first synth so later ones match.
          setMusicalKey({ root: data.synth.root, scale: data.synth.scale });
          appendChat({
            role: "assistant",
            text: `🎹 ${data.synth.commentary}`,
          });
        } else {
          applyClaudePattern(data.pattern, data.vibe_label);
          appendChat({ role: "assistant", text: data.commentary });
        }
        if (process.env.NODE_ENV !== "production") {
          console.log("[claude usage]", data.usage);
        }
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.friendly
            : "Algo não funcionou. Tenta de novo.";
        setError(msg);
        appendChat({ role: "assistant", text: `⚠️ ${msg}` });
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [
      appendChat,
      applyClaudePattern,
      applySurprise,
      setSynthTracks,
      setMusicalKey,
      loading,
    ],
  );

  return (
    <section className="w-full flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs">
        <div className="text-zinc-400 uppercase tracking-wide">AI producer</div>
        {vibeLabel && (
          <div className="text-[rgb(var(--drums))]">vibe: {vibeLabel}</div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 min-h-24 max-h-56 lg:max-h-[28rem] overflow-y-auto text-sm">
        {chat.length === 0 ? (
          <p className="text-zinc-500">
            Descreva a vibe ou peça ajustes — ex: &quot;deixa mais agressivo&quot;.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {chat.map((m, i) => (
              <li
                key={i}
                className={
                  m.role === "user"
                    ? "text-zinc-200"
                    : "text-[rgb(var(--drums))] italic"
                }
              >
                <span className="text-zinc-500 mr-2">
                  {m.role === "user" ? "você:" : "IA:"}
                </span>
                {m.text}
              </li>
            ))}
            {loading && (
              <li className="text-zinc-500 italic">
                <span className="text-zinc-500 mr-2">IA:</span>
                pensando…
              </li>
            )}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="o que você quer? (enter pra enviar)"
          disabled={loading}
          className="flex-1 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[rgb(var(--drums))] focus:shadow-[0_0_14px_rgb(var(--drums)/0.3)] disabled:opacity-50 transition-shadow"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-5 py-2 rounded-full bg-[rgb(var(--drums))] text-black font-semibold disabled:opacity-40 hover:brightness-110 shadow-[0_0_18px_rgb(var(--drums)/0.4)] transition-all"
        >
          {loading ? "…" : "enviar"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => send(s)}
            disabled={loading}
            className="px-3 py-1 text-xs rounded-full bg-white/5 border border-white/10 text-zinc-300 hover:border-[rgb(var(--drums))]/50 hover:text-[rgb(var(--drums))] disabled:opacity-40 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-xs text-rose-400">Erro: {error}</div>
      )}
    </section>
  );
}
