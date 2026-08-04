# Script de instalação automática do Argos APK
# Uso: .\install-apk.ps1 -ApkPath "caminho\para\argos.apk"

param(
    [string]$ApkPath = $(Read-Host "Cole o caminho completo do APK"),
    [switch]$ClearData,
    [switch]$WatchLogs
)

Write-Host "🚀 Instalador do Argos" -ForegroundColor Cyan
Write-Host "=" * 50

# 1. Verificar se ADB está instalado
try {
    $adbVersion = adb version 2>&1 | Select-Object -First 1
    Write-Host "✓ ADB encontrado: $adbVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ ADB não encontrado! Instale o Android SDK Platform Tools" -ForegroundColor Red
    exit 1
}

# 2. Verificar conexão
Write-Host "`n📱 Verificando conexão com dispositivo..."
$devices = adb devices | Select-Object -Skip 1 | Where-Object { $_.Length -gt 0 }

if ($devices.Count -eq 0) {
    Write-Host "✗ Nenhum dispositivo conectado!" -ForegroundColor Red
    Write-Host "  - Conecte o celular via USB" -ForegroundColor Yellow
    Write-Host "  - Ative Debug Mode nas Configurações de Desenvolvedor" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Dispositivo(s) conectado(s):" -ForegroundColor Green
$devices | ForEach-Object {
    Write-Host "  $_" -ForegroundColor Cyan
}

# 3. Validar arquivo APK
Write-Host "`n📦 Validando APK..."
if (-not (Test-Path $ApkPath)) {
    Write-Host "✗ Arquivo não encontrado: $ApkPath" -ForegroundColor Red
    exit 1
}

$apkFile = Get-Item $ApkPath
Write-Host "✓ APK encontrado: $($apkFile.Name) ($('{0:N0}' -f ($apkFile.Length / 1MB)) MB)" -ForegroundColor Green

# 4. Desinstalar versão anterior (opcional)
if ($ClearData) {
    Write-Host "`n🗑️ Desinstalando versão anterior..."
    adb uninstall com.argos 2>&1 | Out-Null
    Start-Sleep -Seconds 1
}

# 5. Instalar APK
Write-Host "`n⏳ Instalando APK..." -ForegroundColor Yellow
$installOutput = adb install -r $ApkPath 2>&1

if ($installOutput -match "Success") {
    Write-Host "✓ APK instalado com sucesso!" -ForegroundColor Green
} else {
    Write-Host "✗ Erro na instalação:" -ForegroundColor Red
    Write-Host $installOutput
    exit 1
}

# 6. Iniciar app (opcional)
Write-Host "`n🚀 Iniciando aplicativo..."
adb shell am start -n com.argos/.MainActivity 2>&1 | Out-Null
Write-Host "✓ Argos iniciado!" -ForegroundColor Green

# 7. Ver logs em tempo real (opcional)
if ($WatchLogs) {
    Write-Host "`n📊 Aguardando logs (Ctrl+C para parar)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    adb logcat | Select-String -Pattern "(Argos|LogService|WakeWord|TextToSpeech|SpeechRecognizer|AIProcessor)" -Pattern "ERROR|WARN"
} else {
    Write-Host "`n💡 Para ver logs em tempo real, execute:" -ForegroundColor Cyan
    Write-Host "   adb logcat | Select-String 'Argos|LogService|WakeWord'" -ForegroundColor Yellow
}

Write-Host "`n✅ Instalação completa!" -ForegroundColor Green
Write-Host "Diga 'Argos' para ativar a voz 🎤" -ForegroundColor Cyan
