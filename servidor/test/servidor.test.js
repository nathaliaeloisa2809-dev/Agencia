import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';
import { iniciarServidor } from '../servidor.js';

function monitorFalso() {
  let cfg = { nome: 'Prédio IA', ocultos: [], apelidos: {}, tipos: {}, andares: { a: { id: 'a', caminhos: ['C:\\velho'] }, b: { id: 'b', caminhos: ['C:\\novo'] } } };
  return {
    getConfig: () => cfg,
    setConfig: fn => { cfg = fn(structuredClone(cfg)); },
    atualizar: () => ({ predio: { nome: cfg.nome }, andares: [], ocultos: cfg.ocultos }),
  };
}

async function subir() {
  const dirWeb = mkdtempSync(join(tmpdir(), 'predio-web-'));
  writeFileSync(join(dirWeb, 'index.html'), '<h1>prédio</h1>');
  const monitor = monitorFalso();
  const s = await iniciarServidor({ monitor, token: 'segredo', porta: 0, dirWeb, intervaloMs: 50 });
  const url = `http://127.0.0.1:${s.porta}`;
  const api = (caminho, corpo, token = 'segredo') => fetch(url + caminho, {
    method: corpo ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { s, url, api, monitor };
}

test('estado exige token', async () => {
  const { s, api } = await subir();
  try {
    assert.equal((await api('/api/estado', null, null)).status, 401);
    assert.equal((await api('/api/estado', null, 'errado')).status, 401);
    const r = await api('/api/estado');
    assert.equal(r.status, 200);
    assert.equal((await r.json()).predio.nome, 'Prédio IA');
  } finally { await s.fechar(); }
});

test('serve a página sem token', async () => {
  const { s, url } = await subir();
  try {
    const r = await fetch(url + '/');
    assert.equal(r.status, 200);
    assert.match(await r.text(), /prédio/);
  } finally { await s.fechar(); }
});

test('não serve fora de web/', async () => {
  const { s, url } = await subir();
  try {
    assert.equal((await fetch(url + '/..%2f..%2fpackage.json')).status, 404);
    assert.equal((await fetch(url + '/nao-existe.js')).status, 404);
  } finally { await s.fechar(); }
});

test('renomeia o prédio', async () => {
  const { s, api, monitor } = await subir();
  try {
    assert.equal((await api('/api/nome', { nome: '  Torre May  ' })).status, 200);
    assert.equal(monitor.getConfig().nome, 'Torre May');
  } finally { await s.fechar(); }
});

test('nome vazio dá 400', async () => {
  const { s, api, monitor } = await subir();
  try {
    assert.equal((await api('/api/nome', { nome: '   ' })).status, 400);
    assert.equal(monitor.getConfig().nome, 'Prédio IA');
  } finally { await s.fechar(); }
});

test('nome longo é cortado em 40', async () => {
  const { s, api, monitor } = await subir();
  try {
    await api('/api/nome', { nome: 'x'.repeat(60) });
    assert.equal(monitor.getConfig().nome.length, 40);
  } finally { await s.fechar(); }
});

test('apelido e remoção do apelido', async () => {
  const { s, api, monitor } = await subir();
  try {
    await api('/api/andares/a/apelido', { apelido: 'Agência' });
    assert.equal(monitor.getConfig().apelidos.a, 'Agência');
    await api('/api/andares/a/apelido', { apelido: '' });
    assert.equal('a' in monitor.getConfig().apelidos, false);
  } finally { await s.fechar(); }
});

test('oculta andar', async () => {
  const { s, api, monitor } = await subir();
  try {
    await api('/api/andares/a/ocultar', { oculto: true });
    assert.deepEqual(monitor.getConfig().ocultos, ['a']);
    await api('/api/andares/a/ocultar', { oculto: false });
    assert.deepEqual(monitor.getConfig().ocultos, []);
  } finally { await s.fechar(); }
});

test('lista os andares ocultos com nome', async () => {
  const { s, api } = await subir();
  try {
    await api('/api/andares/a/ocultar', { oculto: true });
    assert.deepEqual(await (await api('/api/ocultos')).json(), [{ id: 'a', nome: 'velho' }]);
    await api('/api/andares/a/apelido', { apelido: 'Antigo' });
    assert.deepEqual(await (await api('/api/ocultos')).json(), [{ id: 'a', nome: 'Antigo' }]);
  } finally { await s.fechar(); }
});

test('junta andares', async () => {
  const { s, api, monitor } = await subir();
  try {
    assert.equal((await api('/api/juntar', { de: 'a', para: 'b' })).status, 200);
    const cfg = monitor.getConfig();
    assert.deepEqual(cfg.andares.a.caminhos, ['C:\\velho', 'C:\\novo']);
    assert.equal('b' in cfg.andares, false);
    assert.equal((await api('/api/juntar', { de: 'a', para: 'zzz' })).status, 404);
  } finally { await s.fechar(); }
});

test('ws recebe estado ao conectar', async () => {
  const { s, url } = await subir();
  try {
    const ws = new WebSocket(url.replace('http', 'ws') + '/ws?t=segredo');
    const msg = await new Promise((ok, erro) => { ws.on('message', d => ok(JSON.parse(d))); ws.on('error', erro); });
    assert.equal(msg.tipo, 'estado');
    assert.equal(msg.estado.predio.nome, 'Prédio IA');
    ws.close();
  } finally { await s.fechar(); }
});

test('ws sem token é recusado', async () => {
  const { s, url } = await subir();
  try {
    const ws = new WebSocket(url.replace('http', 'ws') + '/ws?t=errado');
    const resultado = await new Promise(ok => { ws.on('error', () => ok('erro')); ws.on('open', () => ok('aberto')); });
    assert.equal(resultado, 'erro');
  } finally { await s.fechar(); }
});
