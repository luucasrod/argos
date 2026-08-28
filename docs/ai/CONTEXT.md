# CONTEXTO OPERACIONAL DO ARGOS

## Produto
Argos é um assistente de voz e controle de dispositivos domésticos (smart home). Aplicação React Native Expo com backend Node.js + Supabase, suportando múltiplas plataformas (web, iOS, Android).

**Objetivo**: Permitir que usuários controlem dispositivos (luzes, ventiladores, tomadas, etc.) através de comandos de voz em linguagem natural, com automações baseadas em regras.

## Arquitetura Vigente

### Frontend
- **React Native + Expo SDK 54** (Expo Router, Reanimated, Async Storage)
- **Tela Principal**: tabs (Casa, Dispositivos, IA, Perfil, Configurações)
- **Estado Global**: Zustand stores (useDeviceStore, useAIStore, useSettingsStore, useMemoryStore, useAutomationStore)
- **Autenticação**: Supabase Auth (email/password)

### Backend
- **API**: Node.js em `api/` (Tuya, Xiaomi, Supabase, wake-word endpoints)
- **Integrações**: 
  - Tuya (luzes, ventiladores, tomadas)
  - Xiaomi (humidificadores, comedouros)
  - eWeLink (sonoff)
  - Local WiZ discovery

### Voz
- **STT**: Expo Speech + Whisper API
- **TTS**: Expo Speech (nativo)
- **Wake Word**: Background (em construção - expo-av + ONNX)
- **Processamento**: FastIntent (classificação de intenção local)

## Decisões Vigentes
1. **Runtimeversion**: `appVersion` = `1.0.0` (builds OTA-compatíveis apenas enquanto versão não muda)
2. **Armazenamento Cliente**: AsyncStorage (nativo) + localStorage (web)
3. **Autenticação Serviço**: Supabase session + tokens de integração (Tuya API key, etc.)
4. **Integração Xiaomi**: HTTP direto (falta autenticação segura — usar MQTT futuro)
5. **Automações**: Loop em processIntent (sem scheduler externo ainda)

## Restrições Críticas
- **Plataforma Nativa (Android/iOS)**: Sem localStorage (usar AsyncStorage)
- **Background Task**: Expo Limited (react-native-background-actions com foreground service)
- **Timers**: JS-only. Screen-off → timers congelam (bug conhecido - mitigation: não contar em timers, usar timestamps)
- **Manifesto Nativo**: Changes exigem `eas build` (OTA só para JS/React/Expo)
- **Supabase RLS**: Habilitado (verificar permissões antes de migrações)

## Pendências Relevantes
1. **Black screen native**: Zustand persist com localStorage em vez de AsyncStorage (CRÍTICO - use AsyncStorage)
2. **Tuya "Executando..." forever**: Sem error handling no device control + sem timeout em fetches
3. **Foreground Service**: Nome da classe errado no manifest (typo: `reaction` em vez de `react`)
4. **Wake Word Background**: Manifesto incompleto (falta `<queries>` para RecognitionService, falta `foregroundServiceType="microphone"`)
5. **Commits config não versionados**: app.json, eas.json, plugins modificados, not committed

## Estado Conceitual (2026-08-28)
- Última feature: WiZ local discovery (GET /api/ha?action=wiz-devices)
- Voice integração: STT/TTS/Intent funcionando em foreground
- Nativo: SDK 54, targetSdk 36, bridgeless
- Testes: Audit de 43 pontos realizada (15/43 agentes completados antes do limite)

## Documentação de Referência
- Audit completa: `docs/auditoria-nativa-2026-07.md` (43 findings)
- API: `api/README.md` (se existir)
- Setup nativo: Verificar `app.json`, `eas.json`, `plugins/withForegroundService.js`

---
**Última atualização**: 2026-08-28 (setup inicial - Claude Code + Codex protocol)
**Fonte de verdade**: Este arquivo em `master` (não versões em branches)
