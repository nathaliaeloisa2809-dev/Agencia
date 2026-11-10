// Registro estável de andares: o andar é do projeto, não do nome da pasta.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { lerFuncionarios } from './funcionarios.js';

export const PALETA = ['#ff7a59', '#5b7cff', '#2fb07f', '#e85d9a', '#e0a400', '#00a8c0', '#8e6bff', '#c0504d'];

const sha1 = texto => createHash('sha1').update(texto).digest('hex');
const nomeDaPasta = caminho => caminho.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
const igual = (a, b) => a.toLowerCase() === b.toLowerCase();
const dentro = (filho, pai) => {
  const f = filho.toLowerCase(), p = pai.toLowerCase().replace(/[\\/]+$/, '');
  return f.length > p.length && f.startsWith(p) && /[\\/]/.test(f[p.length]);
};
const hashNumero = texto => [...texto].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function identidade(cwd) {
  try {
    const saida = execFileSync('git', ['-C', cwd, 'rev-list', '--max-parents=0', 'HEAD'], { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    const primeiro = saida.toString().trim().split(/\r?\n/).pop();
    if (/^[0-9a-f]{40}$/.test(primeiro)) return 'git:' + primeiro;
  } catch { /* sem git */ }
  const agentes = lerFuncionarios(cwd).map(f => f.nome).sort();
  const claudeMd = join(cwd, 'CLAUDE.md');
  if (agentes.length || existsSync(claudeMd)) {
    let texto = '';
    try { texto = readFileSync(claudeMd, 'utf8'); } catch { /* sem CLAUDE.md */ }
    return 'fp:' + sha1(agentes.join(',') + '\n' + texto);
  }
  return 'cwd:' + sha1(cwd.toLowerCase());
}

const caminhoAtual = r => r.caminhos[r.caminhos.length - 1];

export function reconciliar(cfg, projetos, {
  existe = existsSync,
  calcIdentidade = identidade,
  lerNomesFuncionarios = c => lerFuncionarios(c).map(f => f.nome),
  agora = Date.now,
  gerarId = () => randomBytes(4).toString('hex'),
} = {}) {
  const nova = structuredClone(cfg);
  const registros = nova.andares;
  const grupos = new Map();
  const porCwd = new Map();
  // Pais antes dos filhos: o caminho mais curto primeiro.
  const ordenados = [...projetos].sort((a, b) => a.cwd.length - b.cwd.length);

  for (const p of ordenados) {
    const pai = ordenados.find(q => q !== p && dentro(p.cwd, q.cwd));
    let r = pai ? porCwd.get(pai.cwd) : Object.values(registros).find(x => x.caminhos.some(c => igual(c, p.cwd)));
    if (!r) {
      const ident = calcIdentidade(p.cwd);
      r = Object.values(registros).find(x => x.identidade === ident && !existe(caminhoAtual(x)));
      if (r) r.caminhos.push(p.cwd);
      else {
        const nome = nomeDaPasta(p.cwd);
        r = { id: gerarId(), caminhos: [p.cwd], identidade: ident, criadoEm: agora(), cor: PALETA[hashNumero(nome) % PALETA.length], funcionarios: [] };
        registros[r.id] = r;
      }
    }
    porCwd.set(p.cwd, r);
    if (!grupos.has(r.id)) grupos.set(r.id, []);
    grupos.get(r.id).push(p);
  }

  const ativos = [...grupos.keys()].map(id => registros[id]);
  for (const r of ativos) if (existe(caminhoAtual(r))) r.funcionarios = lerNomesFuncionarios(caminhoAtual(r));

  const sugestoes = [];
  for (const velho of ativos) {
    if (existe(caminhoAtual(velho)) || !velho.funcionarios.length) continue;
    for (const novo of ativos) {
      if (novo === velho || novo.criadoEm <= velho.criadoEm || !existe(caminhoAtual(novo))) continue;
      const comuns = velho.funcionarios.filter(n => novo.funcionarios.includes(n)).length;
      if (comuns / velho.funcionarios.length >= 0.7) sugestoes.push({ de: velho.id, para: novo.id });
    }
  }

  const andares = ativos
    .filter(r => !nova.ocultos.includes(r.id))
    .sort((a, b) => a.criadoEm - b.criadoEm)
    .map(r => ({
      id: r.id,
      nome: nova.apelidos[r.id] || nomeDaPasta(caminhoAtual(r)),
      cwd: caminhoAtual(r),
      pastaExiste: existe(caminhoAtual(r)),
      cor: r.cor,
      projetos: grupos.get(r.id),
    }));

  return { cfg: nova, andares, sugestoes };
}
