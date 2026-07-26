"use client";

import { useEffect, useRef } from "react";
import { getMasterBus } from "@/lib/audio/master-bus";
import { useSequencer } from "@/store/sequencer";

// Full-screen background visualizer driven by the real master mix: a smooth
// "aurora" of light rising from the bottom edge — the spectrum drawn as one
// continuous curve filled with a soft vertical gradient (no discrete bars),
// plus a glow that swells with overall energy. Sits behind all UI (z-0,
// pointer-events none); only runs while playing. Canvas-only, no React/frame.
export function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playing = useSequencer((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let raf = 0;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Smoothed bar heights so the spectrum breathes instead of flickering.
    const smoothed = new Float32Array(64);

    const draw = () => {
      const bus = getMasterBus();
      const fft = bus.fft.getValue() as Float32Array;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Steady ambient glow hugging the bottom edge (constant brightness —
      // see photosensitivity note below). Canvas can't read CSS vars, so the
      // warm palette is duplicated here as literals.
      const glow = ctx.createLinearGradient(0, h, 0, h * 0.5);
      glow.addColorStop(0, "rgba(200, 60, 30, 0.22)");
      glow.addColorStop(1, "rgba(200, 60, 30, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Smooth the FFT into a small set of control points (mirrored: lows at
      // the center, highs at the edges), then draw ONE continuous luminous
      // ridge through them — light, not bars.
      const bins = 48;
      const maxH = h * 0.32;
      for (let i = 0; i < bins; i++) {
        const db = fft[i]; // ≈ -100..0 dB
        const norm = Math.max(0, Math.min(1, (db + 90) / 70));
        // Heavier temporal smoothing for a calm, flowing motion.
        smoothed[i] = smoothed[i] + 0.15 * (norm - smoothed[i]);
      }

      // Mirrored control points across the full width (edge→center→edge).
      const points: Array<{ x: number; y: number }> = [];
      const n = bins;
      for (let px = 0; px <= 2 * n; px++) {
        // Distance from center 0..1 maps to bin index (low freq center).
        const distFromCenter = Math.abs(px - n) / n;
        const bin = Math.min(bins - 1, Math.floor(distFromCenter * (bins - 1)));
        // Slight neighbor average for spatial smoothness too.
        const v =
          (smoothed[bin] + smoothed[Math.min(bins - 1, bin + 1)]) / 2;
        points.push({
          x: (px / (2 * n)) * w,
          y: h - v * maxH,
        });
      }

      // Build the ridge path with quadratic curves through midpoints — one
      // continuous flowing line, no corners.
      const ridge = new Path2D();
      ridge.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i++) {
        const mx = (points[i].x + points[i + 1].x) / 2;
        const my = (points[i].y + points[i + 1].y) / 2;
        ridge.quadraticCurveTo(points[i].x, points[i].y, mx, my);
      }
      ridge.lineTo(w, points[points.length - 1].y);

      // Fill under the ridge, extended past the bottom edge so the blur never
      // fades the base of the light.
      const fill = new Path2D(ridge);
      fill.lineTo(w, h + 120);
      fill.lineTo(0, h + 120);
      fill.closePath();
      // Constant brightness on purpose (photosensitivity): the motion comes
      // from the SHAPE of the glow following the spectrum, never from
      // luminance pulsing with the beat.
      const body = ctx.createLinearGradient(0, h - maxH, 0, h);
      body.addColorStop(0, "rgba(255, 200, 90, 0)");
      body.addColorStop(0.4, "rgba(255, 130, 50, 0.22)");
      body.addColorStop(1, "rgba(255, 58, 92, 0.42)");

      // Single wide blurred pass, no stroke, no bright core: a diffuse wash
      // whose silhouette breathes with the music.
      ctx.save();
      ctx.filter = "blur(48px)";
      ctx.fillStyle = body;
      ctx.fill(fill);
      ctx.restore();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [playing]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 z-0 pointer-events-none"
    />
  );
}
