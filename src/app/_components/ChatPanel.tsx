"use client";

import { useCallback, useRef, useState } from "react";
import { useSequencer } from "@/store/sequencer";

const SUGGESTIONS = [
  "deixa mais agressivo",
  "faz um funk lento",
  "trap com pegada pesada",
  "mais space e ambient",
  "bota mais hats",
];

export function ChatPanel() {
  const chat = useSequencer((s) => s.chat);
  const appendChat = useSequencer((s) => s.appendChat);
  const applyClaudePattern = useSequencer((s) => s.applyClaudePattern);
  const vibeLabel = useSequencer((s) => s.vibeLabel);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setError(null);
      appendChat({ role: "user", text: trimmed });
      setInput("");
      setLoading(true);
      try {
        const currentPattern = useSequencer.getState().pattern;
        const res = await fetch("/api/claude", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            pattern: currentPattern,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `http ${res.status}`);
        }
        const data = (await res.json()) as {
          pattern: import("@/lib/audio/pattern").Pattern;
          vibe_label: string;
          commentary: string;
          usage: {
            cache_read_input_tokens: number;
            cache_creation_input_tokens: number;
          };
        };
        applyClaudePattern(data.pattern, data.vibe_label);
        appendChat({ role: "assistant", text: data.commentary });
        if (process.env.NODE_ENV !== "production") {
          console.log("[claude usage]", data.usage);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        appendChat({ role: "assistant", text: `⚠️ ${msg}` });
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [appendChat, applyClaudePattern, loading],
  );

  return (
    <section className="w-full max-w-4xl flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs">
        <div className="text-zinc-400 uppercase tracking-wide">AI producer</div>
        {vibeLabel && (
          <div className="text-emerald-400">vibe: {vibeLabel}</div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 min-h-24 max-h-56 overflow-y-auto text-sm">
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
                    : "text-emerald-300 italic"
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
          className="flex-1 px-4 py-2 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-5 py-2 rounded-full bg-emerald-500 text-black font-semibold disabled:opacity-40 hover:bg-emerald-400 transition-colors"
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
            className="px-3 py-1 text-xs rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-600 disabled:opacity-40"
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
