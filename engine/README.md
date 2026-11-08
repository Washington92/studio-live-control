# WMix Engine — Fase 1 (protótipo nativo)

Este diretório inicia o motor nativo independente da interface React. **Ainda não é um compositor de produção**: gera quadros RGB de teste com timestamps, permite exportar um frame e medir throughput de geração. Não captura câmeras, não faz mixagem de áudio, não codifica nem transmite.

## Windows 10/11

Instale Visual Studio 2022 Build Tools (Desktop development with C++) e CMake 3.20+.

```powershell
cmake -S engine -B engine/build -A x64
cmake --build engine/build --config Release
ctest --test-dir engine/build -C Release --output-on-failure
.\engine\build\Release\wmix-engine.exe --frame teste.ppm
.\engine\build\Release\wmix-engine.exe --benchmark 300
```

O arquivo PPM pode ser aberto em visualizadores compatíveis ou convertido com FFmpeg:
`ffmpeg -i teste.ppm teste.png`

## Próximos marcos

1. Contrato de mensagens e controle de ciclo de vida entre frontend e processo nativo.
2. Pipeline de captura/decodificação com FFmpeg e filas limitadas.
3. Compositor acelerado por GPU com timestamp de apresentação e sincronismo de áudio.
4. Codificação H.264, gravação e saída RTMP/SRT com telemetria e recuperação de falhas.

Não substituir o compositor Canvas atual antes de testes de integração e comparação de resultados.

## Baixar o primeiro executável Windows

O workflow **WMix Phase 1 - Windows validation**, na aba GitHub Actions, compila `wmix-engine.exe` em `Release` e publica o artefato **WMix-Windows-Native-Engine-x64** (ZIP). Para obter o arquivo:

1. Abra **Actions** no repositório e escolha a execução mais recente do workflow.
2. Aguarde a execução ficar verde (sucesso).
3. Na seção **Artifacts**, baixe **WMix-Windows-Native-Engine-x64**.
4. Extraia o ZIP e execute `wmix-engine.exe --selftest` no PowerShell.

Para gerar um quadro de teste: `wmix-engine.exe --frame quadro.ppm`.

**Limite desta compilação:** trata-se do gerador nativo independente de quadros, **não** do aplicativo WMix com interface Electron, **não** de um instalador e **não** do motor libobs. O build de `wmix-obs-smoke.exe` requer SDK/runtime OBS e dependências Windows ainda não integrados ao CI. Não existe garantia de execução até o job concluir e o teste no computador do usuário ser realizado.
