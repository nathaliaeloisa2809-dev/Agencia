// Sprites pixel art (vindos do protótipo aprovado).

export function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashTexto = texto => [...String(texto)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const to = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((to - r) * p + r); g = Math.round((to - g) * p + g); b = Math.round((to - b) * p + b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function outline(c) {
  const g = c.getContext('2d'), w = c.width, h = c.height, d = g.getImageData(0, 0, w, h), a = d.data, o = new Uint8ClampedArray(a);
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 40;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (a[i + 3] > 40) continue;
    if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) { o[i] = 34; o[i + 1] = 28; o[i + 2] = 48; o[i + 3] = 255; }
  }
  d.data.set(o); g.putImageData(d, 0, 0);
}

export function makeSprite(w, h, draw, ol = true) {
  const c = document.createElement('canvas'); c.width = w + 2; c.height = h + 2;
  const g = c.getContext('2d'); g.translate(1, 1);
  draw(g, (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); });
  if (ol) outline(c);
  return c;
}

const SKINS = ['#f6d0b1', '#e8b48f', '#c98d63', '#8f5b3c', '#fbe0c8'];
const HAIRS = ['#2b1d14', '#5a3a22', '#e0a85c', '#1b1b22', '#9c3b2b', '#d8d2c8', '#4a3a8c'];
const PANTS = ['#2e3a59', '#3d3d46', '#4b5a6b', '#5b4636', '#2f4a3a'];

// Visual fixo por semente: o mesmo funcionário tem sempre a mesma cara.
export function newLook(shirt, semente) {
  const r = rng(hashTexto(semente));
  const de = lista => lista[Math.floor(r() * lista.length)];
  return { id: hashTexto(semente + shirt), shirt, skin: de(SKINS), hair: de(HAIRS), pants: de(PANTS), style: Math.floor(r() * 3) };
}

const cache = new Map();
export function avatarSprite(L, dir, frame) {
  const key = L.id + dir + frame;
  if (cache.has(key)) return cache.get(key);
  const s = makeSprite(20, 28, (g, R) => {
    if (dir === 'right') { g.translate(20, 0); g.scale(-1, 1); }
    const d = dir === 'right' ? 'left' : dir;
    const la = frame === 1 ? -1 : 0, lb = frame === 2 ? -1 : 0, am = frame === 1 ? 1 : frame === 2 ? -1 : 0;
    const SH = '#2b2b33', EY = '#1d1d2b', arm = shade(L.shirt, -0.14);
    if (d === 'down' || d === 'up') {
      R(6, 20 + la, 3, 5, L.pants); R(11, 20 + lb, 3, 5, L.pants); R(6, 24 + la, 3, 2, SH); R(11, 24 + lb, 3, 2, SH);
      R(5, 13, 10, 8, L.shirt); g.clearRect(5, 13, 1, 1); g.clearRect(14, 13, 1, 1);
      R(3, 14 + am, 2, 5, arm); R(15, 14 - am, 2, 5, arm); R(3, 19 + am, 2, 1, L.skin); R(15, 19 - am, 2, 1, L.skin);
      R(5, 4, 10, 9, L.skin); [[5, 4], [14, 4], [5, 12], [14, 12]].forEach(([x, y]) => g.clearRect(x, y, 1, 1));
      if (d === 'down') {
        R(5, 3, 10, 3, L.hair); R(6, 2, 8, 1, L.hair); R(5, 6, 1, 3, L.hair); R(14, 6, 1, 3, L.hair);
        if (L.style === 1) { R(4, 5, 1, 9, L.hair); R(15, 5, 1, 9, L.hair); }
        if (L.style === 2) R(8, 0, 4, 2, L.hair);
        R(7, 8, 1, 2, EY); R(12, 8, 1, 2, EY); R(6, 10, 1, 1, '#f2a0a0'); R(13, 10, 1, 1, '#f2a0a0');
        R(9, 13, 2, 1, shade(L.shirt, 0.25));
      } else {
        R(5, 3, 10, 9, L.hair); R(6, 2, 8, 1, L.hair);
        if (L.style === 1) R(5, 12, 10, 3, L.hair);
        if (L.style === 2) R(8, 0, 4, 2, L.hair);
      }
    } else {
      R(7, 20 + la, 3, 5, L.pants); R(10, 20 + lb, 3, 5, L.pants); R(6, 24 + la, 4, 2, SH); R(9, 24 + lb, 4, 2, SH);
      R(6, 13, 8, 8, L.shirt);
      R(9 + am, 14, 3, 5, arm); R(9 + am, 19, 3, 1, L.skin);
      R(5, 4, 9, 9, L.skin); [[5, 4], [13, 4], [5, 12], [13, 12]].forEach(([x, y]) => g.clearRect(x, y, 1, 1));
      R(5, 3, 9, 3, L.hair); R(6, 2, 7, 1, L.hair); R(10, 3, 4, 7, L.hair);
      if (L.style === 1) R(11, 6, 3, 9, L.hair);
      if (L.style === 2) R(12, 1, 3, 3, L.hair);
      R(6, 8, 1, 2, EY); R(6, 10, 1, 1, '#f2a0a0');
    }
  });
  cache.set(key, s);
  return s;
}

export const bubbleSpr = makeSprite(11, 13, (g, R) => { R(1, 0, 9, 10, '#ffd23f'); R(0, 1, 11, 8, '#ffd23f'); R(4, 10, 3, 2, '#ffd23f'); R(5, 11, 1, 2, '#ffd23f'); R(4, 2, 3, 4, '#1d2433'); R(4, 7, 3, 2, '#1d2433'); });
export const arrowSpr = makeSprite(7, 4, (g, R) => { R(0, 0, 7, 1, '#ffffff'); R(1, 1, 5, 1, '#ffffff'); R(2, 2, 3, 1, '#ffffff'); R(3, 3, 1, 1, '#ffffff'); });

export const deskSpr = makeSprite(34, 22, (g, R) => {
  R(0, 4, 34, 11, '#e8d3ae'); R(0, 4, 34, 1, '#f6e8cc'); R(0, 15, 34, 5, '#b48b5e'); R(1, 20, 3, 2, '#8a6a48'); R(30, 20, 3, 2, '#8a6a48');
  R(11, 0, 12, 8, '#5a6175'); R(11, 0, 12, 1, '#7b839a'); R(16, 3, 2, 2, '#9aa2b8'); R(10, 8, 14, 2, '#b8bdc9');
  R(2, 6, 7, 6, '#ffffff'); R(3, 8, 5, 1, '#c9cfdb'); R(3, 10, 4, 1, '#c9cfdb');
  R(27, 7, 4, 4, '#e85d5d'); R(31, 8, 1, 2, '#e85d5d');
});
export const plantSpr = makeSprite(16, 24, (g, R) => {
  R(4, 16, 8, 7, '#c56b45'); R(3, 15, 10, 2, '#da8257'); R(5, 17, 2, 5, '#d77d55');
  R(5, 5, 6, 11, '#3f8c4a'); R(2, 8, 5, 6, '#4f9c52'); R(9, 6, 5, 7, '#4f9c52'); R(6, 1, 4, 6, '#5fae5a'); R(1, 11, 4, 3, '#5fae5a'); R(11, 10, 4, 4, '#5fae5a');
  R(7, 2, 2, 2, '#86d07a'); R(3, 9, 2, 2, '#86d07a'); R(10, 7, 2, 2, '#86d07a');
});
const sofas = new Map();
export function sofaSpr(color, up = false) {
  const key = color + up;
  if (!sofas.has(key)) sofas.set(key, makeSprite(64, 22, (g, R) => {
    const dk = shade(color, -0.18);
    if (!up) { R(0, 0, 64, 9, dk); R(0, 8, 64, 11, color); R(0, 3, 7, 17, dk); R(57, 3, 7, 17, dk); R(21, 9, 1, 9, dk); R(42, 9, 1, 9, dk); R(0, 19, 64, 3, shade(color, -0.35)); }
    else { R(0, 13, 64, 9, dk); R(0, 3, 64, 11, color); R(0, 1, 7, 18, dk); R(57, 1, 7, 18, dk); R(21, 4, 1, 9, dk); R(42, 4, 1, 9, dk); R(0, 0, 64, 2, shade(color, 0.15)); }
  }));
  return sofas.get(key);
}
export const coffeeTableSpr = makeSprite(32, 14, (g, R) => { R(0, 0, 32, 9, '#a87850'); R(0, 0, 32, 1, '#c4936a'); R(0, 9, 32, 3, '#7d5839'); R(1, 12, 2, 2, '#5e432c'); R(29, 12, 2, 2, '#5e432c'); R(6, 3, 6, 4, '#f4f4f4'); R(20, 2, 4, 4, '#ffd166'); });
export const bookshelfSpr = makeSprite(32, 34, (g, R) => {
  R(0, 0, 32, 34, '#8a6448'); R(2, 2, 28, 30, '#6d4d36');
  const cols = ['#e85d5d', '#5b7cff', '#ffd166', '#2fb07f', '#b07bff', '#ff9f7a'];
  for (let s = 0; s < 3; s++) { R(2, 11 + s * 10, 28, 1, '#8a6448'); for (let b = 0; b < 6; b++) R(3 + b * 4 + (s % 2), 3 + s * 10, 3, 8 - (b % 3), cols[(b + s * 2) % 6]); }
});
export const skillShelfSpr = makeSprite(46, 30, (g, R) => {
  R(0, 0, 46, 30, '#8a6448'); R(2, 2, 42, 26, '#6d4d36');
  const cols = ['#5b7cff', '#e85d5d', '#ffd166', '#2fb07f', '#b07bff', '#ff9f7a', '#00a8c0'];
  for (let s = 0; s < 2; s++) { R(2, 14 + s * 12, 42, 1, '#8a6448'); for (let b = 0; b < 9; b++) R(3 + b * 4 + (s % 2), 4 + s * 12, 3, 10 - (b % 3), cols[(b + s * 3) % 7]); }
});
export const counterSpr = makeSprite(128, 22, (g, R) => {
  R(0, 0, 128, 7, '#ddd3c5'); R(0, 0, 128, 1, '#efe7dc'); R(0, 7, 128, 15, '#bfae97');
  for (let i = 0; i < 8; i++) { R(i * 16, 9, 1, 11, '#a8977f'); R(i * 16 + 7, 13, 2, 1, '#6d6150'); }
  R(20, 1, 16, 5, '#a9b9c8'); R(21, 2, 14, 3, '#8ea1b3'); R(27, 0, 2, 2, '#c9d2dc');
  R(80, 1, 10, 5, '#fafafa'); R(92, 2, 6, 4, '#e85d5d');
});
export const coffeeMachineSpr = makeSprite(14, 18, (g, R) => { R(0, 0, 14, 16, '#2d2f36'); R(2, 2, 10, 4, '#4a4e5a'); R(3, 9, 8, 6, '#17181d'); R(5, 11, 4, 3, '#ffffff'); R(11, 3, 1, 1, '#ff4d4d'); R(0, 16, 14, 2, '#1d1e23'); });
export const fridgeSpr = makeSprite(28, 40, (g, R) => { R(0, 0, 28, 40, '#e6ebf2'); R(0, 0, 2, 40, '#f7f9fc'); R(0, 14, 28, 1, '#b9c1cf'); R(23, 4, 2, 8, '#8f99aa'); R(23, 18, 2, 12, '#8f99aa'); R(5, 4, 6, 4, '#ffd166'); R(13, 20, 5, 5, '#6c8cff'); });
export const kTableSpr = makeSprite(48, 26, (g, R) => { R(2, 0, 44, 16, '#d8b48a'); R(0, 2, 48, 12, '#d8b48a'); R(2, 0, 44, 1, '#ead0ad'); R(2, 16, 44, 4, '#a9845d'); R(6, 20, 3, 6, '#7d5f41'); R(39, 20, 3, 6, '#7d5f41'); R(10, 4, 5, 5, '#ffffff'); R(30, 6, 8, 4, '#e85d5d'); });
export const coolerSpr = makeSprite(12, 26, (g, R) => { R(2, 0, 8, 9, '#8fd0ff'); R(3, 1, 3, 6, '#bfe6ff'); R(0, 9, 12, 17, '#e9eef5'); R(4, 13, 4, 2, '#5b7cff'); R(0, 9, 12, 1, '#c9d1dc'); });
export const meetTableSpr = makeSprite(112, 40, (g, R) => { R(0, 0, 112, 30, '#9c6f4a'); R(0, 0, 112, 2, '#b98a63'); R(0, 30, 112, 6, '#71503a'); R(4, 36, 4, 4, '#5a3f2d'); R(104, 36, 4, 4, '#5a3f2d'); for (let i = 0; i < 4; i++) R(14 + i * 24, 8, 10, 8, '#ffffff'); R(50, 18, 12, 6, '#2d2f36'); });
export const benchSpr = makeSprite(48, 14, (g, R) => { R(0, 0, 48, 8, '#7a8cc2'); R(0, 8, 48, 3, '#5d6fa3'); R(2, 11, 3, 3, '#3b4150'); R(43, 11, 3, 3, '#3b4150'); });
export const receptionSpr = makeSprite(112, 26, (g, R) => {
  R(0, 0, 112, 10, '#f4f2ee'); R(0, 0, 112, 1, '#ffffff'); R(0, 10, 112, 16, '#e6e2da'); R(0, 14, 112, 4, '#6c8cff');
  R(70, 2, 14, 6, '#7a3e2b'); R(71, 3, 12, 4, '#fbf6ea'); R(77, 3, 1, 4, '#c9b99a'); R(30, 1, 12, 7, '#5a6175'); R(31, 1, 10, 1, '#7b839a');
});
export const armchairSpr = makeSprite(22, 22, (g, R) => { R(0, 0, 22, 8, '#c0504d'); R(0, 7, 22, 11, '#d66a5e'); R(0, 3, 4, 16, '#a8443f'); R(18, 3, 4, 16, '#a8443f'); R(0, 18, 22, 3, '#8a3734'); });
