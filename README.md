# Loop Machine

Drum machine em loop que roda no browser, com Claude (via AWS Bedrock) co-produzindo o beat e Amazon Polly dando voz às "surpresas" que entram no meio da música. Feito pra ser exposto em eventos: qualquer pessoa — técnica ou não — consegue criar e levar um loop em 3–5 minutos, com visual neon em tons quentes reagindo ao som e controle por gestos na webcam.

## O que dá pra fazer

- **Começar num toque** — overlay de entrada que escolhe um beat e já sai tocando (destrava o áudio no primeiro clique).
- **Clicar num estilo** (Funk, Lo-Fi, Trap, Samba, Drum & Bass, Ambient) e já sair tocando.
- **Editar o grid de 16 steps** ao vivo, organizado em **seções minimizáveis** (Bateria, Baixo, Melodia, Vozes) com cabeçalhos touch-friendly, botão de **gerar** dentro de cada seção e **mute** por linha e por seção.
- **Conversar com a IA** ("deixa mais agressivo", "bota um baixo pesado", "fala 'que pancada' picotado"). O Claude escolhe sozinho entre **três ferramentas**: mexer no beat, adicionar uma linha de synth, ou criar uma frase falada.
- **Adicionar synth** (baixo e melodia) travado em escala — sempre afinado, baixo limitado ao registro grave, melodia com no máximo 2 díades de harmonia por loop.
- **Evoluir a harmonia** — um botão único caminha pelo **círculo das quintas** (desce uma quinta por clique, vira maior/menor a cada 4 passos, volta pra casa em 12), transpondo baixo/melodia existentes. A música *evolui* em vez de sortear tom.
- **Criar Surpresas** — o Claude inventa uma frase curta (≤4 palavras), escolhe efeito (`telephone`, `chopped`, `radio_dj`, `vinyl` — todos secos/rítmicos), a Polly fala com time-stretch pro compasso, e vira track editável. Campo de **tema** direciona as frases; toggle **PT/EN**.
- **🚀 DROP** — build-up de 2 compassos (riser + filtro fechando + gate apertando) e estado "dropado" **segurado até você soltar**. Via botão ou via **gesto**.
- **👋 Gestos na webcam** (MediaPipe local, nada sai do browser): levantar as **duas mãos** inicia o countdown/build e dropa; abaixar volta ao normal. Preview com esqueleto das mãos.
- **Visualizador de fundo** — aurora de luz difusa (blur pesado, sem linhas) que respira com o espectro real do mix. **Brilho constante por fotossensibilidade** — o movimento vem da forma, nunca de pulso de luminância.
- **📤 Levar meu loop** — renderiza o MP3 no browser, sobe pro S3 privado e mostra um **QR com URL pré-assinada (10 min)**: a pessoa escaneia e baixa o arquivo, que sobrevive ao fim do site. Página `/s/<id>` de replay como bônus.
- **Baixar MP3** local e **Nova Sessão** + timeout de inatividade pro próximo visitante.

## Stack

| Camada | Tecnologia |
|---|---|
| Front | Next.js 16 (App Router) + TypeScript + Tailwind |
| Sequencer | Tone.js (Transport + Sequence) |
| Estado | Zustand |
| Synth | Tone.js (MonoSynth/Synth + PolySynth), geração travada em escala |
| Master FX | Bus único (Filter → Tremolo → Freeverb) + taps FFT/Meter pro visualizador |
| Gestos | MediaPipe Tasks Vision (GestureRecognizer, WASM/GPU) — assets locais em `public/` |
| IA conversacional | Claude Opus 4.8 via Amazon Bedrock (`us.anthropic.claude-opus-4-8`, override com `CLAUDE_MODEL`) |
| Tool use | 4 tools (`update_pattern`, `generate_surprise`, `generate_synth`, `compose_song`) + prompt caching |
| TTS das surpresas | Amazon Polly (vozes generativas e neurais em PT-BR e EN-US) |
| Share | S3 privado + link curto `/dl/<id>` (re-assina 10 min a cada acesso) + QR (`qrcode`) |
| Export MP3 | Tone.Offline + `@breezystack/lamejs` (client-side) |

Toda a inteligência roda na AWS — não há `ANTHROPIC_API_KEY`. O SDK `@anthropic-ai/bedrock-sdk` autentica via credenciais AWS padrão. **Regra da conta: nada é público** — o bucket de shares é fechado e o acesso é só por URL pré-assinada.

## Arquitetura

```
[Browser: Next.js + Tone.js + Zustand + MediaPipe]
    │
    ├── /api/claude        → Bedrock (Claude + 3 tools: update_pattern / generate_surprise / generate_synth)
    ├── /api/surprise      → Bedrock (frase + voz + efeito + steps) → Polly (MP3 base64)
    ├── /api/share         → S3 privado (JSON do loop + MP3) → URL pré-assinada 10 min
    ├── /s/<id>            → página pública de replay (enquanto o app estiver no ar)
    │
    └── client-side only
        ├── Drum engine    → Tone.Players + Sequence (+ mute por track)
        ├── Synth          → PolySynth por instrumento, notas travadas em escala
        ├── Master bus     → Filter → Tremolo → Freeverb → out (+ FFT/Meter taps)
        │                    └─ performDrop/releaseDrop/cancelDrop (build-up & drop)
        ├── Gestos         → MediaPipe GestureRecognizer (duas mãos no alto = drop)
        ├── Visualizer     → canvas fullscreen, aurora difusa via FFT real
        ├── Surprise audio → GrainPlayer (time-stretch pro compasso) + FX chains
        ├── Export MP3     → Tone.Offline recria o grafo (SEM master FX — são performance)
        └── Samples base   → /public/samples
```

## Conceitos principais

### Pattern e tracks
O `Pattern` (`src/lib/audio/pattern.ts`) é um BPM + swing + lista de `Track`. Cada track tem 16 steps binários, `muted` opcional, e um `meta` que define o tipo: **drum** (`meta` ausente), **surprise** (frase falada) ou **synth** (uma nota de bass/lead — várias linhas formam um mini piano-roll).

### Synth travado em escala + jornada harmônica
`src/lib/audio/scale.ts` garante afinação: o Claude descreve riffs por **grau** (1 = tônica), nunca nota absoluta. A tonalidade da sessão (`musicalKey`) é fixada pelo primeiro synth e compartilhada por todos. O botão "Evoluir harmonia" usa `nextKeyStep` — círculo das quintas real: desce uma quinta por passo (resolução V→I), flip maior↔menor a cada 4 passos, 12 passos = volta completa. O baixo tem teto de registro (`BASS_MAX_OCTAVE = 2`): tônicas agudas começam uma oitava abaixo e a transposição rebaixa notas que estourariam.

### Master FX bus e drop
Todas as fontes ao vivo passam por `src/lib/audio/master-bus.ts` (o export MP3 não — efeitos de performance ficam fora do arquivo). O drop tem 3 fases: `performDrop` (build de 2 compassos: filtro fecha + riser de ruído + gate aperta), estado **dropado segurado** (reverb bloom + filtro aberto), e `releaseDrop`/`cancelDrop` sob comando do usuário (botão ou gesto).

### Gestos (MediaPipe local)
`src/lib/gestures/recognizer.ts` roda o GestureRecognizer em WASM com **assets commitados** (`public/mediapipe-wasm/` + `public/models/gesture_recognizer.task`) — zero CDN no evento. Um único gesto **simétrico** (duas mãos no alto) de propósito: o MediaPipe troca a identidade esquerda/direita das mãos com frequência, o que quebrava controles assimétricos. Debounce por streak de frames.

### Surpresas
Frases ≤4 palavras, naturais, fonética simplificada (sem respellings tipo "bíti"). Efeitos ativos são todos **secos/rítmicos** (caudas molhadas embolavam no beat): `telephone`, `chopped` (sílabas no grid), `radio_dj`, `vinyl`. A síntese (validação + Polly) vive em `src/lib/surprise/synth.ts`, compartilhada entre o botão e o agente do chat.

### Tema visual
Paleta quente (pôr do sol/brasas) em 4 variáveis CSS nomeadas por **função** — `--drums`, `--surprise`, `--synth`, `--beat` (`globals.css`). Trocar o tema = editar 4 linhas. Exceção: os canvas (visualizador, esqueleto de mãos) duplicam as cores como literais porque a API de canvas não resolve CSS vars (comentado no código).

## Rodando localmente

Pré-requisitos: Node 22+, credenciais AWS (`aws sts get-caller-identity`), região `us-east-1` com Bedrock (Claude) e Polly habilitados, e um bucket S3 privado pro share (`SHARE_BUCKET`, default `loop-ai-machine-shares-<account>`).

```bash
npm install
AWS_REGION=us-east-1 npm run dev
```

### HTTPS / acesso de outros dispositivos na rede
Câmera (gestos) e AudioWorklet só funcionam em **contexto seguro** (localhost ou HTTPS). Pra acessar de outro PC/tablet na LAN:

```bash
# gere um certificado incluindo o IP da máquina (uma vez):
mkcert -key-file certificates/dev-key.pem -cert-file certificates/dev-cert.pem localhost 127.0.0.1 ::1 <SEU_IP>

AWS_REGION=us-east-1 npm run dev -- --hostname 0.0.0.0 --experimental-https \
  --experimental-https-key ./certificates/dev-key.pem \
  --experimental-https-cert ./certificates/dev-cert.pem
```

Adicione o IP/host em `allowedDevOrigins` no `next.config.ts` (o Next bloqueia origens cruzadas no dev). No outro dispositivo, aceite o certificado auto-assinado (Avançado → Continuar).

### Docker

```bash
docker build -t loop-machine .
docker run -p 3000:3000 -e AWS_REGION=us-east-1 \
  -v ~/.aws:/root/.aws:ro loop-machine
```

Build standalone do Next (`output: "standalone"` no `next.config.ts`).

## Estrutura do repositório

```
src/
  app/
    page.tsx                         # palco (sequencer à esquerda, IA/ações à direita)
    globals.css                      # paleta quente por função + animações
    _components/
      StartOverlay.tsx               # onboarding de 1 toque
      VibeButtons.tsx                # 6 presets de estilo
      StepSequencer.tsx              # grid em seções (gerar/mute/collapse) + play/BPM
      KeyButton.tsx                  # jornada harmônica (círculo das quintas)
      DropButton.tsx                 # build-up & drop segurado
      GestureControl.tsx             # webcam: duas mãos no alto = drop
      Visualizer.tsx                 # aurora difusa reagindo ao FFT do mix
      ShareButton.tsx                # MP3 → S3 → QR pré-assinado
      ExportButton.tsx               # download MP3 local
      SurpriseTheme.tsx              # tema das frases + idioma PT/EN
      ChatPanel.tsx                  # conversa com Claude (3 tools)
      SessionControls.tsx            # reset + idle timeout
    api/
      claude/route.ts                # 3 tools; synth por graus resolvidos no server
      surprise/route.ts              # Claude → Polly → base64
      share/route.ts, share/[id]/    # criar share (+MP3 pré-assinado) / buscar
    s/[id]/                          # página pública de replay
  lib/
    audio/
      engine.ts                      # DrumEngine (players + synth + surpresas + mute)
      master-bus.ts                  # FX master + drop + taps de visualização
      synth.ts, synth-generate.ts    # vozes + gerador local (bass/lead)
      scale.ts                       # escalas, graus, transposição, círculo das quintas
      surprise.ts                    # FX chains + GrainPlayer + chopped
      offline-render.ts              # export MP3 (sem master FX)
      pattern.ts                     # tipos
    gestures/recognizer.ts           # MediaPipe wrapper (handsUp debounced)
    claude/                          # client Bedrock, prompts, 3 tool schemas
    surprise/                        # síntese compartilhada, Polly, useSurprise
    share/                           # tipos + S3 store (putShare/putShareMp3/getShare)
  store/sequencer.ts                 # Zustand (pattern, key, dropPhase, tema…)
public/
  samples/*.wav                      # samples base
  mediapipe-wasm/, models/           # assets MediaPipe locais (sem CDN)
```

## Robustez pra evento

- Retry exponencial em 429/5xx; mensagens de erro amigáveis em PT-BR.
- Idle timeout → "tem alguém aí?" → reset automático.
- Prompt caching no Claude (system + catálogo).
- Surpresas e synth preservados nas edições via chat; vibe buttons resetam limpo.
- `prefers-reduced-motion` desliga todas as animações; visualizador com brilho constante (fotossensibilidade).
- Gestos 100% locais (WASM), assets commitados — sem dependência de rede além da AWS.

## Ainda pendente

- Melodia via Claude usar o gerador estruturado local (hoje usa graus diretos).
- Calibração fina dos gestos na câmera do evento.
- Stress test de sessão longa (vazamentos de nós de áudio).
- Deploy na AWS (Dockerfile pronto; falta infra).
- Lifecycle rule pro bucket de shares (hoje os MP3s ficam).

## Licença

MIT — feito pra evento interno, use como quiser.
