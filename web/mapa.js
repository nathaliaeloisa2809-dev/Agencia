// Desenha a planta de um andar (piso, paredes, móveis) a partir do layout.
import { T } from './caminho.js';
import * as S from './sprites.js';

const CAP = '#463d5c', FACE = '#efe6d8', BASE = '#cbb9a0';
const FONTE = '"Press Start 2P", monospace';

export function desenharAndar(layout, andar, { nomePredio = 'Prédio IA', skills = [] } = {}) {
  const { largura: MW, altura: MH } = layout;
  const lobby = layout.tipo === 'terreo';
  const cor = andar ? andar.cor : '#1d2433';
  const rnd = S.rng(S.hashTexto(andar ? andar.id : 'terreo'));
  const cv = document.createElement('canvas'); cv.width = MW * T; cv.height = MH * T;
  const g = cv.getContext('2d');
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const ents = [], janelas = [];
  const ent = (img, x, y, sortY, extra = {}) => ents.push({ img, x, y, sortY: sortY ?? y + img.height - 2, ...extra });

  const madeira = (x, y, w, h) => {
    R(x, y, w, h, '#c99a6b');
    for (let yy = y; yy < y + h; yy += 8) {
      R(x, yy + 7, w, 1, '#ad7f56');
      let xx = x - Math.floor(rnd() * 40);
      while (xx < x + w) { const len = 24 + Math.floor(rnd() * 40); if (rnd() < 0.3) R(Math.max(x, xx + 1), yy, Math.min(len - 1, x + w - xx - 1), 7, '#c18f63'); R(Math.max(x, xx), yy, 1, 7, '#ad7f56'); xx += len; }
    }
  };
  const carpete = (x, y, w, h, c) => {
    R(x, y, w, h, c); const b = S.shade(c, -0.12);
    R(x, y, w, 2, b); R(x, y + h - 2, w, 2, b); R(x, y, 2, h, b); R(x + w - 2, y, 2, h, b);
    for (let i = 0; i < (w * h) / 40; i++) R(x + Math.floor(rnd() * w), y + Math.floor(rnd() * h), 1, 1, S.shade(c, -0.06));
  };
  const ladrilho = (x, y, w, h, a, b, s = 8) => { for (let yy = 0; yy < h; yy += s) for (let xx = 0; xx < w; xx += s) R(x + xx, y + yy, s, s, ((xx + yy) / s) % 2 ? a : b); };
  const janela = c => { R(c * T + 1, 6, 3 * T - 2, 20, '#8e7f6c'); janelas.push({ x: c * T + 3, y: 8, w: 3 * T - 6, h: 16 }); R(c * T, 25, 3 * T, 2, '#b3a28b'); };
  const placa = (c, w, texto, corPlaca) => {
    R(c * T, 7, w * T, 18, S.shade(corPlaca, -0.25)); R(c * T + 1, 8, w * T - 2, 16, corPlaca); R(c * T + 1, 8, w * T - 2, 1, S.shade(corPlaca, 0.2));
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let tamanho = 12;
    do { g.font = `${tamanho}px ${FONTE}`; tamanho -= 1; } while (g.measureText(texto).width > w * T - 8 && tamanho > 5);
    g.fillText(texto, c * T + (w * T) / 2, 17);
  };

  // piso
  if (lobby) {
    ladrilho(0, 0, MW * T, MH * T, '#e9e3d8', '#ddd5c8', 16);
    carpete(18 * T, 11 * T, 4 * T, 14 * T, '#c0504d'); R(18 * T + 3, 11 * T + 3, 4 * T - 6, 1, '#e8b84a');
  } else {
    madeira(0, 0, MW * T, MH * T);
    const fimEscritorio = layout.mesas.length ? layout.mesas.at(-1).r + 2 : (layout.estantes.length ? layout.estantes.at(-1).r + 2 : 14);
    carpete(2 * T, 3 * T, 21 * T, (fimEscritorio - 3) * T, S.shade(cor, 0.72));
    ladrilho(26 * T, 2 * T, 13 * T, 8 * T, '#eeeae3', '#dcd5ca');
    carpete(26 * T, 15 * T, 13 * T, 10 * T, '#b8c6d8');
    const rL = layout.rLounge;
    carpete(3 * T, rL * T, 9 * T, 6 * T, S.shade(cor, 0.5));
    R(4 * T, (rL + 1) * T, 7 * T, 1, S.shade(cor, 0.8)); R(4 * T, (rL + 5) * T - 1, 7 * T, 1, S.shade(cor, 0.8));
  }
  // paredes externas
  R(0, 0, MW * T, 2 * T, FACE); R(0, 0, MW * T, 5, CAP); R(0, 2 * T - 4, MW * T, 4, BASE);
  R(0, 0, T, MH * T, CAP); R((MW - 1) * T, 0, T, MH * T, CAP);
  R(0, (MH - 1) * T, MW * T, T, CAP);
  for (const p of layout.paredes) {
    if (p.tipo === 'v') { for (let r = p.r1; r <= p.r2; r++) if (!p.vaos.includes(r)) R(p.c * T + 4, r * T, 8, T, CAP); }
    else for (let c = p.c1; c <= p.c2; c++) if (!p.vaos.includes(c)) { R(c * T, p.r * T, T, 6, CAP); R(c * T, p.r * T + 6, T, 8, FACE); R(c * T, p.r * T + 14, T, 2, BASE); }
  }
  // elevador e relógio
  R(20 * T + 10, 5, 2 * T + 12, 27, '#7d8396'); R(21 * T, 8, 2 * T, 24, '#c9ced9'); R(22 * T - 1, 8, 2, 24, '#9aa0b0');
  R(22 * T - 6, 5, 12, 3, '#1d2433'); R(22 * T - 1, 6, 2, 1, '#2fd08a'); R(23 * T + 4, 16, 3, 5, '#e9e3d6'); R(23 * T + 5, 17, 1, 1, '#ffc233');
  R(21 * T, 2 * T, 2 * T, 5, '#9aa0b0'); R(21 * T, 2 * T, 2 * T, 1, '#b9bfcc');
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(24 * T + 8, 16, 7, 0, 7); g.fill(); g.strokeStyle = CAP; g.lineWidth = 2; g.stroke();
  R(24 * T + 8, 11, 1, 5, CAP); R(24 * T + 8, 16, 4, 1, CAP);

  if (lobby) {
    [2, 6, 29, 33].forEach(janela);
    placa(9, 9, nomePredio.toUpperCase(), '#1d2433');
    R(18 * T, (MH - 1) * T, 4 * T, T, '#bfe3f5'); R(20 * T - 1, (MH - 1) * T, 2, T, '#8fb7cc'); R(18 * T, (MH - 1) * T, 4 * T, 2, '#8fb7cc');
  } else {
    [2, 6, 10].forEach(janela);
    placa(13, 7, andar.nome.toUpperCase(), cor);
    // armários da copa
    R(26 * T, 7, 8 * T, 14, '#d6c8b5'); for (let i = 0; i < 8; i++) { R(26 * T + i * 16, 7, 1, 14, '#bfae97'); R(26 * T + i * 16 + 7, 18, 2, 1, '#6d6150'); }
    R(26 * T, 21, 8 * T, 7, '#cfe3e8'); for (let i = 0; i < 32; i++) R(26 * T + i * 4, 21, 1, 7, '#b9d3da');
  }

  for (const m of layout.moveis) {
    const x = m.c * T, y = m.r * T;
    switch (m.tipo) {
      case 'mesa': {
        const sx = (m.c + 1) * T, sy = m.r * T - 1;
        R(sx - 6, sy - 15, 12, 9, '#4b5166'); R(sx - 5, sy - 14, 10, 1, '#5d6479'); R(sx - 7, sy - 7, 14, 5, '#5d6479');
        ent(S.deskSpr, x - 1, y - 6, y + 16, { mesa: layout.mesas.findIndex(d => d.c === m.c && d.r === m.r) });
        break;
      }
      case 'planta': ent(S.plantSpr, x, y - 8); break;
      case 'sofa': ent(S.sofaSpr(lobby ? '#7a8cc2' : S.shade(cor, -0.05)), x, y); break;
      case 'sofaCostas': ent(S.sofaSpr(lobby ? '#7a8cc2' : S.shade(cor, -0.05), true), x, lobby ? y : y - 2); break;
      case 'mesinha': ent(S.coffeeTableSpr, x, y + (lobby ? 2 : 1)); break;
      case 'poltrona': ent(S.armchairSpr, x, y - 4); break;
      case 'estante': ent(S.bookshelfSpr, x, y - 18); break;
      case 'balcao': ent(S.counterSpr, x, y - 6); break;
      case 'cafeteira': ent(S.coffeeMachineSpr, x + 1, y - 16, y + 17, { dyn: (ctx, t) => {
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        for (let i = 0; i < 3; i++) { const p = (t * 0.8 + i / 3) % 1; ctx.fillRect(x + 8 + Math.round(Math.sin(p * 6 + i) * 1.5), y - 18 - Math.round(p * 10), 1, 1); }
      } }); break;
      case 'geladeira': ent(S.fridgeSpr, x + 2, y - 24); break;
      case 'mesaCopa':
        ent(S.kTableSpr, x, y - 2);
        for (const [bx, by] of [[29 * T + 6, 7 * T], [33 * T + 4, 7 * T]]) { R(bx, by - 4, 8, 6, '#a9845d'); R(bx + 3, by + 2, 2, 4, '#5e432c'); }
        break;
      case 'bebedouro': ent(S.coolerSpr, x + 2, y - 10); break;
      case 'mesaReuniao':
        for (let i = 0; i < 5; i++) { const cx = 29 * T + i * 20; R(cx, 17 * T - 2, 10, 7, '#4b5166'); R(cx, 20 * T + 6, 10, 7, '#4b5166'); }
        ent(S.meetTableSpr, x, y - 6);
        break;
      case 'banco': ent(S.benchSpr, x, lobby ? y : y - 2); break;
      case 'recepcao': ent(S.receptionSpr, x + 8, y - 4); break;
      case 'estanteSkills': {
        ent(S.skillShelfSpr, x + 1, y - 16, undefined, { estante: m.indice });
        const nomes = (layout.estantes[m.indice] || { skills: [] }).skills.map(i => skills[i]).filter(Boolean);
        g.font = `5px ${FONTE}`; g.textAlign = 'left'; g.textBaseline = 'top';
        nomes.forEach((s, k) => {
          const t = (s.nome || '').slice(0, 9);
          R(x, y + 15 + k * 7, 48, 7, 'rgba(29,36,51,.75)');
          g.fillStyle = '#fff'; g.fillText(t, x + 2, y + 16 + k * 7);
        });
        break;
      }
    }
  }
  return { cv, ents, janelas, luzes: layout.luzes };
}
