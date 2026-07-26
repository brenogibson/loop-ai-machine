import { getShare } from "@/lib/share/store";
import { SharePlayer } from "./SharePlayer";

// Public playback page for a shared loop (/s/<id>). Server component fetches
// the payload; the client player handles audio.
export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let share = null;
  try {
    share = await getShare(id);
  } catch (err) {
    console.error("share page lookup failed:", err);
  }

  return (
    <main className="min-h-screen text-zinc-100 flex flex-col items-center justify-center p-6 gap-8">
      <header className="flex flex-col items-center gap-1">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase bg-gradient-to-r from-[rgb(var(--drums))] via-[rgb(var(--fg))] to-[rgb(var(--surprise))] bg-clip-text text-transparent drop-shadow-[0_0_25px_rgb(var(--surprise)/0.25)]">
          Loop Machine
        </h1>
        <p className="text-sm text-zinc-400">
          {share
            ? "Um loop criado com IA — aperta o play 🎧"
            : "Loop não encontrado"}
        </p>
      </header>

      {share ? (
        <SharePlayer share={share} />
      ) : (
        <p className="text-zinc-500 text-sm max-w-sm text-center">
          Esse link não existe ou expirou. Que tal criar o seu próprio beat?
        </p>
      )}

      <a
        href="/"
        className="px-6 py-3 rounded-full bg-[rgb(var(--surprise))] text-white font-semibold shadow-[0_0_25px_rgb(var(--surprise)/0.45)] hover:brightness-110 transition-all"
      >
        🎛️ Criar meu próprio loop
      </a>
    </main>
  );
}
