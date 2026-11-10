import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horaBrasilia } from '../relogio.js';
import { montarEstado } from '../estado.js';
import { criarSessao, aplicar } from '../sessoes.js';

const T0 = Date.parse('2026-11-10T15:00:00Z');
const ts = s => new Date(T0 + s * 1000).toISOString();
const ferramenta = (nome, input, id, s) => ({ type: 'assistant', timestamp: ts(s), message: { content: [{ type: 'tool_use', id, name: nome, input }], stop_reason: 'tool_use' } });
const fala = (t, s) => ({ type: 'user', timestamp: ts(s), message: { content: t } });

function sessao(id, ...linhas) {
  const s = criarSessao(id);
  for (const l of linhas) aplicar(s, l);
  return s;
}

const ANDAR = { id: 'a1', nome: 'Conteudo May', cwd: 'C:\\x\\Conteudo May', pastaExiste: true, cor: '#ff7a59', projetos: [{ pasta: 'P1' }] };
const INFO = new Map([['a1', {
  funcionarios: [{ nome: 'copywriter', descricao: 'Legendas', ferramentas: [] }, { nome: 'roteirista', descricao: 'Roteiros', ferramentas: [] }],
  tipo: 'linha-producao', skills: [],
}]]);
const CFG = { nome: 'Torre May', tipos: {} };

function montar(sessoes, agora = T0 + 10_000, extra = {}) {
  return montarEstado({ cfg: CFG, andares: [ANDAR], sessoesPorPasta: new Map([['P1', sessoes]]), infoPorAndar: INFO, agora, sugestoes: [], ...extra });
}

test('hora de Brasília', () => {
  assert.deepEqual(horaBrasilia(new Date('2026-11-10T21:30:00Z')), { hora: '18:30', data: '2026-11-10', noite: true });
  assert.deepEqual(horaBrasilia(new Date('2026-11-10T10:05:00Z')), { hora: '07:05', data: '2026-11-10', noite: false });
  assert.equal(horaBrasilia(new Date('2026-11-11T02:30:00Z')).data, '2026-11-10');
});

test('funcionário acende pela chamada do terminal', () => {
  const principal = sessao('s1', fala('rode o ciclo semanal', 0), ferramenta('Agent', { subagent_type: 'roteirista', description: 'Roteiro peça 1', prompt: 'x' }, 'a1', 1));
  const sub = sessao('sub', ferramenta('Edit', { file_path: 'C:\\x\\peca.md' }, 'e1', 5));
  const r = montar(new Map([['s1', { sessao: principal, subagentes: new Map([['a1', sub]]) }]]));
  const rot = r.andares[0].funcionarios.find(f => f.nome === 'roteirista');
  assert.equal(rot.estado, 'escrevendo');
  assert.equal(rot.acao, 'Editando peca.md');
  assert.deepEqual(rot.arquivos, ['C:\\x\\peca.md']);
  assert.equal(r.predio.nome, 'Torre May');
  assert.equal(r.andares[0].numero, 1);
  assert.equal(r.andares[0].tipo, 'linha-producao');
});

test('subagente ainda sem arquivo fica trabalhando', () => {
  const principal = sessao('s1', ferramenta('Agent', { subagent_type: 'roteirista', description: 'Roteiro peça 1', prompt: 'x' }, 'a1', 1));
  const rot = montar(new Map([['s1', { sessao: principal, subagentes: new Map() }]])).andares[0].funcionarios.find(f => f.nome === 'roteirista');
  assert.deepEqual([rot.estado, rot.acao], ['trabalhando', 'Roteiro peça 1']);
});

test('funcionário sem chamada fica parado', () => {
  const cop = montar(new Map()).andares[0].funcionarios.find(f => f.nome === 'copywriter');
  assert.deepEqual([cop.estado, cop.acao, cop.descricao], ['parado', 'Sem trabalho agora', 'Legendas']);
});

test('sessão encerrada não vira visitante', () => {
  const velha = sessao('s1', fala('oi', 0));
  const r = montar(new Map([['s1', { sessao: velha, subagentes: new Map() }]]), T0 + 40 * 60_000);
  assert.deepEqual(r.andares[0].visitantes, []);
  const nova = montar(new Map([['s1', { sessao: velha, subagentes: new Map() }]]));
  assert.equal(nova.andares[0].visitantes[0].titulo, 'oi');
});

test('estagiário para general-purpose', () => {
  const principal = sessao('s1', fala('pesquise', 0), ferramenta('Agent', { subagent_type: 'general-purpose', description: 'Pesquisa de concorrentes', prompt: 'x' }, 'a9', 1));
  const r = montar(new Map([['s1', { sessao: principal, subagentes: new Map() }]]));
  assert.deepEqual(r.andares[0].estagiarios.map(e => [e.id, e.descricao, e.chamadoPor]), [['a9', 'Pesquisa de concorrentes', 'pesquise']]);
});

test('execução ordenada e sem parados', () => {
  const a = sessao('s1', fala('primeira', 0), ferramenta('Read', { file_path: 'C:\\a.md' }, 'r1', 2));
  const b = sessao('s2', fala('segunda', 1), ferramenta('Bash', { command: 'npm test' }, 'b1', 1));
  const r = montar(new Map([['s1', { sessao: a, subagentes: new Map() }], ['s2', { sessao: b, subagentes: new Map() }]]));
  assert.deepEqual(r.execucao.map(e => [e.quem, e.tipo, e.acao]), [['segunda', 'visitante', '$ npm test'], ['primeira', 'visitante', 'Lendo a.md']]);
  assert.ok(r.execucao.every(e => e.andar === 'Conteudo May'));
});

test('sugestões levam os nomes', () => {
  const outro = { ...ANDAR, id: 'a2', nome: 'Agencia May', projetos: [] };
  const r = montarEstado({ cfg: CFG, andares: [ANDAR, outro], sessoesPorPasta: new Map(), infoPorAndar: INFO, agora: T0, sugestoes: [{ de: 'a1', para: 'a2' }] });
  assert.deepEqual(r.sugestoes, [{ de: 'a1', para: 'a2', deNome: 'Conteudo May', paraNome: 'Agencia May' }]);
});
