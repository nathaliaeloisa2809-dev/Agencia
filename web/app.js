// Página do prédio: recebe o retrato ao vivo do servidor e desenha cada andar.
import { T, findPath } from './caminho.js';
import { gerarLayout } from './layout.js';
import { desenharAndar } from './mapa.js';
import * as S from './sprites.js';

try { await document.fonts.load('8px "Press Start 2P"'); } catch { /* sem a fonte, segue com a padrão */ }

const token = new URLSearchParams(location.search).get('t');
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nomeArquivo = c => String(c).split(/[\\/]/).pop();

const ESTADOS = {
  escrevendo: { label: '✍️ Escrevendo', cor: '#6c8cff', anim: 'typing' },
  pensando: { label: '💭 Pensando', cor: '#6c8cff', anim: 'typing' },
  trabalhando: { label: '⚙️ Trabalhando', cor: '#6c8cff', anim: 'typing' },
  lendo: { label: '📖 Lendo', cor: '#b07bff', anim: 'reading' },
  delegando: { label: '📋 Delegando', cor: '#b07bff', anim: 'reading' },
  terminal: { label: '⌨️ Terminal', cor: '#2fd08a', anim: 'terminal' },
  precisa: { label: '❗ Precisa de você', cor: '#ffc233', anim: 'waiting' },
  esperando: { label: '❗ Esperando você', cor: '#ffc233', anim: 'waiting' },
  parado: { label: '☕ Sem trabalho', cor: '#8a90ad', anim: 'idle' },
};
const est = e => ESTADOS[e] || ESTADOS.parado;
const TIPOS = { funcionario: 'Funcionário', visitante: 'Sessão no terminal', estagiario: 'Ajudante (subagente)' };

// ================= estado da página =================
let retrato = null;
let pisos = [];            // 0 = térreo; i = andar de número i
const bonecos = new Map(); // chave → Boneco
const vistos = new Set();
const obras = new Map();   // andarId → até quando mostra "em obra"
let primeiro = true, view = 0, selected = null, follow = null, fade = 0;
let sugestoesDispensadas = new Set(), semConexao = false;
const indicePiso = andarId => pisos.findIndex(p => p.andar && p.andar.id === andarId);

// ================= bonecos =================
class Boneco {
  constructor(chave, tipo, andarId, cor) {
    Object.assign(this, { chave, tipo, andarId, x: 0, y: 0, dir: 'down', mode: 'stand', path: [], t: Math.random() * 10, alvo: null, saindo: false });
    this.look = S.newLook(cor, chave);
  }
  get rotulo() { return this.tipo === 'funcionario' ? this.dados.nome : this.tipo === 'visitante' ? this.dados.titulo : this.dados.descricao; }
  get estado() { return this.saindo ? 'parado' : this.dados.estado; }
  colocar(alvo) {
    this.alvo = alvo; this.x = alvo.x; this.y = alvo.y; this.path = [];
    this.mode = alvo.sentar ? 'sit' : 'stand'; this.dir = alvo.dir || 'down';
  }
  irPara(alvo) {
    if (this.alvo && this.alvo.id === alvo.id) return;
    this.alvo = alvo;
    const piso = pisos[indicePiso(this.andarId)];
    if (this.mode === 'sit') { this.mode = 'stand'; this.y += 6; }
    const caminho = piso ? findPath(piso.layout, this.x, this.y, alvo.x, alvo.y) : null;
    if (!caminho) return this.colocar(alvo);
    this.path = caminho; this.mode = 'walk';
  }
  update(dt) {
    this.t += dt;
    if (!this.path.length) return;
    const p = this.path[0], dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy), passo = 52 * dt;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    if (d <= passo) {
      this.x = p.x; this.y = p.y; this.path.shift();
      if (!this.path.length) {
        if (this.saindo) { bonecos.delete(this.chave); if (selected === this) { selected = null; renderAgentPanel(); } return; }
        this.mode = this.alvo.sentar ? 'sit' : 'stand'; this.dir = this.alvo.dir || 'down';
      }
    } else { this.x += (dx / d) * passo; this.y += (dy / d) * passo; }
  }
  draw(ctx, t) {
    const x = Math.round(this.x), y = Math.round(this.y), sit = this.mode === 'sit';
    const frame = this.mode === 'walk' ? (Math.floor(this.t * 8) % 2) + 1 : 0;
    if (!sit) { ctx.fillStyle = 'rgba(20,15,35,.25)'; ctx.fillRect(x - 6, y - 1, 12, 3); ctx.fillRect(x - 4, y - 2, 8, 5); }
    ctx.drawImage(S.avatarSprite(this.look, this.dir, frame), x - 11, y - 27 + (sit ? 3 : 0));
    if (this.mode === 'stand' && est(this.estado).anim === 'idle' && !this.saindo) {
      const hx = this.dir === 'left' ? x - 3 : this.dir === 'right' ? x + 1 : x + 4;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(hx, y - 10, 3, 3); ctx.fillStyle = '#6b4a33'; ctx.fillRect(hx, y - 10, 3, 1);
      ctx.fillStyle = 'rgba(255,255,255,.6)'; const p = (t * 0.7) % 1; ctx.fillRect(hx + 1 + Math.round(Math.sin(p * 7)), y - 12 - Math.round(p * 6), 1, 1);
    }
  }
}

function sincronizarBonecos() {
  const desejados = new Map();
  retrato.andares.forEach(a => {
    a.funcionarios.forEach((f, i) => desejados.set(`f:${a.id}:${f.nome}`, { tipo: 'funcionario', andar: a, dados: f, mesa: i, cor: a.cor }));
    a.visitantes.forEach(v => desejados.set(`v:${v.id}`, { tipo: 'visitante', andar: a, dados: v, cor: '#9aa3b2' }));
    a.estagiarios.forEach(e => desejados.set(`e:${e.id}`, { tipo: 'estagiario', andar: a, dados: e, cor: S.shade(a.cor, 0.35) }));
  });

  // Vagas ocupadas por quem continua no mesmo tipo de vaga.
  const ocupadas = new Set();
  for (const [chave, d] of desejados) {
    const b = bonecos.get(chave);
    if (b && b.alvo && !b.saindo) {
      const querLazer = d.tipo === 'funcionario' && d.dados.estado === 'parado';
      const tipoVaga = b.alvo.id.split(':')[0];
      if ((d.tipo !== 'funcionario' && tipoVaga === 'visita') || (querLazer && tipoVaga === 'lazer')) ocupadas.add(d.andar.id + b.alvo.id);
    }
  }
  const vagaLivre = (andarId, lista, prefixo) => {
    for (let k = 0; k < lista.length; k++) {
      const id = `${prefixo}:${k}`;
      if (!ocupadas.has(andarId + id)) { ocupadas.add(andarId + id); return { ...lista[k], sentar: prefixo === 'visita', id }; }
    }
    return null;
  };

  for (const [chave, d] of desejados) {
    const piso = pisos[indicePiso(d.andar.id)];
    if (!piso) continue;
    const L = piso.layout;
    let b = bonecos.get(chave);
    const novo = !b;
    if (novo) { b = new Boneco(chave, d.tipo, d.andar.id, d.cor); bonecos.set(chave, b); }
    b.saindo = false; b.dados = d.dados; b.andarId = d.andar.id;
    let alvo = null;
    if (d.tipo === 'funcionario') {
      const m = L.mesas[d.mesa];
      const mesa = m ? { x: m.sx, y: m.sy, dir: 'down', sentar: true, id: `mesa:${d.mesa}` } : null;
      if (d.dados.estado === 'parado') {
        const atual = b.alvo && b.alvo.id.startsWith('lazer') ? b.alvo : null;
        alvo = atual || vagaLivre(d.andar.id, [...L.copa, ...L.lounge], 'lazer') || mesa;
      } else alvo = mesa;
    } else {
      alvo = b.alvo && b.alvo.id.startsWith('visita') ? b.alvo : vagaLivre(d.andar.id, L.visitas, 'visita');
      if (!alvo) alvo = { ...L.lounge[0], id: 'lazer:extra' };
    }
    if (!alvo) continue;
    if (novo) {
      if (primeiro || d.tipo === 'funcionario') b.colocar(alvo);
      else { b.colocar({ x: L.elevador.x, y: L.elevador.y, dir: 'down', id: 'elevador' }); b.irPara(alvo); }
    } else b.irPara(alvo);
  }
  for (const [chave, b] of bonecos) {
    if (desejados.has(chave) || b.saindo) continue;
    const piso = pisos[indicePiso(b.andarId)];
    if (!piso) { bonecos.delete(chave); continue; }
    b.saindo = true;
    b.irPara({ x: piso.layout.elevador.x, y: piso.layout.elevador.y, dir: 'up', id: 'saida' });
    if (!b.path.length) bonecos.delete(chave);
  }
}

// ================= retrato =================
function aplicarRetrato(r) {
  retrato = r;
  const nome = r.predio.nome;
  $('nomePredio').textContent = nome.toUpperCase();
  document.title = nome;
  const novos = [];
  const chaveTerreo = 'terreo:' + nome;
  if (!pisos[0] || pisos[0].chave !== chaveTerreo) {
    const layout = gerarLayout({ tipo: 'terreo' });
    pisos[0] = { andar: null, layout, mapa: desenharAndar(layout, null, { nomePredio: nome }), chave: chaveTerreo };
  }
  const antigos = new Map(pisos.slice(1).map(p => [p.andar.id, p]));
  pisos = [pisos[0], ...r.andares.map(a => {
    const chave = [a.id, a.nome, a.cor, a.tipo, a.funcionarios.length, a.skills.length].join('|');
    const velho = antigos.get(a.id);
    if (velho && velho.chave === chave) { velho.andar = a; return velho; }
    const layout = gerarLayout({ funcionarios: a.funcionarios.length, tipo: a.tipo, skills: a.tipo === 'biblioteca' ? a.skills.length : 0 });
    if (!vistos.has(a.id)) { vistos.add(a.id); if (!primeiro) novos.push(a.id); }
    return { andar: a, layout, mapa: desenharAndar(layout, a, { skills: a.skills }), chave };
  })];
  for (const id of novos) obras.set(id, performance.now() + 2600);
  if (selected && !bonecos.has(selected.chave)) selected = null;
  if (view >= pisos.length) view = pisos.length - 1;
  sincronizarBonecos();
  if (primeiro) {
    primeiro = false;
    let melhor = 0;
    r.andares.forEach((a, i) => { if (melhor === 0 || a.funcionarios.length > r.andares[melhor - 1].funcionarios.length) melhor = i + 1; });
    setView(melhor);
  }
  $('nExec').textContent = r.execucao.length;
  renderFloorTitle(); renderBuilding(); renderFaixa();
  if (selected) renderAgentPanel();
}

// ================= conexão =================
function conectar() {
  if (!token) { semConexao = true; renderFaixa('Abra o prédio pelo iniciar.cmd (falta a chave de acesso no endereço).'); return; }
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?t=${encodeURIComponent(token)}`);
  ws.onopen = () => { semConexao = false; renderFaixa(); };
  ws.onmessage = e => { try { const m = JSON.parse(e.data); if (m.tipo === 'estado') aplicarRetrato(m.estado); } catch (erro) { console.error(erro); } };
  ws.onclose = () => { semConexao = true; renderFaixa(); setTimeout(conectar, 2000); };
}
async function api(caminho, corpo) {
  const r = await fetch(caminho, { method: corpo ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-token': token }, body: corpo ? JSON.stringify(corpo) : undefined });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || 'Não deu certo.');
  return dados;
}

// ================= câmera e desenho =================
const cv = $('view'), ctx = cv.getContext('2d');
const luzCv = document.createElement('canvas'), lg = luzCv.getContext('2d');
let dpr = 1;
const cam = { x: 320, y: 208, z: 2 };
function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
  luzCv.width = cv.width; luzCv.height = cv.height;
}
resize(); addEventListener('resize', resize);
const pisoAtual = () => pisos[view];
const tamanho = () => { const L = pisoAtual().layout; return { w: L.largura * T, h: L.altura * T }; };
const zoomAjustado = () => { const { w, h } = tamanho(); return Math.max(1, Math.min(innerWidth / w, innerHeight / h) * 0.92); };
const offset = () => ({ ox: innerWidth / 2 - cam.x * cam.z, oy: innerHeight / 2 - cam.y * cam.z });
const paraMundo = (sx, sy) => { const { ox, oy } = offset(); return { x: (sx - ox) / cam.z, y: (sy - oy) / cam.z }; };

function desenharMesa(ctx, mesaIdx, t) {
  const piso = pisoAtual();
  const m = piso.layout.mesas[mesaIdx];
  if (!m) return;
  const o = [...bonecos.values()].find(b => b.andarId === piso.andar.id && b.tipo === 'funcionario' && b.mode === 'sit' && b.alvo && b.alvo.id === `mesa:${mesaIdx}`);
  if (!o) return;
  const x0 = m.c * T - 1, y0 = m.r * T - 6, e = est(o.estado);
  ctx.globalAlpha = 0.45 + Math.sin(t * 6) * 0.2; ctx.fillStyle = e.cor; ctx.fillRect(x0 + 10, y0 - 3, 14, 2); ctx.globalAlpha = 1;
  ctx.fillRect(x0 + 11, y0 - 1, 12, 1);
  ctx.fillStyle = o.look.skin;
  if (e.anim === 'typing' || e.anim === 'terminal') {
    const k = Math.floor(t * (e.anim === 'terminal' ? 16 : 9)) % 2;
    ctx.fillRect(x0 + 7, y0 + 9 + k, 3, 2); ctx.fillRect(x0 + 24, y0 + 10 - k, 3, 2);
  } else if (e.anim === 'reading') {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 + 10, y0 + 6, 14, 8); ctx.fillStyle = '#c9cfdb'; ctx.fillRect(x0 + 12, y0 + 8, 9, 1); ctx.fillRect(x0 + 12, y0 + 10, 7, 1);
    ctx.fillStyle = o.look.skin; ctx.fillRect(x0 + 8, y0 + 9, 3, 2); ctx.fillRect(x0 + 23, y0 + 9, 3, 2);
  } else { ctx.fillRect(x0 + 8, y0 + 10, 3, 2); ctx.fillRect(x0 + 23, y0 + 10, 3, 2); }
}

function desenharJanelas(mapa, t, noite) {
  for (const w of mapa.janelas) {
    ctx.fillStyle = noite ? '#1b2550' : '#9fd3ff'; ctx.fillRect(w.x, w.y, w.w, w.h);
    if (noite) { ctx.fillStyle = '#fff6c8'; for (let i = 0; i < 5; i++) if (Math.sin(t * 2 + i * 3 + w.x) > -0.6) ctx.fillRect(w.x + ((i * 37 + w.x) % (w.w - 2)) + 1, w.y + ((i * 13) % (w.h - 3)) + 1, 1, 1); }
    else { ctx.fillStyle = '#ffffff'; const cx = w.x + ((t * 3 + w.x) % (w.w + 16)) - 8; ctx.fillRect(Math.max(w.x, cx), w.y + 4, Math.max(0, Math.min(10, w.x + w.w - cx)), 3); }
    ctx.fillStyle = '#8e7f6c'; ctx.fillRect(w.x + w.w / 2 - 1, w.y, 2, w.h); ctx.fillRect(w.x, w.y + w.h / 2 - 1, w.w, 1);
  }
}

const recepcionista = { look: S.newLook('#1d2433', 'recepcionista'), x: 20 * T, y: 9 * T - 2 };

function render(t) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const noite = retrato ? retrato.relogio.noite : false;
  ctx.fillStyle = noite ? '#121530' : '#262a42'; ctx.fillRect(0, 0, innerWidth, innerHeight);
  const piso = pisoAtual();
  if (!piso) return;
  const z = cam.z;
  let { ox, oy } = offset(); ox = Math.round(ox * dpr) / dpr; oy = Math.round(oy * dpr) / dpr;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, ox * dpr, oy * dpr);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(piso.mapa.cv, 0, 0);
  desenharJanelas(piso.mapa, t, noite);
  const itens = piso.mapa.ents.map(e => ({ s: e.sortY, e }));
  const daqui = [...bonecos.values()].filter(b => piso.andar && b.andarId === piso.andar.id);
  daqui.forEach(b => itens.push({ s: b.y + 0.5, b }));
  if (!piso.andar) itens.push({ s: recepcionista.y, r: true });
  itens.sort((p, q) => p.s - q.s);
  for (const it of itens) {
    if (it.e) { ctx.drawImage(it.e.img, it.e.x - 1, it.e.y - 1); if (it.e.dyn) it.e.dyn(ctx, t); if (it.e.mesa >= 0 && piso.andar) desenharMesa(ctx, it.e.mesa, t); }
    else if (it.b) it.b.draw(ctx, t);
    else ctx.drawImage(S.avatarSprite(recepcionista.look, 'down', 0), recepcionista.x - 11, recepcionista.y - 24);
  }
  for (const b of daqui) {
    const topo = Math.round(b.y) - 27 + (b.mode === 'sit' ? 3 : 0);
    const balao = est(b.estado).anim === 'waiting' && b.mode !== 'walk';
    if (balao) ctx.drawImage(S.bubbleSpr, Math.round(b.x) - 6, topo - 15 + Math.round(Math.sin(t * 4) * 1.5));
    if (b === selected) ctx.drawImage(S.arrowSpr, Math.round(b.x) - 4, topo - (balao ? 22 : 8) + Math.round(Math.sin(t * 5) * 1.5));
  }
  if (noite) {
    lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, luzCv.width, luzCv.height); lg.fillStyle = 'rgba(10,14,44,0.62)'; lg.fillRect(0, 0, luzCv.width, luzCv.height);
    lg.globalCompositeOperation = 'destination-out';
    const furo = (wx, wy, raio, k = 0.95) => {
      const sx = (ox + wx * z) * dpr, sy = (oy + wy * z) * dpr, rr = raio * z * dpr;
      const gr = lg.createRadialGradient(sx, sy, 0, sx, sy, rr); gr.addColorStop(0, `rgba(0,0,0,${k})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = gr; lg.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
    };
    piso.mapa.luzes.forEach(l => furo(l.x, l.y, l.r));
    daqui.forEach(b => { if (b.mode === 'sit') furo(b.x, b.y - 6, 26, 0.8); });
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(luzCv, 0, 0);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = '600 11px system-ui'; ctx.textBaseline = 'middle';
  for (const b of daqui) {
    if (b !== selected && z < 2.6) continue;
    const balao = est(b.estado).anim === 'waiting' && b.mode !== 'walk';
    const sx = ox + b.x * z, sy = oy + (b.y - 27 + (b.mode === 'sit' ? 3 : 0)) * z - 10 - (balao ? 16 * z : 0);
    const bruto = b === selected ? b.dados.acao : b.rotulo;
    const texto = bruto.length > 30 ? bruto.slice(0, 29) + '…' : bruto;
    const w = Math.min(260, ctx.measureText(texto).width) + 22;
    ctx.fillStyle = 'rgba(20,22,40,.85)'; ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - 10, w, 20, 6); ctx.fill();
    ctx.fillStyle = est(b.estado).cor; ctx.fillRect(sx - w / 2 + 7, sy - 3, 6, 6);
    ctx.fillStyle = '#fff'; ctx.fillText(texto, sx - w / 2 + 17, sy + 1, 240);
  }
  if (fade > 0) { ctx.fillStyle = `rgba(10,10,20,${fade})`; ctx.fillRect(0, 0, innerWidth, innerHeight); }
}

// ================= navegação =================
function setView(f, manterCamera = false) {
  if (!pisos[f]) return;
  const mudou = f !== view;
  view = f;
  if (mudou) fade = 0.85;
  if (!manterCamera) { const { w, h } = tamanho(); cam.x = w / 2; cam.y = h / 2; cam.z = zoomAjustado(); }
  renderFloorTitle(); renderBuilding();
}
function renderFloorTitle() {
  const p = pisoAtual();
  if (!p) return;
  const a = p.andar;
  $('ftSw').style.background = a ? a.cor : '#1d2433';
  $('ftName').textContent = a ? `${a.numero}º ANDAR · ${a.nome.toUpperCase()}` : 'TÉRREO · RECEPÇÃO';
  $('ftSpec').textContent = !a ? 'Entrada do prédio'
    : a.tipo === 'biblioteca' ? `Biblioteca · ${a.skills.length} skills`
    : `${a.tipo === 'linha-producao' ? 'Linha de produção · ' : ''}${a.funcionarios.length} funcionários${a.pastaExiste ? '' : ' · pasta não encontrada'}`;
  $('fDown').disabled = view === 0; $('fUp').disabled = view === pisos.length - 1;
}
$('fUp').onclick = () => { follow = null; setView(Math.min(pisos.length - 1, view + 1)); };
$('fDown').onclick = () => { follow = null; setView(Math.max(0, view - 1)); };

let drag = null, moveu = false;
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y }; moveu = false; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) { moveu = true; follow = null; cv.classList.add('drag'); }
    if (moveu) { cam.x = drag.cx - dx / cam.z; cam.y = drag.cy - dy / cam.z; }
  } else cv.classList.toggle('hover', !!(bonecoEm(e.clientX, e.clientY) || estanteEm(e.clientX, e.clientY)));
});
cv.addEventListener('pointerup', e => {
  cv.classList.remove('drag');
  if (drag && !moveu) {
    const b = bonecoEm(e.clientX, e.clientY);
    if (b) { selected = b; follow = b; renderAgentPanel(); }
    else { const est_ = estanteEm(e.clientX, e.clientY); if (est_ !== null) abrirEstante(est_); }
  }
  drag = null;
});
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const antes = paraMundo(e.clientX, e.clientY);
  cam.z = Math.max(1, Math.min(7, cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
  const depois = paraMundo(e.clientX, e.clientY);
  cam.x += antes.x - depois.x; cam.y += antes.y - depois.y;
}, { passive: false });
function bonecoEm(sx, sy) {
  const p = pisoAtual(); if (!p || !p.andar) return null;
  const w = paraMundo(sx, sy);
  let melhor = null;
  for (const b of bonecos.values()) {
    if (b.andarId !== p.andar.id) continue;
    const topo = b.y - 26 + (b.mode === 'sit' ? 3 : 0);
    if (w.x > b.x - 9 && w.x < b.x + 9 && w.y > topo && w.y < b.y + (b.mode === 'sit' ? -4 : 2) && (!melhor || b.y > melhor.y)) melhor = b;
  }
  return melhor;
}
function estanteEm(sx, sy) {
  const p = pisoAtual(); if (!p || !p.andar || p.andar.tipo !== 'biblioteca') return null;
  const w = paraMundo(sx, sy);
  const e = p.mapa.ents.find(x => x.estante >= 0 && w.x >= x.x && w.x <= x.x + x.img.width && w.y >= x.y && w.y <= x.y + x.img.height + 30);
  return e ? e.estante : null;
}
$('zIn').onclick = () => { cam.z = Math.min(7, cam.z * 1.25); };
$('zOut').onclick = () => { cam.z = Math.max(1, cam.z / 1.25); };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Escape') { if ($('overlay').style.display === 'flex') return fecharModal(); selected = null; follow = null; renderAgentPanel(); setView(view); }
  if (e.key === 'PageUp') $('fUp').click();
  if (e.key === 'PageDown') $('fDown').click();
});

// ================= painéis =================
$('legend').innerHTML = [['escrevendo', 'Escrevendo'], ['lendo', 'Lendo'], ['terminal', 'Terminal'], ['esperando', 'Precisa de você'], ['parado', 'Sem trabalho']]
  .map(([e, n]) => `<span><i style="background:${ESTADOS[e].cor}"></i>${n}</span>`).join('');

function renderBuilding() {
  const agora = performance.now();
  $('floorsList').innerHTML = pisos.map((p, i) => ({ p, i })).reverse().map(({ p, i }) => {
    const a = p.andar;
    const obra = a && obras.get(a.id) > agora;
    const daqui = a ? [...bonecos.values()].filter(b => b.andarId === a.id && !b.saindo) : [];
    const cls = ['fl', i === view ? 'cur' : '', obra ? 'obra' : ''].join(' ');
    return `<div class="${cls}" data-f="${i}"><span class="num px">${a ? a.numero + 'º' : 'T'}</span>
      <span class="sw" style="background:${a ? a.cor : '#8a90ad'}"></span>
      <span class="nm">${obra ? 'EM OBRA…' : esc(a ? a.nome : 'Recepção')}${a && !a.pastaExiste ? '<small>pasta não encontrada</small>' : ''}${a && a.tipo === 'biblioteca' ? `<small style="color:var(--muted)">${a.skills.length} skills</small>` : ''}</span>
      <span class="pips">${daqui.map(b => `<i style="background:${est(b.estado).cor}" title="${esc(b.rotulo)}"></i>`).join('')}</span></div>`;
  }).join('');
}
$('floorsList').addEventListener('click', e => { const r = e.target.closest('.fl'); if (r) { follow = null; setView(+r.dataset.f); } });

function renderAgentPanel() {
  const el = $('agent');
  if (!selected || !bonecos.has(selected.chave)) { el.style.display = 'none'; return; }
  const b = selected, d = b.dados, e = est(b.estado);
  const andar = retrato.andares.find(a => a.id === b.andarId);
  const titulo = b.tipo === 'funcionario' ? d.nome : b.tipo === 'visitante' ? d.titulo : d.descricao;
  const desc = b.tipo === 'funcionario' ? d.descricao : b.tipo === 'estagiario' ? `Chamado por: ${d.chamadoPor || 'sessão'}` : '';
  const responder = b.tipo !== 'funcionario' && (d.estado === 'esperando' || d.estado === 'precisa');
  el.style.display = 'block';
  el.innerHTML = `<div class="hd"><span class="sw" style="background:${andar ? andar.cor : '#888'}"></span><div><small class="px">${esc((andar ? andar.nome : '').toUpperCase())}</small><b>${TIPOS[b.tipo]}</b></div><button data-x="close">✕</button></div>
  <h3>${esc(titulo)}</h3>${desc ? `<p class="desc">${esc(desc)}</p>` : ''}
  <span class="st"><i style="background:${e.cor}"></i>${e.label}</span>
  <div class="act">› ${esc(d.acao)}</div>
  ${responder ? '<div class="aviso">Esta sessão está esperando você. <b>Responda no terminal</b> onde ela está aberta.</div>' : ''}
  ${d.mensagens && d.mensagens.length ? `<div class="msgs"><small class="px">ÚLTIMAS MENSAGENS</small>${d.mensagens.map(m => `<div class="msg ${m.u ? 'u' : 'a'}">${esc(m.t)}</div>`).join('')}</div>` : ''}
  ${d.arquivos && d.arquivos.length ? `<div class="arqs"><small class="px">ARQUIVOS ALTERADOS</small>${d.arquivos.slice(-6).reverse().map(a => `<div title="${esc(a)}">${esc(nomeArquivo(a))}</div>`).join('')}</div>` : ''}
  <div class="row"><button data-x="follow">🎯 Seguir</button></div>`;
}
$('agent').addEventListener('click', e => {
  const x = e.target.dataset.x; if (!x) return;
  if (x === 'close') { selected = null; follow = null; renderAgentPanel(); }
  if (x === 'follow' && selected) { follow = selected; cam.z = Math.max(cam.z, 3.5); }
});

function renderFaixa(mensagemErro) {
  const f = $('faixa');
  if (mensagemErro || semConexao) {
    f.className = 'erro'; f.textContent = mensagemErro || 'Sem conexão com o prédio — tentando de novo…'; return;
  }
  const s = retrato && retrato.sugestoes.find(x => !sugestoesDispensadas.has(x.de + x.para));
  if (!s) { f.className = ''; f.innerHTML = ''; return; }
  f.className = 'sugestao';
  f.innerHTML = `<span>Parece que <b>${esc(s.deNome)}</b> virou <b>${esc(s.paraNome)}</b>. Juntar os andares?</span><button class="primary" data-j="sim">Juntar</button><button data-j="nao">Agora não</button>`;
  f.onclick = async e => {
    if (!e.target.dataset.j) return;
    sugestoesDispensadas.add(s.de + s.para);
    if (e.target.dataset.j === 'sim') { try { await api('/api/juntar', { de: s.de, para: s.para }); } catch (erro) { alert(erro.message); } }
    renderFaixa();
  };
}

// ================= modais =================
function abrirModal(titulo, corpo, botoes = [{ texto: 'Fechar', primario: true }], aoAbrir) {
  $('dialog').innerHTML = `<h2 class="px">${titulo}</h2><div class="body">${corpo}</div><div class="actions">${botoes.map((b, i) => `<button data-i="${i}" class="${b.primario ? 'primary' : ''}">${b.texto}</button>`).join('')}</div>`;
  $('overlay').style.display = 'flex';
  $('dialog').onclick = async e => {
    const i = e.target.dataset.i; if (i === undefined) return;
    const b = botoes[i];
    if (b.acao) { const ok = await b.acao(); if (ok === false) return; }
    fecharModal();
  };
  if (aoAbrir) aoAbrir($('dialog'));
}
function fecharModal() { $('overlay').style.display = 'none'; }
$('overlay').addEventListener('click', e => { if (e.target === $('overlay')) fecharModal(); });

const haQuanto = desde => {
  if (!desde) return '';
  const min = Math.floor((Date.now() - desde) / 60000);
  return min < 1 ? 'agora' : `há ${min} min`;
};
$('bExec').onclick = () => {
  const itens = retrato ? retrato.execucao : [];
  abrirModal('EM EXECUÇÃO', itens.length ? `<div class="lista">${itens.map((x, i) => {
    const dono = [...bonecos.values()].find(b => b.andarId === x.andarId && b.rotulo === x.quem);
    const cor = dono ? est(dono.estado).cor : '#6c8cff';
    return `<div class="item" data-k="${i}"><i style="background:${cor}"></i><span class="q">${esc(x.quem.length > 28 ? x.quem.slice(0, 27) + '…' : x.quem)}</span><span class="a">${esc(x.andar)} · ${esc(x.acao)}</span><time>${haQuanto(x.desde)}</time></div>`;
  }).join('')}</div>` : '<p class="vazio">Ninguém trabalhando agora. Quando uma sessão do Claude Code estiver ativa, ela aparece aqui.</p>', undefined, dlg => {
    dlg.querySelector('.lista')?.addEventListener('click', e => {
      const it = e.target.closest('.item'); if (!it) return;
      const x = itens[+it.dataset.k];
      const dono = [...bonecos.values()].find(b => b.andarId === x.andarId && b.rotulo === x.quem);
      setView(indicePiso(x.andarId));
      if (dono) { selected = dono; follow = dono; cam.z = Math.max(cam.z, 3.5); renderAgentPanel(); }
      fecharModal();
    });
  });
};
$('bNome').onclick = () => {
  abrirModal('NOME DO PRÉDIO', `<input type="text" id="novoNome" maxlength="40" value="${esc(retrato ? retrato.predio.nome : '')}"><p class="vazio" id="erroNome"></p>`,
    [{ texto: 'Cancelar' }, { texto: 'Salvar', primario: true, acao: async () => {
      try { await api('/api/nome', { nome: $('novoNome').value }); return true; } catch (erro) { $('erroNome').textContent = erro.message; return false; }
    } }], dlg => { const i = dlg.querySelector('#novoNome'); i.focus(); i.select(); });
};
$('bAjustes').onclick = async () => {
  let ocultos = [];
  try { ocultos = await api('/api/ocultos'); } catch { /* segue sem a lista */ }
  const andares = retrato ? retrato.andares : [];
  abrirModal('AJUSTES', `<p class="vazio">Apelido muda só o nome no prédio; a pasta continua igual. Ocultar não apaga nada.</p>
    <div class="lista">${andares.map(a => `<div class="ajuste"><b>${a.numero}º · ${esc(a.nome)}</b><label><input type="checkbox" data-ocultar="${a.id}"> ocultar</label>
      <input type="text" data-apelido="${a.id}" data-antes="${esc(a.apelido)}" value="${esc(a.apelido)}" maxlength="40" placeholder="Apelido (vazio = nome da pasta)"></div>`).join('')}
    ${ocultos.map(o => `<div class="ajuste"><b>${esc(o.nome)} <small class="vazio">(oculto)</small></b><button data-mostrar="${o.id}">Mostrar</button></div>`).join('')}</div>`,
    [{ texto: 'Fechar', primario: true, acao: async () => {
      for (const i of $('dialog').querySelectorAll('[data-apelido]')) if (i.value.trim() !== i.dataset.antes) await api(`/api/andares/${i.dataset.apelido}/apelido`, { apelido: i.value });
      for (const c of $('dialog').querySelectorAll('[data-ocultar]')) if (c.checked) await api(`/api/andares/${c.dataset.ocultar}/ocultar`, { oculto: true });
      return true;
    } }], dlg => {
      dlg.querySelectorAll('[data-mostrar]').forEach(b => b.addEventListener('click', async ev => {
        ev.stopPropagation(); await api(`/api/andares/${b.dataset.mostrar}/ocultar`, { oculto: false }); b.closest('.ajuste').remove();
      }));
    });
};
function abrirEstante(indice) {
  const p = pisoAtual();
  const skills = (p.layout.estantes[indice] || { skills: [] }).skills.map(i => p.andar.skills[i]).filter(Boolean);
  abrirModal(`ESTANTE ${indice + 1}`, `<div class="lista">${skills.map(s => `<div class="ajuste"><b>${esc(s.nome)}</b><span></span><span class="vazio" style="grid-column:1/-1">${esc(s.descricao || 'Sem descrição.')}</span></div>`).join('')}</div>`);
}

// ================= relógio e laço =================
const formatoHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
setInterval(() => { $('hora').textContent = formatoHora.format(new Date()); }, 1000);
$('hora').textContent = formatoHora.format(new Date());

let ultimo = performance.now(), acumulado = 0;
function laco(agora) {
  const dt = Math.min((agora - ultimo) / 1000, 0.05); ultimo = agora;
  for (const b of [...bonecos.values()]) b.update(dt);
  if (follow && bonecos.has(follow.chave)) {
    const f = indicePiso(follow.andarId);
    if (f !== view && f >= 0) setView(f, true);
    const k = 1 - Math.exp(-6 * dt); cam.x += (follow.x - cam.x) * k; cam.y += (follow.y - 12 - cam.y) * k;
  }
  if (pisoAtual()) { const { w, h } = tamanho(); cam.x = Math.max(0, Math.min(w, cam.x)); cam.y = Math.max(0, Math.min(h, cam.y)); }
  fade = Math.max(0, fade - dt * 3);
  render(agora / 1000);
  if ((acumulado += dt) > 0.5) { acumulado = 0; renderBuilding(); }
  requestAnimationFrame(laco);
}
requestAnimationFrame(laco);
conectar();
