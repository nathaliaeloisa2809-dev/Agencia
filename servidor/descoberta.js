// Cada pasta em ~/.claude/projects com sessões é um projeto; o caminho real vem do "cwd" das linhas.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { lerInicio } from './jsonl.js';

const mesmoCaminho = (a, b) => a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase();

function cwdDe(sessoes) {
  for (const s of sessoes) {
    try {
      const comCwd = lerInicio(s.arquivo).find(o => typeof o.cwd === 'string' && o.cwd);
      if (comCwd) return comCwd.cwd;
    } catch { /* arquivo sumiu no meio da leitura */ }
  }
  return null;
}

export function listarProjetos(dirProjetos, { home = homedir() } = {}) {
  let pastas;
  try { pastas = readdirSync(dirProjetos, { withFileTypes: true }).filter(e => e.isDirectory()); } catch { return []; }
  const projetos = [];
  for (const { name: pasta } of pastas) {
    if (pasta.includes('-scratch-')) continue;
    const dir = join(dirProjetos, pasta);
    let sessoes;
    try {
      sessoes = readdirSync(dir)
        .filter(a => a.endsWith('.jsonl'))
        .map(a => {
          const arquivo = join(dir, a);
          const id = basename(a, '.jsonl');
          const sub = join(dir, id, 'subagents');
          return { id, arquivo, mtimeMs: statSync(arquivo).mtimeMs, dirSubagentes: existsSync(sub) ? sub : null };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
    } catch { continue; }
    if (!sessoes.length) continue;
    const cwd = cwdDe(sessoes);
    if (!cwd || mesmoCaminho(cwd, home) || /[\\/]scratch-workspaces[\\/]/i.test(cwd)) continue;
    projetos.push({ pasta: dir, cwd, sessoes });
  }
  return projetos;
}
