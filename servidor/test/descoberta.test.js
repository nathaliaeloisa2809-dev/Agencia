import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listarProjetos } from '../descoberta.js';

const HOME = 'C:\\Users\\Teste';
const MAY = 'C:\\Users\\Teste\\OneDrive\\Área de Trabalho\\Conteudo May';

function dirProjetos() {
  return mkdtempSync(join(tmpdir(), 'predio-desc-'));
}
function sessao(dir, pasta, id, cwd, extra = '') {
  mkdirSync(join(dir, pasta), { recursive: true });
  writeFileSync(join(dir, pasta, id + '.jsonl'), '{"type":"mode"}\n' + JSON.stringify({ type: 'user', cwd }) + '\n' + extra);
}

test('encontra projeto e cwd', () => {
  const dir = dirProjetos();
  sessao(dir, 'C--Users-Teste-OneDrive--rea-de-Trabalho-Conteudo-May', 'abc', MAY);
  const p = listarProjetos(dir, { home: HOME });
  assert.equal(p.length, 1);
  assert.equal(p[0].cwd, MAY);
  assert.equal(p[0].sessoes[0].id, 'abc');
  assert.equal(p[0].sessoes[0].dirSubagentes, null);
});

test('ignora scratch e home', () => {
  const dir = dirProjetos();
  sessao(dir, 'C--Users-Teste', 'a', HOME);
  sessao(dir, 'C--x-scratch-2026', 'b', 'C:\\x\\scratch-workspaces\\y');
  sessao(dir, 'C--outra-coisa', 'c', 'C:\\Dados\\scratch-workspaces\\z');
  assert.deepEqual(listarProjetos(dir, { home: HOME }), []);
});

test('pasta sem jsonl é ignorada', () => {
  const dir = dirProjetos();
  mkdirSync(join(dir, 'C--vazio', 'memory'), { recursive: true });
  assert.deepEqual(listarProjetos(dir, { home: HOME }), []);
});

test('lista subagentes', () => {
  const dir = dirProjetos();
  sessao(dir, 'C--may', 'abc', MAY);
  mkdirSync(join(dir, 'C--may', 'abc', 'subagents'), { recursive: true });
  const p = listarProjetos(dir, { home: HOME });
  assert.equal(p[0].sessoes[0].dirSubagentes, join(dir, 'C--may', 'abc', 'subagents'));
});

test('cwd vem de outra sessão se a mais recente não tiver', () => {
  const dir = dirProjetos();
  sessao(dir, 'C--may', 'velha', MAY);
  writeFileSync(join(dir, 'C--may', 'nova.jsonl'), '{"type":"mode"}\n');
  const p = listarProjetos(dir, { home: HOME });
  assert.equal(p[0].cwd, MAY);
  assert.equal(p[0].sessoes.length, 2);
});

test('pasta de projetos inexistente devolve vazio', () => {
  assert.deepEqual(listarProjetos(join(tmpdir(), 'nao-existe-predio-x'), { home: HOME }), []);
});
