# WMix — Apple-inspired interaction guidelines

Reference: [Emil Kowalski, Apple Design Skill](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md). This document adapts principles rather than copying the upstream skill. Check the upstream repository license before redistributing its full text.

## Non-negotiable WMix constraints

- Preserve the approved production-console layout and existing transition controls.
- Input thumbnails remain fixed at **190px**, **16:9**, up to **10 per row**; do not shrink them to fit.
- Never add spring, bounce, momentum or smoothing to audio faders or T-Bar values: the displayed position must match the value sent to the engine.
- A native CUT/transition must not appear confirmed until the libobs engine acknowledges it. Browser-only preview state and native Program state must be explicitly distinguished.
- Do not restore drag-and-drop grouping without a separately tested design.

## Interaction rules

1. **Immediate feedback:** controls respond visually on press. Success/error status follows the actual result, not an optimistic assumption.
2. **Direct manipulation:** sliders and T-Bar track the pointer continuously and accurately, without animation on the control value.
3. **Interruptibility:** only decorative UI motion (drawers, modals, panel presentation) may be interrupted or reversed. On-air media transitions follow the engine state machine.
4. **Spatial consistency:** panels open and close from consistent origins. Avoid unnecessary movement of critical controls.
5. **Restraint:** no gratuitous glass effects, motion blur, bouncing buttons or animated audio meters disconnected from real measurements.
6. **Accessibility:** support visible keyboard focus, reduced motion, reduced transparency and increased contrast. Preserve legibility in dense production layouts.
7. **Typography:** use consistent system fonts and a clear hierarchy; never sacrifice readability to compress more controls.

## Validation checklist

- Keyboard-only: all primary actions reachable, focus clearly visible.
- Reduced-motion: no large translations or elastic UI effects.
- Pointer: faders and T-Bar track the exact value without latency or rebound.
- Production: native CUT success/failure reflected accurately; no phantom state changes.
- Layout: 190px thumbnails and maximum ten per row preserved.
- Performance: no animation work that competes with real-time video/audio rendering.

## Scope of first application

`src/styles.css` contains incremental accessibility and feedback rules. This first step intentionally avoids refactoring the studio layout or audiovisual engine. Validate on Windows and in the browser before considering further motion changes.

## Fase 1 — precisão operacional (implementação incremental)

- Atalhos globais agora ignoram repetição de tecla, modificadores de sistema, composição de texto e foco em campos, botões, sliders ou diálogos. Isso reduz CUTs involuntários durante edição e manipulação.
- CUT e AUTO têm rótulos acessíveis descritivos.
- Botões do mixer expõem `aria-pressed`; faders expõem o valor em decibéis via `aria-valuetext`.
- **Ainda pendente:** estados explícitos de confirmação do motor libobs, sincronização de fontes nativas com entradas React, testes de latência de T-Bar e medição real de clipping. Nenhuma destas capacidades deve ser apresentada como concluída.
