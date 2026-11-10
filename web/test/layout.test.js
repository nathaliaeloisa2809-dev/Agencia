import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarLayout, T } from '../layout.js';
import { findPath } from '../caminho.js';

const perto = (p, x, y) => Math.abs(p.x - x) < T && Math.abs(p.y - y) < T;
function alcanca(layout, x, y) {
  const c = findPath(layout, layout.elevador.x, layout.elevador.y, x, y);
  return c !== null && perto(c[c.length - 1], x, y);
}

test('18 funcionários dá 20 mesas', () => {
  assert.equal(gerarLayout({ funcionarios: 18, tipo: 'linha-producao' }).mesas.length, 20);
});

test('nenhum funcionário dá 8 mesas', () => {
  const l = gerarLayout({ funcionarios: 0, tipo: 'fila' });
  assert.equal(l.mesas.length, 8);
  assert.equal(l.altura, 26);
  assert.equal(l.largura, 40);
});

test('andar cresce', () => {
  assert.ok(gerarLayout({ funcionarios: 30, tipo: 'fila' }).altura > 26);
});

test('toda mesa é alcançável', () => {
  for (const n of [0, 6, 18, 30]) {
    const l = gerarLayout({ funcionarios: n, tipo: 'fila' });
    for (const m of l.mesas) assert.ok(alcanca(l, m.sx, m.sy), `mesa ${m.c},${m.r} com ${n} funcionários`);
  }
});

test('toda vaga de visita, copa e lounge é alcançável', () => {
  const l = gerarLayout({ funcionarios: 18, tipo: 'linha-producao' });
  assert.equal(l.visitas.length, 10);
  assert.ok(l.copa.length + l.lounge.length >= 12);
  for (const v of [...l.visitas, ...l.copa, ...l.lounge]) assert.ok(alcanca(l, v.x, v.y), `vaga ${v.x},${v.y}`);
});

test('biblioteca com 27 skills tem 7 estantes', () => {
  const l = gerarLayout({ funcionarios: 0, tipo: 'biblioteca', skills: 27 });
  assert.equal(l.estantes.length, 7);
  assert.equal(l.mesas.length, 0);
  assert.ok(l.estantes.every(e => e.skills.length <= 4));
  assert.equal(l.estantes.flatMap(e => e.skills).length, 27);
});

test('térreo tem entrada alcançável', () => {
  const l = gerarLayout({ tipo: 'terreo' });
  assert.ok(alcanca(l, l.entrada.x, l.entrada.y));
});

test('findPath devolve null sem caminho', () => {
  const grade = { largura: 3, altura: 3, bloqueado: new Uint8Array([0, 1, 0, 0, 1, 0, 0, 1, 0]) };
  assert.equal(findPath(grade, 8, 8, 40, 8), null);
  assert.deepEqual(findPath(grade, 8, 8, 8, 40).at(-1), { x: 8, y: 40 });
});
