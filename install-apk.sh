#!/bin/bash
# Script de instalação automática do Argos APK
# Uso: ./install-apk.sh -a caminho/para/argos.apk

set -e

APK_PATH=""
CLEAR_DATA=false
WATCH_LOGS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -a|--apk) APK_PATH="$2"; shift 2 ;;
    -c|--clear) CLEAR_DATA=true; shift ;;
    -l|--logs) WATCH_LOGS=true; shift ;;
    *) APK_PATH="$1"; shift ;;
  esac
done

# Se não informou APK, pedir
if [ -z "$APK_PATH" ]; then
  read -p "Cole o caminho completo do APK: " APK_PATH
fi

echo "🚀 Instalador do Argos"
echo "=================================================="

# 1. Verificar ADB
if ! command -v adb &> /dev/null; then
  echo "✗ ADB não encontrado! Instale o Android SDK Platform Tools"
  exit 1
fi

ADB_VERSION=$(adb version | head -1)
echo "✓ ADB encontrado: $ADB_VERSION"

# 2. Verificar conexão
echo ""
echo "📱 Verificando conexão com dispositivo..."
DEVICES=$(adb devices | tail -n +2 | grep -v "^$")

if [ -z "$DEVICES" ]; then
  echo "✗ Nenhum dispositivo conectado!"
  echo "  - Conecte o celular via USB"
  echo "  - Ative Debug Mode nas Configurações de Desenvolvedor"
  exit 1
fi

echo "✓ Dispositivo(s) conectado(s):"
echo "$DEVICES" | sed 's/^/  /'

# 3. Validar arquivo APK
echo ""
echo "📦 Validando APK..."
if [ ! -f "$APK_PATH" ]; then
  echo "✗ Arquivo não encontrado: $APK_PATH"
  exit 1
fi

APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
APK_NAME=$(basename "$APK_PATH")
echo "✓ APK encontrado: $APK_NAME ($APK_SIZE)"

# 4. Desinstalar versão anterior (opcional)
if [ "$CLEAR_DATA" = true ]; then
  echo ""
  echo "🗑️ Desinstalando versão anterior..."
  adb uninstall com.argos 2>/dev/null || true
  sleep 1
fi

# 5. Instalar APK
echo ""
echo "⏳ Instalando APK..."
INSTALL_OUTPUT=$(adb install -r "$APK_PATH" 2>&1)

if echo "$INSTALL_OUTPUT" | grep -q "Success"; then
  echo "✓ APK instalado com sucesso!"
else
  echo "✗ Erro na instalação:"
  echo "$INSTALL_OUTPUT"
  exit 1
fi

# 6. Iniciar app
echo ""
echo "🚀 Iniciando aplicativo..."
adb shell am start -n com.argos/.MainActivity 2>/dev/null || true
echo "✓ Argos iniciado!"

# 7. Ver logs em tempo real (opcional)
if [ "$WATCH_LOGS" = true ]; then
  echo ""
  echo "📊 Aguardando logs (Ctrl+C para parar)..."
  sleep 2
  adb logcat | grep -E "(Argos|LogService|WakeWord|TextToSpeech|SpeechRecognizer|AIProcessor|ERROR|WARN)" || true
else
  echo ""
  echo "💡 Para ver logs em tempo real, execute:"
  echo "   adb logcat | grep -E 'Argos|LogService|WakeWord'"
fi

echo ""
echo "✅ Instalação completa!"
echo "Diga 'Argos' para ativar a voz 🎤"
