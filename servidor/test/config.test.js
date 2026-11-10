import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { carregarConfig, salvarConfig } from '../config.js';

const pastaTemp = () => mkdtempSync(join(tmpdir(), 'predio-config-'));

test('config padrão quando não existe arquivo', () => {
  const cfg = carregarConfig(join(pastaTemp(), 'x.json'));
  assert.deepEqual(cfg, { nome: 'Prédio IA', ocultos: [], apelidos: {}, tipos: {}, andares: {} });
});

test('salva e relê', () => {
  const pasta = pastaTemp();
  const arquivo = join(pasta, 'dados', 'predio.json');
  const cfg = carregarConfig(arquivo);
  cfg.nome = 'Torre May';
  salvarConfig(arquivo, cfg);
  assert.equal(carregarConfig(arquivo).nome, 'Torre May');
  assert.deepEqual(readdirSync(join(pasta, 'dados')), ['predio.json']);
});

test('arquivo corrompido volta ao padrão', () => {
  const arquivo = join(pastaTemp(), 'p.json');
  writeFileSync(arquivo, '{quebrado');
  assert.equal(carregarConfig(arquivo).nome, 'Prédio IA');
});

test('campos faltando são completados', () => {
  const arquivo = join(pastaTemp(), 'p.json');
  writeFileSync(arquivo, '{"nome":"X"}');
  const cfg = carregarConfig(arquivo);
  assert.equal(cfg.nome, 'X');
  assert.deepEqual(cfg.ocultos, []);
  assert.deepEqual(cfg.andares, {});
});
