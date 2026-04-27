# AI Loop Drum Machine

Drum machine em loop que roda no browser, com Claude (via AWS Bedrock) co-produzindo o beat e Amazon Polly dando voz às "surpresas" que entram no meio da música. Feito pra ser exposto em eventos: qualquer pessoa — técnica ou não — consegue criar e baixar um loop em 3–5 minutos.

## O que dá pra fazer

- **Clicar num estilo** (Funk, Lo-Fi, Trap, Samba, Drum & Bass, Ambient) e já sair tocando.
- **Editar o grid de 16 steps** ao vivo pra cada track — kick, snare, hat, bass, fx, e as surpresas.
- **Conversar com a IA** ("deixa mais agressivo", "faz um funk lento", "trap com pegada pesada") e o Claude devolve um pattern novo, preservando as surpresas que você já colocou.
- **Clicar em Surpresa** e o Claude inventa uma frase curta ("cola no bíti", "segura o drop"), escolhe um estilo de processamento (robótico, melódico, reverso, stutter, pitched, telefone), a Polly fala, e a frase vira uma nova track editável.
- **Baixar MP3** do loop atual, renderizado client-side (Tone.Offline + lamejs).
- **Nova Sessão** + timeout de inatividade (2 min) reseta tudo pra próxima pessoa.

## Stack

| Camada | Tecnologia |
|---|---|
| Front | Next.js 16 (App Router) + TypeScript + Tailwind |
| Sequencer | Tone.js (Transport + Sequence) |
| Estado | Zustand |
| IA conversacional | Claude Sonnet 4.6 via Amazon Bedrock (inference profile `us.anthropic.claude-sonnet-4-6`) |
| Tool use | `update_pattern` forçado + prompt caching no system prompt e catálogo |
| TTS das surpresas | Amazon Polly (vozes generativas e neurais em PT-BR e EN-US) |
| Efeitos de áudio | Tone.js PitchShift / BitCrusher / Freeverb / Chorus / Distortion / FeedbackDelay / Filters |
| Export MP3 | Tone.Offline + `@breezystack/lamejs` (client-side) |

Toda a inteligência roda na AWS — não há `ANTHROPIC_API_KEY`. O SDK `@anthropic-ai/bedrock-sdk` autentica via credenciais AWS padrão.

## Arquitetura

```
[Browser: Next.js + Tone.js + Zustand]
    │
    ├── /api/claude        → Bedrock (Claude Sonnet 4.6 + tool_use update_pattern)
    │
    ├── /api/surprise      → Bedrock (Claude escolhe frase + voz + efeito + steps)
    │                       → Polly SynthesizeSpeech (MP3 base64)
    │
    └── client-side only
        ├── Surprise audio → Web Audio buffer + effect chain no Tone.js
        ├── Export MP3     → Tone.Offline recria o grafo, lamejs codifica
        └── Samples base   → /public/samples (kicks, snares, hats, bass, fx…)
```

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
    page.tsx                         # layout principal
    _components/
      VibeButtons.tsx                # 6 presets de estilo
      StepSequencer.tsx              # grid 16×N + play/BPM
      SurpriseButton.tsx             # gera surpresa + registra no pattern
      ExportButton.tsx               # render MP3 client-side
      ChatPanel.tsx                  # conversa com Claude
      SessionControls.tsx            # reset + idle timeout
    api/
      claude/route.ts                # conversa → update_pattern
      surprise/route.ts              # Claude → Polly → audio base64
  lib/
    audio/
      engine.ts                      # DrumEngine (Tone.Players + Sequence)
      engine-registry.ts             # singleton accessor
      surprise.ts                    # createSurpriseSource + chains de FX
      surprise-registry.ts           # base64 por sampleId (pra export)
      offline-render.ts              # Tone.Offline + lamejs
      pattern.ts                     # tipos (Pattern, Track, Step)
    claude/
      client.ts                      # AnthropicBedrock + model id
      prompt.ts                      # system prompt + catálogo + pattern atual
      tools.ts                       # tool update_pattern
      surprise-tool.ts               # tool generate_surprise
    surprise/
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

## Samples

O `public/catalog.json` descreve 19 samples placeholder sintetizados via `ffmpeg` (kicks em 55–80 Hz com decays variados, snares com noise + highpass, hats curtos, bass tones, FX). Pré-evento, eles podem ser substituídos por samples reais via os scripts em `scripts/` — não implementados ainda, mas preparados pra rodar contra Replicate + S3.

## Robustez pra evento

- Retry exponencial em 429/5xx nas chamadas das APIs (2 tentativas, backoff com jitter).
- Mensagens de erro em PT-BR amigáveis (`fetchJson` + `ApiError.friendly`).
- Idle timeout de 2 min → modal "tem alguém aí?" com countdown de 15s → reset automático.
- Prompt caching no Claude: system prompt + catálogo inteiro cacheados → ~90% de redução de custo na 2ª chamada em diante.
- Surpresas preservadas entre atualizações do chat, eliminadas nos botões de vibe (reset "limpo").

## Ainda pendente

- Service worker pra precache de samples (depende de escolha de hosting).
- Share link (estratégia A/B/C ainda a decidir).
- Stress test programático.
- Pipeline real de samples via Replicate/Stable Audio.
- Deploy na AWS (Amplify/CloudFront+Lambda/ECS).

## Licença

MIT — feito pra evento interno, use como quiser.
