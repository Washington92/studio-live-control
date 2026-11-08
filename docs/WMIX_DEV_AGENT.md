# WMix Dev Agent — plano de operação

## Objetivo

Evoluir o **WMix Studio para Windows 10/11 x64**, por tarefas pequenas, com agentes de programação e CI, mantendo aprovação humana. O agente **não roda dentro do executável WMix** e não interfere no fluxo audiovisual em produção. Ele trabalha no repositório e no ambiente de desenvolvimento.

## Arquitetura operacional

```text
GitHub Issues (backlog e critérios de aceite)
   |
Agente de programação (Codex ou alternativa conectada ao repositório)
   |
branch agent/<issue>-<slug> -> draft Pull Request
   |
GitHub Actions (testes React, Electron, C++, instalação NSIS)
   |
Revisão e aprovação do proprietário -> merge em main
   |
WMix-Setup-Windows-x64.exe (artefato após CI verde)
```

## Primeira trilha de entregas

| Ordem | Entrega | Evidência obrigatória |
| --- | --- | --- |
| 1 | Installer NSIS confiável | setup compilado, instalação/abertura/desinstalação comprovadas |
| 2 | Integridade e atualização das dependências | lockfile sincronizado e instalação reprodutível |
| 3 | libobs compilado no Windows | binário libobs verdadeiro + DLLs/plugins e handshake |
| 4 | Program/Preview nativos | CUT/tally efetivos em cena real, comparação com render web |
| 5 | Entradas e áudio | fontes reais e testes de hardware em Windows |
| 6 | Gravação/transmissão | testes locais e ponta a ponta, sem expor chaves |

## O que falta para a automação executar código sozinha

Estas instruções e os Issues **não ligam um agente de IA automaticamente**. É necessário conectar/configurar um agente com acesso de leitura/escrita ao repositório e permissões de abrir PRs, além de fornecer um ambiente com dependências para executar os testes. Conceder permissões mínimas e não liberar auto-merge.

Se usar Codex, conecte o projeto pelo fluxo oficial do serviço; configure-o para consumir `AGENTS.md`, trabalhar em Issues/branches e submeter PRs. O serviço e os limites de uso precisam ser autorizados pelo titular da conta. Nunca adicione tokens ao repositório.

## Segurança operacional

- `main` é a versão revisada. Agente propõe PRs, não faz merge sozinho.
- Segredos ficam fora do GitHub e de logs.
- O CI sem GPU e sem SDK libobs **não prova** captura, encoding ou transmissão nativa.
- Priorizar bloqueadores concretos do CI ao invés de prometer funcionalidades não testadas.
- Primeiro release distribuível continua experimental, sem assinatura digital.
- O instalador Windows é o produto principal; não reintroduzir ZIP portátil como prioridade.

## Execução orientada a Issues

Cada Issue deve conter: problema observado, arquivos envolvidos, entregável exato, testes necessários, critérios de aceite e riscos. O agente seleciona somente tarefas desbloqueadas. Requer aprovação explícita antes de integrar na `main`.
