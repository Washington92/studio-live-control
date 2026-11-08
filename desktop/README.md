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

## Proteção contra travamento

Comandos IPC agora expiram após 5 segundos. Em timeout, o host encerra o processo nativo para evitar que uma resposta atrasada seja atribuída ao próximo comando. O motor fica offline até uma nova inicialização do aplicativo. O mecanismo ainda não implementa reinicialização automática.


## WMix Studio para Windows — instalador completo (experimental)

A distribuição principal para Windows 10/11 agora é o **instalador NSIS**
`WMix-Setup-Windows-x64.exe`. O pacote portátil não é mais publicado como
artefato principal. A pasta de staging do Electron é gerada apenas dentro do CI
para compor o instalador e validar que a interface abre no Windows.

O instalador oferece assistente em português, seleção do diretório, opção de
atalho no desktop, atalhos no menu Iniciar, cadastro em **Aplicativos instalados**
do Windows e **Uninstall.exe**. A marca WMix é aplicada ao executável durante
o build. A instalação requer privilégios administrativos por padrão e usa
`Arquivos de Programas\\WMix Studio`.

1. Abra **GitHub Actions > WMix Phase 1 - Windows validation**.
2. Selecione a execução **verde** da branch `main`.
3. Em **Artifacts**, baixe `WMix-Setup-Windows-x64` e extraia o ZIP que o
   próprio GitHub fornece como envelope de download.
4. Antes de instalar, confira a integridade: o artefato contém também
   `WMix-Setup-Windows-x64.sha256`. No PowerShell, na pasta dos arquivos,
   execute `(Get-FileHash .\\WMix-Setup-Windows-x64.exe -Algorithm SHA256).Hash`
   e compare o resultado com a primeira sequência hexadecimal do arquivo
   `.sha256`. Se não coincidir, não execute o instalador.
5. Execute **WMix-Setup-Windows-x64.exe** e siga o assistente.

O CI verifica o compositor React, gera o setup e executa um teste de
instalação e desinstalação silenciosas no runner Windows. Isso **não** valida
todas as fontes reais, drivers e o processamento libobs no PC do usuário.
A primeira versão do instalador ainda **não é assinada digitalmente**; o
Windows SmartScreen pode solicitar confirmação de procedência. Não desative
proteções do Windows para instalar arquivos de procedência desconhecida.

O script de empacotamento é `desktop/installer/wmix.nsi`.

## Seleção do motor OBS pelo WMix (experimental)

Na versão desktop, quando o motor nativo estiver offline, o cabeçalho oferece
**SELECIONAR OBS**. Esse botão abre o seletor de executável do Windows e
aceita somente `wmix-obs-smoke.exe`. O caminho escolhido é armazenado no
perfil local do Electron (`native-engine.json` dentro de `userData`) e
carregado na próxima inicialização. A variável `WMIX_ENGINE_BINARY`, quando
definida, tem prioridade sobre a seleção salva.

**Atenção:** `wmix-engine.exe` (gerador de barras/quadros de teste) NÃO é
o processo libobs e NÃO suporta o protocolo `--control`. A compilação padrão
do GitHub Actions ainda gera apenas o gerador standalone. Para obter
`wmix-obs-smoke.exe`, é necessário compilar `engine/obs` com um SDK/runtime
libobs compatível no Windows e fornecer suas DLLs e plugins. Não basta
ter o OBS Studio instalado ou renomear o executável standalone.
O status **OBS: CONECTADO** confirma apenas o handshake de controle nativo;
não garante ainda que as entradas, o áudio e o Program web sejam processados
pelo libobs.

## Ícone do Windows

O pacote Windows agora inclui `desktop/assets/wmix-icon.png` e
gera um `.ico` com múltiplos tamanhos durante o GitHub Actions.
A etapa de empacotamento utiliza `rcedit` para gravar o ícone no recurso
PE do `WMix.exe`, além de usar o PNG na janela Electron e no favicon
do renderer offline. A alteração depende de uma **nova compilação bem-sucedida**;
artefatos anteriores mantêm o ícone antigo.
