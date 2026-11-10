import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { reconciliar, identidade, PALETA } from '../andares.js';

const D = 'C:\\Users\\T\\OneDrive\\Área de Trabalho\\';
const proj = cwd => ({ pasta: 'p:' + cwd, cwd, sessoes: [] });
const cfgVazia = () => ({ nome: 'Prédio IA', ocultos: [], apelidos: {}, tipos: {}, andares: {} });

// Contadores compartilhados entre rodadas, como o relógio e os ids reais.
let n = 0, t = 1000;
function opcoes({ existentes = null, ident = {}, funcs = {} } = {}) {
  return {
    existe: c => (existentes ? existentes.includes(c) : true),
    calcIdentidade: c => ident[c] || 'cwd:' + c,
    lerNomesFuncionarios: c => funcs[c] || [],
    agora: () => t++,
    gerarId: () => 'id' + n++,
  };
}

test('cria andar novo com cor da paleta', () => {
  const r = reconciliar(cfgVazia(), [proj(D + 'Conteudo May')], opcoes());
  assert.equal(r.andares.length, 1);
  assert.equal(r.andares[0].nome, 'Conteudo May');
  assert.ok(PALETA.includes(r.andares[0].cor));
  assert.deepEqual(r.cfg.andares[r.andares[0].id].caminhos, [D + 'Conteudo May']);
});

test('mesmo cwd reaproveita o andar', () => {
  const r1 = reconciliar(cfgVazia(), [proj(D + 'Conteudo May')], opcoes());
  const r2 = reconciliar(r1.cfg, [proj(D + 'Conteudo May')], opcoes());
  assert.equal(r2.andares[0].id, r1.andares[0].id);
  assert.equal(Object.keys(r2.cfg.andares).length, 1);
});

test('subpasta entra no andar pai', () => {
  const r = reconciliar(cfgVazia(), [proj(D + 'skills\\.agents\\skills'), proj(D + 'skills')], opcoes());
  assert.equal(r.andares.length, 1);
  assert.equal(r.andares[0].nome, 'skills');
  assert.equal(r.andares[0].projetos.length, 2);
});

test('pasta renomeada mantém o id', () => {
  const antigo = D + 'Conteudo May', novo = D + 'Conteudo Maio';
  const r1 = reconciliar(cfgVazia(), [proj(antigo)], opcoes({ ident: { [antigo]: 'git:abc' } }));
  const r2 = reconciliar(r1.cfg, [proj(antigo), proj(novo)], opcoes({ existentes: [novo], ident: { [novo]: 'git:abc' } }));
  assert.equal(r2.andares.length, 1);
  assert.equal(r2.andares[0].id, r1.andares[0].id);
  assert.equal(r2.andares[0].nome, 'Conteudo Maio');
  assert.equal(r2.andares[0].pastaExiste, true);
  assert.equal(r2.andares[0].projetos.length, 2);
});

test('andar com pasta inexistente', () => {
  const r = reconciliar(cfgVazia(), [proj(D + 'sumiu')], opcoes({ existentes: [] }));
  assert.equal(r.andares[0].pastaExiste, false);
});

test('oculto some da lista', () => {
  const r1 = reconciliar(cfgVazia(), [proj(D + 'a'), proj(D + 'b')], opcoes());
  const cfg = { ...r1.cfg, ocultos: [r1.andares[0].id] };
  const r2 = reconciliar(cfg, [proj(D + 'a'), proj(D + 'b')], opcoes());
  assert.deepEqual(r2.andares.map(a => a.nome), ['b']);
});

test('apelido substitui o nome', () => {
  const r1 = reconciliar(cfgVazia(), [proj(D + 'a')], opcoes());
  const cfg = { ...r1.cfg, apelidos: { [r1.andares[0].id]: 'Agência May' } };
  assert.equal(reconciliar(cfg, [proj(D + 'a')], opcoes()).andares[0].nome, 'Agência May');
});

test('sugere juntar quando os funcionários batem', () => {
  const antigo = D + 'Conteudo May', novo = D + 'Agencia May';
  const nomes = ['copywriter', 'roteirista', 'estoque', 'revisor'];
  const r1 = reconciliar(cfgVazia(), [proj(antigo)], opcoes({ funcs: { [antigo]: nomes } }));
  const r2 = reconciliar(r1.cfg, [proj(antigo), proj(novo)], opcoes({ existentes: [novo], ident: { [novo]: 'git:outro' }, funcs: { [novo]: [...nomes.slice(0, 3), 'novo'] } }));
  assert.equal(r2.andares.length, 2);
  assert.deepEqual(r2.sugestoes, [{ de: r1.andares[0].id, para: r2.andares.find(a => a.nome === 'Agencia May').id }]);
});

test('sem funcionários não sugere', () => {
  const r1 = reconciliar(cfgVazia(), [proj(D + 'x')], opcoes());
  const r2 = reconciliar(r1.cfg, [proj(D + 'x'), proj(D + 'y')], opcoes({ existentes: [D + 'y'] }));
  assert.deepEqual(r2.sugestoes, []);
});

test('não muta a config original', () => {
  const cfg = cfgVazia();
  reconciliar(cfg, [proj(D + 'a')], opcoes());
  assert.deepEqual(cfg.andares, {});
});

test('identidade sem git usa CLAUDE.md e agentes', () => {
  const cwd = join(mkdtempSync(join(tmpdir(), 'predio-id-')), 'Área de Trabalho', 'proj');
  mkdirSync(join(cwd, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(cwd, 'CLAUDE.md'), 'regras');
  writeFileSync(join(cwd, '.claude', 'agents', 'a.md'), '---\nname: a\n---');
  assert.match(identidade(cwd), /^fp:[0-9a-f]{40}$/);
  assert.match(identidade(join(tmpdir(), 'nao-existe-predio-y')), /^cwd:[0-9a-f]{40}$/);
});
