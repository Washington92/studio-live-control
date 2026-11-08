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

## Corte nativo experimental

`wmix-obs-smoke --switch` cria duas cenas e executa um **CUT** alterando a fonte do canal de saída Program para a cena Preview; confirma a troca consultando o libobs. O teste ainda usa cenas vazias, não renderiza conteúdo nem conecta botões da interface. Execute `ctest --test-dir engine/build -C Release --output-on-failure` após compilar e configurar o runtime do OBS.

## Controle interativo do motor (experimental)

Depois de compilar e disponibilizar as DLLs do OBS:

```powershell
.\engine\build\obs\Release\wmix-obs-smoke.exe --control
```

O processo responde `READY WMIX_OBS_CONTROL_V1` e aceita uma instrução por linha em stdin:

| Comando | Resposta | Efeito |
|---|---|---|
| `STATUS` | `STATUS PROGRAM` ou `STATUS PREVIEW` | Consulta qual cena está no canal 0 |
| `CUT` | `OK CUT PREVIEW` ou `OK CUT PROGRAM` | Alterna a cena ligada ao Program |
| `QUIT` | `BYE` | Encerra o processo |

Comando desconhecido recebe `ERROR UNKNOWN_COMMAND`. Esse é um protocolo de texto para testes locais; ainda não existe ponte com o frontend, autenticação ou suporte a mídia real. Logs de inicialização também são impressos em stdout, portanto um futuro cliente IPC deve separar o canal de logs antes de depender desse protocolo em produção.

## Fonte de teste nativa

O modo `--sources` inicializa libobs, carrega os plugins encontrados no runtime, cria uma fonte `color_source` e a associa à cena Preview. É um passo verificável em direção ao gerenciamento de fontes.

```powershell
.\engine\build\obs\Release\wmix-obs-smoke.exe --sources
ctest --test-dir engine/build -C Release --output-on-failure
```

**Limitações:** o plugin `color_source` precisa estar instalado e detectável. O teste ainda não captura câmera, não renderiza quadros no frontend, nem estabelece vínculo entre IDs React e fontes OBS. A execução precisa ser validada em Windows com GPU e DLLs compatíveis.

## Protocolo de fontes (incremental)

No modo `--control`, o comando `ADD_TEST_SOURCE` cria uma única fonte `color_source` chamada `WMix Test Color` na cena Preview. Responde `OK SOURCE WMix Test Color`, `ERROR SOURCE_UNAVAILABLE` (plugin ausente) ou `ERROR SOURCE_ATTACH` (falha de associação). Chamadas repetidas retornam sucesso sem duplicar a fonte.

O host Electron encaminha esse comando pelo IPC e o bridge TypeScript interpreta a resposta. **Ainda não há botão na UI para criar a fonte nem transporte de quadros para o Preview.** O comando pode ser testado via `window.wmixNative.command("ADD_TEST_SOURCE")` no desktop em desenvolvimento.

Para homologar: compilar no Windows, confirmar plugins OBS, executar `ADD_TEST_SOURCE`, consultar `STATUS`, executar `CUT` e verificar o estado. Isso ainda não substitui a inspeção visual dos quadros.

## Consulta de fonte nativa

`SOURCE_STATUS` retorna `SOURCE_STATUS PRESENT WMix Test Color` ou `SOURCE_STATUS ABSENT WMix Test Color`, consultando diretamente o registro de fontes do libobs. O botão de diagnóstico `TESTAR FONTE OBS` agora executa `ADD_TEST_SOURCE` seguido de `SOURCE_STATUS`, mostrando as duas respostas. Isso comprova apenas presença lógica da fonte, **não** captura, renderização, exibição no Preview ou Tally do Program. Requer compilação e teste Windows para validação.

## Diagnóstico do Program

`PROGRAM_SOURCE_STATUS` consulta a fonte ligada ao canal 0 do libobs, identifica se corresponde a uma das cenas controladas e verifica se `WMix Test Color` está inserida nessa cena. Retorna `PROGRAM_SOURCE_STATUS PRESENT WMix Test Color` ou `PROGRAM_SOURCE_STATUS ABSENT WMix Test Color`.

Sequência de teste manual no modo `--control`:

```text
ADD_TEST_SOURCE
SOURCE_STATUS
PROGRAM_SOURCE_STATUS
CUT
PROGRAM_SOURCE_STATUS
```

O resultado esperado é fonte presente no registro, ausente inicialmente no Program e presente depois do CUT, **desde que o plugin `color_source` e o runtime OBS funcionem**. Isso valida roteamento lógico, não transporte de quadros ou Tally visual. A execução Windows ainda não foi comprovada.

## Teste de CUT pelo painel WMix

Com o desktop Electron conectado, `TESTAR FONTE OBS` cria a fonte e consulta sua presença. `TESTAR CUT OBS` consulta `STATUS`, envia `CUT`, exige a resposta `OK CUT ...`, consulta novamente `STATUS` e verifica `PROGRAM_SOURCE_STATUS`. Os dois botões compartilham o bloqueio de operações simultâneas.

**Importante:** este CUT é um teste isolado das cenas libobs. Ele **não** troca o Program web, não sincroniza o Tally das entradas da interface e não demonstra frames renderizados. Uma falha no comando não é apresentada como sucesso. Para validar a integração é necessário executar o aplicativo desktop no Windows com o motor compilado.

## Consulta da configuração de vídeo

`VIDEO_STATUS` usa `obs_get_video_info` para obter a resolução de saída e o FPS racional configurados no libobs. O botão `VÍDEO OBS` disponibiliza a consulta na interface desktop; o protocolo responde `VIDEO_STATUS <largura>x<altura> <fps_num>/<fps_den>` ou `ERROR VIDEO_UNAVAILABLE`. Esta consulta **não** mede quadros efetivamente renderizados, não transporta imagens ao React e não substitui validação Windows.

## Tally nativo de diagnóstico

`TALLY_STATUS` consulta `obs_get_output_source(0)` e retorna `TALLY_STATUS PROGRAM`, `TALLY_STATUS PREVIEW` ou `TALLY_STATUS UNKNOWN`. A resposta representa a cena conectada à saída do libobs, independentemente do estado lógico mantido pelo loop de controle. `TESTAR CUT OBS` consulta esse Tally depois de executar CUT.

**Limites:** ainda não existe correspondência entre cenas/fontes nativas e IDs de entradas React; portanto o Tally não deve alterar os indicadores de câmera da UI. O teste precisa ser executado em Windows com libobs compilado.

## Estado efetivo do CUT

`STATUS` agora consulta diretamente a cena conectada ao canal 0 do libobs, assim como `TALLY_STATUS`. O comando `CUT` calcula o destino a partir desse estado efetivo e verifica a cena após a troca. Se o canal 0 não estiver associado a uma das duas cenas controladas, retorna `ERROR CUT UNKNOWN` sem sobrescrever uma saída desconhecida. Em caso de falha, informa a cena efetivamente observada, em vez de reutilizar um estado lógico possivelmente desatualizado.

Essa proteção evita divergência entre o estado do protocolo e a saída real, mas não substitui os testes de runtime Windows nem o mapeamento de entradas da interface.
