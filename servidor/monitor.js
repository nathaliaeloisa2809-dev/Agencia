// Junta tudo: varre os projetos, lê só o que é novo e monta o retrato do prédio.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { carregarConfig, salvarConfig } from './config.js';
import { lerNovasLinhas, lerInicio } from './jsonl.js';
import { listarProjetos } from './descoberta.js';
import { reconciliar } from './andares.js';
import { lerFuncionarios, detectarTipo, listarSkills } from './funcionarios.js';
import { criarSessao, aplicar } from './sessoes.js';
import { montarEstado } from './estado.js';

const RECENTE_MS = 30 * 60 * 1000;
const CACHE_INFO_MS = 30 * 1000;
const cursorInicial = () => ({ offset: 0, resto: Buffer.alloc(0) });

export class Monitor {
  constructor({ dirProjetos, caminhoConfig, agora = Date.now, home = homedir(), leitor = { lerNovasLinhas, lerInicio }, opcoesReconciliar = {} }) {
    Object.assign(this, { dirProjetos, caminhoConfig, agora, home, leitor, opcoesReconciliar });
    this.cfg = carregarConfig(caminhoConfig);
    this.leituras = new Map(); // arquivo → {cursor, sessao, soInicio}
    this.info = new Map();     // andarId → {em, dados}
  }

  getConfig() { return this.cfg; }

  setConfig(fn) {
    this.cfg = fn(structuredClone(this.cfg));
    salvarConfig(this.caminhoConfig, this.cfg);
    this.info.clear();
  }

  lerSessao(arquivo, id, mtimeMs, agora) {
    let l = this.leituras.get(arquivo);
    const recente = mtimeMs > agora - RECENTE_MS;
    if (!l || (recente && l.soInicio)) {
      l = { cursor: cursorInicial(), sessao: criarSessao(id), soInicio: false };
      this.leituras.set(arquivo, l);
    }
    if (recente) {
      const r = this.leitor.lerNovasLinhas(arquivo, l.cursor);
      for (const o of r.objetos) aplicar(l.sessao, o);
      l.cursor = r.cursor;
    } else if (!l.soInicio) {
      for (const o of this.leitor.lerInicio(arquivo)) aplicar(l.sessao, o);
      l.soInicio = true;
    }
    return l.sessao;
  }

  lerSubagentes(dir, agora) {
    const mapa = new Map();
    if (!dir) return mapa;
    let arquivos;
    try { arquivos = readdirSync(dir).filter(a => a.endsWith('.jsonl')); } catch { return mapa; }
    for (const a of arquivos) {
      const arquivo = join(dir, a);
      try {
        const { mtimeMs } = statSync(arquivo);
        if (mtimeMs <= agora - RECENTE_MS) continue;
        const meta = JSON.parse(readFileSync(arquivo.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
        if (meta.toolUseId) mapa.set(meta.toolUseId, this.lerSessao(arquivo, a, mtimeMs, agora));
      } catch { /* subagente sem meta ainda */ }
    }
    return mapa;
  }

  infoDoAndar(andar, agora) {
    const c = this.info.get(andar.id);
    if (c && agora - c.em < CACHE_INFO_MS && c.cwd === andar.cwd) return c.dados;
    const dados = andar.pastaExiste
      ? { funcionarios: lerFuncionarios(andar.cwd), tipo: detectarTipo(andar.cwd), skills: listarSkills(andar.cwd) }
      : { funcionarios: [], tipo: 'fila', skills: [] };
    this.info.set(andar.id, { em: agora, cwd: andar.cwd, dados });
    return dados;
  }

  atualizar() {
    const agora = this.agora();
    const projetos = listarProjetos(this.dirProjetos, { home: this.home });
    const r = reconciliar(this.cfg, projetos, this.opcoesReconciliar);
    if (JSON.stringify(r.cfg) !== JSON.stringify(this.cfg)) {
      this.cfg = r.cfg;
      salvarConfig(this.caminhoConfig, this.cfg);
    }
    const sessoesPorPasta = new Map();
    for (const p of projetos) {
      const sessoes = new Map();
      for (const s of p.sessoes) {
        try {
          sessoes.set(s.id, { sessao: this.lerSessao(s.arquivo, s.id, s.mtimeMs, agora), subagentes: this.lerSubagentes(s.dirSubagentes, agora) });
        } catch { /* arquivo sumiu entre a listagem e a leitura */ }
      }
      sessoesPorPasta.set(p.pasta, sessoes);
    }
    const infoPorAndar = new Map(r.andares.map(a => [a.id, this.infoDoAndar(a, agora)]));
    return montarEstado({ cfg: this.cfg, andares: r.andares, sessoesPorPasta, infoPorAndar, agora, sugestoes: r.sugestoes });
  }
}
