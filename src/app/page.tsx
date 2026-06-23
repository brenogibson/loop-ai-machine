import { ChatPanel } from "./_components/ChatPanel";
import { ExportButton } from "./_components/ExportButton";
import { KeyButton } from "./_components/KeyButton";
import { SessionControls } from "./_components/SessionControls";
import { StartOverlay } from "./_components/StartOverlay";
import { StepSequencer } from "./_components/StepSequencer";
import { SurpriseButton } from "./_components/SurpriseButton";
import { SurpriseTheme } from "./_components/SurpriseTheme";
import { SynthDemoButton } from "./_components/SynthDemoButton";
import { VibeButtons } from "./_components/VibeButtons";

export default function Home() {
  return (
    <main className="min-h-screen text-zinc-100 flex flex-col items-center p-4 sm:p-6 gap-6">
      <StartOverlay />

      <header className="relative w-full max-w-6xl flex flex-col items-center gap-1 pt-2">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase bg-gradient-to-r from-[rgb(var(--cyan))] via-[rgb(var(--fg))] to-[rgb(var(--magenta))] bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(255,60,200,0.25)]">
          Loop Machine
        </h1>
        <p className="text-sm text-zinc-400">
          Escolha um estilo ou peça pra IA criar a música junto com você
        </p>
        <div className="absolute right-0 top-2">
          <SessionControls />
        </div>
      </header>

      {/* Stage: the machine dominates the left, the AI lives in a side rail.
          Collapses to a single column on narrow screens. */}
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-6 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <VibeButtons />
          <StepSequencer />
          <div className="flex items-center gap-4 flex-wrap">
            <SurpriseButton />
            <SynthDemoButton />
            <KeyButton />
            <ExportButton />
          </div>
        </div>

        <aside className="lg:sticky lg:top-6 flex flex-col gap-5">
          <SurpriseTheme />
          <ChatPanel />
        </aside>
      </div>
    </main>
  );
}
