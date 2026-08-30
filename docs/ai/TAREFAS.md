# Fila de tarefas — auditoria de 30/08/2026

> ⚠️ **Arquivo temporário.** A fonte de verdade da fila é o **GitHub Issues**
> (ver `WORK_PROTOCOL.md`). As Issues ainda não foram criadas porque o `gh` está
> sem autenticação na máquina. Enquanto isso, esta lista serve de fila.
> Quando as Issues subirem (`scripts/criar-issues.sh`), **este arquivo é apagado**
> e o GitHub passa a mandar.
>
> Enquanto for este arquivo: para reivindicar, marque `[EM ANDAMENTO — codex]`
> na linha da tarefa, **commite essa marcação primeiro**, e só então comece.

O texto completo de cada tarefa (contexto, critério de aceite, onde olhar,
armadilhas) está em **`scripts/criar-issues.sh`** — é o mesmo conteúdo que vai
virar Issue.

**Antes de começar qualquer coisa, leia `docs/ai/CONTEXT.md`.** Ele tem as três
regras que quebram o app em silêncio.

---

## CODEX — nesta ordem

A ordem importa: as duas primeiras destravam as outras.

### 1. Xiaomi Pet: `getXiaomiAccount` com 1 argumento em vez de 2 · P0

`api/xiaomi-pet.ts:41` e `:99` chamam `getXiaomiAccount(auth.user.id)`, mas a
assinatura é `getXiaomiAccount(userId, authToken)` (`api/_lib/xiaomi.ts:528`).
O `authToken` chega `undefined` no `supabaseAsUser()`. **Integração quebrada em
produção.** Comparar com como `api/xiaomi.ts` monta a chamada.

### 2. Remover as dependências mortas do Picovoice · P0

`@picovoice/porcupine-react-native` e `@picovoice/react-native-voice-processor`
estão no `package.json` e **nenhum arquivo importa**. Entram por autolink em todo
build nativo. Não encostar no `react-native-vosk`.

### 3. Erro de tipo em `perfil.tsx` (typed routes) · P3

`app/(tabs)/perfil.tsx:180`. Resolver de verdade, **sem `as any`**.
Depois desta e da #1, `npx tsc --noEmit` fica **totalmente limpo** — o baseline
passa a ser zero. É isso que destrava a #4.

### 4. CI: typecheck em todo PR · P3

Workflow com `npm ci` + `npx tsc --noEmit`. Barato, sem build de app.
**Depende de #1 e #3**, senão o check nasce vermelho.

### 5. Google/Chrome: criar o cartão na tela de Integrações · P1

`chromeService.ts` já está ligado ao `useDeviceStore` e `/api/chrome` responde,
mas não existe cartão em `app/(modals)/integracoes.tsx` — a integração é
inalcançável pelo usuário. Copiar a estrutura de um cartão existente.

### 6. Home Assistant: implementar fetch/control de verdade · P1

`services/ha/haService.ts` só faz generate/get/delete da chave. Não existe
`fetchHADevices` nem `controlHADevice`, e o store não importa nada de HA.
O cartão promete uma integração que não existe.

### 7. Tuya local (LAN): ligar ao store · P1

`services/devices/tuyaLocal.native.ts` está implementado e testado, mas nenhum
arquivo importa. Tentar o local antes da nuvem quando houver `localKey` + `ip` +
versão suportada; cair para a nuvem sem erro visível. 3.4/3.5 vai direto pra nuvem.

### 8. Xiaomi Pet: criar a UI · P1

Ligado ao store, zero interface. **Depende de #1** — sem ela o endpoint não
responde.

### 9. Limitar as memórias que entram no prompt · P3

Toda memória ativa entra em todo pedido. Maior custo de token do projeto, e
piora a latência. Selecionar por relevância + teto de tamanho.

### 10. Migrar `expo-av` → `expo-audio` / `expo-video` · P3

Deprecado, sai no SDK 54. **A mais arriscada da lista** — mexe no caminho de
áudio, que é o coração do produto. Testar bipe e TTS no aparelho antes de fechar.
Coordenar com quem estiver mexendo em voz.

---

## CLAUDE — precisa do aparelho, é nativo, ou é risco

Não pegar estas no Codex.

| | Tarefa | P |
|---|---|---|
| 11 | RLS desligado nas tabelas de token da Alexa | P0 |
| 12 | Política de versão (`1.0.0` travada apaga a fronteira JS/nativo) | P0 |
| 13 | Philips WiZ: reescrever o módulo UDP como config plugin | P1 |
| 14 | Apelido falável (`tv`, `4k`, `speaker`, `standing`, `ar-condicionado`, `2`) | P1 |
| 15 | Voz neural: decidir provedor e implementar | P2 |
| 16 | Medir de onde vem a latência | P2 |
| 17 | Voz masculina do sistema | P2 |
| 18 | Bipe de confirmação não soa | P2 |
| 19 | Wake word com a tela apagada | P2 |
| 20 | Reproduzir "travou" e "(funk)" | P2 |
| 21 | Divergência `master` vs `experimento-grande` | P3 |

---

## Quando a fila acabar

Ver a seção **"ENCADEAMENTO"** do `WORK_PROTOCOL.md`: terminou uma, procura a
próxima elegível sozinho. Não sobrou nenhuma → **para e avisa**. Não inventar
tarefa, não abrir refatoração espontânea.
