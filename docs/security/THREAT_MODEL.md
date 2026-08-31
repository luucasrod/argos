# Threat model do Argos

Versao 1, 31/08/2026. Escopo: app Argos F, APIs serverless/Argos Cloud,
futuro Argos Home, LAN e provedores de dispositivos. Este documento nao contem
segredos, valores de chave nem detalhes de tabelas privadas.

## Ativos e fronteiras de confianca

Ativos P0: capacidade de acionar a casa, tokens de conta/provedor, chaves locais
de dispositivos, identidade do usuario e memorias. Uma falha P0 permite controle
nao autorizado persistente, exfiltracao de credencial ou acao fisica perigosa.

1. **Pessoa -> app:** o aparelho e a sessao local nao provam presenca do dono.
2. **App -> Cloud:** rede e cliente sao hostis; o servidor autentica e autoriza.
3. **Cloud -> banco/provedor:** service credentials atravessam uma fronteira de
   alto privilegio e nunca podem chegar ao cliente ou aos logs.
4. **App/Home -> LAN/device:** qualquer host da LAN pode observar, repetir ou
   forjar trafego que o protocolo nao autentique.
5. **Cloud -> Home:** uma sessao valida nao basta; comando precisa ter origem,
   destino, validade, integridade, autorizacao e protecao contra repeticao.
6. **Pairing -> controle persistente:** descoberta nao concede propriedade.

## Ameacas, controles e gates

| ID | Ameaca | Nivel | Controles concretos atuais | Mitigacao minima / gate |
|---|---|---:|---|---|
| T1 | App ou cliente falso chama APIs | P0 | APIs de integracao validam Bearer via Supabase (`api/_lib/*`); `api/ha.ts` valida chave dedicada | Toda rota de leitura/controle deve resolver identidade no servidor e filtrar recursos por userId. Teste negativo obrigatorio. |
| T2 | Replay de comando valido | P0 | `contracts/protocol.ts` inclui commandId e timestamp | Antes de beta externo: TTL curto, nonce/commandId deduplicado no destino e rejeicao persistida de repetidos. Timestamp sozinho nao mitiga replay. |
| T3 | Tomada do Argos Home | P0 | Ainda nao ha Home implantado | Antes de beta externo: identidade unica por Home, pairing com prova de presenca, credencial rotacionavel, revogacao e autorizacao por homeId. Discovery nunca autentica. |
| T4 | Vazamento de token/chave local | P0 | Snapshots cloud excluem metadata/state (`services/devices/deviceRegistry.ts`); sessao e renovada por `services/auth/session.ts` | Segredos somente em storage apropriado/servidor; nunca em snapshot, analytics, erro, URL ou log. Rotacao e revogacao testadas. Redaction automatica antes do beta. |
| T5 | LAN hostil injeta/observa comandos | P0 | Alguns protocolos de fornecedor assinam/cifram; isso varia por adapter | Adapter deve documentar autenticacao, confidencialidade e replay. Protocolo sem autenticacao fica restrito a acao de baixo risco ou requer canal autenticado do Home. |
| T6 | Comprometimento Cloud controla todas as casas | P0 | Separacao por usuario e tokens de escopo do provedor | Minimo privilegio, isolamento por user/home, auditoria de comandos, revogacao emergencial e ausencia de chave mestra de controle no app. Acoes criticas exigem politica adicional. |
| T7 | Pairing indevido associa device/Home | P0 | Integracoes exigem sessao do usuario; discovery local nao equivale a ownership | Prova de presenca/posse, confirmacao explicita, binding a userId+homeId, timeout e tentativa limitada. Exibir identidade humana antes de confirmar. |
| T8 | Confused deputy troca deviceId de outro usuario | P0 | Endpoints consultam credenciais do usuario autenticado | Nunca aceitar ownership do body. Resolver device/account pelo userId da sessao e testar IDs cruzados. |
| T9 | Prompt/voz aciona operacao sensivel | P1 | Nivel de autonomia e confirmacoes existem no cliente | Autorizacao final nao pode depender so do LLM. Classificar acao e exigir confirmacao/politica deterministica no executor. |
| T10 | Logs e telemetria viram canal de exfiltracao | P1 | Snapshot canonico reduz dados enviados | Allowlist de campos, redaction de Authorization/tokens/localKey e retencao limitada. Trace usa IDs opacos. |

Nenhum risco P0 pode ser aceito tacitamente. Se a mitigacao minima ainda nao
existir, a integracao permanece interna/bloqueada e ganha issue propria antes do
beta externo.

## Checklist obrigatorio para nova integracao

- [ ] Define quem autentica o chamador e onde a autorizacao e decidida.
- [ ] Deriva userId/homeId da credencial validada, nunca do body sem verificacao.
- [ ] Documenta onde tokens, passwords e local keys ficam; nenhum entra em log,
      URL, analytics, snapshot cloud ou resposta de API.
- [ ] Tem teste para sem credencial, credencial invalida, usuario cruzado e
      deviceId de outro usuario.
- [ ] Define idempotencia, TTL e comportamento de replay/commandId duplicado.
- [ ] Se usa LAN, documenta autenticacao, cifragem, descoberta hostil e spoofing.
- [ ] Discovery e pairing sao etapas separadas; pairing exige prova de posse ou
      presenca e confirmacao humana.
- [ ] Define capacidades e limites; payload do fornecedor nao atravessa o core.
- [ ] Define timeout, retry limitado e falha segura (sem confirmar acao incerta).
- [ ] Permite revogar/desconectar e confirma que credenciais deixam de funcionar.
- [ ] Registra auditoria sem conteudo sensivel: actor, home, device, capability,
      outcome, commandId e horario.
- [ ] Classifica acoes fisicamente sensiveis e aplica confirmacao/politica fora do LLM.
- [ ] A revisao inclui threat model atualizado e evidencia dos testes negativos.

## Evidencia para liberar beta externo

O responsavel pela release deve anexar a uma issue de gate: matriz T1--T8 com
links para implementacao/testes, resultado de tentativa de replay, teste de
isolamento entre dois usuarios, revogacao de Home/provedor e amostra de logs
redigidos. Ausencia de evidencia equivale a gate reprovado.
