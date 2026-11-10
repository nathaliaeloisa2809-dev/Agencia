import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, utimesSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Monitor } from '../monitor.js';
import { lerNovasLinhas, lerInicio } from '../jsonl.js';

function cenario() {
  const raiz = mkdtempSync(join(tmpdir(), 'predio-mon-'));
  const cwd = join(raiz, 'Área de Trabalho', 'Conteudo May');
  mkdirSync(join(cwd, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(cwd, '.claude', 'agents', 'roteirista.md'), '---\nname: roteirista\ndescription: Roteiros.\ntools: Read, Write\n---\n');
  const dirProjetos = join(raiz, 'projects');
  const pasta = join(dirProjetos, 'C--x-Conteudo-May');
  mkdirSync(pasta, { recursive: true });
  const sessao = join(pasta, 's1.jsonl');
  const agora = Date.now();
  writeFileSync(sessao, JSON.stringify({ type: 'user', cwd, timestamp: new Date(agora - 5000).toISOString(), message: { content: 'rode o ciclo' } }) + '\n');
  return { raiz, cwd, dirProjetos, pasta, sessao, caminhoConfig: join(raiz, 'dados', 'predio.json') };
}

test('primeiro retrato', () => {
  const c = cenario();
  const r = new Monitor({ dirProjetos: c.dirProjetos, caminhoConfig: c.caminhoConfig, home: 'C:\\Nada' }).atualizar();
  assert.equal(r.andares.length, 1);
  assert.equal(r.andares[0].nome, 'Conteudo May');
  assert.deepEqual(r.andares[0].funcionarios.map(f => [f.nome, f.estado]), [['roteirista', 'parado']]);
  assert.equal(r.andares[0].visitantes[0].titulo, 'rode o ciclo');
  assert.ok(JSON.parse(readFileSync(c.caminhoConfig, 'utf8')).andares);
});

test('acompanha append', () => {
  const c = cenario();
  const m = new Monitor({ dirProjetos: c.dirProjetos, caminhoConfig: c.caminhoConfig, home: 'C:\\Nada' });
  m.atualizar();
  appendFileSync(c.sessao, JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { content: [{ type: 'tool_use', id: 'a1', name: 'Agent', input: { subagent_type: 'roteirista', description: 'Roteiro da peça', prompt: 'x' } }], stop_reason: 'tool_use' } }) + '\n');
  const r = m.atualizar();
  const rot = r.andares[0].funcionarios[0];
  assert.deepEqual([rot.estado, rot.acao], ['trabalhando', 'Roteiro da peça']);
  assert.ok(r.execucao.some(e => e.quem === 'roteirista'));
});

test('lê o subagente ligado pelo meta.json', () => {
  const c = cenario();
  appendFileSync(c.sessao, JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { content: [{ type: 'tool_use', id: 'a1', name: 'Agent', input: { subagent_type: 'general-purpose', description: 'x', prompt: 'Siga .claude/agents/roteirista.md' } }], stop_reason: 'tool_use' } }) + '\n');
  const sub = join(c.pasta, 's1', 'subagents');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'agent-9.meta.json'), JSON.stringify({ toolUseId: 'a1' }));
  writeFileSync(join(sub, 'agent-9.jsonl'), JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { content: [{ type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: 'C:\\p\\peca.md' } }], stop_reason: 'tool_use' } }) + '\n');
  const rot = new Monitor({ dirProjetos: c.dirProjetos, caminhoConfig: c.caminhoConfig, home: 'C:\\Nada' }).atualizar().andares[0].funcionarios[0];
  assert.deepEqual([rot.estado, rot.acao], ['escrevendo', 'Editando peca.md']);
});

test('ignora corpo de sessões antigas', () => {
  const c = cenario();
  const velha = join(c.pasta, 'velha.jsonl');
  const linha = JSON.stringify({ type: 'user', cwd: c.cwd, timestamp: '2026-01-01T00:00:00Z', message: { content: 'x'.repeat(1000) } }) + '\n';
  writeFileSync(velha, linha.repeat(5000));
  const duasHoras = (Date.now() - 2 * 3600_000) / 1000;
  utimesSync(velha, duasHoras, duasHoras);
  const lidosInteiros = [];
  const leitor = { lerInicio, lerNovasLinhas: (f, cur) => { lidosInteiros.push(f); return lerNovasLinhas(f, cur); } };
  new Monitor({ dirProjetos: c.dirProjetos, caminhoConfig: c.caminhoConfig, home: 'C:\\Nada', leitor }).atualizar();
  assert.ok(!lidosInteiros.includes(velha));
  assert.ok(lidosInteiros.includes(c.sessao));
});

test('setConfig renomeia o prédio', () => {
  const c = cenario();
  const m = new Monitor({ dirProjetos: c.dirProjetos, caminhoConfig: c.caminhoConfig, home: 'C:\\Nada' });
  m.setConfig(cfg => ({ ...cfg, nome: 'Torre May' }));
  assert.equal(m.atualizar().predio.nome, 'Torre May');
  assert.equal(JSON.parse(readFileSync(c.caminhoConfig, 'utf8')).nome, 'Torre May');
});
