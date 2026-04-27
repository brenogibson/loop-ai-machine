import { ChatPanel } from "./_components/ChatPanel";
import { ExportButton } from "./_components/ExportButton";
import { SessionControls } from "./_components/SessionControls";
import { StepSequencer } from "./_components/StepSequencer";
import { SurpriseButton } from "./_components/SurpriseButton";
import { VibeButtons } from "./_components/VibeButtons";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center p-6 gap-8">
      <header className="relative w-full max-w-4xl flex flex-col items-center gap-1 pt-4">
        <h1 className="text-3xl font-semibold tracking-tight">AI Loop Drum Machine</h1>
        <p className="text-sm text-zinc-400">
          Escolha um estilo ou peça pra IA criar a música junto com você
        </p>
        <div className="absolute right-0 top-4">
          <SessionControls />
        </div>
      </header>
      <VibeButtons />
      <StepSequencer />
      <div className="flex items-center gap-4 flex-wrap justify-center">
        <SurpriseButton />
        <ExportButton />
      </div>
      <ChatPanel />
    </main>
  );
}
