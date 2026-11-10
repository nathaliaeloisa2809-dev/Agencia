// Redutor: cada linha do .jsonl de uma sessão atualiza o estado dela.

const MIN = 60 * 1000;
const ESCRITA = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
const LEITURA = ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'];
const TERMINAL = ['Bash', 'PowerShell'];
const DELEGAR = ['Agent', 'Task'];
const PODE_PEDIR_PERMISSAO = ['Bash', 'PowerShell', 'Write', 'Edit'];

const nomeArquivo = c => String(c || '').split(/[\\/]/).pop();
const cortar = (t, n) => (t.length > n ? t.slice(0, n) : t);

export function criarSessao(id) {
  return { id, titulo: '', ultima: 0, ferramentaAberta: null, fimDeTurno: false, mensagens: [], arquivos: [], chamadas: new Map() };
}

function guardarMensagem(s, u, t) {
  s.mensagens.push({ u, t: cortar(t, 280) });
  if (s.mensagens.length > 6) s.mensagens.shift();
}

function funcionarioDaChamada(input) {
  if (input.subagent_type && input.subagent_type !== 'general-purpose') return input.subagent_type;
  const m = /\.claude[\\/]+agents[\\/]+([\w-]+)\.md/.exec(input.prompt || '');
  return m ? m[1] : null;
}

export function aplicar(s, obj) {
  if (!obj || typeof obj !== 'object') return;
  const quando = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
  if (!Number.isNaN(quando)) s.ultima = quando;

  if (obj.type === 'ai-title' && obj.aiTitle) { s.titulo = obj.aiTitle; return; }

  const conteudo = obj.message && obj.message.content;
  if (obj.type === 'user') {
    const textos = typeof conteudo === 'string' ? [conteudo]
      : Array.isArray(conteudo) ? conteudo.filter(c => c.type === 'text').map(c => c.text) : [];
    for (const t of textos) {
      // Mensagens com tags (<command-name>, <system-reminder>…) são do sistema, não do dono.
      if (!t || t.trimStart().startsWith('<')) continue;
      guardarMensagem(s, true, t);
      if (!s.titulo) s.titulo = cortar(t.trim(), 60);
      s.fimDeTurno = false;
    }
    if (Array.isArray(conteudo)) {
      for (const c of conteudo) {
        if (c.type !== 'tool_result') continue;
        if (s.ferramentaAberta && s.ferramentaAberta.id === c.tool_use_id) s.ferramentaAberta = null;
        s.chamadas.delete(c.tool_use_id);
      }
    }
    return;
  }

  if (obj.type === 'assistant' && Array.isArray(conteudo)) {
    for (const c of conteudo) {
      if (c.type === 'text' && c.text) guardarMensagem(s, false, c.text);
      if (c.type !== 'tool_use') continue;
      const input = c.input || {};
      s.ferramentaAberta = { id: c.id, nome: c.name, input, inicio: Number.isNaN(quando) ? s.ultima : quando };
      if (ESCRITA.includes(c.name) && input.file_path) {
        s.arquivos = s.arquivos.filter(a => a !== input.file_path);
        s.arquivos.push(input.file_path);
        if (s.arquivos.length > 20) s.arquivos.shift();
      }
      if (DELEGAR.includes(c.name)) {
        s.chamadas.set(c.id, { toolUseId: c.id, funcionario: funcionarioDaChamada(input), descricao: input.description || '', inicio: s.ferramentaAberta.inicio });
      }
    }
    s.fimDeTurno = obj.message.stop_reason === 'end_turn';
  }
}

function acaoDaFerramenta(f) {
  const i = f.input;
  if (ESCRITA.includes(f.nome)) return 'Editando ' + nomeArquivo(i.file_path || i.notebook_path);
  if (f.nome === 'Read') return 'Lendo ' + nomeArquivo(i.file_path);
  if (f.nome === 'Grep') return `Buscando "${i.pattern || ''}"`;
  if (f.nome === 'Glob') return 'Procurando ' + (i.pattern || '');
  if (TERMINAL.includes(f.nome)) return '$ ' + cortar(String(i.command || ''), 60);
  if (DELEGAR.includes(f.nome)) return 'Chamando ' + (funcionarioDaChamada(i) || i.description || 'ajudante');
  if (f.nome === 'WebFetch') { try { return 'Abrindo ' + new URL(i.url).host; } catch { return 'Abrindo página'; } }
  if (f.nome === 'WebSearch') return `Pesquisando "${i.query || ''}"`;
  return f.nome;
}

export function estadoAtual(s, agora) {
  const desde = s.ultima;
  const parada = agora - s.ultima;
  if (parada > 30 * MIN) return { estado: 'encerrada', acao: 'Encerrada', desde };
  const f = s.ferramentaAberta;
  if (f) {
    if (PODE_PEDIR_PERMISSAO.includes(f.nome) && parada > MIN) return { estado: 'precisa', acao: 'Talvez esperando permissão no terminal', desde };
    const acao = acaoDaFerramenta(f);
    if (ESCRITA.includes(f.nome)) return { estado: 'escrevendo', acao, desde };
    if (LEITURA.includes(f.nome)) return { estado: 'lendo', acao, desde };
    if (TERMINAL.includes(f.nome)) return { estado: 'terminal', acao, desde };
    if (DELEGAR.includes(f.nome)) return { estado: 'delegando', acao, desde };
    return { estado: 'trabalhando', acao, desde };
  }
  if (s.fimDeTurno && parada < 5 * MIN) return { estado: 'esperando', acao: 'Esperando você', desde };
  if (parada < 2 * MIN) return { estado: 'pensando', acao: 'Pensando…', desde };
  return { estado: 'parado', acao: 'Parado', desde };
}

export function chamadasAbertas(s) {
  return [...s.chamadas.values()];
}
