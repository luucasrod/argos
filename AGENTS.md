# Argos — instruções para agentes

## Leia primeiro

1. **[docs/ai/CONTEXT.md](docs/ai/CONTEXT.md)** — verdade técnica: arquitetura
   da voz, armadilhas de build/OTA, o que já foi tentado e falhou, bugs de causa
   raiz já resolvidos, pendências. **Leia antes de escrever código.**
2. **[docs/ai/TAREFAS.md](docs/ai/TAREFAS.md)** — a fila de agora, em ordem de
   dependência. Temporária: vale enquanto as Issues do GitHub não existem.
3. **[docs/ai/WORK_PROTOCOL.md](docs/ai/WORK_PROTOCOL.md)** — como trabalhar:
   papéis, claim de tarefa, worktree, PR, revisão cruzada, encadeamento de
   tarefas.

Fonte de verdade: fila = GitHub Issues; alterações = PR; decisão técnica =
`docs/ai/CONTEXT.md` na branch integrada.

## Expo mudou

Consulte a documentação da versão exata antes de escrever código:
https://docs.expo.dev/versions/v54.0.0/

## Três regras que quebram o app em silêncio

Estão detalhadas no CONTEXT, mas erram tanto que ficam repetidas aqui:

1. **Acento na gramática do Vosk.** O vocabulário do modelo pt só tem as formas
   **acentuadas**. Mandar `escritorio` faz o Vosk descartar a entrada e a
   palavra vira impossível de falar, sem erro visível. Use `toGrammar()` (mantém
   acento) para a gramática e `normalize()` (remove) só para comparar.
2. **`android/` é gitignored e o `expo prebuild` apaga módulo nativo.** Só
   adicione código nativo por config plugin em `plugins/`.
3. **Mexeu no JS, publique o OTA** (`npx eas update --branch preview`). Já
   ficaram 3 semanas de correções paradas por falta disso.

## Ao abrir a sessão

Declare o papel — `CODEX — BUILDER` ou `CODEX — REVIEWER` — e confirme repo,
branch e worktree antes de começar. Nunca assuma que está na worktree certa.
Quem implementa não aprova o próprio trabalho: Codex revisa o que o Claude fez,
e vice-versa.
