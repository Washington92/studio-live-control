# wMix Desktop — arquitetura inicial (Windows)

## Estado desta etapa

Esta pasta contém a **primeira implementação do motor local RTMPS**.
Ainda **não** há instalador, janela desktop, integração IPC com o botão Transmitir
ou transmissão homologada no YouTube. A interface React/TanStack Start e a prévia
Lovable permanecem inalteradas.

## Arquitetura planejada

```text
wMix UI (React / compositor Canvas)
  -> ProgramOutputEngine (MediaStream: vídeo PGM + áudio Master)
  -> MediaRecorder (fragmentos WebM VP8/VP9 + Opus)
  -> IPC local seguro do aplicativo Windows [PRÓXIMA ETAPA]
  -> wMix RTMPS engine (processo Node local, stdin WebM)
  -> FFmpeg integrado (H.264 + AAC / FLV)
  -> YouTube Live (RTMPS)
```

O motor é **próprio na orquestração e integração**; a codificação H.264/AAC
usa FFmpeg. Não estamos afirmando ter criado um codec proprietário.

A interface atual usa TanStack Start com SSR e configuração específica do
Lovable/Cloudflare. Não substitua o build web nem a configuração do Vite
para criar um desktop: será necessário empacotar a interface e o runtime
local em um processo separado e validar o funcionamento offline.

## Contrato da primeira implementação

- Entrada: fluxo WebM contínuo em `stdin` (gerado pelo Program).
- Saída: RTMPS, H.264, AAC, 30 FPS e GOP 60.
- `WMIX_FFMPEG_PATH`: caminho do FFmpeg fornecido pelo instalador futuro.
- `WMIX_RTMPS_URL`: URL RTMPS de destino, incluindo chave.
- `WMIX_VIDEO_BITRATE_KBPS`: bitrate opcional, padrão 4500.
- Não persiste a chave no repositório; diagnósticos tentam ocultar URL/chave.
- A chave ainda é passada ao processo FFmpeg como argumento; na integração
  desktop precisamos avaliar a exposição local em ferramentas de processos.

## Verificação isolada

```sh
node --test desktop/engine/rtmps-engine.test.mjs
```

Esta verificação cobre parâmetros e validação, **não** prova transmissão.
O teste ponta a ponta exigirá empacotar FFmpeg e receber o WebM do Program.
Não use uma chave real em logs, commits ou capturas de tela.

## Electron host experimental (libobs)

Adicionado `desktop/main.cjs` e `desktop/preload.cjs` como caminho **alternativo e experimental** ao motor RTMPS já documentado acima. Não substitui o pipeline RTMPS existente.

1. Compile `engine/obs` com `WMIX_WITH_LIBOBS=ON` e disponibilize as DLLs do OBS.
2. Execute `npm install` e `npm run dev`.
3. Em outro PowerShell, configure:

```powershell
$env:WMIX_DEV_URL="http://localhost:3000" # ajustar à porta exibida pelo Vite
$env:WMIX_ENGINE_BINARY="C:\caminho\wmix-obs-smoke.exe"
npm run desktop
```

A janela carrega a interface web local. O preload isolado disponibiliza `window.wmixNative.status()`, `window.wmixNative.command('STATUS')`, `window.wmixNative.command('CUT')` e `window.wmixNative.onEvent(callback)`. **Os botões da UI ainda não chamam essas funções**. Não há instalador, Preview/Program nativo visível ou teste validado em Windows. O host só aceita endereço de desenvolvimento local.
