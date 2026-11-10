import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarSessao, aplicar, estadoAtual, chamadasAbertas } from '../sessoes.js';

const T0 = Date.parse('2026-11-10T15:00:00Z');
const ts = (s = 0) => new Date(T0 + s * 1000).toISOString();
const usoFerramenta = (nome, input, id = 't1', s = 0) => ({
  type: 'assistant', timestamp: ts(s),
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name: nome, input }], stop_reason: 'tool_use' },
});
const resultado = (id = 't1', s = 1) => ({
  type: 'user', timestamp: ts(s), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
});
const texto = (t, s = 0, stop = 'end_turn') => ({
  type: 'assistant', timestamp: ts(s), message: { role: 'assistant', content: [{ type: 'text', text: t }], stop_reason: stop },
});
const pergunta = (t, s = 0) => ({ type: 'user', timestamp: ts(s), message: { role: 'user', content: t } });

function sessaoCom(...linhas) {
  const s = criarSessao('abc');
  for (const l of linhas) aplicar(s, l);
  return s;
}
const estado = (s, segundos) => estadoAtual(s, T0 + segundos * 1000);

test('encerrada depois de 30 min', () => {
  assert.equal(estado(sessaoCom(texto('oi')), 31 * 60).estado, 'encerrada');
});

test('ferramenta longa vira precisa', () => {
  const e = estado(sessaoCom(usoFerramenta('Bash', { command: 'npm test' })), 61);
  assert.deepEqual([e.estado, e.acao], ['precisa', 'Talvez esperando permissão no terminal']);
});

test('escrevendo', () => {
  const e = estado(sessaoCom(usoFerramenta('Edit', { file_path: 'C:\\x\\peca.md' })), 5);
  assert.deepEqual([e.estado, e.acao], ['escrevendo', 'Editando peca.md']);
});

test('lendo com Read, Grep e Glob', () => {
  assert.equal(estado(sessaoCom(usoFerramenta('Read', { file_path: 'C:/a/CLAUDE.md' })), 5).acao, 'Lendo CLAUDE.md');
  assert.equal(estado(sessaoCom(usoFerramenta('Grep', { pattern: 'cota' })), 5).acao, 'Buscando "cota"');
  const g = estado(sessaoCom(usoFerramenta('Glob', { pattern: '**/*.md' })), 5);
  assert.deepEqual([g.estado, g.acao], ['lendo', 'Procurando **/*.md']);
  assert.equal(estado(sessaoCom(usoFerramenta('WebFetch', { url: 'https://exemplo.com/a' })), 5).acao, 'Abrindo exemplo.com');
});

test('terminal', () => {
  const e = estado(sessaoCom(usoFerramenta('Bash', { command: 'npm run status' })), 5);
  assert.deepEqual([e.estado, e.acao], ['terminal', '$ npm run status']);
});

test('delegando', () => {
  const e = estado(sessaoCom(usoFerramenta('Agent', { subagent_type: 'roteirista', description: 'Roteiro', prompt: 'x' })), 5);
  assert.deepEqual([e.estado, e.acao], ['delegando', 'Chamando roteirista']);
});

test('outra ferramenta é trabalhando', () => {
  const e = estado(sessaoCom(usoFerramenta('TodoWrite', {})), 5);
  assert.deepEqual([e.estado, e.acao], ['trabalhando', 'TodoWrite']);
});

test('fim de turno recente é esperando', () => {
  const e = estado(sessaoCom(texto('Pronto, o que acha?')), 60);
  assert.deepEqual([e.estado, e.acao], ['esperando', 'Esperando você']);
});

test('mensagem recente sem resposta é pensando', () => {
  const e = estado(sessaoCom(texto('feito'), pergunta('e agora?', 10)), 30);
  assert.deepEqual([e.estado, e.acao], ['pensando', 'Pensando…']);
});

test('parado', () => {
  const e = estado(sessaoCom(pergunta('oi')), 10 * 60);
  assert.deepEqual([e.estado, e.acao], ['parado', 'Parado']);
});

test('desde é o momento da última linha', () => {
  assert.equal(estado(sessaoCom(texto('a', 7)), 20).desde, T0 + 7000);
});

test('título por ai-title vence a primeira mensagem', () => {
  const s = sessaoCom(pergunta('quero um prédio com os meus agentes trabalhando como um jogo, com andares e tudo mais'));
  assert.equal(s.titulo, 'quero um prédio com os meus agentes trabalhando como um jogo');
  assert.equal(s.titulo.length, 60);
  aplicar(s, { type: 'ai-title', aiTitle: 'Prédio dos agentes' });
  assert.equal(s.titulo, 'Prédio dos agentes');
});

test('subagente por subagent_type', () => {
  const s = sessaoCom(usoFerramenta('Agent', { subagent_type: 'roteirista', description: 'Roteiro da peça', prompt: 'x' }, 'a1'));
  assert.deepEqual(chamadasAbertas(s), [{ toolUseId: 'a1', funcionario: 'roteirista', descricao: 'Roteiro da peça', inicio: T0 }]);
});

test('subagente pelo caminho no prompt', () => {
  const s = sessaoCom(usoFerramenta('Agent', { subagent_type: 'general-purpose', description: 'Estoque', prompt: 'Leia `.claude/agents/estoque.md` e siga.' }, 'a1'));
  assert.equal(chamadasAbertas(s)[0].funcionario, 'estoque');
});

test('general-purpose sem caminho dá funcionario null', () => {
  const s = sessaoCom(usoFerramenta('Task', { subagent_type: 'general-purpose', description: 'Pesquisa', prompt: 'pesquise' }, 'a1'));
  assert.equal(chamadasAbertas(s)[0].funcionario, null);
});

test('tool_result fecha ferramenta e chamada', () => {
  const s = sessaoCom(usoFerramenta('Agent', { subagent_type: 'roteirista', prompt: 'x' }, 'a1'), resultado('a1', 3));
  assert.deepEqual(chamadasAbertas(s), []);
  assert.equal(s.ferramentaAberta, null);
});

test('guarda só 6 mensagens', () => {
  const s = sessaoCom(...Array.from({ length: 8 }, (_, i) => pergunta('m' + i, i)));
  assert.deepEqual(s.mensagens.map(m => m.t), ['m2', 'm3', 'm4', 'm5', 'm6', 'm7']);
  assert.equal(s.mensagens[0].u, true);
});

test('guarda arquivos alterados sem repetir', () => {
  const s = sessaoCom(
    usoFerramenta('Write', { file_path: 'C:\\a.md' }, 'x1'), resultado('x1'),
    usoFerramenta('Edit', { file_path: 'C:\\b.md' }, 'x2'), resultado('x2'),
    usoFerramenta('Edit', { file_path: 'C:\\a.md' }, 'x3'),
  );
  assert.deepEqual(s.arquivos, ['C:\\b.md', 'C:\\a.md']);
});
