// Caminho em grade (BFS, 4 direções). Devolve pontos em pixels de arte, ou null se não há caminho.
export const T = 16;

export function findPath(grade, x0, y0, x1, y1) {
  const { largura: W, altura: H, bloqueado } = grade;
  const tile = (x, y) => [Math.max(0, Math.min(W - 1, Math.floor(x / T))), Math.max(0, Math.min(H - 1, Math.floor(y / T)))];
  const livre = (c, r) => c >= 0 && r >= 0 && c < W && r < H && !bloqueado[r * W + c];
  const [sc, sr] = tile(x0, y0);
  let [gc, gr] = tile(x1, y1);
  if (!livre(gc, gr)) {
    let achou = false;
    for (let raio = 1; raio < 4 && !achou; raio++) {
      for (let dy = -raio; dy <= raio && !achou; dy++) {
        for (let dx = -raio; dx <= raio && !achou; dx++) {
          if (livre(gc + dx, gr + dy)) { gc += dx; gr += dy; achou = true; }
        }
      }
    }
    if (!achou) return null;
  }
  const anterior = new Int32Array(W * H).fill(-1);
  const inicio = sr * W + sc, alvo = gr * W + gc;
  const fila = [inicio];
  anterior[inicio] = inicio;
  for (let i = 0; i < fila.length; i++) {
    const atual = fila[i];
    if (atual === alvo) break;
    const c = atual % W, r = (atual / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dx, nr = r + dy, n = nr * W + nc;
      if (livre(nc, nr) && anterior[n] === -1) { anterior[n] = atual; fila.push(n); }
    }
  }
  if (anterior[alvo] === -1) return null;
  const pontos = [];
  for (let n = alvo; n !== inicio; n = anterior[n]) pontos.unshift({ x: (n % W) * T + 8, y: ((n / W) | 0) * T + 8 });
  pontos.push({ x: x1, y: y1 });
  return pontos;
}
