// Leitura incremental dos .jsonl das sessões: só os bytes novos, só linhas completas.
import { openSync, readSync, closeSync, fstatSync } from 'node:fs';

const NL = 0x0a;

function linhasParaObjetos(buffer) {
  const objetos = [];
  let inicio = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] !== NL) continue;
    const linha = buffer.subarray(inicio, i).toString('utf8').trim();
    inicio = i + 1;
    if (!linha) continue;
    try {
      objetos.push(JSON.parse(linha));
    } catch {
      // linha inválida: ignorada
    }
  }
  return { objetos, resto: buffer.subarray(inicio) };
}

export function lerNovasLinhas(arquivo, cursor) {
  const fd = openSync(arquivo, 'r');
  try {
    const { size } = fstatSync(fd);
    let { offset, resto } = cursor;
    if (size < offset) {
      offset = 0;
      resto = Buffer.alloc(0);
    }
    const novos = Buffer.alloc(size - offset);
    let lidos = 0;
    while (lidos < novos.length) {
      const n = readSync(fd, novos, lidos, novos.length - lidos, offset + lidos);
      if (n === 0) break;
      lidos += n;
    }
    const r = linhasParaObjetos(Buffer.concat([resto, novos.subarray(0, lidos)]));
    return { objetos: r.objetos, cursor: { offset: offset + lidos, resto: Buffer.from(r.resto) } };
  } finally {
    closeSync(fd);
  }
}

export function lerInicio(arquivo, bytes = 65536) {
  const fd = openSync(arquivo, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const n = readSync(fd, buffer, 0, bytes, 0);
    return linhasParaObjetos(buffer.subarray(0, n)).objetos;
  } finally {
    closeSync(fd);
  }
}
