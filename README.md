# Studio Live Control

Criar um sistema de transmissão e mixagem de vídeo profissional que unifica as principais funcionalidades do vMix, OBS Studio e Wirecast:
- Layout profissional broadcast estilo estúdio (tema dark de alto contraste)
- Monitores duplos operacionais PVW (Preview) com Tally verde e PGM (Program) com Tally vermelho, incluindo guias de enquadramento (Safe Areas)
- Barra de controle de transições com T-Bar funcional, cortes rápidos (CUT, AUTO com tempo configurável, FADE, SLIDE, WIPE, STINGER) e botão FTB (Fade to Black)
- Barramento de Overlays/DSK (Downstream Keyers) para Lower Thirds, placares, PiP e logos
- Matriz de entradas (Inputs Grid) interativa com suporte a múltiplas fontes simuladas e reais (Câmeras/Webcam via MediaDevices, captura de tela, vídeos locais, barras de cores SMPTE e fontes web) com status de Tally, VU meters e atalhos rápidos
- Console de mixagem de áudio multicanal (Audio Mixer) com faders logarítmicos, medidores de VU animados (Peak e RMS), botões de Mute, Solo, AFV (Audio Follows Video) e barramentos Master e Auxiliares
- Barra superior de telemetria de estúdio com timers de LIVE/REC (Timecode SMPTE), indicadores de FPS, render time da GPU, uso de recursos e botões de disparo de transmissão e gravação
- Barra inferior de status com indicadores de áudio e sincronismo de sinal

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2d8c6b0b-b2e6-4da0-ae3c-a7879409eaf8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
