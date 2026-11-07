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
