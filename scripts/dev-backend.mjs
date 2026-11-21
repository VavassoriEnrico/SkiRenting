import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backendDir = fileURLToPath(new URL('../backend/', import.meta.url));
const python = path.join(
  backendDir,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);

if (!existsSync(python)) {
  console.error(
    'Ambiente Python assente. Crea backend/.venv e installa backend/requirements-dev.txt. Vedi README.md.',
  );
  process.exit(1);
}

const server = spawn(
  python,
  ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8001'],
  { cwd: backendDir, stdio: 'inherit' },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
server.on('error', (error) => {
  console.error(`Impossibile avviare il backend: ${error.message}`);
  process.exit(1);
});
server.on('exit', (code, signal) => {
  process.exit(code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1));
});
