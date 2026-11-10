# Prédio IA — Fase 2 (Produção e expediente) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os funcionários trabalham de verdade dentro do expediente (7h–16h de Brasília): a Conteudo May abre as peças do calendário e passa cada uma pela linha de produção até "aguardando aprovação". As entregas são copiadas para `predio-ia/entregas/`. O dono acompanha, dá tarefas na hora e para trabalhos pelo prédio.

**Architecture:** Um `Producao` (no servidor) roda a cada 5 s:
1. pergunta ao **adaptador** do andar o que há para fazer;
2. o **agendador** (função pura, com relógio injetável) decide o que começa, respeitando expediente, pausas, meta do dia, limite de 3 agentes ao mesmo tempo e as regras da May;
3. o **executor** sobe um `claude -p --agent <nome>` por trabalho, sempre numa sessão nova (caixa de contexto enxuta), e lê o `stream-json` ao vivo.

O `Monitor` da Fase 1 passa a saber quais sessões são de qual funcionário, pelo registro `sessionId → funcionário` que o executor mantém.

**Tech Stack:** Node 26 ESM, `node:test`, `node:child_process`, Claude Code CLI (`claude -p`) com o login do dono, `ws@8.18.0`.

**Spec:** `docs/superpowers/specs/2026-11-10-predio-ia-design.md`, seções 7 (inclusive 7.7 e 7.8), 8, 9, 10 e 11.

## Global Constraints

- Tudo em português (textos, nomes, erros, commits). A raiz é `predio-ia/`.
- **Linha de comando do executor:**
  ```
  claude -p "<instrução>" --agent <nome> --output-format stream-json --verbose --permission-mode acceptEdits --setting-sources project --add-dir "<predio-ia/entregas/<Empresa>>"
  ```
  O `cwd` é a pasta do projeto. Não se passa `--allowedTools`: as ferramentas vêm da ficha do agente.
- **Expediente (America/Sao_Paulo):**
  - de segunda a sexta, das 07:00 às 16:00;
  - almoço das 12:00 às 13:00;
  - pausa das 15:00 às 15:15;
  - fins de semana sem expediente.
  - Nada começa fora do expediente, exceto trabalho na hora confirmado pelo dono. Quem está trabalhando termina o passo atual.
- **Limite:** no máximo 3 trabalhos rodando no prédio inteiro, com a Conteudo May primeiro.
- **Regras da linha de produção da May:**
  - nunca dois trabalhos na mesma peça;
  - `revisor-qualidade` e `ideias-criativas` trabalham um de cada vez;
  - `estoque` roda antes de `ideias-criativas` ao abrir dias;
  - nunca chamar `publicacao`.
- **Limites do prédio:**
  - O prédio nunca edita `status`, `revisoes`, `motivo_devolucao` nem `aviso` de peça.
  - Só **lê** o projeto, via `lerPeca` e `proximoAgente` importados de `sistema/`, e roda `npm run status`.
- **Contexto enxuto:** uma sessão nova por trabalho, nunca `--resume`. Um trabalho que passar de 40 turnos é encerrado e continua numa sessão nova com o `PASSAGEM.md`.
- **Entregas:** `predio-ia/entregas/<Nome do andar>/<AAAA-MM-DD> - <título>/`, sempre com `RESUMO.md`.
- **Limite do plano:** um `rate_limit_event` com `status` diferente de `allowed`, ou um `result` com erro de limite, faz o prédio entrar em **pausa forçada** até o horário de volta informado, ou por 30 min. Nada é tentado de novo em loop.

## Review Focus

1. **O processo `claude` some no meio** (o PC dorme, o dono fecha o terminal): o trabalho volta para a fila e o funcionário não fica "trabalhando" para sempre. Teste no Task 1: `processo que morre sem result vira falha`.
2. **Relógio virando de dia** durante um trabalho: a meta e as "peças de hoje" passam a usar o dia novo, e o trabalho em andamento não é contado duas vezes. Teste no Task 5: `virada do dia zera a meta`.
3. **Peça com cabeçalho quebrado** (`lerPeca` lança erro): o adaptador pula essa peça, registra o erro e não derruba a produção. Teste no Task 2: `peça inválida é pulada`.
4. **Servidor reiniciado com trabalhos rodando:** na partida, sessões órfãs do executor (registro em `dados/trabalhos.json` com status `rodando`) são marcadas como interrompidas e voltam para a fila. Teste no Task 7: `reinício devolve trabalhos para a fila`.
5. **Entrega com nome perigoso** (título com `/`, `:` ou `..`): o nome da pasta é limpo e nada é escrito fora de `entregas/`. Teste no Task 4: `título perigoso vira nome seguro`.

---

## Estrutura de arquivos

```
servidor/
  executor.js        sobe e acompanha um `claude -p`; emite eventos; parar()
  linha-producao.js  adaptador da Conteudo May (peças, dias sem peça, meta, npm run status)
  fila.js            tarefas do dono (dados/fila.json)
  instrucoes.js      monta a instrução enxuta de cada trabalho
  entregas.js        copia o resultado e escreve RESUMO.md
  expediente.js      horário de Brasília → fase do expediente
  agendador.js       decidir(): o que começa agora (puro)
  producao.js        classe Producao: junta tudo a cada 5 s; registro de trabalhos
  referencias.js     resumo diário do Instagram
  (alterados) estado.js, monitor.js, servidor.js, main.js
  test/fixtures/claude-falso.js   imita o stream-json do claude
web/ (alterados) app.js, estilo.css, index.html
```

---

### Task 1: Executor

**Files:** Create `servidor/executor.js`, `servidor/test/executor.test.js`, `servidor/test/fixtures/claude-falso.js`

**Interfaces:**
- Produces: `iniciarTrabalho({cwd, agente, instrucao, dirEntregas, comando = ['claude'], aoEvento = () => {}}): {parar(): void, fim: Promise<Fim>}`
  - `Fim = {ok: boolean, sessionId: string|null, resultado: string, turnos: number, limite: null | {ateMs: number}, erro: string|null}`
  - `aoEvento(e)`, com `e` em `{tipo: 'inicio', sessionId}`, `{tipo: 'ferramenta', nome, input}`, `{tipo: 'texto', texto}` ou `{tipo: 'limite', ateMs}`.
- O `claude-falso.js` lê `process.env.CENARIO` (`ok`, `limite`, `morre`, `erro`) e escreve no stdout as linhas JSON no formato real: `system/init` com `session_id`, `assistant` com `tool_use`, `rate_limit_event` e `result`.

- [ ] **Step 1: Testes que falham**
  - `trabalho ok devolve sessionId e resultado`
  - `emite ferramenta ao vivo`
  - `limite vira fim.limite`: `rate_limit_event` com `rate_limit_info: {status: 'rejected', resetsAt: <epoch s>}` dá `ateMs = resetsAt*1000`.
  - `processo que morre sem result vira falha`: `ok: false` e `erro` contém "sem resultado".
  - `parar encerra o processo`: `fim` resolve com `ok: false` e `erro: 'parado pelo dono'`.
  - `monta os argumentos certos`: o comando falso é um script que ecoa `process.argv` num `result`; confere `--agent`, `--setting-sources project`, `--add-dir` e que a instrução vai depois de `-p`.
- [ ] **Step 2:** `npm test`. Esperado: FAIL, porque o módulo não existe.
- [ ] **Step 3:** Implementar com `spawn(comando[0], [...comando.slice(1), ...args], {cwd, windowsHide: true})`.
  - Lê o stdout linha a linha (pode reaproveitar a lógica de linha completa do `jsonl.js`) e ignora linhas inválidas.
  - `parar()` usa `taskkill /pid <pid> /T /F` no Windows e `kill` nos demais sistemas.
- [ ] **Step 4:** `npm test`. Esperado: PASS.
- [ ] **Step 5:** Commit `Executor de agentes (claude -p --agent)`.

### Task 2: Adaptador da linha de produção

**Files:** Create `servidor/linha-producao.js`, `servidor/test/linha-producao.test.js` (fixture: cópia mínima de `sistema/pipeline.js` e de `sistema/peca.js` da May, numa pasta temporária `Área de Trabalho/Conteudo May`, mais `05-Calendario/2026-11.md` e duas peças)

**Interfaces:**
- Produces:
  - `pecas(cwd): {id, caminho, status, tipo, data, aviso, agente}[]`
    - Lê `06-Producao/*/*/peca.md` com o `lerPeca` do projeto (import dinâmico via `pathToFileURL`) e o `agente` com `proximoAgente`.
    - `data` = os 10 primeiros caracteres do `id`.
  - `trabalhosPendentes(cwd): {chave: 'peca:<id>', agente, peca}[]`, com `agente` diferente de `null` e de `publicacao`.
  - `diasSemPecas(cwd, datas: string[]): string[]`: datas que têm linhas no `05-Calendario/AAAA-MM.md` (linhas `| AAAA-MM-DD |`) e nenhuma peça com aquele prefixo.
  - `metaDoDia(cwd, data): {feitas, total, ok}`
    - `total` = linhas do calendário daquela data.
    - `feitas` = peças da data com status `aguardando-aprovacao`, `aprovado` ou `publicado` e `aviso` vazio.
    - `ok = total > 0 && feitas >= total`.
  - `rodarStatus(cwd): Promise<{ok: boolean, erros: string[]}>`. Roda `npm run status` e lê as linhas sob `Erros (N):`.

- [ ] **Step 1: Testes que falham**
  - `lê peças e o próximo agente`: status `ideia` dá `roteirista`.
  - `não oferece publicacao nem aguardando`
  - `peça inválida é pulada`: um peca.md sem `---` não lança erro e fica de fora.
  - `dias sem peças`: o calendário tem 10/11 e 11/11, a peça é de 10/11, o resultado é `['2026-11-11']`.
  - `meta do dia`: 2 de 3 dá `{feitas: 2, total: 3, ok: false}`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar. `rodarStatus` usa `execFile('npm', ['run', 'status'], {cwd, shell: true})` e é testado só pelo parse: exportar `lerSaidaStatus(texto)` e testá-lo com a saída real copiada para o teste.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Adaptador da linha de produção da May`.

### Task 3: Instruções enxutas (caixas de contexto)

**Files:** Create `servidor/instrucoes.js`, `servidor/test/instrucoes.test.js`

**Interfaces:**
- Produces: `instrucao(trabalho, {referencias = []}): string`
  - `trabalho.tipo` é um destes:
    - `{tipo: 'estacao', agente, peca: {id, caminho}}`
    - `{tipo: 'abrir-dias', agente: 'estoque'|'ideias-criativas', datas}`
    - `{tipo: 'tarefa', agente, texto, dirEntrega}`
    - `{tipo: 'continuar', original: Trabalho, passagem: string}`

**Textos (fixos):**
- **estacao:** `Trabalhe na peça {caminho}. Siga a sua ficha (Função, Lê, Entrega, Regras) e escreva só na sua seção. Ao terminar, avance o status como a ficha manda e pare.`
- **abrir-dias, estoque:** `Atualize o catálogo para as peças dos dias {datas}. Siga a sua ficha e pare ao terminar.`
- **abrir-dias, ideias-criativas:** `Abra as peças dos dias {datas} a partir do 05-Calendario, como no passo 2 do ciclo-semanal. Siga a sua ficha e pare ao terminar.`
- **tarefa:** `{texto}\n\nSalve o resultado final em {dirEntrega}. Ao terminar, escreva {dirEntrega}/PASSAGEM.md com: o que foi feito, o que falta e onde estão os arquivos.`
- **continuar:** a instrução original, mais `\n\nVocê está continuando um trabalho que já começou. Leia isto antes:\n{passagem}`
- **Referências:** quando há `referencias`, acrescenta `\n\nReferências (leia se for útil para o seu passo): {lista de caminhos}`.

- [ ] **Step 1:** Um teste para cada tipo, com o texto exato acima, mais `referências só quando existem`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Instruções enxutas por trabalho`.

### Task 4: Entregas

**Files:** Create `servidor/entregas.js`, `servidor/test/entregas.test.js`

**Interfaces:**
- Produces:
  - `pastaEntrega(raiz, nomeAndar, data, titulo): string`
    - O nome é limpo: troca `[\\/:*?"<>|]` e `..` por `-`, corta em 80 caracteres e remove o ponto final.
    - Sempre fica dentro de `raiz`.
  - `entregarPeca({raiz, andar, peca, cwd, inicio, fim, sessionIds}): string`
    - Copia o `peca.md` e os arquivos citados em `midias_reais`/`midias_geradas` que existirem.
    - Escreve o `RESUMO.md`: quem trabalhou, início, fim, a duração, o status final, o caminho original da peça e as sessões.
    - Devolve a pasta.
  - `escreverResumo(pasta, {quem, inicio, fim, status, origem, sessionIds}): void`. É usado pelo `entregarPeca` e, no fim de cada tarefa da fila, pelo Task 7.
  - `listarEntregas(raiz, data): {andar, titulo, pasta, quando}[]`

- [ ] **Step 1: Testes que falham**
  - `título perigoso vira nome seguro`: `'../x: y'` não sai de `raiz`.
  - `entrega copia peça e escreve resumo`
  - `lista entregas do dia`
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Entregas com RESUMO.md`.

### Task 5: Expediente e agendador

**Files:** Create `servidor/expediente.js`, `servidor/agendador.js`, `servidor/test/agendador.test.js`

**Interfaces:**
- Produces:
  - `faseDoExpediente(data: Date): {fase: 'fora'|'trabalho'|'almoco'|'pausa'|'fim-de-semana', volta: 'HH:MM'|null, data: 'AAAA-MM-DD'}`
  - `decidir({fase, rodando: Trabalho[], pendentes: Trabalho[], metaOk: Map<andarId, boolean>, pausaForcadaAte: number, agora: number, limite = 3}): Trabalho[]`, que devolve o que **começa** agora.
  - `Trabalho = {chave, andarId, agente, prioridade: number, peca?: string, naHora?: boolean}`

**Regras do `decidir`:**
- Se `agora < pausaForcadaAte`, nada começa.
- Se a fase não é `trabalho`, só começam os itens com `naHora`.
- Andar com `metaOk` só recebe `naHora`.
- Vagas = `limite - rodando.length`.
- Ordem: `naHora` primeiro, depois a menor `prioridade` (Conteudo May = 0, os outros = 1), depois a ordem de chegada.
- Pula o que já está rodando, quem repetiria uma `peca` que já está em `rodando`, e um segundo `revisor-qualidade` ou `ideias-criativas`.
- `ideias-criativas` de abrir dias só começa se não houver `estoque` de abrir dias pendente ou rodando.

- [ ] **Step 1: Testes que falham** (relógio fixo)
  - `07:00 de terça é trabalho`
  - `12:30 é almoço e volta às 13:00`
  - `15:10 é pausa`
  - `16:00 é fora`
  - `sábado é fim de semana`
  - `limite de 3`
  - `May tem prioridade`
  - `nunca duas na mesma peça`
  - `um revisor por vez`
  - `estoque antes de ideias`
  - `fora do expediente só na hora`
  - `meta batida para o andar`
  - `pausa forçada segura tudo`
  - `virada do dia zera a meta`: `faseDoExpediente` às 23:59 e às 00:01 devolvem datas diferentes, e o produtor usa `data` para a meta (o teste chama `metaDoDia` da fixture do Task 2 com as duas datas).
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar. `faseDoExpediente` reaproveita o `Intl` de `relogio.js` e acrescenta o dia da semana.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Expediente de Brasília e agendador`.

### Task 6: Fila de tarefas do dono

**Files:** Create `servidor/fila.js`, `servidor/test/fila.test.js`

**Interfaces:**
- Produces: `class Fila { constructor(caminho); adicionar({andarId, agente, texto, naHora}): Tarefa; pendentes(): Tarefa[]; marcar(id, estado, extra?); todas(): Tarefa[] }`
  - Persiste em `dados/fila.json`, com gravação atômica igual à do `salvarConfig`.
  - `Tarefa = {id, andarId, agente, texto, naHora, criadaEm, estado: 'pendente'|'rodando'|'feita'|'falhou'|'parada', pasta?}`

- [ ] **Step 1: Testes:** `adiciona e persiste`, `texto vazio é recusado`, `marca estado`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Fila de tarefas do dono`.

### Task 7: Produção (o laço do turno)

**Files:** Create `servidor/producao.js`, `servidor/test/producao.test.js`

**Interfaces:**
- Consumes: Tasks 1 a 6, `listarFuncionarios` e o `retrato.andares` do Monitor.
- Produces: `class Producao { constructor({monitor, fila, raizEntregas, caminhoRegistro, iniciar = iniciarTrabalho, agora = Date.now, adaptador = linhaProducao}); tick(): Promise<void>; parar(chave); estado(): EstadoProducao; funcionarioDaSessao(sessionId): {andarId, nome}|null }`
  - `EstadoProducao = {fase, volta, pausaForcadaAte, rodando: [{chave, andarId, agente, titulo, desde, ultimaAcao}], esperando: [{andarId, agente}], meta: {[andarId]: {feitas, total, ok}}, avisos: string[]}`

**Regras do `tick`:**
1. Monta os pendentes de cada andar:
   - linha de produção: `abrir-dias` para hoje e amanhã (`diasSemPecas`) com `estoque` e depois `ideias-criativas`, mais as `estacao` de `trabalhosPendentes`;
   - fila: as tarefas pendentes do andar.
2. `decidir`.
3. Inicia cada trabalho com `instrucao`. O `dirEntrega` de tarefa é `pastaEntrega`.
4. Registra no `dados/trabalhos.json`.
5. **No fim de cada trabalho:**
   - Se `fim.limite`, entra em pausa forçada.
   - Se é uma estação, roda `rodarStatus`. Se a peça chegou a `aguardando-aprovacao`, chama `entregarPeca`.
   - Se o trabalho passou de 40 turnos sem `ok`, cria um trabalho `continuar` com o `PASSAGEM.md` (tarefa) ou com o próprio `peca.md` (estação).
   - Registra no histórico (`dados/historico/AAAA-MM-DD.jsonl`).
6. **Na construção:** trabalhos com `rodando` em `trabalhos.json` viram `interrompido`, e tarefas da fila em `rodando` voltam a `pendente`.

- [ ] **Step 1: Testes que falham** (com `iniciar` falso, controlado pelo teste)
  - `começa a abrir os dias com estoque`
  - `depois da estação chama status e entrega quando chega em aguardando`
  - `limite do plano pausa a produção`
  - `fora do expediente não começa nada`
  - `reinício devolve trabalhos para a fila`
  - `parar encerra e devolve`
  - `trabalho longo continua em sessão nova com passagem`
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Laço de produção do turno`.

### Task 8: Retrato com produção

**Files:** Modify `servidor/estado.js`, `servidor/monitor.js` · Test `servidor/test/estado.test.js`, `servidor/test/monitor.test.js`

**Interfaces:**
- `montarEstado` recebe `producao: EstadoProducao` e `funcionarioDaSessao` e devolve:
  - **Funcionário:** se uma sessão do andar pertence a ele (`funcionarioDaSessao`), o estado e a ação vêm dessa sessão. Essa sessão **não** aparece em `visitantes`.
  - **Funcionário em `producao.esperando`:** estado `esperando-vez`, ação `Esperando a vez`.
  - **Fase do expediente** diferente de `trabalho`, e ele não está rodando: estado `almoco`, `pausa` ou `foi-embora`.
  - **No retrato:** `expediente: {fase, volta}`, `andares[i].meta`, `entregasHoje: n` e `avisos`.
- O `Monitor` recebe `producao` no construtor (opcional; sem ela, tudo funciona como na Fase 1).

- [ ] **Step 1: Testes:**
  - `sessão do executor acende o funcionário e não vira visitante`
  - `esperando a vez`
  - `almoço`
  - `fora do expediente vai embora`
  - `meta no retrato`
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Retrato com produção e expediente`.

### Task 9: Rotas e partida

**Files:** Modify `servidor/servidor.js`, `servidor/main.js` · Test `servidor/test/servidor.test.js`

**Rotas novas** (todas com token):

| Rota | Comportamento |
|---|---|
| `POST /api/tarefas` `{andarId, agente, texto, naHora}` | 400 sem texto |
| `POST /api/trabalhos/:chave/parar` | Para o trabalho |
| `GET /api/entregas?data=AAAA-MM-DD` | Lista as entregas do dia |
| `POST /api/abrir` `{caminho}` | Abre no Explorer (`explorer.exe`) só caminhos dentro de `entregas/`; fora disso, 403 |

`main.js`:
- cria `Fila`, `Producao` e o `Monitor` com a produção;
- chama `producao.tick()` a cada 5 s;
- se a porta estiver ocupada, abre o navegador no prédio já aberto, sem dar erro, porque o atalho da Inicializar pode rodar duas vezes.

- [ ] **Step 1: Testes:**
  - `cria tarefa`
  - `tarefa sem texto dá 400`
  - `abrir fora de entregas dá 403`
  - `lista entregas`
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Rotas de tarefas, entregas e partida com o turno`.

### Task 10: Referência do Instagram

**Files:** Create `servidor/referencias.js`, `servidor/test/referencias.test.js`

**Interfaces:**
- Produces:
  - `lerResumoInstagram(html): {seguidores, seguindo, posts, titulo, descricao}`, a partir das metas `og:title` e `og:description`.
  - `atualizarInstagram({usuario: 'oticamay', destino, buscar = fetch}): Promise<string|null>`, que escreve o `.md` no máximo uma vez por dia.
  - Os caminhos de referência vão para a instrução dos funcionários da lista da spec 7.8.

- [ ] **Step 1: Testes:**
  - `lê seguidores e posts do HTML real`, usando a meta copiada da página de 10/11 (4,216 seguidores e 1,009 posts);
  - `não busca duas vezes no mesmo dia`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar. Esperado: PASS.
- [ ] **Step 5:** Commit `Referência diária do Instagram`.

### Task 11: Página — produção visível e controlável

**Files:** Modify `web/app.js`, `web/estilo.css`, `web/index.html`

**Estados novos e animação:**

| Estado | Animação |
|---|---|
| `esperando-vez` | Na mesa, mexendo no celular: o boneco sentado com um retângulo escuro de 3×4 px na mão |
| `almoco`, `pausa` | Vai para a copa ou o lounge |
| `foi-embora` | Sai pelo elevador e some até a volta |

**Relógio:** abaixo da hora, mostra a fase: "Expediente até 16:00", "Almoço — volta 13:00", "Pausa — volta 15:15", "Fora do expediente — volta 07:00" ou "Fim de semana".

**Título do andar:** "Meta: 4/6" (verde quando `ok`).

**Painel do funcionário:**
- botão **📝 Dar tarefa**: modal com texto e uma caixa "Fazer agora". Fora do expediente, o "Fazer agora" pede confirmação ("fora do expediente — rodar mesmo assim?"). Envia para `POST /api/tarefas`.
- botão **⏹ Parar**, quando ele está rodando.

**Barra de ações:**
- 🔎 Em execução ganha ⏹ em cada item que é trabalho do prédio;
- novo botão **📦 Entregas**: lista as de hoje, com o botão "Abrir pasta" (`POST /api/abrir`).

**Faixas:**
- **Pausa forçada:** "Limite do plano atingido — os funcionários voltam às HH:MM".
- **Avisos:** "Sem calendário para amanhã — rode o ciclo-mensal".

- [ ] **Step 1:** Implementar a página.
- [ ] **Step 2:** Verificar no navegador com o servidor real, fora do expediente:
  - o relógio mostra "Fora do expediente — volta 07:00";
  - os funcionários estão em "foi embora";
  - 📦 Entregas mostra a lista vazia.
- [ ] **Step 3: Teste de aceitação real (com autorização do dono, porque gasta o plano):**
  - dar **uma** tarefa na hora para o `copywriter`: "Escreva 3 opções de legenda para o story de 10/11 08:00 (alianças)";
  - conferir que o boneco vai trabalhar e que o 🔎 mostra o trabalho com ⏹;
  - conferir que nasce `entregas/Conteudo May/2026-11-10 - …/` com o resultado e o `PASSAGEM.md`, e que o `RESUMO.md` é escrito pelo prédio.
- [ ] **Step 4:** Commit `Página com produção, expediente e entregas`.
