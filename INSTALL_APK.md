# 🚀 Instalação do Argos APK via ADB

## Pré-requisitos

✅ Android Debug Bridge (ADB) instalado
✅ USB Debug ativado no celular
✅ APK baixado localmente

## Instalação Rápida (Windows/PowerShell)

```powershell
# 1. Conectar celular via USB
# 2. Executar (substitua o caminho do APK):

adb install -r .\argos-v1.apk
```

## Instalação Rápida (Mac/Linux)

```bash
# 1. Conectar celular via USB
# 2. Executar:

adb install -r ./argos-v1.apk
```

## Verificar Conexão

```bash
adb devices
```

Deve mostrar seu celular como "device" (não "offline")

## Após Instalação

✅ App "Argos" aparecerá na tela inicial
✅ Abra e permita:
  - Permissão de microfone
  - Permissão de localizações de dispositivo
  - Permissão de arquivo

✅ Diga "Argos" para ativar

## Ver Logs em Tempo Real

```bash
adb logcat | grep "Argos"
```

Ver especificamente logs de voz:

```bash
adb logcat | grep -E "(LogService|WakeWord|TextToSpeech|SpeechRecognizer|AIProcessor)"
```

## Desinstalar se Precisar

```bash
adb uninstall com.argos
```

## Arquivo de Log no Dispositivo

Após usar o app:

```bash
adb pull /sdcard/Argos/logs/ ./argos-logs/
```

Isso copia todos os logs para `./argos-logs/` local.

---

## 📱 Checklist de Testes

- [ ] Wake word "Argos" detectado (escuta de fundo)
- [ ] STT captura comando após wake word
- [ ] AI processa e identifica dispositivo
- [ ] TTS responde com voz
- [ ] Logs mostram pipeline completo
- [ ] Nenhum crash ou permission error

## 🔧 Se Falhar

1. Verificar logs: `adb logcat | grep "ERROR"`
2. Verificar arquivo: `adb pull /sdcard/Argos/logs/latest.log ./`
3. O arquivo terá exatamente onde falhou
