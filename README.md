# Loop Machine

Drum machine em loop que roda no browser, com Claude (via AWS Bedrock) co-produzindo o beat e Amazon Polly dando voz às "surpresas" que entram no meio da música. Feito pra ser exposto em eventos: qualquer pessoa — técnica ou não — consegue criar e baixar um loop em 3–5 minutos, com visual neon/synthwave reativo ao som.

## O que dá pra fazer

- **Começar num toque** — overlay de entrada que escolhe um beat e já sai tocando (destrava o áudio no primeiro clique).
- **Clicar num estilo** (Funk, Lo-Fi, Trap, Samba, Drum & Bass, Ambient) e já sair tocando.
- **Editar o grid de 16 steps** ao vivo, organizado em **seções minimizáveis** (Bateria, Baixo, Melodia, Vozes) — cada uma com cabeçalho grande pra touchscreen e indicador que pulsa no tempo.
- **Conversar com a IA** ("deixa mais agressivo", "bota um baixo pesado", "fala 'que pancada' picotado"). O Claude escolhe sozinho entre **três ferramentas**: mexer no beat, adicionar uma linha de synth, ou criar uma frase falada.
- **Adicionar synth** (baixo e melodia) travado em escala — gerado pelo Claude ou pelos botões, sempre afinado. Dá pra **trocar o tom** e o **clima** (escala) transpondo o que já existe.
- **Clicar em Surpresa** e o Claude inventa uma frase curta (≤4 palavras, natural), escolhe um efeito (melódico, reverso, telefone, megafone, dub, picotado), a Polly fala, e a frase vira uma track editável. Um campo de **tema** direciona as frases (ex: "futebol", "amor").
- **Baixar MP3** do loop atual (drums + synth + surpresas), renderizado client-side.
- **Nova Sessão** + timeout de inatividade reseta tudo pra próxima pessoa.

## Stack

| Camada | Tecnologia |
|---|---|
| Front | Next.js 16 (App Router) + TypeScript + Tailwind |
| Sequencer | Tone.js (Transport + Sequence) |
| Estado | Zustand |
| Synth | Tone.js (MonoSynth/Synth + PolySynth), geração travada em escala |
| IA conversacional | Claude Sonnet 4.6 via Amazon Bedrock (`us.anthropic.claude-sonnet-4-6`) |
| Tool use | 3 tools (`update_pattern`, `generate_surprise`, `generate_synth`) + prompt caching |
| TTS das surpresas | Amazon Polly (vozes generativas e neurais em PT-BR e EN-US) |
| Efeitos de áudio | Tone.js PitchShift / BitCrusher / Freeverb / Chorus / Distortion / FeedbackDelay / GrainPlayer / Filters |
| Export MP3 | Tone.Offline + `@breezystack/lamejs` (client-side) |

Toda a inteligência roda na AWS — não há `ANTHROPIC_API_KEY`. O SDK `@anthropic-ai/bedrock-sdk` autentica via credenciais AWS padrão.

## Arquitetura

```
[Browser: Next.js + Tone.js + Zustand]
    │
    ├── /api/claude        → Bedrock (Claude + 3 tools: update_pattern / generate_surprise / generate_synth)
    │
    ├── /api/surprise      → Bedrock (Claude escolhe frase + voz + efeito + steps)
    │                       → Polly SynthesizeSpeech (MP3 base64)
    │
    └── client-side only
        ├── Drum engine    → Tone.Players + Sequence
        ├── Synth          → Tone.PolySynth por instrumento (bass/lead), notas travadas em escala
        ├── Surprise audio → Web Audio buffer + effect chain + time-stretch (GrainPlayer)
        ├── Export MP3     → Tone.Offline recria o grafo (drums+synth+surpresas), lamejs codifica
        └── Samples base   → /public/samples (kicks, snares, hats, bass, fx…)
```

## Conceitos principais

### Pattern e tracks
O `Pattern` (`src/lib/audio/pattern.ts`) é um BPM + swing + lista de `Track`. Cada track tem 16 steps binários (toca/não toca) e um `meta` opcional que define o tipo:
- **drum** (`meta` ausente) — toca um sample do catálogo.
- **surprise** (`meta.kind === "surprise"`) — frase falada com efeito.
- **synth** (`meta.kind === "synth"`) — uma nota de um instrumento (bass/lead). Várias linhas de synth formam um mini piano-roll.

### Synth travado em escala
`src/lib/audio/scale.ts` garante que tudo que um synth toca fica dentro de uma tonalidade (`musicalKey` no store: root + escala). O Claude descreve riffs por **grau** (1 = tônica), nunca por nota absoluta, então não há como desafinar. O primeiro synth da sessão fixa a tonalidade; os seguintes a reusam. Trocar tom/clima transpõe o que já está no grid preservando as edições.

### Surpresas
`/api/surprise` faz o Claude inventar a frase + escolher voz/efeito/steps; a lógica de validação e síntese (Polly) vive em `src/lib/surprise/synth.ts`, compartilhada com o agente do chat. Frases são curtas (≤4 palavras), naturais, com fonética simplificada pra soar bem no TTS. Efeitos ativos: `melodic`, `reverse`, `telephone`, `megaphone`, `dub`, `chopped`.

## Rodando localmente

Pré-requisitos: Node 22+, credenciais AWS configuradas (`aws sts get-caller-identity` deve funcionar), região `us-east-1` com Bedrock liberado pros modelos Claude e Polly habilitado.

```bash
npm install
AWS_REGION=us-east-1 npm run dev
```

Abre `http://localhost:3000`.

Build de produção:

```bash
npm run build
AWS_REGION=us-east-1 npm run start
```

## Estrutura do repositório

```
src/
  app/
    page.tsx                         # layout "palco" (sequencer à esquerda, IA à direita)
    layout.tsx                       # metadata + fontes
    globals.css                      # tema neon/synthwave + animações
    _components/
      StartOverlay.tsx               # onboarding de 1 toque
      VibeButtons.tsx                # 6 presets de estilo
      StepSequencer.tsx              # grid 16×N em seções minimizáveis + play/BPM
      SurpriseButton.tsx             # gera surpresa + seletor de idioma
      SurpriseTheme.tsx              # campo de tema das frases
      SynthDemoButton.tsx            # gera baixo/melodia generativos
      KeyButton.tsx                  # trocar tom + clima (transpõe)
      ExportButton.tsx               # render MP3 client-side
      ChatPanel.tsx                  # conversa com Claude (3 tools)
      SessionControls.tsx            # reset + idle timeout
    api/
      claude/route.ts                # conversa → update_pattern / generate_surprise / generate_synth
      surprise/route.ts              # Claude → Polly → audio base64
  lib/
    audio/
      engine.ts                      # DrumEngine (Players + Sequence + synth voices)
      synth.ts                       # vozes de synth (bass/lead) Tone.js
      scale.ts                       # geração travada em escala, transposição
      surprise.ts                    # createSurpriseSource + chains de FX + time-stretch
      offline-render.ts              # Tone.Offline + lamejs (drums+synth+surpresas)
      pattern.ts                     # tipos (Pattern, Track, Step, metas)
      engine-registry.ts             # singleton accessor
      surprise-registry.ts           # base64 por sampleId (pra export)
    claude/
      client.ts                      # AnthropicBedrock + model id
      prompt.ts                      # system prompt + catálogo + pattern atual
      tools.ts                       # tool update_pattern
      surprise-tool.ts               # tool generate_surprise + vozes/estilos
      synth-tool.ts                  # tool generate_synth
    surprise/
      synth.ts                       # validação + Polly compartilhados (botão + chat)
      polly.ts                       # wrapper SynthesizeSpeech + SSML {en}…{/en}
    samples/catalog.ts               # fetch /catalog.json
    net/fetch-json.ts                # retry + mensagens amigáveis
    session/reset.ts                 # hardResetSession
    vibes.ts                         # presets hardcoded
  store/sequencer.ts                 # Zustand store
public/
  catalog.json                       # metadata de todos os samples
  samples/*.wav                      # kicks, snares, hats, bass, fx
scripts/
  generate-samples.ts                # (stub) pipeline futura pra Stable Audio via Replicate
  upload-catalog.ts                  # (stub) sync pra S3 + CloudFront
```

## Robustez pra evento

- Retry exponencial em 429/5xx nas chamadas das APIs.
- Mensagens de erro em PT-BR amigáveis (`fetchJson` + `ApiError.friendly`).
- Idle timeout → modal "tem alguém aí?" com countdown → reset automático.
- Prompt caching no Claude (system prompt + catálogo) → redução de custo nas chamadas seguintes.
- Surpresas e synth preservados entre atualizações do chat; vibe buttons resetam "limpo".
- `prefers-reduced-motion` desliga as animações neon.

## Ainda pendente

- Geração de melodia do Claude usar o algoritmo estruturado (harmonia → ritmo → melodia) que já roda nos botões.
- Botões demo de synth (`// TEMP`) viram features definitivas ou saem.
- Service worker pra precache de samples.
- Share link (`/s/xxx`).
- Pipeline real de samples via Replicate/Stable Audio.
- Deploy na AWS.

## Licença

MIT — feito pra evento interno, use como quiser.
