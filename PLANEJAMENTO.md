# BIOBUZZ Scout · versão Planilha · Planejamento

Plano de execução do clone descrito no [`README.md`](README.md). Código escrito e testado localmente em 09/11/2026.

## Decisões tomadas (09/11/2026)

| Tema | Decisão |
|---|---|
| Onde o site mora | Link novo no GitHub Pages |
| Onde ficam os dados | Planilha Google no Drive, gravada por um Apps Script |
| O que fica no site | Só login e formulário de scout de partida |
| Visualização | Toda na planilha (Ranking, Comparar, Gráficos) |
| Pit scout | Removido |
| Login | Igual ao atual: nome + senha da equipe |
| Migração | Nada a migrar. Só a lista de equipes do evento entra na planilha antes |

## Respostas às questões em aberto (09/11/2026)

| Questão | Resposta |
|---|---|
| Senha da equipe | Definida; fica só na propriedade `SCOUT_KEY` do script |
| Evento (`origin`) | O scout escolhe entre **Seletiva RS** e **Evento teste**. Cada um tem a sua planilha, com a mesma estrutura |
| Equipe fora da aba Equipes | O site só deixa escolher equipes cadastradas no evento; o script também recusa (`bad_team`) |
| Compartilhamento | Quem tem a planilha compartilhada pode ver ou editar; proteções são só de aviso |
| Bolas na HIVE | Não entram na pontuação estimada; ficam como dado estatístico |
| Conta dona | goncalvesisaque772@gmail.com (onde as planilhas foram criadas) |

## Fases

### Fase 1 · Planilha

- [x] Criar as planilhas (Seletiva RS e Evento teste). A estrutura é montada pela função `setup()` do script.
- [x] Aba **Partidas** com o cabeçalho na ordem do README e a coluna de fórmula `pontosEstimados`.
- [x] Aba **Config** com os valores de pontuação.
- [x] Aba **Equipes** criada (Evento teste já com 8 equipes fictícias). Seletiva RS com as 12 equipes inscritas, carregadas pelo `setup()`.
- [x] Proteger Partidas, Config e as abas de fórmula.
- [x] Compartilhar conforme o item 4.

**Pronto quando:** a planilha existe, tem as equipes do evento e uma linha de exemplo digitada à mão calcula os pontos certos.

### Fase 2 · Apps Script

- [x] `doPost`: ler o JSON, conferir a senha, validar campos obrigatórios, upsert pelo `id` com trava.
- [x] `doGet`: `ping` e `teams`.
- [x] Senha nas propriedades do script (`SCOUT_KEY`).
- [x] Publicar como Web App (executar como dono, acesso para qualquer pessoa). URL em `config.js`.
- [x] Testar: envio novo, reenvio do mesmo `id` (não duplica), senha errada, JSON inválido, 20 envios em sequência rápida. Feito no mock local (`apps-script/test/mock-test.js`) e contra o script publicado em 09/11/2026: tudo certo, 20 envios em paralelo sem perda.

**Pronto quando:** todos os testes acima passam e as linhas aparecem certas na aba Partidas.

### Fase 3 · Clone do front

- [x] Copiar o HTML atual do site publicado.
- [x] Remover: pit scout, Ranking, Comparar, Partidas/Dados, escala, edição, exclusão, exportação e a navegação de abas.
- [x] Trocar a camada de dados do claude.ai por chamadas ao Apps Script (`fetch` com `text/plain`).
- [x] Gerar o `id` ao abrir o formulário e manter o mesmo nas tentativas de reenvio.
- [x] Adaptar a fila offline existente (`bb_outbox`) para a nova chamada; reenviar ao voltar a conexão e ao abrir o site.
- [x] Indicador de envio e botão "enviar agora".
- [x] Ler a lista de equipes (`?action=teams`), guardar no aparelho e mostrar o nome ao digitar o número.
- [x] `config.js` com a URL do script e o evento.
- [x] Manter o visual atual: botões grandes, ícones, pensado para celular.

**Pronto quando:** o formulário completo funciona no navegador do computador apontando para o script real. Já passa no teste ponta a ponta local (`apps-script/test/e2e.js`): seletor por evento, senha errada, modo avião, reabrir com fila, duplicata, 20 envios, equipe inválida.

### Fase 4 · Visualização na planilha

- [x] **Ranking**: por equipe, número de partidas, médias de bolas (auto e teleop), tips e GARDEN, % de LEAVE, % de PARK, % que pifou, pontuação estimada média; ordenado pela pontuação.
- [x] **Comparar**: 4 listas suspensas (validação a partir da aba Equipes) e as métricas lado a lado, com destaque no melhor valor de cada linha.
- [x] **Gráficos**: barras da pontuação estimada por equipe e de bolas por fase (SPARKLINE em cada linha, se atualizam sozinhas).
- [x] Formatação condicional na aba Partidas para destacar a mesma equipe + partida registrada duas vezes.

**Pronto quando:** com umas 20 linhas de teste, as três abas mostram números conferidos à mão.

### Fase 5 · Publicação e testes

- [ ] Criar o repositório no GitHub e ativar o GitHub Pages.
- [ ] Testes no link publicado:
  - [ ] dois celulares enviando ao mesmo tempo;
  - [ ] modo avião: salvar, voltar a conexão, conferir o reenvio;
  - [ ] senha errada: a partida fica na fila e a senha é pedida de novo;
  - [ ] fechar o navegador com partida na fila e reabrir;
  - [ ] Android e iPhone.
- [ ] Apagar as linhas de teste da planilha.

**Pronto quando:** todos os testes passam no link público.

### Fase 6 · Preparação para o evento

- [ ] Conferir a aba Equipes com a lista oficial do evento.
- [ ] Ajustar `origin` no `config.js`, se for fixo.
- [ ] Mandar o link para o time e fazer um ensaio com uma partida gravada em vídeo.
- [ ] Combinar o plano B (ver abaixo).

## Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Sinal ruim no ginásio | Envios atrasam | Fila offline; conferir o indicador antes de sair do evento |
| Celular perde a fila (limpeza de dados, modo anônimo) | Partidas perdidas | Orientar a não usar aba anônima; indicador visível de pendências |
| Senha da equipe vaza | Lixo na planilha | Trocar a senha nas propriedades do script; apagar linhas pelo `recebidoEm` |
| Alguém edita a aba Partidas por engano | Dados corrompidos | Proteção da aba e histórico de versões da planilha |
| Atualização do script muda a URL | Site para de enviar | Sempre atualizar a mesma implantação em vez de criar uma nova |
| Dois scouts na mesma equipe e partida | Linha duplicada nas médias | Destaque por formatação condicional; decidir na hora qual manter |

## Plano B no dia

Se o Apps Script ou o Google ficarem fora do ar, as partidas continuam na fila dos celulares e são enviadas quando ele voltar. Se um celular falhar de vez, o scout anota no papel e alguém digita direto na aba Partidas depois.

## Refinamentos (09/11/2026, rodada 2)

| Pedido | Como ficou |
|---|---|
| Senha só uma vez, antes do nome | Primeira tela pede a senha e confere no servidor (`action: 'auth'`). Fica salva no aparelho. Offline: aceita provisoriamente e confere quando a conexão volta |
| Envio automático | Envia ao salvar, ao abrir, ao voltar a conexão, ao voltar para o app e com novas tentativas (4 s → 30 s). O botão "Enviar agora" virou aviso de conexão com link "Tentar agora" |
| Validação por seção | Próximo e a timeline só avançam com a etapa completa; campos vazios ficam em vermelho |
| Cores | Próximo/Salvar verde, Voltar vermelho |
| Zero como resposta | Contadores começam em 0 e 0 é válido. Número da partida continua precisando ser 1 ou mais |
| Timeline no rodapé | Barra fixa inferior com os botões e as 4 etapas, navegável; some com o teclado aberto |

## Mapa de tiro, placar da aliança e sinergia (09/11/2026, rodada 3)

Decisões com o Vinícius: fim de jogo (PARK na LOADING ZONE) não é conflito; os conflitos considerados são posição inicial (HIVE alta/baixa), fonte de coleta no auto (Chão/Flor) e sobreposição das zonas de tiro; o placar é digitado à mão no fim da partida.

| Item | Como ficou |
|---|---|
| Mapa de tiro | Grade 6×6 sobre `assets/arena.png` (recortada no campo para a grade bater com os tiles). Toque: marcada → principal (★) → desmarcada. Azul vê a arena girada 180°; os rótulos não giram. Obrigatório, pelo menos 1 célula |
| `placarAlianca` | Campo opcional no passo Final, só dígitos (até 3). Gravado em AD, separado de A..AB |
| Code.gs | Valida `shootSpot` (regex e no máximo um `*`) e `placarAlianca`; `limparEventoTeste()` limpa AD; `setup()` não mexe em planilha com `_calcCmp`; `copiarLayoutDoTeste()` leva o layout da planilha de teste para a produção |
| Planilha | Config 10–15, `_calcCmp` T:X, `_calc` S (OPR), Ranking com OPR, Comparar 26–48 (perfil e sinergia), abas Mapa de tiro, Placar real e `_tiro`: montados direto na planilha de teste (fórmulas no handoff `scout-mapa-sinergia-handoff.md`) |

Para publicar, nesta ordem:
1. Garantir que os celulares estão com "Tudo enviado" (partidas antigas na fila com texto livre em `shootSpot` seriam recusadas pelo script novo).
2. Colar o `Code.gs` novo no editor e em Implantar > Gerenciar implantações > lápis > Versão: nova versão (a URL não muda).
3. Fazer o merge no GitHub (site e `assets/arena.png` no ar).
4. Na planilha de teste: enviar 4 registros de uma mesma partida (2 Azul, 2 Vermelha) com mapa e placar e conferir Placar real, Mapa de tiro e Comparar.
5. Rodar `copiarLayoutDoTeste()` para levar o layout à produção. Na primeira abertura da aba Mapa de tiro, a planilha pode pedir "Permitir acesso" para a imagem.
6. Calibrar os pesos de Config!B11:B13 depois de 15–20 alianças com placar (seção 5 do handoff).

