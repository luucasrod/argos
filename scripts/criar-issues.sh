#!/usr/bin/env bash
# Cria no GitHub as tarefas da auditoria de 30/08/2026.
#
# Pré-requisito: gh autenticado.
#   1) apagar a variável GITHUB_TOKEN inválida (ela vence o login do gh)
#   2) fechar e reabrir o terminal
#   3) gh auth login
#
# Rodar uma vez só. Se rodar de novo, cria duplicata.
set -euo pipefail

REPO="luucasrod/argos"

echo "== criando labels =="
label() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null; }
label "agente:claude"   "5436DA" "Para a sessão Claude (precisa do aparelho/adb ou é nativo)"
label "agente:codex"    "1D9E5E" "Para a sessão Codex (código puro, verificável com tsc)"
label "status:ready"    "0E8A16" "Elegível para um agente reivindicar"
label "status:blocked"  "B60205" "Bloqueada por dependência ou decisão do usuário"
label "requires-human"  "D93F0B" "Precisa do usuário (conta, chave, aparelho, decisão)"
label "p0"              "B60205" "Quebrado em produção"
label "p1"              "D93F0B" "Integração incompleta"
label "p2"              "FBCA04" "Qualidade de voz e experiência"
label "p3"              "C5DEF5" "Dívida técnica"

echo "== criando issues =="
mk() { # mk <titulo> <labels> <corpo>
  gh issue create --repo "$REPO" --title "$1" --label "$2" --body "$3" | tail -1
}

# ---------------------------------------------------------------- P0
mk "Xiaomi Pet quebrado: getXiaomiAccount chamado com 1 argumento em vez de 2" \
"p0,agente:codex,status:ready" \
'## Problema

`getXiaomiAccount(userId, authToken)` exige **2** argumentos (`api/_lib/xiaomi.ts:528`),
mas `api/xiaomi-pet.ts` chama com **1** nas linhas **41** e **99**.

`authToken` chega `undefined` em `supabaseAsUser(authToken)`, então a consulta roda
sem credencial de usuário. **Toda a integração Xiaomi Pet está quebrada em produção**
(alimentadores, caixa de areia, bebedouro).

Isto estava catalogado como "erro de tipo pré-existente, pode ignorar". Não é —
é defeito de runtime.

## Critério de aceite

- [ ] As duas chamadas passam o `authToken` do header, como os outros endpoints fazem
- [ ] `npx tsc --noEmit` deixa de acusar os 2 erros de `api/xiaomi-pet.ts`
- [ ] `GET /api/xiaomi-pet` com sessão válida responde sem 500

## Onde olhar

`api/xiaomi-pet.ts:41`, `api/xiaomi-pet.ts:99`, `api/_lib/xiaomi.ts:528`.
Comparar com como `api/xiaomi.ts` monta a chamada.'

mk "Remover dependências mortas do Picovoice do package.json" \
"p0,agente:codex,status:ready" \
'## Problema

`@picovoice/porcupine-react-native` e `@picovoice/react-native-voice-processor`
estão no `package.json` e **nenhum arquivo do projeto os importa** (confirmado por
grep em todo o `services/`, `app/`, `stores/`).

São restos da rota Picovoice, abandonada quando o tier grátis acabou (30/06/2026).
O autolink do Expo puxa qualquer módulo nativo declarado no `package.json` para
dentro do APK — então eles entram em todo build nativo, sem chave de acesso.

É um dos principais suspeitos de "build novo dá problema".

## Critério de aceite

- [ ] Os dois pacotes removidos de `package.json` e do lock
- [ ] `npx tsc --noEmit` continua com os mesmos 3 erros conhecidos, nem um a mais
- [ ] Nenhum import quebrado (grep por `picovoice` e `porcupine` volta vazio)

## Cuidado

Não mexer no `react-native-vosk` — esse é o motor de STT em uso.'

mk "RLS desligado em tabelas de token da Alexa" \
"p0,agente:claude,requires-human,status:ready" \
'## Problema

Há tabelas no Supabase com Row Level Security **desligado**, guardando tokens de
integração. Sem RLS, qualquer chave publicável lê a tabela inteira.

Os nomes das tabelas estão fora deste texto de propósito — **o repositório é
público**. Pedir ao usuário.

## Critério de aceite

- [ ] Políticas RLS escritas e testadas (o dono só enxerga as próprias linhas)
- [ ] RLS ligado sem quebrar o fluxo de OAuth existente
- [ ] Testado de ponta a ponta: conectar a integração continua funcionando

## Cuidado

Ligar RLS sem política **derruba a integração inteira**. Escrever a política
primeiro, validar, só então ligar. Mudança em produção: confirmar com o usuário
antes de aplicar.'

mk "Política de versão: version travada em 1.0.0 apaga a fronteira entre JS e nativo" \
"p0,agente:claude,status:ready" \
'## Problema

`runtimeVersion` usa a política `appVersion`, e `version` nunca saiu de `"1.0.0"`.
Logo **todo APK já gerado compartilha o mesmo runtime**, e o servidor de OTA
entrega o mesmo bundle JS para qualquer um deles — incluindo JS novo sobre
nativo velho.

## Critério de aceite

- [ ] `version` sobe a cada build que mexe no nativo (documentar a regra)
- [ ] Documentado em `docs/ai/CONTEXT.md` como parte do fluxo de release
- [ ] Verificado no aparelho: um APK de runtime antigo deixa de receber bundle novo

## Onde olhar

`app.json` (`expo.version`, `expo.runtimeVersion`), `eas.json`.'

# ---------------------------------------------------------------- P1
mk "Google/Chrome: integração ligada ao store mas sem tela para conectar" \
"p1,agente:codex,status:ready" \
'## Problema

`services/devices/chromeService.ts` está importado no `useDeviceStore`
(`fetchChromeDevices`, `controlChromeDevice`) e o endpoint `/api/chrome` responde.
Mas a tela de Integrações (`app/(modals)/integracoes.tsx`) tem **7 cartões**
(eWeLink, Tuya, WiZ, Tapo, Xiaomi, Alexa, Home Assistant) e **nenhum de
Google/Chrome**.

Resultado: o usuário não tem como conectar — a integração é inalcançável.

## Critério de aceite

- [ ] Cartão de Google/Chrome na tela de Integrações, no padrão dos outros
- [ ] Conectar, ver estado de conexão e desconectar
- [ ] Aparelhos aparecem na aba Casa depois de conectado

## Onde olhar

`app/(modals)/integracoes.tsx`, `services/devices/chromeService.ts`, `api/chrome.ts`.
Copiar a estrutura de um cartão existente.'

mk "Xiaomi Pet: sem nenhuma tela para conectar ou usar" \
"p1,agente:codex,status:ready" \
'## Problema

`xiaomiPetService.ts` está ligado ao store e `/api/xiaomi-pet` existe, mas não há
UI nenhuma — nem cartão em Integrações, nem tela dos aparelhos (alimentador,
caixa de areia, bebedouro).

## Depende de

A correção do `getXiaomiAccount` (issue de P0) — sem ela o endpoint não responde.

## Critério de aceite

- [ ] Aparelhos de pet aparecem junto com os outros, ou em tela própria
- [ ] Dá para acionar o alimentador pela interface
- [ ] Estado (nível de ração/água) visível quando a API devolve'

mk "Home Assistant: só gerencia chave, não traz nenhum dispositivo" \
"p1,agente:codex,status:ready" \
'## Problema

`services/ha/haService.ts` só tem `generateHAKey` / `getHAKey` / `deleteHAKey`,
usados na tela de Integrações. **Não existe `fetchHADevices` nem
`controlHADevice`**, e o `useDeviceStore` não importa nada de HA.

O cartão sugere uma integração que não existe: gera a chave e para aí.

## Critério de aceite

- [ ] `fetchHADevices` / `controlHADevice` implementados sobre `/api/ha`
- [ ] Ligados ao `useDeviceStore` como as outras fontes
- [ ] Aparelhos do HA aparecem na aba Casa
- [ ] Se a intenção for só gerar chave, então o cartão precisa dizer isso — e a
      issue vira documentação'

mk "Tuya local (LAN) pronto mas não ligado ao store" \
"p1,agente:codex,status:ready" \
'## Problema

`services/devices/tuyaLocal.native.ts` implementa o protocolo LAN da Tuya
(versões 3.1/3.3, CRC32, AES, enquadramento) e está testado, mas **nenhum arquivo
o importa**. É código morto.

O caminho local corta a ida à nuvem — é o maior ganho de latência disponível hoje
para quem tem a lâmpada na mesma rede.

## Critério de aceite

- [ ] `useDeviceStore` tenta o caminho local antes da nuvem quando há
      `localKey` + `ip` + versão suportada
- [ ] Cai para a nuvem sem erro visível quando o local falha ou o aparelho está fora da LAN
- [ ] Tuya 3.4/3.5 continua indo direto para a nuvem (não é suportado)
- [ ] Medido: quanto o comando ficou mais rápido pela LAN'

mk "Philips WiZ local: reescrever o módulo nativo UDP como config plugin" \
"p1,agente:claude,status:ready" \
'## Problema

Hoje o controle local da WiZ exige uma **ponte rodando num PC**
(`node tools/wiz-bridge.js`), o que na prática significa "só funciona com o
computador ligado".

O `WizUdpModule.kt` (Kotlin + `DatagramSocket`) já existiu e funcionava, mas
**foi perdido**: `android/` é gitignored e um `expo prebuild` regenerou a pasta.
A única cópia compilada está no APK de backup em
`A:\Argos\argos-backup-apk\base.apk`.

## Já tentado e FALHOU — não repetir

`react-native-udp`: arquitetura antiga, incompatível com `newArchEnabled=true`
(obrigatório por causa de `react-native-mmkv`/Nitro). O app **crashava no boot**
com `[runtime not ready] ... JavaScriptContextHolder`.

## Critério de aceite

- [ ] `WizUdpModule` reescrito em Kotlin como **TurboModule**
- [ ] Injetado por **config plugin** em `plugins/` — sobrevive a `expo prebuild`
- [ ] `wizLocalDirect.native.ts` volta a funcionar (a guarda `if (!WizUdp)` já existe)
- [ ] Descoberta por broadcast UDP 38899 acha a lâmpada do quarto
- [ ] Testado no aparelho: build local, instalar, **conferir o logcat** — typecheck
      limpo não prova nada sobre módulo nativo
- [ ] A UI para de exigir o ID da ponte

## Referência

Protocolo aberto e documentado (pywizlight, integração WiZ do Home Assistant):
UDP 38899, JSON puro, `getPilot`/`setPilot`, broadcast `registration`.'

mk "Aparelhos impossíveis de chamar por voz: nome fora do vocabulário do modelo" \
"p1,agente:claude,status:ready" \
'## Problema

Seis palavras que aparecem em nome de aparelho não existem no vocabulário do
modelo Vosk pt e são descartadas na montagem da gramática:

```
tv    4k    speaker    standing    ar-condicionado    2
```

Esses aparelhos não podem ser chamados por voz por essas partes do nome.

## Critério de aceite

- [ ] Mecanismo de **apelido falável** por aparelho (ex.: `tv` → `televisão`)
- [ ] O apelido entra na gramática e resolve de volta para o aparelho certo
- [ ] Validado contra o vocabulário real do modelo antes de confiar
- [ ] Testado no aparelho: chamar cada um dos seis por voz funciona

## Como validar uma palavra

O vocabulário (99.101 palavras) sai do `assets/model-pt/Gr.fst` — tabela de
símbolos OpenFst, int32 de tamanho seguido dos bytes UTF-8. Já extraído em
`A:\Argos\argos-backup-apk\vocab.json`.

⚠️ Ler a seção "acento na gramática" do `docs/ai/CONTEXT.md` antes de mexer.'

# ---------------------------------------------------------------- P2
mk "Voz neural sem cota: decidir provedor e implementar" \
"p2,agente:claude,requires-human,status:blocked" \
'## Problema

A cota grátis da ElevenLabs esgotou (**9.998 / 10.000** caracteres em
`GET /api/tts`). Toda resposta cai **silenciosamente** para a voz do sistema.

Como não há voz masculina pt-BR instalada no aparelho, o app usa a voz padrão
(feminina) com `pitch = 0.72` — é isso que o usuário descreve como "robótico".

## Bloqueada por decisão do usuário

1. Plano pago da ElevenLabs (libera também a `nassif`, sotaque BR nativo)
2. **Azure TTS** — camada grátis bem maior; `api/tts.ts` já tem o caminho
   (`azure_configured: false`), falta a chave
3. Esperar o reset mensal

## Critério de aceite

- [ ] Provedor escolhido e configurado
- [ ] `GET /api/tts?probe=1` sintetiza de verdade
- [ ] Voz masculina confirmada no aparelho
- [ ] **A queda para a voz do sistema deixa de ser silenciosa** — precisa ficar
      visível que a voz degradou, senão o problema se repete sem ninguém notar'

mk "Medir de onde vem a latência da resposta" \
"p2,agente:claude,status:ready" \
'## Problema

O usuário relata que o Argos "demora pra responder". Ninguém mediu onde o tempo
é gasto — não dá para otimizar no chute.

## Critério de aceite

- [ ] Instrumentar o caminho: fim da fala → STT → intent → LLM → TTS → áudio saindo
- [ ] Medir no aparelho real, com log, numa interação de verdade
- [ ] Relatório dizendo qual etapa domina
- [ ] Só então propor a otimização (issue nova)

## Suspeitos, em ordem

1. Ida e volta ao LLM
2. Ida à nuvem para o TTS (o áudio só começa quando o servidor responde)
3. Comando de aparelho indo à nuvem em vez da LAN (ver issue do Tuya local)'

mk "Voz masculina do sistema quando não há neural" \
"p2,agente:claude,status:ready" \
'## Problema

Sem voz masculina pt-BR instalada, `pickVoiceForPersonality` devolve `null`,
o app não seta `options.voice` e usa a voz padrão (feminina) com `pitch = 0.72`.
Soa robótico porque é voz feminina com o tom forçado para baixo.

Os regexes de `services/voice/voicePicker.ts` procuram nomes ("felipe", "tiago"),
mas os identificadores do Google TTS no Android não trazem gênero no nome — pode
existir voz masculina no aparelho que o código não sabe reconhecer.

## Já existe instrumentação

O OTA atual loga a lista real de vozes. Ler no aparelho:

```
adb logcat -d | grep "argos-voz"
```

Ele só imprime **quando o app fala** — é preciso interagir uma vez.

## Critério de aceite

- [ ] Lista real de vozes do aparelho coletada
- [ ] `voicePicker.ts` reconhece as vozes masculinas que existirem de fato
- [ ] Se não existir nenhuma, o app **avisa** e sugere instalar, em vez de fingir
      com pitch
- [ ] Testado no aparelho'

mk "Bipe de confirmação não soa (só a vibração)" \
"p2,agente:claude,status:ready" \
'## Problema

O código diz que o bipe dispara de dentro do serviço, junto com a vibração. No
aparelho o usuário **só sente a vibração** — sem o celular na mão, não percebe
que foi ouvido.

Contradiz o que está documentado: confirmar no código e no logcat antes de
assumir qualquer coisa.

## Critério de aceite

- [ ] Causa identificada no logcat (asset não encontrado? canal de áudio? foco?)
- [ ] Bipe audível ao acordar pela wake word
- [ ] Funciona com o app em background, que é o caso de uso real

## Onde olhar

`assets/chime.wav` (está no APK), `services/voice/listenChime.ts`.'

mk "Wake word com a tela apagada: nunca foi verificado" \
"p2,agente:claude,status:ready" \
'## Problema

Está marcado como "não verificado" desde sempre. É o caso de uso principal de um
assistente por voz — se não funcionar com a tela apagada, o produto não cumpre
a promessa.

## Critério de aceite

- [ ] Testado no aparelho com a tela apagada por vários minutos
- [ ] Testado depois do aparelho ficar parado (otimização de bateria da MIUI)
- [ ] Se não funcionar: causa identificada no logcat e issue de correção aberta
- [ ] Resultado documentado no `docs/ai/CONTEXT.md`, seja qual for'

mk "Reproduzir dois relatos: app travou e apareceu (funk) na tela" \
"p2,agente:claude,status:ready" \
'## Problema

O usuário relatou, sem conseguir reproduzir na hora:

1. o app **travou**
2. apareceu algo como **`(funk)`** na tela

Hipótese para o segundo: a intenção de música casou com algo que não devia
(`toca`, `coloca`, `põe`, `música` estão na gramática) — mas é hipótese,
não diagnóstico.

## Critério de aceite

- [ ] Reproduzido com o aparelho no adb e logcat capturado no momento
- [ ] Causa de cada um identificada
- [ ] Se for a intenção de música pegando frase demais, aplicar a mesma regra do
      atalho rápido: **na dúvida devolve `null` e deixa para a IA**'

# ---------------------------------------------------------------- P3
mk "Erro de tipo em perfil.tsx: rota de integrações fora dos typed routes" \
"p3,agente:codex,status:ready" \
'## Problema

`app/(tabs)/perfil.tsx:180` faz `router.push(''/(modals)/integracoes'')` e o
TypeScript recusa: a rota não está no union gerado pelos typed routes
(`experiments.typedRoutes: true`), mesmo com o arquivo existindo.

É um dos 3 erros que hoje são tratados como "ruído aceitável" — o que é ruim,
porque esconde erro de verdade (ver o caso do Xiaomi Pet).

## Critério de aceite

- [ ] Erro resolvido de verdade (regenerar tipos ou corrigir a rota), sem `as any`
- [ ] Navegar para Integrações pelo Perfil continua funcionando
- [ ] `npx tsc --noEmit` fica **totalmente limpo** depois desta e da issue do
      Xiaomi Pet — o baseline passa a ser zero'

mk "Migrar expo-av para expo-audio / expo-video" \
"p3,agente:codex,status:ready" \
'## Problema

`expo-av` está deprecado e sai no SDK 54 — o aviso já aparece no log do aparelho:

```
[expo-av]: Expo AV has been deprecated and will be removed in SDK 54.
```

## Critério de aceite

- [ ] Todo uso de `expo-av` migrado para `expo-audio` / `expo-video`
- [ ] O bipe e o TTS continuam funcionando (testar no aparelho antes de fechar)
- [ ] `npx tsc --noEmit` sem erro novo
- [ ] O aviso some do log

## Cuidado

Mexe no caminho de áudio, que é o coração do produto. Mudança de baixo risco no
papel, alto risco na prática — coordenar com quem estiver mexendo em voz.'

mk "Limitar memórias que entram no prompt (maior custo de token)" \
"p3,agente:codex,status:ready" \
'## Problema

Toda memória ativa entra em **todo** pedido ao LLM. O prompt cresce sem limite,
e este é o maior custo de token do projeto. Também piora a latência — quanto
maior o prompt, mais demorada a resposta.

## Critério de aceite

- [ ] Seleção por relevância em vez de mandar tudo
- [ ] Teto de tamanho, com as mais recentes/confirmadas tendo prioridade
- [ ] Medido: tamanho do prompt antes e depois
- [ ] O Argos continua lembrando do que importa (testar com memórias reais)'

mk "CI: rodar typecheck em todo PR" \
"p3,agente:codex,status:ready" \
'## Problema

Não existe `.github/workflows` — nenhuma verificação automática. Nada impede um
PR de entrar quebrando o typecheck.

## Critério de aceite

- [ ] Workflow rodando `npm ci` + `npx tsc --noEmit` em cada PR
- [ ] Barato e rápido (sem build de app, sem matriz de versões)
- [ ] Vira check obrigatório na branch padrão

## Depende de

As issues do Xiaomi Pet e do `perfil.tsx` — sem elas o baseline não é zero e o
check nasce vermelho.'

mk "Resolver a divergência master vs experimento-grande" \
"p3,agente:claude,requires-human,status:ready" \
'## Problema

As duas branches se separaram em **22/06/2026**:

- **`experimento-grande`** — é o produto de verdade (6 abas em português, todas
  as integrações, Vosk, TTS, foreground service). É o que está em produção: os
  20 últimos deploys do Vercel saíram dela.
- **`master`** — parou no app de junho (4 abas em inglês, só eWeLink, sem voz) e
  em 28/08 recebeu 7 commits de documentação de setup + um experimento de
  roteamento (`services/router/`, ~1.400 linhas).

A branch padrão do GitHub aponta para a `master`, ou seja, a proteção de branch
protege o código errado.

## Critério de aceite

- [ ] `experimento-grande` vira a branch padrão
- [ ] O que presta na `master` é trazido (avaliar `services/router/`, escrito
      contra o código de junho — provavelmente nem compila hoje)
- [ ] **Não** trazer o lixo: `graphify-out/`, o arquivo `argos-codex-builder`
      (pasta de worktree commitada por acidente), PDFs, `SETUP_*.md` soltos na raiz
- [ ] Proteção de branch aplicada na branch certa
- [ ] Nada da `master` se perde — ela continua existindo

## Cuidado

**Não mergear a `master` inteira** — arrastaria o app de junho por cima do atual.
Operação de risco: confirmar o plano com o usuário antes de executar.'

echo
echo "== pronto =="
gh issue list --repo "$REPO" --limit 30
