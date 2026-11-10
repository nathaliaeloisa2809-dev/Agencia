// Configuração do prédio, guardada em dados/predio.json.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

const padrao = () => ({ nome: 'Prédio IA', ocultos: [], apelidos: {}, tipos: {}, andares: {} });

export function carregarConfig(caminho) {
  let lido = {};
  try {
    lido = JSON.parse(readFileSync(caminho, 'utf8'));
    if (!lido || typeof lido !== 'object' || Array.isArray(lido)) lido = {};
  } catch {
    lido = {};
  }
  return { ...padrao(), ...lido };
}

// Grava num .tmp e renomeia, para nunca deixar o arquivo pela metade.
export function salvarConfig(caminho, cfg) {
  mkdirSync(dirname(caminho), { recursive: true });
  const temporario = caminho + '.tmp';
  writeFileSync(temporario, JSON.stringify(cfg, null, 2));
  // OneDrive e antivírus às vezes travam o arquivo por um instante.
  for (let tentativa = 1; ; tentativa++) {
    try { return renameSync(temporario, caminho); } catch (erro) {
      if (tentativa >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(erro.code)) throw erro;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * tentativa);
    }
  }
}
