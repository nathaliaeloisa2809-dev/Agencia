import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lerNovasLinhas, lerInicio } from '../jsonl.js';

const arquivoTemp = () => join(mkdtempSync(join(tmpdir(), 'predio-jsonl-')), 's.jsonl');
const inicial = () => ({ offset: 0, resto: Buffer.alloc(0) });

test('lê linhas completas', () => {
  const f = arquivoTemp();
  writeFileSync(f, '{"a":1}\n{"b":2}\n');
  const { objetos } = lerNovasLinhas(f, inicial());
  assert.deepEqual(objetos, [{ a: 1 }, { b: 2 }]);
});

test('junta linha parcial na leitura seguinte', () => {
  const f = arquivoTemp();
  writeFileSync(f, '{"a":1}\n{"b":');
  const r1 = lerNovasLinhas(f, inicial());
  assert.deepEqual(r1.objetos, [{ a: 1 }]);
  appendFileSync(f, '2}\n');
  const r2 = lerNovasLinhas(f, r1.cursor);
  assert.deepEqual(r2.objetos, [{ b: 2 }]);
});

test('ignora linha inválida', () => {
  const f = arquivoTemp();
  writeFileSync(f, '{quebrada\n{"ok":true}\n');
  assert.deepEqual(lerNovasLinhas(f, inicial()).objetos, [{ ok: true }]);
});

test('arquivo encolhido recomeça', () => {
  const f = arquivoTemp();
  writeFileSync(f, '{"a":1}\n{"b":2}\n');
  const r1 = lerNovasLinhas(f, inicial());
  writeFileSync(f, '{"c":3}\n');
  assert.deepEqual(lerNovasLinhas(f, r1.cursor).objetos, [{ c: 3 }]);
});

test('lida com acento cortado no meio', () => {
  const f = arquivoTemp();
  const bytes = Buffer.from('{"p":"Área"}\n');
  const corte = bytes.indexOf(0xc3) + 1; // metade do "Á"
  writeFileSync(f, bytes.subarray(0, corte));
  const r1 = lerNovasLinhas(f, inicial());
  assert.deepEqual(r1.objetos, []);
  appendFileSync(f, bytes.subarray(corte));
  assert.deepEqual(lerNovasLinhas(f, r1.cursor).objetos, [{ p: 'Área' }]);
});

test('lerInicio devolve só linhas completas do começo', () => {
  const f = arquivoTemp();
  writeFileSync(f, '{"cwd":"C:\\\\x"}\n' + '{"y":"' + 'z'.repeat(200) + '"}\n');
  assert.deepEqual(lerInicio(f, 30), [{ cwd: 'C:\\x' }]);
});
