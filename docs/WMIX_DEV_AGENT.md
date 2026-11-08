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


## Ativação prática do Codex Cloud (ação do proprietário)

1. Revise e integre o PR de preparação `#5` para que o `AGENTS.md` completo fique disponível na `main`.
2. No ChatGPT web ou desktop, abra **Work in > Cloud > Select environment > Create environment**.
3. Conecte a sua conta GitHub quando solicitado e selecione `Washington92/studio-live-control`.
4. Deixe o Codex inspecionar o projeto. Configure Node 22, Bun e as dependências web no ambiente. A etapa Windows NSIS deve ser verificada no GitHub Actions (`windows-latest`), não simulada no Linux.
5. Revise o relatório de setup, publique o ambiente e crie uma nova tarefa apontando para a Issue `#3`.
6. Solicite ao agente uma branch `agent/3-bun-lock` e PR para `main`; nenhum auto-merge.

**Primeiro prompt sugerido ao Codex:**

> Trabalhe no repositório Washington92/studio-live-control. Leia AGENTS.md e a Issue #3. Corrija a divergência entre bun.lock e package.json após a adição do Electron. Rode os testes disponíveis, valide que bun install --frozen-lockfile funciona em checkout limpo e ajuste o workflow para voltar a usar frozen somente se comprovado. Não altere o layout aprovado do WMix nem o motor de vídeo. Crie uma branch agent/3-bun-lock e abra um draft PR para revisão com evidências dos testes. Não faça merge, não exponha segredos e não alegue compilação Windows local se a validação só ocorrer pelo CI.

A publicação do ambiente e o início da tarefa exigem conexão e aprovação da conta do proprietário. Este repositório não contém credenciais nem dispara Codex sozinho.
