// Sobe o prédio: monitor + servidor local, e abre o navegador.
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Monitor } from './monitor.js';
import { iniciarServidor } from './servidor.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = 4777;
const token = randomBytes(16).toString('hex');
const monitor = new Monitor({ dirProjetos: join(homedir(), '.claude', 'projects'), caminhoConfig: join(raiz, 'dados', 'predio.json') });

try {
  await iniciarServidor({ monitor, token, porta: PORTA, dirWeb: join(raiz, 'web') });
} catch (erro) {
  if (erro.code === 'EADDRINUSE') {
    console.error(`A porta ${PORTA} já está em uso — o prédio já está aberto?`);
    process.exit(1);
  }
  throw erro;
}

const url = `http://127.0.0.1:${PORTA}/?t=${token}`;
console.log(`Prédio aberto em ${url}`);
console.log('Deixe esta janela aberta enquanto usa o prédio. Para fechar: Ctrl+C.');
if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
