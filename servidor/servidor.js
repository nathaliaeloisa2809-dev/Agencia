// Servidor local: entrega a página, o retrato do prédio e recebe os comandos do dono.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { WebSocketServer } from 'ws';

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const MAX_NOME = 40;

function responder(res, status, corpo) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corpo));
}

async function lerCorpo(req) {
  let texto = '';
  for await (const parte of req) {
    texto += parte;
    if (texto.length > 100_000) throw new Error('corpo grande demais');
  }
  return texto ? JSON.parse(texto) : {};
}

// Endereços estranhos (ex.: "//") não podem derrubar o servidor.
function urlDoPedido(req) {
  try { return new URL(req.url, 'http://127.0.0.1'); } catch { return null; }
}

export function iniciarServidor({ monitor, token, porta = 4777, dirWeb, intervaloMs = 1500 }) {
  const raizWeb = resolve(dirWeb);
  let ultimoJson = null;
  const wss = new WebSocketServer({ noServer: true });

  const retrato = () => {
    const estado = monitor.atualizar();
    ultimoJson = JSON.stringify({ tipo: 'estado', estado });
    return ultimoJson;
  };
  const enviarParaTodos = () => {
    const antes = ultimoJson;
    let json;
    try { json = retrato(); } catch (erro) { console.error('Erro ao ler o prédio:', erro.message); return; }
    if (json === antes) return;
    for (const c of wss.clients) if (c.readyState === 1) c.send(json);
  };

  const rotasPost = [
    [/^\/api\/nome$/, (corpo) => {
      const nome = String(corpo.nome ?? '').trim().slice(0, MAX_NOME);
      if (!nome) return [400, { erro: 'O nome do prédio não pode ficar vazio.' }];
      monitor.setConfig(cfg => ({ ...cfg, nome }));
      return [200, { ok: true, nome }];
    }],
    [/^\/api\/andares\/([\w-]+)\/apelido$/, (corpo, id) => {
      const apelido = String(corpo.apelido ?? '').trim().slice(0, MAX_NOME);
      monitor.setConfig(cfg => {
        const apelidos = { ...cfg.apelidos };
        if (apelido) apelidos[id] = apelido; else delete apelidos[id];
        return { ...cfg, apelidos };
      });
      return [200, { ok: true }];
    }],
    [/^\/api\/andares\/([\w-]+)\/ocultar$/, (corpo, id) => {
      monitor.setConfig(cfg => {
        const ocultos = cfg.ocultos.filter(x => x !== id);
        if (corpo.oculto) ocultos.push(id);
        return { ...cfg, ocultos };
      });
      return [200, { ok: true }];
    }],
    [/^\/api\/juntar$/, (corpo) => {
      const { de, para } = corpo;
      const cfg = monitor.getConfig();
      if (!cfg.andares[de] || !cfg.andares[para] || de === para) return [404, { erro: 'Andar não encontrado.' }];
      monitor.setConfig(c => {
        c.andares[de].caminhos.push(...c.andares[para].caminhos);
        delete c.andares[para];
        delete c.apelidos[para];
        c.ocultos = c.ocultos.filter(x => x !== para);
        return c;
      });
      return [200, { ok: true }];
    }],
  ];

  const servidor = createServer(async (req, res) => {
    try {
      const url = urlDoPedido(req);
      if (!url) return responder(res, 400, { erro: 'Pedido inválido.' });
      if (url.pathname.startsWith('/api/')) {
        if (req.headers['x-token'] !== token) return responder(res, 401, { erro: 'Sem permissão.' });
        if (req.method === 'GET' && url.pathname === '/api/estado') return responder(res, 200, JSON.parse(retrato()).estado);
        if (req.method === 'GET' && url.pathname === '/api/ocultos') {
          const cfg = monitor.getConfig();
          return responder(res, 200, cfg.ocultos.filter(id => cfg.andares[id]).map(id => ({
            id, nome: cfg.apelidos[id] || cfg.andares[id].caminhos.at(-1).split(/[\\/]/).pop(),
          })));
        }
        if (req.method === 'POST') {
          for (const [padrao, fazer] of rotasPost) {
            const m = padrao.exec(url.pathname);
            if (!m) continue;
            const [status, corpo] = fazer(await lerCorpo(req), m[1]);
            if (status === 200) setImmediate(enviarParaTodos);
            return responder(res, status, corpo);
          }
        }
        return responder(res, 404, { erro: 'Rota não encontrada.' });
      }
      const pedido = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const arquivo = resolve(raizWeb, '.' + pedido);
      if (!arquivo.startsWith(raizWeb + sep)) return responder(res, 404, { erro: 'Não encontrado.' });
      const conteudo = await readFile(arquivo);
      res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(conteudo);
    } catch (erro) {
      if (erro.code === 'ENOENT' || erro.code === 'EISDIR') return responder(res, 404, { erro: 'Não encontrado.' });
      if (erro instanceof SyntaxError) return responder(res, 400, { erro: 'Pedido inválido.' });
      console.error(erro);
      responder(res, 500, { erro: 'Erro interno.' });
    }
  });

  servidor.on('upgrade', (req, socket, cabeca) => {
    try {
      const url = urlDoPedido(req);
      if (!url || url.pathname !== '/ws' || url.searchParams.get('t') !== token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        return socket.destroy();
      }
      wss.handleUpgrade(req, socket, cabeca, ws => {
        try { ws.send(ultimoJson || retrato()); } catch (erro) { console.error(erro.message); }
      });
    } catch (erro) {
      console.error('Pedido de conexão inválido:', erro.message);
      socket.destroy();
    }
  });

  const relogio = setInterval(enviarParaTodos, intervaloMs);

  return new Promise((ok, falha) => {
    servidor.once('error', erro => { clearInterval(relogio); falha(erro); });
    servidor.listen(porta, '127.0.0.1', () => ok({
      porta: servidor.address().port,
      fechar: () => new Promise(fim => {
        clearInterval(relogio);
        for (const c of wss.clients) c.terminate();
        wss.close();
        servidor.closeAllConnections();
        servidor.close(() => fim());
      }),
    }));
  });
}
