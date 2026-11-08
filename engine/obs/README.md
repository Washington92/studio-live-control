# WMix + libobs — integração experimental

O WMix vai avaliar o **libobs** (OBS Studio) como núcleo nativo de captura, mixagem, composição, gravação e transmissão. A interface React existente continua intacta.

## Escopo desta primeira entrega

- Alvo CMake opcional `wmix-obs-smoke` para **inicializar e encerrar libobs**.
- Sem alteração no fluxo atual do WMix web.
- Sem captura, Preview/Program nativo, áudio, streaming ou integração frontend nesta fase.

## Compilação

Primeiro, obtenha e compile uma versão compatível do OBS Studio a partir do repositório oficial:
https://github.com/obsproject/obs-studio

Depois, configure o WMix com um pacote CMake exportado por essa compilação:

```powershell
cmake -S engine -B engine/build -A x64 -DWMIX_WITH_LIBOBS=ON -Dlibobs_DIR="CAMINHO_PARA_CONFIG_LIBOBS"
cmake --build engine/build --config Release
```

O nome e o local do pacote CMake dependem da distribuição/compilação do OBS. Se não houver pacote exportado, será necessário adaptar o vínculo ao SDK/build local.

## Próximos marcos

1. Validar compilação e carregamento de DLLs do libobs no Windows.
2. Inicializar vídeo/áudio, adicionar fonte de teste e capturar frames.
3. Construir Preview e Program com cenas independentes.
4. Criar uma ponte IPC entre processo nativo e interface React.
5. Adicionar gravação, transmissão e diagnósticos.

## Licenciamento

OBS Studio/libobs é distribuído sob GPL-2.0-or-later. Antes de distribuir binários do WMix com libobs, avaliar as obrigações da GPL para o conjunto integrado, avisos de copyright, código-fonte correspondente e componentes de terceiros. Não assumir que IPC elimina obrigações de licença.

## Teste Preview / Program

Após compilar com `WMIX_WITH_LIBOBS=ON`, execute:

```powershell
.\engine\build\obs\Release\wmix-obs-smoke.exe --dual
ctest --test-dir engine/build -C Release --output-on-failure
```

`--dual` inicializa vídeo/áudio, cria cenas separadas de Preview e Program e conecta somente Program ao canal de saída 0. **Não exibe imagens nem testa transições ou fontes reais.** O teste exige DLLs do OBS, plugins gráficos e uma GPU compatível no ambiente de execução.
