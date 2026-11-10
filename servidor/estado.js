// Monta o retrato do prédio que a página desenha.
import { horaBrasilia } from './relogio.js';
import { estadoAtual, chamadasAbertas } from './sessoes.js';

const PARADOS = ['parado', 'encerrada'];

function andarRetrato(andar, numero, { cfg, sessoesPorPasta, infoPorAndar, agora }) {
  const info = infoPorAndar.get(andar.id) || { funcionarios: [], tipo: 'fila', skills: [] };
  const nomes = new Set(info.funcionarios.map(f => f.nome));
  const visitantes = [], estagiarios = [];
  const ocupados = new Map(); // nome do funcionário → dados ao vivo

  for (const projeto of andar.projetos) {
    const sessoes = sessoesPorPasta.get(projeto.pasta);
    if (!sessoes) continue;
    for (const { sessao, subagentes } of sessoes.values()) {
      const e = estadoAtual(sessao, agora);
      if (e.estado === 'encerrada') continue;
      visitantes.push({ id: sessao.id, titulo: sessao.titulo || 'Sessão sem título', ...e, mensagens: sessao.mensagens, arquivos: sessao.arquivos });
      for (const ch of chamadasAbertas(sessao)) {
        const sub = subagentes.get(ch.toolUseId);
        const es = sub ? estadoAtual(sub, agora) : null;
        const vivo = es && es.estado !== 'encerrada'
          ? es
          : { estado: 'trabalhando', acao: ch.descricao || 'Trabalhando', desde: ch.inicio };
        if (ch.funcionario && nomes.has(ch.funcionario)) {
          ocupados.set(ch.funcionario, { ...vivo, mensagens: sub ? sub.mensagens : [], arquivos: sub ? sub.arquivos : [] });
        } else {
          estagiarios.push({ id: ch.toolUseId, descricao: ch.descricao || ch.funcionario || 'Ajudante', chamadoPor: sessao.titulo, ...vivo });
        }
      }
    }
  }

  const funcionarios = info.funcionarios.map(f => ({
    nome: f.nome,
    descricao: f.descricao,
    ...(ocupados.get(f.nome) || { estado: 'parado', acao: 'Sem trabalho agora', desde: 0, mensagens: [], arquivos: [] }),
  }));

  return {
    id: andar.id, numero, nome: andar.nome, cor: andar.cor, pastaExiste: andar.pastaExiste,
    tipo: (cfg.tipos && cfg.tipos[andar.id]) || info.tipo,
    funcionarios, visitantes, estagiarios, skills: info.skills,
  };
}

export function montarEstado({ cfg, andares, sessoesPorPasta, infoPorAndar, agora, sugestoes = [] }) {
  const retratos = andares.map((a, i) => andarRetrato(a, i + 1, { cfg, sessoesPorPasta, infoPorAndar, agora }));
  const execucao = [];
  for (const a of retratos) {
    const base = { andarId: a.id, andar: a.nome };
    for (const f of a.funcionarios) if (!PARADOS.includes(f.estado)) execucao.push({ ...base, quem: f.nome, tipo: 'funcionario', acao: f.acao, desde: f.desde });
    for (const v of a.visitantes) if (!PARADOS.includes(v.estado)) execucao.push({ ...base, quem: v.titulo, tipo: 'visitante', acao: v.acao, desde: v.desde });
    for (const e of a.estagiarios) if (!PARADOS.includes(e.estado)) execucao.push({ ...base, quem: e.descricao, tipo: 'estagiario', acao: e.acao, desde: e.desde });
  }
  execucao.sort((x, y) => x.desde - y.desde);
  const nomeDe = id => (andares.find(a => a.id === id) || {}).nome || '';
  return {
    predio: { nome: cfg.nome },
    relogio: horaBrasilia(new Date(agora)),
    andares: retratos,
    execucao,
    sugestoes: sugestoes.map(s => ({ ...s, deNome: nomeDe(s.de), paraNome: nomeDe(s.para) })),
  };
}
