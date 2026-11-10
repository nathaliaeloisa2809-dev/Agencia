// O que o projeto tem: funcionários (.claude/agents), tipo de andar e skills.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

export function lerFrontmatter(texto) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto);
  if (!m) return {};
  const dados = {};
  for (const linha of m[1].split(/\r?\n/)) {
    const i = linha.indexOf(':');
    if (i <= 0 || /^\s/.test(linha)) continue;
    dados[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  return dados;
}

const lerTexto = arquivo => { try { return readFileSync(arquivo, 'utf8'); } catch { return ''; } };

export function lerFuncionarios(cwd) {
  const pasta = join(cwd, '.claude', 'agents');
  let arquivos;
  try { arquivos = readdirSync(pasta).filter(a => a.endsWith('.md')); } catch { return []; }
  return arquivos
    .map(a => {
      const d = lerFrontmatter(lerTexto(join(pasta, a)));
      return {
        nome: d.name || basename(a, '.md'),
        descricao: d.description || '',
        ferramentas: d.tools ? d.tools.split(',').map(t => t.trim()).filter(Boolean) : [],
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

const IGNORAR = new Set(['node_modules', '.git']);

// Caminhos de SKILL.md até a profundidade 4 (a pasta da skill conta como nível 1).
function acharSkills(cwd) {
  const achados = [];
  const visitar = (pasta, nivel) => {
    if (nivel > 4) return;
    let entradas;
    try { entradas = readdirSync(pasta, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      if (!e.isDirectory() || IGNORAR.has(e.name)) continue;
      const sub = join(pasta, e.name);
      if (existsSync(join(sub, 'SKILL.md'))) achados.push(sub);
      visitar(sub, nivel + 1);
    }
  };
  visitar(cwd, 1);
  return achados;
}

const ehPasta = p => { try { return statSync(p).isDirectory(); } catch { return false; } };

export function detectarTipo(cwd) {
  if (existsSync(join(cwd, 'sistema', 'pipeline.js'))) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
      if (pkg.scripts && pkg.scripts.status) return 'linha-producao';
    } catch { /* sem package.json válido */ }
  }
  if (!ehPasta(join(cwd, '.claude', 'agents')) && acharSkills(cwd).length >= 3) return 'biblioteca';
  return 'fila';
}

export function listarSkills(cwd) {
  const porNome = new Map();
  for (const pasta of acharSkills(cwd)) {
    const d = lerFrontmatter(lerTexto(join(pasta, 'SKILL.md')));
    const nome = d.name || basename(pasta);
    if (!porNome.has(nome)) porNome.set(nome, { nome, descricao: d.description || '' });
  }
  return [...porNome.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}
