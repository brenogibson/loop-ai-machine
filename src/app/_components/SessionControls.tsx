"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hardResetSession } from "@/lib/session/reset";
import { useSequencer } from "@/store/sequencer";

const IDLE_MS = 2 * 60 * 1000; // 2 min without any state change → prompt
const COUNTDOWN_S = 15;

export function SessionControls() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showIdle, setShowIdle] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_S);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Watch for any meaningful state change as a proxy for user activity.
  // Pattern edits, chat messages, playing, etc. all flow through the store.
  useEffect(() => {
    const reschedule = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        // Only prompt if the user actually did something (has any state beyond
        // the demo defaults).
        const s = useSequencer.getState();
        const active =
          s.chat.length > 0 ||
          s.surpriseHistory.length > 0 ||
          s.vibeId !== null ||
          s.vibeLabel !== null;
        if (active) setShowIdle(true);
      }, IDLE_MS);
    };

    reschedule();
    const unsub = useSequencer.subscribe(() => {
      if (!showIdle) reschedule();
    });

    return () => {
      unsub();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [showIdle]);

  // Countdown while idle modal is open.
  useEffect(() => {
    if (!showIdle) return;
    setCountdown(COUNTDOWN_S);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          hardResetSession();
          setShowIdle(false);
          return COUNTDOWN_S;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [showIdle]);

  const confirmReset = useCallback(() => {
    hardResetSession();
    setShowConfirm(false);
  }, []);

  const dismissIdle = useCallback(() => {
    setShowIdle(false);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="px-4 py-2 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm hover:border-rose-500 hover:text-rose-300 transition-colors"
      >
        ↻ Nova Sessão
      </button>

      {showConfirm && (
        <Modal onClose={() => setShowConfirm(false)}>
          <h2 className="text-xl font-semibold mb-2">Começar de novo?</h2>
          <p className="text-zinc-400 text-sm mb-6">
            Isso apaga o beat atual, as surpresas e o chat. Não dá pra
            desfazer.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 rounded-full border border-zinc-700 text-zinc-300 text-sm hover:border-zinc-500"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmReset}
              className="px-4 py-2 rounded-full bg-rose-500 text-white text-sm font-semibold hover:bg-rose-400"
            >
              Sim, novo começo
            </button>
          </div>
        </Modal>
      )}

      {showIdle && (
        <Modal onClose={dismissIdle}>
          <h2 className="text-xl font-semibold mb-2">Tem alguém aí?</h2>
          <p className="text-zinc-400 text-sm mb-1">
            A sessão vai reiniciar pra próxima pessoa em
          </p>
          <p className="text-4xl font-bold text-rose-400 mb-6 tabular-nums">
            {countdown}s
          </p>
          <button
            type="button"
            onClick={dismissIdle}
            className="w-full px-4 py-3 rounded-full bg-emerald-500 text-black font-semibold hover:bg-emerald-400"
          >
            Ainda estou aqui!
          </button>
        </Modal>
      )}
    </>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
