"use client";

import { useCallback, useState } from "react";
import QRCode from "qrcode";
import { renderLoopToMp3 } from "@/lib/audio/offline-render";
import { surpriseAudioEntries } from "@/lib/audio/surprise-registry";
import { fetchCatalog } from "@/lib/samples/catalog";
import { ApiError, fetchJson } from "@/lib/net/fetch-json";
import { useSequencer } from "@/store/sequencer";

// Browser-native blob → base64 (no Buffer dependency client-side).
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// "Take it home": renders the loop to MP3 in the browser, uploads it, and shows
// a QR pointing at a presigned S3 URL (10 min) — so the download outlives the
// event site itself. Nothing on the AWS account is public; the QR carries the
// signed URL. The /s/<id> replay link is secondary (works while the app is up).
export function ShareButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<{
    pageUrl: string;
    mp3Url: string | null;
    qr: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { pattern, vibeLabel } = useSequencer.getState();

      // Render the loop to MP3 client-side (same path as the download button).
      const catalog = await fetchCatalog();
      const blob = await renderLoopToMp3({ pattern, catalog, bars: 2 });
      const mp3Base64 = await blobToBase64(blob);

      // Bundle audio for the surprises present in the pattern (for /s replay).
      const used = new Set(
        pattern.tracks
          .filter((t) => t.meta?.kind === "surprise")
          .map((t) => t.sampleId),
      );
      const surpriseAudio: Record<string, string> = {};
      for (const [id, b64] of surpriseAudioEntries()) {
        if (used.has(id)) surpriseAudio[id] = b64;
      }

      const res = await fetchJson<{
        id: string;
        mp3: { url: string } | null;
      }>("/api/share", {
        body: { pattern, vibeLabel, surpriseAudio, mp3Base64 },
      });

      const pageUrl = `${window.location.origin}/s/${res.id}`;
      // QR points at the MP3 itself so the download works even after the event
      // site is gone; fall back to the replay page if the upload failed.
      const mp3Url = res.mp3?.url ?? null;
      const qr = await QRCode.toDataURL(mp3Url ?? pageUrl, {
        width: 240,
        margin: 1,
        color: { dark: "#120806", light: "#fff1e0" },
      });
      setShare({ pageUrl, mp3Url, qr });
      setCopied(false);
    } catch (err) {
      console.error("share failed", err);
      setError(
        err instanceof ApiError
          ? err.friendly
          : "Não consegui criar o link. Tenta de novo.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const copy = useCallback(async () => {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.mp3Url ?? share.pageUrl);
      setCopied(true);
    } catch {
      // clipboard may be unavailable; the URL is visible to copy manually
    }
  }, [share]);

  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={handleShare}
          disabled={busy}
          className={[
            "px-5 py-2 rounded-full border font-medium text-sm transition-all",
            "bg-white/5 border-white/10 text-zinc-200",
            "hover:border-[rgb(var(--surprise))] hover:text-[rgb(var(--surprise))] hover:shadow-[0_0_16px_rgb(var(--surprise)/0.3)]",
            "disabled:opacity-60 disabled:cursor-wait",
          ].join(" ")}
        >
          {busy ? "Preparando seu loop…" : "📤 Levar meu loop"}
        </button>
        {error && <div className="text-xs text-rose-400">{error}</div>}
      </div>

      {share && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShare(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-zinc-950/80 backdrop-blur-md border border-white/10 p-6 shadow-2xl shadow-orange-500/10 flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold">Leva seu som! 🎧</h2>
            <p className="text-sm text-zinc-400 text-center">
              {share.mp3Url
                ? "Aponta a câmera do celular pro QR e baixa o MP3 do seu loop."
                : "Aponta a câmera do celular pro QR pra ouvir seu loop."}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={share.qr}
              alt="QR code pra baixar o loop"
              className="rounded-xl w-56 h-56"
            />
            {share.mp3Url && (
              <p className="text-[11px] text-amber-300/80 text-center">
                ⏱ O download vale por 10 minutos — baixa agora!
              </p>
            )}
            <div className="w-full flex items-center gap-2">
              <input
                readOnly
                value={share.mp3Url ?? share.pageUrl}
                onFocus={(e) => e.target.select()}
                className="flex-1 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-zinc-300 text-xs focus:outline-none"
              />
              <button
                type="button"
                onClick={copy}
                className="px-4 py-2 rounded-full bg-[rgb(var(--drums))] text-black text-sm font-semibold hover:brightness-110 shadow-[0_0_14px_rgb(var(--drums)/0.4)]"
              >
                {copied ? "✓" : "Copiar"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShare(null)}
              className="text-sm text-zinc-500 hover:text-zinc-300"
            >
              fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
