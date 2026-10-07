/**
 * Instala o argos-core como serviço do Windows (Task Scheduler).
 * Execute como Administrador: node scripts/install-service.js
 */
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

if (os.platform() !== 'win32') {
  console.log('Instalação de serviço suportada apenas no Windows.');
  console.log('No Linux/macOS, use systemd ou launchd manualmente.');
  process.exit(0);
}

const cwd = path.resolve(__dirname, '..');
const nodeExe = process.execPath;
const script = path.join(cwd, 'dist', 'index.js');

const taskName = 'ArgosCore';
const xmlTask = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Argos Core — ponte local entre o app mobile e o PC</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled></LogonTrigger>
  </Triggers>
  <Settings>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure>
  </Settings>
  <Actions>
    <Exec>
      <Command>${nodeExe}</Command>
      <Arguments>${script}</Arguments>
      <WorkingDirectory>${cwd}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;

const xmlPath = path.join(os.tmpdir(), 'argos-core-task.xml');
require('fs').writeFileSync(xmlPath, xmlTask, 'utf-16le');

try {
  execSync(`schtasks /delete /tn "${taskName}" /f`, { stdio: 'ignore' });
} catch {}

execSync(`schtasks /create /tn "${taskName}" /xml "${xmlPath}" /f`);
console.log(`[argos-core] Tarefa "${taskName}" instalada com sucesso.`);
console.log('Execute: npm run build && npm start');
