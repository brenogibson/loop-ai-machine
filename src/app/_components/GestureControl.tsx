"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getMasterBus } from "@/lib/audio/master-bus";
import {
  HAND_CONNECTIONS,
  startGestureTracker,
  type GestureFrame,
  type GestureTracker,
} from "@/lib/gestures/recognizer";
import { useSequencer } from "@/store/sequencer";

// Webcam gesture: raise BOTH hands and hold — a countdown runs (~3s: the audio
// build-up of 2 bars plays underneath, exact time follows the BPM) and the
// beat DROPS; lower the hands to return to normal. One symmetric two-hand
// gesture on purpose: MediaPipe's left/right hand identities flip constantly,
// which made per-hand controls swap mid-gesture. Tracking is local (WASM);
// no video leaves the browser.
export function GestureControl() {
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const countdownRef = useRef<HTMLDivElement | null>(null);
  const trackerRef = useRef<GestureTracker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Gesture state machine, outside React (updated per frame).
  const holdStartRef = useRef<number | null>(null);
  const buildSecondsRef = useRef(3);
  const phaseRef = useRef<"idle" | "building" | "dropped">("idle");

  const stop = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    // Never leave the mix stuck in a build/drop when the camera goes away.
    if (phaseRef.current === "building") getMasterBus().cancelDrop();
    if (phaseRef.current === "dropped") getMasterBus().releaseDrop();
    phaseRef.current = "idle";
    holdStartRef.current = null;
    useSequencer.getState().setDropPhase("idle");
    setActive(false);
  }, []);

  const handleFrame = useCallback((frame: GestureFrame) => {
    const store = useSequencer.getState();
    const phase = phaseRef.current;

    if (frame.handsUp) {
      if (phase === "idle" && store.playing && store.dropPhase === "idle") {
        // Hands just went up: start the audio build; the countdown matches its
        // real duration (2 bars at the current BPM ≈ 3-4s).
        const buildS = getMasterBus().performDrop(store.pattern.bpm, 2);
        if (buildS != null) {
          buildSecondsRef.current = buildS;
          holdStartRef.current = performance.now();
          phaseRef.current = "building";
          store.setDropPhase("building");
        }
      } else if (phase === "building" && holdStartRef.current != null) {
        const held = (performance.now() - holdStartRef.current) / 1000;
        if (held >= buildSecondsRef.current) {
          phaseRef.current = "dropped";
          store.setDropPhase("dropped");
        }
      }
    } else {
      // Hands came down: abort a running build, or release a held drop.
      if (phase === "building") {
        getMasterBus().cancelDrop();
        phaseRef.current = "idle";
        holdStartRef.current = null;
        store.setDropPhase("idle");
      } else if (phase === "dropped") {
        getMasterBus().releaseDrop();
        phaseRef.current = "idle";
        holdStartRef.current = null;
        store.setDropPhase("idle");
      }
    }

    // Countdown HUD (refs only — no re-render per frame).
    if (countdownRef.current) {
      const p = phaseRef.current;
      if (p === "building" && holdStartRef.current != null) {
        const left = Math.max(
          0,
          buildSecondsRef.current -
            (performance.now() - holdStartRef.current) / 1000,
        );
        countdownRef.current.textContent = `🙌 ${left.toFixed(1)}s`;
        countdownRef.current.style.opacity = "1";
      } else if (p === "dropped") {
        countdownRef.current.textContent = "🔥 DROP! (abaixa pra voltar)";
        countdownRef.current.style.opacity = "1";
      } else {
        countdownRef.current.textContent = "🙌 duas mãos pro alto = drop";
        countdownRef.current.style.opacity = "0.5";
      }
    }

    // Skeleton overlay (single accent color — hand identity is irrelevant).
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    // Canvas can't read CSS vars — warm palette literals mirroring globals.css.
    const color =
      phaseRef.current === "dropped"
        ? "rgb(255 214 92)" // --beat
        : frame.handsUp
          ? "rgb(255 58 92)" // --surprise
          : "rgb(255 138 40)"; // --drums
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    for (const hand of frame.hands) {
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(hand[a].x * canvas.width, hand[a].y * canvas.height);
        ctx.lineTo(hand[b].x * canvas.width, hand[b].y * canvas.height);
        ctx.stroke();
      }
      for (const lm of hand) {
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, []);

  const start = useCallback(async () => {
    if (starting || active) return;
    setStarting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      // setActive mounts the <video>/<canvas>; wiring continues in the effect.
      setActive(true);
    } catch (err) {
      console.error("gesture start failed", err);
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Permissão da câmera negada. Libera a câmera pra usar os gestos."
          : "Não consegui acessar a câmera.",
      );
      setStarting(false);
    }
  }, [starting, active]);

  // Once active mounts the video element, attach the stream and start tracking.
  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    let cancelled = false;
    video.srcObject = stream;
    video
      .play()
      .then(() => startGestureTracker(video, handleFrame))
      .then((tracker) => {
        if (cancelled) {
          tracker.stop();
          return;
        }
        trackerRef.current = tracker;
        setStarting(false);
      })
      .catch((err) => {
        console.error("tracker init failed", err);
        setError("Falha ao iniciar o rastreamento de gestos.");
        setStarting(false);
        stop();
      });
    return () => {
      cancelled = true;
    };
  }, [active, handleFrame, stop]);

  // Release the camera if the component unmounts while active.
  useEffect(() => stop, [stop]);

  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={active ? stop : start}
          disabled={starting}
          className={[
            "px-5 py-2 rounded-full border font-medium text-sm transition-all",
            "disabled:opacity-60 disabled:cursor-wait",
            active
              ? "bg-[rgb(var(--beat))] text-black border-[rgb(var(--beat))] shadow-[0_0_18px_rgb(var(--beat)/0.5)]"
              : "bg-white/5 border-white/10 text-zinc-200 hover:border-[rgb(var(--beat))] hover:text-[rgb(var(--beat))] hover:shadow-[0_0_16px_rgb(var(--beat)/0.3)]",
          ].join(" ")}
        >
          {starting ? "Ligando câmera…" : active ? "👋 Gestos ligados" : "👋 Gestos"}
        </button>
        {error && <div className="text-xs text-rose-400 max-w-52 text-center">{error}</div>}
      </div>

      {/* Preview lives on <body>: the stage's transforms must not move it
          (fixed positioning breaks under an ancestor transform). */}
      {active &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed bottom-4 right-4 z-30 flex flex-col gap-2 items-end">
            <div className="relative rounded-xl overflow-hidden border border-white/15 shadow-[0_0_25px_rgba(0,0,0,0.6)]">
              {/* Hidden raw video feeds the recognizer; canvas is the mirrored preview. */}
              <video ref={videoRef} className="hidden" playsInline muted />
              <canvas
                ref={canvasRef}
                width={320}
                height={240}
                className="w-56 h-42 -scale-x-100 bg-black"
              />
              <div
                ref={countdownRef}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 rounded-full bg-black/70 text-[rgb(var(--beat))] text-[11px] font-bold transition-opacity"
                style={{ opacity: 0.5 }}
              >
                🙌 duas mãos pro alto = drop
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
