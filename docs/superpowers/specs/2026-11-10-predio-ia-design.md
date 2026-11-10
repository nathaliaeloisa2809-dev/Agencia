# Prédio IA — Especificação

Data: 2026-11-10 · Status: aguardando revisão do dono

## 1. Objetivo

Um escritório virtual que roda no computador do dono, em pixel art 2D vista de cima (visual aprovado no protótipo `prototipo/index.html`). Cada projeto do Claude Code é um andar (uma "empresa"), e os agentes de cada projeto são funcionários que **trabalham de verdade**: produzem arquivos reais, pedem ajuda quando precisam e entregam o resultado numa pasta central de entregas.

O dono consegue:
- ver ao vivo o que cada agente está fazendo;
- ajudar quem está travado (responder, aprovar, devolver);
- passar um trabalho na hora para um agente;
- acompanhar o expediente e a meta do dia;
- personalizar o prédio (nome, espaço, móveis).

**Regra de ouro:** nada acontece fora das regras do projeto nem sem o comando do dono. Nenhum agente publica nada, apaga projeto ou age em outra empresa por conta própria.

## 2. O que fica de fora (por agora)

- Publicação em redes sociais: continua sendo a fase 3 da própria Conteudo May.
- Acesso pelo celular ou fora do computador: o servidor só escuta `127.0.0.1`.
- Colaboração entre empresas (pergunta e consultoria): fica para a fase 5, porque hoje só a Conteudo May produz.

## 3. Arquitetura

```
predio-ia/
  servidor/          Node.js (ESM), sem framework pesado
    descoberta.js    vigia ~/.claude/projects e monta a lista de andares
    sessoes.js       lê os .jsonl ao vivo → estado de cada sessão
    executor.js      roda agentes (claude -p, stream-json) e controla os processos
    agendador.js     expediente, pausas, metas, limite de agentes ao mesmo tempo
    adaptadores/
      linha-producao.js   projetos com linha de produção (Conteudo May)
      fila.js             projetos genéricos: fila de tarefas do dono
      biblioteca.js       projetos que só guardam coisas (Skills): sem produção
    entregas.js      copia resultados para entregas/ e escreve RESUMO.md
    api.js           HTTP + WebSocket para a página
  web/               página do prédio (canvas 2D, a partir do protótipo)
  dados/predio.json  configurações e layout (nome do prédio, móveis, metas, ocultos…)
  dados/historico/   livro de registro (um .jsonl por dia)
  entregas/<Empresa>/<AAAA-MM-DD> - <título>/
  iniciar.cmd        atalho: sobe o servidor e abre http://localhost:4777
```

- O servidor manda as mudanças para a página por WebSocket, assim que acontecem.
- A página não lê arquivos: só desenha e envia comandos.
- Dependências: o mínimo possível (`ws` e `chokidar`, ou `fs.watch` nativo se bastar).

## 4. Descoberta de projetos (atuais e futuros)

- O servidor vigia `~/.claude/projects/` o tempo todo.
- Cada pasta ali é um projeto. O caminho real vem do campo `cwd` dentro dos `.jsonl`, porque o nome da pasta só tem uma versão codificada do caminho.
- Cada projeto real vira um andar. Uma pasta nova faz surgir um andar novo, com a animação de obra.
- **Ignorados automaticamente:** pastas de rascunho do app (`…-scratch-…`) e a pasta inicial do usuário.
- **Ocultos pelo dono:** lista em `predio.json`. O **Anti** já começa oculto. Ocultar nunca apaga nada no disco.
- **Identidade do andar:** cada andar tem um ID próprio, que não muda quando o nome da pasta muda.
  - A identidade é calculada pelo primeiro commit do git; sem git, pelo conjunto de nomes em `.claude/agents` mais o `CLAUDE.md`.
- **Pasta renomeada:** se o caminho antigo some e aparece um novo com a mesma identidade, o andar só troca de nome e mantém layout, histórico e entregas.
  - Se a identidade for parecida mas não idêntica, o prédio pergunta: "Parece que *X* virou *Y*. Juntar?"
- **Nome da empresa:** o nome da pasta do projeto, por exemplo "Conteudo May". O dono pode dar um apelido.

## 5. Quem são os bonecos

| Tipo | De onde vem | O que o dono pode fazer |
|---|---|---|
| **Funcionário** | cada `.claude/agents/<nome>.md` do projeto. A Conteudo May tem 18. | Ver ao vivo, dar tarefa, responder, aprovar, parar |
| **Funcionário genérico** | projeto sem `.claude/agents`: um "Assistente" | Igual ao funcionário |
| **Visitante** | sessão que o dono abriu no terminal | Só ver. Para responder, usa o terminal. Quando o terminal fecha, o prédio pode "assumir" a sessão (`--resume`). |

- Cada funcionário tem uma mesa fixa, um crachá com o cargo (o `name`) e uma descrição (a `description`).
- A aparência é sorteada uma vez e fica salva.
- O andar cresce automaticamente para caber todos. Com 18 funcionários, são duas áreas de mesas.

## 6. Estados ao vivo

O estado de cada boneco vem de dois lugares:
- dos eventos do `stream-json`, quando é o prédio que roda o agente;
- da leitura contínua do `.jsonl`, no caso dos visitantes.

| Estado | Quando | No mapa |
|---|---|---|
| Escrevendo | ferramenta Write/Edit | digitando; tela azul |
| Lendo | Read/Grep/Glob/WebFetch | lendo papel; tela branca |
| Terminal | Bash | digitando rápido; tela verde |
| Precisa de você | pergunta ao dono, peça aguardando aprovação ou erro | balão "!" piscando |
| Esperando a vez | tem trabalho, mas o limite de agentes ao mesmo tempo está cheio | na mesa, mexendo no celular |
| Sem trabalho / meta batida | nada pendente para ele | copa ou lounge |
| Almoço / pausa | horário do expediente | copa e lounge, cheios |
| Fora do expediente | antes das 7h ou depois das 16h | vai embora pelo elevador; luzes do andar apagadas |
| Travado | erro do processo ou limite do plano atingido | "!" vermelho |

Clicando no boneco, abre um painel com:
- o cargo e a tarefa atual;
- a ação ao vivo (arquivo ou comando);
- as últimas mensagens;
- os arquivos que ele alterou hoje;
- os botões: **Dar tarefa**, **Responder** (quando há pergunta), **Parar** e **Seguir**.

## 7. Produção real

### 7.1 Como um agente roda

O `executor.js` inicia um processo para cada trabalho:

```
claude -p "<instrução do trabalho>" --output-format stream-json --verbose
       --append-system-prompt "<corpo do .claude/agents/<nome>.md>"
       --allowedTools "<tools do frontmatter do agente>"
       --permission-mode acceptEdits --add-dir "<predio-ia/entregas/<Empresa>>"
```

- O processo roda com `cwd` igual à pasta do projeto, então segue o `CLAUDE.md` e as skills do projeto.
- O `claude -p` usa o **login e o plano que o dono já tem no Claude Code**, sem uma chave de API à parte.
  - *Verificar no plano de implementação* se a cobrança é mesmo pelo plano e se há uma flag nativa para escolher o subagente.
- **Ferramentas:** só as que o agente declara no frontmatter. O roteirista, por exemplo, só lê e escreve arquivos, sem terminal.
- **Onde pode escrever:** só dentro da pasta do projeto e da sua pasta de entregas.
- Todo processo tem um ID de sessão, e o painel "Em execução" mostra todos os ativos.
- **⏹ Parar** encerra o processo. O trabalho volta para a fila no mesmo ponto em que estava, sem avançar status.

### 7.2 Adaptador "linha de produção" (Conteudo May)

O adaptador é escolhido automaticamente quando o projeto tem `sistema/pipeline.js` e o script `status` no `package.json`.

- **Descobrir o trabalho:** lê as peças em `06-Producao/**/peca.md` e usa o `proximoAgente()` do próprio projeto (importado, nunca copiado) para saber quem age em cada peça.
- **Gerar o trabalho:** cada peça pendente vira um trabalho do tipo "funcionário X na peça Y". A instrução passa o caminho exato do `peca.md`, como faz o `ciclo-semanal`.
- **Respeitar as regras do `CLAUDE.md`:**
  - nunca dois agentes na mesma peça;
  - `revisor-qualidade` e `ideias-criativas` trabalham um de cada vez.
- **Abrir peças da semana:** quando não há peças da semana, o prédio mostra "Semana sem peças — abrir produção?". Com o "sim" do dono, roda `estoque` e depois `ideias-criativas`, seguindo o passo 1–2 do `ciclo-semanal`.
- **Depois de cada passo:** roda `npm run status`. Se der erro, o boneco fica "Travado" e mostra a mensagem.
- **Aguardando aprovação:** a peça aparece como "!" na mesa do revisor e na **Caixa de aprovação** do andar. O dono abre a peça e escolhe:
  - **Aprovar:** marca `status: aprovado`. Só o dono faz isso, e o botão pede confirmação. Peças com `aviso` exigem uma confirmação extra.
  - **Pedir ajuste:** roda `npm run devolver -- <peça> <agente> "<motivo>" --dono`.
- O prédio **nunca** chama o funcionário `publicacao` enquanto a fase de publicação do projeto não existir.

### 7.3 Adaptador "fila" (projetos genéricos)

- Cada andar tem uma **fila de tarefas**: o dono escreve, escolhe o funcionário (ou "qualquer um") e a prioridade.
- A instrução enviada ao agente termina com: "salve o resultado final em `<pasta de entregas da tarefa>` e escreva um RESUMO.md".

### 7.4 Adaptador "biblioteca" (Skills)

- Não tem produção nem funcionários trabalhando.
- O andar vira uma **biblioteca**: estantes com as skills salvas, e clicar numa mostra o `SKILL.md`.
- Uma recepcionista fica parada no balcão.

### 7.5 Trabalho na hora

- O dono clica num funcionário, escolhe **Dar tarefa** e escreve.
- A tarefa vai para o topo da fila daquele funcionário.
- Se o limite de agentes ao mesmo tempo estiver cheio, o prédio pergunta: "Pausar *Z* para começar agora, ou esperar a vez?"

### 7.6 Precisa de ajuda

| Caso | Como o dono ajuda |
|---|---|
| O agente terminou com uma pergunta ao dono | **Responder**: a resposta continua a mesma sessão (`claude -p --resume <id> "<resposta>"`) |
| Peça aguardando aprovação | Aprovar ou pedir ajuste (7.2) |
| Erro, limite do plano ou `npm run status` com erro | Ver o erro, **Tentar de novo** ou **Pular** |
| Visitante (sessão do terminal) esperando | Aviso "responda no terminal"; o prédio não injeta texto em terminal aberto |

## 8. Entregas

- Pasta central: `predio-ia/entregas/<Empresa>/<AAAA-MM-DD> - <título>/`.
- **Conteudo May:** quando uma peça chega em `aguardando-aprovacao`, o prédio copia para lá o `peca.md` e as mídias geradas que ele referencia. A peça original continua no projeto.
- **Fila:** o próprio agente salva os resultados direto na pasta da entrega.
- **`RESUMO.md` (escrito pelo prédio):** quem fez, quando, quanto tempo levou, quais arquivos foram alterados no projeto e onde está a peça original.
- No mapa, cada andar tem uma **caixa de saída**. O funcionário leva a entrega até ela, e o contador do dia sobe.
- Botão **📦 Entregas:** lista as entregas do dia, com links para abrir a pasta ou o arquivo.

## 9. Expediente e metas (horário de Brasília)

- O relógio usa sempre `America/Sao_Paulo`, independente do relógio do sistema.
- **Expediente padrão:** chegada às 7h00, almoço das 12h00 às 13h00, pausa das 15h00 às 15h15, saída às 16h00. Tudo é editável em ⚙️.
- **Fins de semana:** o padrão é sem expediente. É configurável.
- **Na pausa e no almoço:** não começa trabalho novo. Quem está no meio de um passo termina e então vai para a copa ou o lounge. Ninguém é interrompido no meio de um arquivo.
- **Fora do expediente:** nada roda sozinho. O dono ainda pode dar "trabalho na hora", com o aviso "fora do expediente — rodar mesmo assim?".
- **Meta do dia:**
  - Conteudo May: as peças do calendário de hoje chegarem a `aguardando-aprovacao`. Vem da cota que o projeto já tem (5 stories por dia, mais post e reels nos dias marcados).
  - Fila: um número de tarefas por dia, definido pelo dono.
  - Biblioteca: sem meta.
- **Meta batida:** o andar comemora com uma animação curta, os funcionários vão para o lounge ou embora mais cedo, e o agendador não puxa mais trabalho automático daquele andar no dia.
- **Barra da meta:** no título do andar e no painel PRÉDIO, por exemplo "Meta: 4/6".

## 10. Limite de agentes ao mesmo tempo

- Cada passo de uma peça depende do anterior, então numa mesma peça só um funcionário trabalha por vez.
- O paralelismo vem de **várias peças em estações diferentes**: o roteirista na peça A, o copywriter na B, o designer na C.
- Quem não tem vez fica em "Esperando a vez" (ou descansa, se não há nada para ele). Assim que um termina, o próximo da fila entra.
- **Padrão:** até **3 agentes ao mesmo tempo no prédio inteiro**, e a Conteudo May tem prioridade.
  - O limite geral e o limite por andar ficam em ⚙️.
  - O dono pode subir para 6 ou mais.
- **Limite do plano atingido** (detectado no erro do processo): o prédio entra em "pausa forçada", mostra uma faixa com a hora prevista de volta e não tenta de novo em loop.

## 11. Interface

Mantém o visual aprovado: pixel art 2D vista de cima, painel PRÉDIO à esquerda, ▲▼ para trocar de andar e câmera com zoom e arraste.

**Barra de ações**

| Botão | O que faz |
|---|---|
| 🔎 Em execução | Lista tudo que está rodando no prédio inteiro, com o tempo de cada um, e um ⏹ por item |
| 🕐 Relógio | Hora de Brasília, sempre visível, mais o estado do expediente ("Almoço — volta 13:00") |
| ✏️ Nome do prédio | Renomeia; aparece no hall, no título e na aba do navegador |
| 📦 Entregas | Entregas do dia (seção 8) |
| ✅ Aprovações | Tudo que espera o dono, no prédio inteiro |
| 📖 Registro | Livro de registro: quem fez o quê e quando |
| 🛠️ Construir | Modo construção (seção 12) |
| ⚙️ Ajustes | Expediente, limites, metas, andares ocultos, apelidos |
| CMD | Barra de comando: "roteirista, refaz o roteiro da peça X…" vira "Dar tarefa" já preenchida |

## 12. Modo construção

- O mapa ganha uma grade. Fica um **catálogo de móveis** à direita: mesas, cadeiras, plantas, sofás, estantes, mesas de reunião, quadros, máquina de café, tapetes, divisórias e portas.
- **Colocar:** clica no móvel e clica no mapa. **Mover:** arrasta. **Girar:** R. **Remover:** Delete.
- **Aumentar espaço:** botões nas bordas do andar ("+ 4 colunas", "+ 4 linhas") e **nova sala**, desenhando um retângulo com divisórias e uma porta.
- Mesas novas viram vagas para funcionários. Quem não tem mesa ganha a próxima livre.
- **Validações:** não deixa bloquear o elevador nem fechar um caminho até uma mesa. O caminho é conferido com o mesmo pathfinding usado pelos bonecos.
- Tudo fica salvo em `predio.json`, por ID de andar. **Desfazer:** Ctrl+Z.

## 13. Erros e segurança

- O servidor só escuta `127.0.0.1:4777` e exige um token que o `iniciar.cmd` passa para a página.
- Um `.jsonl` corrompido ou incompleto tem a linha ignorada, e a leitura continua.
- Se um processo do agente morre, o boneco fica "Travado", o trabalho volta para a fila e nada muda de status.
- Se o servidor reinicia, ele reencontra o que estava rodando pelo histórico, e o que ficou pela metade volta para a fila.
- O prédio nunca apaga arquivos de projeto e nunca edita `status`, `revisoes` ou `motivo_devolucao` à mão. Usa sempre os mecanismos do próprio projeto (`devolver`), e a aprovação é feita pelo dono.

## 14. Testes

- `node --test` em `servidor/test/`, com pastas de exemplo, cobrindo:
  - descoberta (pastas novas, ignoradas, ocultas, renomeadas);
  - leitura de `.jsonl` (cada estado da seção 6);
  - agendador com relógio falso (expediente, almoço, pausa, fim de semana, meta batida, limite de agentes ao mesmo tempo, nunca dois agentes na mesma peça);
  - adaptador de linha de produção com uma cópia mínima da estrutura da Conteudo May;
  - entregas (pasta e RESUMO.md).
- O executor é testado com um `claude` falso, um script que imita o `stream-json`.
- **Teste manual de aceitação:** ver os 18 funcionários da Conteudo May e rodar uma peça de exemplo de `ideia` até `aguardando-aprovacao`, numa semana de teste.

## 15. Fases

1. **Prédio ao vivo:** descoberta real de todos os projetos, funcionários vindos de `.claude/agents`, visitantes, estados ao vivo, painel do agente, 🔎 Em execução, 🕐 relógio, ✏️ nome do prédio, pasta renomeada, Anti oculto e Skills como biblioteca. *Ainda sem rodar agentes.*
2. **Produção:** executor, adaptadores de linha de produção e de fila, trabalho na hora, responder, aprovar e pedir ajuste, entregas, ⏹ parar.
3. **Expediente:** agendador com horário de Brasília, pausas, metas, limite de agentes ao mesmo tempo e pausa forçada.
4. **Construção:** modo construção e móveis.
5. **Entre empresas:** a central de comando (pergunta e consultoria) já desenhada, para quando houver mais de uma empresa produzindo.

Cada fase entrega algo usável sozinho, e a fase 1 já mostra o prédio real.
