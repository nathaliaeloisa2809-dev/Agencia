# Prédio IA — Fase 1 (Prédio ao vivo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um servidor local que lê ao vivo todos os projetos e sessões do Claude Code e uma página 2D (visual do protótipo aprovado) que mostra cada projeto como um andar, com os funcionários de `.claude/agents` e os visitantes trabalhando de verdade. Nesta fase ainda não rodamos agentes.

**Architecture:** Node ESM puro. O `Monitor` varre `~/.claude/projects` a cada 1,5 s, lê só os bytes novos de cada `.jsonl`, reduz cada linha num estado de sessão e monta um "retrato" do prédio (`montarEstado`). O servidor HTTP entrega a página e o retrato e manda as mudanças por WebSocket. A página só desenha e envia comandos (renomear prédio, apelido, ocultar, juntar andares).

**Tech Stack:** Node 26 (ESM, `node:test`), `ws@8.18.0` (única dependência), canvas 2D no navegador, sem build.

**Spec:** `docs/superpowers/specs/2026-11-10-predio-ia-design.md`, seções 3–6, 11 e 13. Fase 1 da seção 15.

## Global Constraints

- Todo texto visível, nome de função, mensagem de erro e commit em **português**.
- Raiz do projeto: `C:\Users\User\OneDrive\Área de Trabalho\predio-ia\`. Os caminhos abaixo são relativos a ela.
- O servidor escuta **somente `127.0.0.1:4777`**. Toda rota `/api/*` e o WebSocket exigem o token gerado na partida: header `x-token` ou `?t=`.
- **Leitura apenas:** a Fase 1 nunca escreve em pasta de projeto nem em `~/.claude`. Só escreve em `dados/predio.json`.
- Relógio sempre em `America/Sao_Paulo`. "Noite" = hora < 6 ou ≥ 18.
- **Ignorar:** cwd igual a `os.homedir()`, e qualquer cwd que contenha `\scratch-workspaces\` ou cuja pasta em `~/.claude/projects` contenha `-scratch-`.
- **Todos os funcionários de um projeto ficam no mesmo andar.** O andar cresce para caber: `fileiras = max(2, ceil((funcionarios + 2) / 4))`, com 4 mesas por fileira.
- Linha de `.jsonl` inválida é ignorada sem derrubar nada.
- Dependências fixas: `ws@8.18.0`. Nada mais.

## Review Focus

1. **`.jsonl` de vários MB:** a primeira leitura de uma sessão antiga não pode travar o servidor. Sessões com `mtime` acima de 30 min só têm o cwd e o título lidos (os primeiros 64 KB, mais a varredura de `ai-title`), sem reduzir tudo. Teste no Task 8: `ignora corpo de sessões antigas`.
2. **Linha cortada no meio** (o Claude ainda está escrevendo): o leitor guarda o pedaço e só processa quando chega o `\n`. Teste no Task 2: `junta linha parcial na leitura seguinte`.
3. **Projeto cuja pasta sumiu** (renomeada ou apagada): o andar continua, com `pastaExiste: false`, e nada quebra ao tentar ler `.claude/agents`. Teste no Task 5: `andar com pasta inexistente`.
4. **Nome de prédio ou apelido vazio ou enorme:** a API recusa vazio com 400 e corta em 40 caracteres. Teste no Task 9.
5. **Caminhos com acento e espaço** (`Área de Trabalho`, `Conteudo May`): todos os testes de fixture usam uma pasta temporária com `Área de Trabalho` no nome. Testes nos Tasks 4 e 5.

---

## Estrutura de arquivos

```
package.json                 scripts: test, start
iniciar.cmd                  node servidor\main.js
servidor/
  config.js                  carregar/salvar dados/predio.json
  jsonl.js                   leitura incremental de .jsonl
  funcionarios.js            .claude/agents, tipo do projeto, skills
  descoberta.js              pastas de ~/.claude/projects → projetos {pasta, cwd, arquivos}
  andares.js                 registro estável de andares (identidade, renomear, subpastas, sugestões)
  sessoes.js                 redutor: linha → estado da sessão; estadoAtual()
  relogio.js                 hora de Brasília
  estado.js                  montarEstado(): retrato do prédio para a página
  monitor.js                 classe Monitor (junta tudo; varredura incremental)
  servidor.js                HTTP + WebSocket + rotas
  main.js                    sobe tudo e abre o navegador
  test/                      *.test.js + fixtures criadas em pasta temporária
web/
  index.html  estilo.css
  caminho.js                 findPath (puro, testado no Node)
  layout.js                  gerarLayout() (puro, testado no Node)
  sprites.js                 sprites pixel art (vindos do protótipo)
  mapa.js                    desenha um andar a partir do layout
  app.js                     WebSocket, câmera, bonecos, painéis
```

---

### Task 1: Projeto e configuração

**Files:**
- Create: `package.json`, `servidor/config.js`, `servidor/test/config.test.js`

**Interfaces:**
- Produces:
  - `carregarConfig(caminho: string): Config`
  - `salvarConfig(caminho: string, cfg: Config): void`, gravando de forma atômica (escreve `.tmp` e depois `rename`)
  - `Config = { nome: string, ocultos: string[], apelidos: {[id]: string}, tipos: {[id]: 'linha-producao'|'fila'|'biblioteca'}, andares: {[id]: RegistroAndar} }`

- [ ] **Step 1:** Criar `package.json` com `"type": "module"`, `"scripts": {"test": "node --test servidor/test/ web/test/", "start": "node servidor/main.js"}` e a dependência `"ws": "8.18.0"`. Rodar `npm install`.
- [ ] **Step 2: Escrever os testes que falham**
  - `config padrão quando não existe arquivo`: `carregarConfig(tmp/'x.json')` deve dar `{nome:'Prédio IA', ocultos:[], apelidos:{}, tipos:{}, andares:{}}`.
  - `salva e relê`: muda `nome` para `'Torre May'`, salva e relê, e o valor se mantém. Não pode sobrar arquivo `.tmp` na pasta.
  - `arquivo corrompido volta ao padrão`: escreve `{quebrado` e o resultado é o padrão, sem lançar erro.
  - `campos faltando são completados`: um arquivo com só `{"nome":"X"}` traz `ocultos: []`.
- [ ] **Step 3:** Rodar `npm test`. Esperado: os testes falham porque `config.js` não existe.
- [ ] **Step 4:** Implementar `servidor/config.js`. `salvarConfig` cria a pasta se não existir.
- [ ] **Step 5:** Rodar `npm test`. Esperado: PASS.
- [ ] **Step 6:** Commit `Configuração do prédio (dados/predio.json)`.

### Task 2: Leitor incremental de `.jsonl`

**Files:**
- Create: `servidor/jsonl.js`, `servidor/test/jsonl.test.js`

**Interfaces:**
- Produces:
  - `lerNovasLinhas(arquivo: string, cursor: {offset: number, resto: string}): {objetos: object[], cursor}`
    - Lê de `offset` até o fim, em `utf8`, e junta com o `resto` da leitura anterior.
    - Só processa linhas completas. Linha que não é JSON é descartada.
    - O cursor inicial é `{offset: 0, resto: ''}`.
    - Se o arquivo encolheu (`size < offset`), recomeça do zero.
  - `lerInicio(arquivo: string, bytes = 65536): object[]`, com as linhas completas do começo do arquivo.

- [ ] **Step 1: Testes que falham**
  - `lê linhas completas`
  - `junta linha parcial na leitura seguinte`: escreve `{"a":1}\n{"b":` e depois `2}\n`. A primeira leitura devolve 1 objeto e a segunda devolve `{b:2}`.
  - `ignora linha inválida`
  - `arquivo encolhido recomeça`
  - `lida com acento`: a string `"Área"` dividida entre duas escritas, com o corte no meio do caractere UTF-8, sai intacta. Para isso, o leitor trabalha em `Buffer` e só decodifica linhas completas, guardando `resto` como Buffer em base64 ou como `Buffer`.
- [ ] **Step 2:** Rodar `npm test`. Esperado: FAIL.
- [ ] **Step 3:** Implementar com `fs.openSync`/`readSync` a partir do offset. Não usar `readFileSync` do arquivo inteiro.
- [ ] **Step 4:** Rodar `npm test`. Esperado: PASS.
- [ ] **Step 5:** Commit `Leitura incremental das sessões`.

### Task 3: Funcionários, tipo do projeto e skills

**Files:**
- Create: `servidor/funcionarios.js`, `servidor/test/funcionarios.test.js`

**Interfaces:**
- Produces:
  - `lerFrontmatter(texto: string): {[chave]: string}`. Entende só blocos `---` no topo com linhas `chave: valor` de uma linha. É suficiente para os arquivos atuais e não precisa de dependência YAML.
  - `lerFuncionarios(cwd: string): {nome, descricao, ferramentas: string[]}[]`
    - Lê os `.claude/agents/*.md` em ordem alfabética.
    - `nome` vem do frontmatter `name` ou, na falta dele, do nome do arquivo.
    - `ferramentas` vem de `tools`, separando por vírgula.
    - Devolve `[]` se a pasta não existir.
  - `detectarTipo(cwd: string): 'linha-producao'|'biblioteca'|'fila'`
    - `linha-producao`: existe `sistema/pipeline.js` e o `package.json` tem `scripts.status`.
    - `biblioteca`: não existe `.claude/agents` e há ≥ 3 arquivos `SKILL.md` até a profundidade 4, ignorando `node_modules` e `.git`.
    - `fila`: os demais casos, inclusive pasta inexistente.
  - `listarSkills(cwd: string): {nome, descricao}[]`. Lista as pastas que contêm `SKILL.md` (profundidade ≤ 4), sem repetir nome, em ordem alfabética.

- [ ] **Step 1: Testes que falham** (fixture em `os.tmpdir()/Área de Trabalho/...`)
  - `lê os funcionários`: 3 agentes, sendo um sem `name`; confere nome, descrição e ferramentas `['Read','Write']`.
  - `sem pasta de agentes`: devolve `[]`.
  - `detecta linha de produção`, `detecta biblioteca` (4 SKILL.md), `pasta inexistente é fila`.
  - `lista skills sem repetir`: o mesmo nome em dois lugares aparece uma vez só.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Funcionários, tipo de projeto e skills`.

### Task 4: Descoberta de projetos

**Files:**
- Create: `servidor/descoberta.js`, `servidor/test/descoberta.test.js`

**Interfaces:**
- Consumes: `lerInicio` (Task 2)
- Produces: `listarProjetos(dirProjetos: string, {home = os.homedir()} = {}): {pasta: string, cwd: string, sessoes: {id, arquivo, mtimeMs, dirSubagentes}[]}[]`
  - Cada subpasta de `dirProjetos` com pelo menos um `.jsonl` vira um projeto.
  - O `cwd` vem do primeiro objeto com campo `cwd`, buscado com `lerInicio` no `.jsonl` mais recente; se não achar, tenta os outros.
  - `dirSubagentes` = `<pasta>/<id>/subagents` quando existir.
  - Aplica as regras de "Ignorar" das Global Constraints.

- [ ] **Step 1: Testes que falham** (fixture com uma pasta falsa de projetos e `.jsonl` escritos à mão)
  - `encontra projeto e cwd`, com cwd `C:\\…\\Área de Trabalho\\Conteudo May`.
  - `ignora scratch e home`.
  - `pasta sem jsonl é ignorada`.
  - `lista subagentes`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Descoberta dos projetos do Claude Code`.

### Task 5: Registro estável de andares

**Files:**
- Create: `servidor/andares.js`, `servidor/test/andares.test.js`

**Interfaces:**
- Consumes: `listarProjetos` (formato do Task 4), `Config` (Task 1)
- Consumes: `lerFuncionarios` (Task 3)
- Produces:
  - `RegistroAndar = {id, caminhos: string[], identidade: string, criadoEm: number, cor: string, funcionarios: string[]}`
  - `identidade(cwd: string): string`, que tenta nesta ordem:
    1. `'git:' + <primeiro commit>`, de `git -C <cwd> rev-list --max-parents=0 HEAD` via `execFileSync`, com timeout de 3 s e silenciando erros;
    2. `'fp:' + sha1(nomes de .claude/agents ordenados + conteúdo do CLAUDE.md)`, se algum dos dois existir;
    3. `'cwd:' + sha1(cwd em minúsculas)`.
  - `reconciliar(cfg: Config, projetos, {existe = fs.existsSync, calcIdentidade = identidade, agora = Date.now} = {}): {cfg, andares: AndarResolvido[], sugestoes: {de, para}[]}`
    - **Não muta** `cfg`: devolve uma cópia atualizada.
    - `AndarResolvido = {id, nome, cwd, pastaExiste, cor, projetos: Projeto[]}`

Regras do `reconciliar`, nesta ordem, para cada projeto:
1. Se o `cwd` está dentro do `cwd` de outro projeto da lista (prefixo + separador, sem diferenciar maiúsculas), o projeto entra no andar do pai.
2. Se algum registro já tem esse `cwd` em `caminhos`, usa esse andar.
3. Senão, calcula a identidade. Se algum registro tem a mesma identidade e o caminho atual dele não existe mais, é **pasta renomeada**: o `cwd` novo vai para o fim de `caminhos`.
4. Senão, cria um registro novo:
   - `id` = 8 caracteres hexadecimais aleatórios;
   - `cor` = `PALETA[hash(nome) % PALETA.length]`, com `PALETA = ['#ff7a59','#5b7cff','#2fb07f','#e85d9a','#e0a400','#00a8c0','#8e6bff','#c0504d']`.

Depois de processar todos:
- Gera uma **sugestão** quando um andar tem a pasta atual inexistente e um andar criado nesta rodada tem ≥ 70% dos **nomes de funcionários** em comum com ele. Para comparar com a pasta antiga, que já não existe, o registro guarda `funcionarios: string[]`, atualizado sempre que a pasta existe. Sem funcionários, não há sugestão.
- `nome` = apelido, ou o último segmento do último caminho.
- `ocultos` não aparecem em `andares`.
- A ordem é por `criadoEm`.

- [ ] **Step 1: Testes que falham**
  - `cria andar novo com cor da paleta`
  - `mesmo cwd reaproveita o andar`
  - `subpasta entra no andar pai`: `…\skills\.agents\skills` cai em `…\skills`.
  - `pasta renomeada mantém o id`: o registro tem o caminho `…\Conteudo May`, que não existe mais; um projeto novo em `…\Conteudo Maio` com a mesma identidade fica com o mesmo `id` e o nome `Conteudo Maio`.
  - `andar com pasta inexistente`: `pastaExiste: false` e não lança erro.
  - `oculto some da lista`
  - `apelido substitui o nome`
  - `sugere juntar quando os funcionários batem`
  - `não muta a config original`
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar. Nos testes, `existe` e `calcIdentidade` são injetados; o git real não é chamado.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Andares com identidade estável (renomear, subpastas, sugestões)`.

### Task 6: Estado de uma sessão

**Files:**
- Create: `servidor/sessoes.js`, `servidor/test/sessoes.test.js`

**Interfaces:**
- Produces:
  - `criarSessao(id: string): Sessao`
  - `aplicar(s: Sessao, obj: object): void`, que reduz uma linha do `.jsonl`
  - `estadoAtual(s: Sessao, agora: number): {estado, acao, desde}`
  - `chamadasAbertas(s: Sessao): {toolUseId, funcionario: string|null, descricao, inicio}[]`
  - `Sessao` guarda: `titulo`, `ultima` (ms do último `timestamp`), `ferramentaAberta {id, nome, input, inicio}|null`, `fimDeTurno: boolean`, `mensagens: {u: boolean, t: string}[]` (as últimas 6), `arquivos: string[]` (os últimos 20 alterados, sem repetir), `chamadas: Map`.

**Regras de `aplicar`:**
- `type: 'ai-title'` → `titulo = aiTitle`.
- `type: 'user'` com `message.content` string → mensagem `{u: true}`, cortada em 280 caracteres. Se ainda não há título, o título vira os primeiros 60 caracteres. Também zera `fimDeTurno`.
- `type: 'user'` com array contendo `tool_result` → fecha `ferramentaAberta` se o id bater, e fecha a chamada em `chamadas` com o mesmo `tool_use_id`.
- `type: 'assistant'`:
  - cada `text` vira mensagem `{u: false}`;
  - cada `tool_use` vira `ferramentaAberta`;
  - quando `name` é `Write`/`Edit`/`MultiEdit`/`NotebookEdit`, o `input.file_path` vai para `arquivos`;
  - quando `name` é `Agent`/`Task`, abre uma chamada com `funcionario = input.subagent_type` (se não for `general-purpose`) ou com o nome extraído do primeiro `/\.claude[\\/]+agents[\\/]+([\w-]+)\.md/` do `input.prompt`; caso contrário, `null`;
  - `fimDeTurno = message.stop_reason === 'end_turn'`.
- Toda linha com `timestamp` atualiza `ultima`. As demais linhas são ignoradas.

**Regras de `estadoAtual`, na ordem:**

| Condição | Estado |
|---|---|
| `agora - ultima > 30 min` | `encerrada` |
| ferramenta aberta `Bash`/`PowerShell`/`Write`/`Edit` há mais de 60 s sem linha nova | `precisa`, com ação `Talvez esperando permissão no terminal` |
| ferramenta aberta `Write`/`Edit`/`MultiEdit`/`NotebookEdit` | `escrevendo` |
| ferramenta aberta `Read`/`Grep`/`Glob`/`WebFetch`/`WebSearch` | `lendo` |
| ferramenta aberta `Bash`/`PowerShell` | `terminal` |
| ferramenta aberta `Agent`/`Task` | `delegando` |
| qualquer outra ferramenta aberta | `trabalhando` |
| `fimDeTurno` e `agora - ultima < 5 min` | `esperando` |
| `agora - ultima < 2 min` | `pensando` |
| nenhum dos anteriores | `parado` |

**Texto da `acao`:**
- `Editando <basename>`
- `Lendo <basename>`
- `Buscando "<pattern>"`
- `Procurando <pattern>`
- `$ <command, primeiros 60 caracteres>`
- `Chamando <funcionario ou description>`
- `Abrindo <host da url>`
- `Esperando você`
- `Pensando…`
- `Parado`
- caso contrário, o nome da ferramenta

- [ ] **Step 1: Testes que falham.** As linhas são montadas no formato real: `{type:'assistant', timestamp, message:{content:[{type:'tool_use', id:'t1', name:'Edit', input:{file_path:'C:\\x\\peca.md'}}], stop_reason:'tool_use'}}`.
  - um teste para cada linha da tabela de estados;
  - `título por ai-title vence a primeira mensagem`;
  - `subagente por subagent_type`;
  - `subagente pelo caminho no prompt`;
  - `general-purpose sem caminho dá funcionario null`;
  - `tool_result fecha ferramenta e chamada`;
  - `guarda só 6 mensagens`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Estado ao vivo de cada sessão`.

### Task 7: Relógio e retrato do prédio

**Files:**
- Create: `servidor/relogio.js`, `servidor/estado.js`, `servidor/test/estado.test.js`

**Interfaces:**
- Consumes: `AndarResolvido` (Task 5), `Sessao` e as funções do Task 6, `lerFuncionarios`, `detectarTipo` e `listarSkills` (Task 3)
- Produces:
  - `horaBrasilia(data: Date): {hora: 'HH:MM', data: 'AAAA-MM-DD', noite: boolean}`, via `Intl.DateTimeFormat('pt-BR', {timeZone: 'America/Sao_Paulo', …})`.
  - `montarEstado({cfg, andares, sessoesPorPasta: Map<pasta, Map<id, {sessao, subagentes: Map<toolUseId, Sessao>}>>, infoPorAndar: Map<id, {funcionarios, tipo, skills}>, agora}): Retrato`

```
Retrato = {
  predio: {nome},
  relogio: {hora, data, noite},
  andares: [{
    id, numero, nome, cor, tipo, pastaExiste,
    funcionarios: [{nome, descricao, estado, acao, desde, mensagens, arquivos}],
    visitantes:   [{id, titulo, estado, acao, desde, mensagens, arquivos}],
    estagiarios:  [{id, descricao, chamadoPor, estado, acao}],
    skills:       [{nome, descricao}]
  }],
  execucao:  [{andarId, andar, quem, tipo: 'funcionario'|'visitante'|'estagiario', acao, desde}],
  sugestoes: [{de, para, deNome, paraNome}]
}
```

**Regras:**
- `numero` vai de 1 a N, na ordem dos andares.
- `tipo` = `cfg.tipos[id]`, ou `detectarTipo`.
- **Funcionário:** se existe uma chamada aberta, em qualquer sessão não encerrada do andar, cujo `funcionario` é o nome dele, então:
  - o estado e a ação vêm de `estadoAtual` da sessão do subagente, ligada pelo `toolUseId`;
  - se o subagente ainda não tem arquivo, o estado é `trabalhando` e a ação é a `descricao`;
  - as mensagens e os arquivos vêm da sessão do subagente.
  - Sem chamada aberta, o estado é `parado` e a ação é `Sem trabalho agora`.
- **Visitante:** toda sessão principal com estado diferente de `encerrada`.
- **Estagiário:** chamada aberta com `funcionario` null, ou com um nome que não existe no andar.
- **`execucao`:** todos com estado diferente de `parado` e `encerrada`, ordenados por `desde`.

- [ ] **Step 1: Testes que falham**
  - `hora de Brasília`: `new Date('2026-11-10T21:30:00Z')` dá `{hora: '18:30', data: '2026-11-10', noite: true}`.
  - `funcionário acende pela chamada do terminal`: uma sessão visitante com uma chamada aberta `roteirista` faz o funcionário `roteirista` aparecer como `escrevendo` quando o subagente tem um `Edit` aberto.
  - `funcionário sem chamada fica parado`
  - `sessão encerrada não vira visitante`
  - `estagiário para general-purpose`
  - `execução ordenada e sem parados`
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Retrato do prédio e relógio de Brasília`.

### Task 8: Monitor (varredura incremental)

**Files:**
- Create: `servidor/monitor.js`, `servidor/test/monitor.test.js`

**Interfaces:**
- Consumes: Tasks 2–7
- Produces: `class Monitor { constructor({dirProjetos, caminhoConfig, agora = Date.now, home}); atualizar(): Retrato; getConfig(): Config; setConfig(fn: (cfg) => cfg): void }`
  - `setConfig` aplica a função, salva com `salvarConfig` e invalida o cache.

**Regras de `atualizar()`:**
1. `listarProjetos`.
2. `reconciliar`. Se a config mudou, salva.
3. Para cada sessão:
   - se `mtimeMs` é mais recente que `agora - 30 min`, lê só as linhas novas com o cursor guardado;
   - se não, lê uma única vez só o `lerInicio` (para o título) e marca como encerrada.
4. Faz o mesmo com os `.jsonl` de subagentes, ligando cada um ao `toolUseId` do `.meta.json` vizinho.
5. Funcionários, tipo e skills de cada andar ficam em cache por 30 s.
6. `montarEstado`.

- [ ] **Step 1: Testes que falham** (fixture completa em `tmp/Área de Trabalho`: pasta de projetos falsa + pasta de projeto com `.claude/agents/roteirista.md`)
  - `primeiro retrato`: 1 andar com o funcionário `roteirista` `parado`.
  - `acompanha append`: acrescenta no `.jsonl` uma linha `Agent` com `subagent_type: 'roteirista'` e depois chama `atualizar()`; o roteirista aparece como `trabalhando` e consta em `execucao`.
  - `ignora corpo de sessões antigas`: um `.jsonl` de 5 MB com `mtime` de 2 h atrás; espiona `lerNovasLinhas` e confere que não foi chamado.
  - `setConfig renomeia o prédio`: `retrato.predio.nome === 'Torre May'` e o arquivo foi salvo.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Monitor ao vivo do prédio`.

### Task 9: Servidor HTTP + WebSocket

**Files:**
- Create: `servidor/servidor.js`, `servidor/main.js`, `iniciar.cmd`, `servidor/test/servidor.test.js`

**Interfaces:**
- Consumes: `Monitor` (Task 8)
- Produces: `iniciarServidor({monitor, token, porta = 4777, dirWeb, intervaloMs = 1500}): Promise<{porta, fechar()}>`

**Rotas:**

| Rota | Comportamento |
|---|---|
| `GET /` e arquivos de `web/` | Estáticos, sem token. Não deixa sair de `dirWeb` (`..` dá 404). |
| `GET /api/estado` | O retrato |
| `POST /api/nome` `{nome}` | `trim`; vazio dá 400; corta em 40 caracteres |
| `POST /api/andares/:id/apelido` `{apelido}` | Apelido vazio remove o apelido |
| `POST /api/andares/:id/ocultar` `{oculto: boolean}` | Oculta ou mostra o andar |
| `POST /api/juntar` `{de, para}` | Os `caminhos` do registro `para` vão para o fim dos de `de`, e o registro `para` é apagado |
| `WS /ws?t=` | Ao conectar, manda `{tipo: 'estado', estado}`. A cada `intervaloMs`, chama `monitor.atualizar()` e manda de novo só se o JSON mudou. |

- Toda rota `/api` e o WebSocket sem o token correto respondem 401 ou têm a conexão fechada.
- `main.js`:
  - `token = randomBytes(16).toString('hex')`;
  - `dirProjetos = ~/.claude/projects`;
  - `caminhoConfig = dados/predio.json`;
  - abre `http://127.0.0.1:4777/?t=<token>` com `start "" <url>` (via `cmd /c`);
  - se a porta estiver ocupada, escreve `A porta 4777 já está em uso — o prédio já está aberto?` e sai com código 1.
- `iniciar.cmd`: `@echo off`, `cd /d "%~dp0"`, `node servidor\main.js`.

- [ ] **Step 1: Testes que falham** (porta 0 + Monitor de fixture)
  - `estado exige token`
  - `renomeia o prédio`
  - `nome vazio dá 400`
  - `nome longo é cortado em 40`
  - `oculta andar`
  - `junta andares`
  - `não serve fora de web/`
  - `ws recebe estado ao conectar`
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar com `node:http` e `ws`.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Servidor local do prédio`.

### Task 10: Layout do andar (cresce para caber todos)

**Files:**
- Create: `web/caminho.js`, `web/layout.js`, `web/test/layout.test.js`

**Interfaces:**
- Produces:
  - `findPath(grade: {largura, altura, bloqueado: Uint8Array}, x0, y0, x1, y1): {x, y}[]`. É a BFS do protótipo (`prototipo/index.html`, função `findPath`), recebendo a grade como parâmetro.
  - `gerarLayout({funcionarios: number, tipo, skills: number}): Layout`

```
Layout = {
  largura, altura, bloqueado,
  mesas:     [{c, r, sx, sy}],
  copa:      [{x, y, dir}],
  lounge:    [{x, y, dir}],
  visitas:   [{x, y, dir}],
  estantes:  [{c, r}],
  elevador:  {x, y},
  moveis:    [{tipo, c, r}],
  salas:     {...}
}
```

**Regras** (derivadas do `makeFloor` do protótipo):
- Largura fixa de 40.
- Mesas nas colunas `[3, 8, 13, 18]` e nas linhas `6 + 5*i`.
- `fileiras = max(2, ceil((funcionarios + 2) / 4))`.
- O lounge começa em `r = 6 + 5*fileiras + 1`.
- `altura = max(26, rLounge + 8)`.
- A copa e a sala de foco ficam no lado direito, nas mesmas posições do protótipo.
- As vagas de visitante são as cadeiras da sala de foco: 10 vagas.
- Vagas de copa e lounge somam pelo menos 12.
- **Tipo biblioteca:** sem mesas; estantes em fileiras de 5 (colunas `3 + 4*k`), `ceil(skills / 4)` estantes, cada uma com até 4 skills.

- [ ] **Step 1: Testes que falham**
  - `18 funcionários dá 20 mesas`
  - `nenhum funcionário dá 8 mesas`
  - `andar cresce`: com 30 funcionários, `altura > 26`.
  - `toda mesa é alcançável`: para cada mesa, `findPath` do elevador até `(sx, sy)` termina num ponto a menos de 1 tile da mesa, e nunca no fallback em linha reta. Para isso, `findPath` devolve `null` quando não há caminho, e o teste exige que não seja `null`.
  - `toda vaga de visita é alcançável`
  - `biblioteca com 27 skills tem 7 estantes`
- [ ] **Step 2:** Rodar `npm test`. Esperado: FAIL.
- [ ] **Step 3:** Implementar. `findPath` passa a devolver `null` sem caminho, e quem chama decide o que fazer.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Layout do andar que cresce com a equipe`.

### Task 11: Página do prédio

**Files:**
- Create: `web/index.html`, `web/estilo.css`, `web/sprites.js`, `web/mapa.js`, `web/app.js`

**Interfaces:**
- Consumes:
  - o `Retrato` (Task 7), pelo WebSocket `/ws?t=<token>`; o token vem de `?t=` na URL;
  - as rotas do Task 9, com o header `x-token`;
  - `gerarLayout` e `findPath` (Task 10).
- Produces: a página.

**O que vem do protótipo e o que muda:**
- **`sprites.js`:** `outline`, `makeSprite`, `avatarSprite` e todos os sprites de móveis, copiados do `prototipo/index.html` e exportados.
  - Muda só uma coisa: o visual do boneco passa a ser **determinístico**, com `newLook(cor, semente)`, onde a semente é o hash de `andarId + nome`. Assim cada funcionário tem sempre a mesma cara.
- **`mapa.js`:** `desenharAndar(layout, andar) → {cv, ents, luzes, janelas}`.
  - É o `makeFloor` do protótipo, mas lendo as posições do `Layout` em vez de constantes.
  - Placa da parede com `andar.nome`.
  - No tipo biblioteca, desenha as estantes com o nome de cada skill numa plaquinha (fonte `Press Start 2P` 6px) e não desenha mesas.
  - O térreo continua igual ao protótipo.
- **`app.js`:**
  - **Bonecos:**
    - funcionário → mesa `i` (pela ordem do array) no andar dele;
    - visitante e estagiário → vagas `visitas`;
    - quem tem estado `parado` vai andando até uma vaga livre de copa ou lounge; sem vaga livre, fica na mesa.
  - Quando o estado muda, o boneco caminha (`findPath`) e não teleporta.
  - Bonecos que somem do retrato saem andando até o elevador.
  - **Estado → animação** (a mesma do protótipo):

    | Estado | Animação |
    |---|---|
    | `escrevendo`, `pensando`, `trabalhando` | digitando |
    | `lendo`, `delegando` | lendo |
    | `terminal` | terminal |
    | `precisa`, `esperando` | balão "!" |
    | `parado` | café |

  - **Painel PRÉDIO:** usa `andares` do retrato. Andar com `pastaExiste: false` mostra a etiqueta "pasta não encontrada".
  - **Painel do boneco:** cargo ou título, estado, ação, mensagens e arquivos alterados. Para visitante em `esperando` ou `precisa`, mostra o aviso **"Responda no terminal"**.
  - **Barra de ações:**

    | Botão | O que faz |
    |---|---|
    | 🔎 Em execução | Modal com `retrato.execucao`, mostrando quem, andar, ação e "há X min". Clicar num item leva ao andar e segue o boneco. |
    | 🕐 | Hora de Brasília, sempre visível, a partir de `retrato.relogio`. Atualiza a cada segundo localmente, recalibrando no próximo retrato. |
    | ✏️ Nome | Modal com input → `POST /api/nome`. O nome aparece no topo, no hall (placa do térreo) e em `document.title`. |
    | ⚙️ Ajustes | Lista de andares com campo de apelido e caixa "ocultar". |
    | 🌙 | Removido: dia e noite vêm de `relogio.noite`. |

  - **Sugestões de juntar:** faixa no topo, "Parece que *X* virou *Y*. Juntar?", com os botões **Juntar** (`POST /api/juntar`) e **Agora não** (esconde até recarregar a página).
  - Andar novo no retrato → faixa "EM OBRA…" por 2,6 s no painel PRÉDIO, como no protótipo.
  - **Sem conexão:** faixa "Sem conexão com o prédio — tentando de novo…"; reconecta a cada 2 s.
  - **Sem simulação:** a barra de comando e o "＋ Simular pasta nova" **não entram nesta fase**. Nada na página inventa estado.

- [ ] **Step 1:** Montar `sprites.js` e `mapa.js` a partir do protótipo e conferir no navegador, com um retrato fixo de teste em `web/teste.html`, que um andar com 18 funcionários desenha 20 mesas e uma biblioteca desenha estantes.
- [ ] **Step 2:** Montar `app.js` e `index.html` ligados ao servidor real (`npm start`).
- [ ] **Step 3: Verificação manual com os dados reais**
  - O andar **Conteudo May** mostra 18 funcionários com os nomes de `.claude/agents`.
  - **skills** aparece como biblioteca, com as skills nas estantes, e não existe um andar separado para `skills\.agents\skills`.
  - O **Anti** não aparece.
  - O relógio bate com a hora de Brasília.
- [ ] **Step 4:** Verificação ao vivo: numa sessão do Claude Code na pasta Conteudo May, pedir "leia o CLAUDE.md". Em até 3 s, um visitante aparece no andar com o estado `lendo`.
- [ ] **Step 5:** Verificação de renomear o prédio: ✏️ → "Torre May" → recarregar a página; o nome continua.
- [ ] **Step 6:** Commit `Página do prédio ao vivo`.
