// Planta de um andar: onde fica cada parede, móvel e vaga. Só dados — o desenho fica no mapa.js.
import { T } from './caminho.js';
export { T };

const LARGURA = 40;
const COLUNAS_MESA = [3, 8, 13, 18];

export function gerarLayout({ funcionarios = 0, tipo = 'fila', skills = 0 } = {}) {
  const terreo = tipo === 'terreo', biblioteca = tipo === 'biblioteca';
  const fileiras = terreo || biblioteca ? 0 : Math.max(2, Math.ceil((funcionarios + 2) / 4));
  const numEstantes = biblioteca ? Math.ceil(skills / 4) : 0;
  const linhasEstantes = Math.ceil(numEstantes / 5);
  const rLounge = biblioteca ? Math.max(17, 5 + 4 * linhasEstantes + 2) : Math.max(17, 6 + 5 * fileiras + 1);
  const altura = terreo ? 26 : Math.max(26, rLounge + 8);

  const L = {
    largura: LARGURA, altura, tipo, bloqueado: new Uint8Array(LARGURA * altura),
    mesas: [], copa: [], lounge: [], visitas: [], estantes: [], moveis: [], paredes: [], luzes: [],
    elevador: { x: 22 * T, y: 2 * T + 10 }, entrada: null, rLounge,
  };
  const bloquear = (c, r, w = 1, h = 1) => {
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (x >= 0 && y >= 0 && x < LARGURA && y < altura) L.bloqueado[y * LARGURA + x] = 1;
  };
  const movel = (tipoMovel, c, r, w = 0, h = 1, extra = {}) => { L.moveis.push({ tipo: tipoMovel, c, r, ...extra }); if (w) bloquear(c, r, w, h); };
  const paredeV = (c, r1, r2, vaos = []) => { L.paredes.push({ tipo: 'v', c, r1, r2, vaos }); for (let r = r1; r <= r2; r++) if (!vaos.includes(r)) bloquear(c, r); };
  const paredeH = (r, c1, c2, vaos = []) => { L.paredes.push({ tipo: 'h', r, c1, c2, vaos }); for (let c = c1; c <= c2; c++) if (!vaos.includes(c)) bloquear(c, r); };
  const luz = (c, r, raio = 70) => L.luzes.push({ x: c * T, y: r * T, r: raio });

  // paredes externas
  bloquear(0, 0, LARGURA, 2); bloquear(0, 0, 1, altura); bloquear(LARGURA - 1, 0, 1, altura); bloquear(0, altura - 1, LARGURA, 1);

  if (terreo) {
    for (let c = 18; c <= 21; c++) L.bloqueado[(altura - 1) * LARGURA + c] = 0;
    L.entrada = { x: 20 * T, y: 24 * T + 8 };
    movel('recepcao', 16, 9, 0); bloquear(17, 9, 6, 1);
    movel('sofa', 4, 13, 4); movel('sofaCostas', 4, 17, 4); movel('mesinha', 5, 15, 2);
    movel('banco', 29, 13, 3); movel('banco', 33, 13, 3);
    for (const [c, r] of [[2, 3], [15, 3], [25, 3], [37, 3], [2, 23], [37, 23], [16, 23], [23, 23], [10, 15]]) movel('planta', c, r, 1);
    for (const [c, r] of [[6, 6], [14, 6], [26, 6], [34, 6], [6, 16], [14, 17], [26, 17], [34, 17], [20, 20]]) luz(c, r, 80);
    return L;
  }

  // copa
  paredeV(25, 2, 10, [6, 7]); paredeH(10, 25, 38);
  movel('balcao', 26, 2, 8); movel('cafeteira', 30, 2); movel('geladeira', 36, 2, 2); movel('mesaCopa', 30, 6, 3, 2); movel('bebedouro', 38, 4, 1);
  L.copa.push({ x: 27 * T + 8, y: 4 * T + 10, dir: 'up' }, { x: 29 * T + 8, y: 4 * T + 10, dir: 'up' }, { x: 34 * T + 8, y: 7 * T + 8, dir: 'left' }, { x: 28 * T + 4, y: 8 * T + 8, dir: 'right' });
  // sala de foco (visitantes)
  paredeH(14, 25, 38, [30, 31]); paredeV(25, 14, 24);
  if (altura > 26) paredeH(25, 25, 38);
  movel('mesaReuniao', 28, 18, 7, 2);
  for (let i = 0; i < 5; i++) {
    L.visitas.push({ x: 29 * T + i * 20 + 5, y: 17 * T + 6, dir: 'down' }, { x: 29 * T + i * 20 + 5, y: 20 * T + 12, dir: 'up' });
  }
  movel('banco', 33, 12, 3);
  // lounge
  movel('sofa', 4, rLounge, 4); movel('sofaCostas', 4, rLounge + 4, 4); movel('mesinha', 5, rLounge + 2, 2); movel('poltrona', 9, rLounge + 2, 1);
  movel('estante', 13, rLounge - 2, 2);
  for (const c of [3, 4, 7, 8, 11, 12, 13, 14]) L.lounge.push({ x: c * T + 8, y: (rLounge + 2) * T + 8, dir: 'down' });
  // plantas
  for (const [c, r] of [[23, 4], [37, 12], [24, 14], [26, 23], [38, 23], [2, rLounge - 3], [23, altura - 2], [17, altura - 2]]) movel('planta', c, r, 1);
  if (altura > 26) for (const c of [27, 31, 35]) movel('planta', c, altura - 3, 1);

  if (biblioteca) {
    for (let i = 0; i < numEstantes; i++) {
      const c = 3 + 4 * (i % 5), r = 5 + 4 * Math.floor(i / 5);
      L.estantes.push({ c, r, skills: [] });
      movel('estanteSkills', c, r, 3, 1, { indice: i });
    }
    for (let s = 0; s < skills; s++) L.estantes[Math.floor(s / 4)].skills.push(s);
  } else {
    for (let i = 0; i < fileiras; i++) {
      const r = 6 + 5 * i;
      for (const c of COLUNAS_MESA) {
        L.mesas.push({ c, r, sx: (c + 1) * T, sy: r * T - 1 });
        movel('mesa', c, r, 2);
      }
      for (const c of [5, 11, 17]) luz(c, r - 1);
    }
  }
  for (const [c, r] of [[31, 5], [31, 19], [7, rLounge + 2], [32, 12], [14, rLounge + 3]]) luz(c, r);
  return L;
}
