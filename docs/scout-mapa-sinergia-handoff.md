# Scout Biobuzz: mapa de tiro, placar da aliança e sinergia

Handoff para o chat que mexe no código (repositório `mhl2102/Scout-Biobuzz`: `index.html` e `apps-script/Code.gs`).
A planilha **de teste** já está montada e funcionando com dados de exemplo. A de **produção ainda não foi alterada**.

- Teste: https://docs.google.com/spreadsheets/d/15OcV-Eve36FfeRi6-OMgrieWwy7y6oYNM3IRYBBJ2KY
- Produção: https://docs.google.com/spreadsheets/d/1ov75brRKteBhUnTYTJvuuhZXz-ftMr5Ma_Fq339AFyg

---

## 1. Resumo do que muda

| # | Mudança | Onde |
|---|---|---|
| 1 | "Local de preferência de tiro" deixa de ser texto livre e vira um **mapa 6×6 da arena**, com várias células e uma principal | app + planilha |
| 2 | Novo campo **Placar final da aliança**, digitado à mão pelo scouter no fim da partida | app + planilha |
| 3 | **OPR** por equipe (contribuição real ao placar, estimada pelos placares das alianças) | planilha |
| 4 | **Sinergia da aliança** no Comparar: desconta da soma das médias os conflitos de estratégia (posição inicial, fonte de coleta no auto, zona de tiro) | planilha |

Decisões já tomadas com o Vinícius:
- Fim de jogo (PARK na LOADING ZONE) **não** é conflito: as duas equipes ocupam a LOADING ZONE normalmente.
- Os conflitos considerados são só: disputa de posição inicial (HIVE alta/baixa), disputa de fonte de coleta no auto (Chão/Flor) e sobreposição das zonas de tiro.
- O placar é registrado **manualmente** no app, no fim da partida.

---

## 2. Formato dos dados (contrato entre app e planilha)

### 2.1 `shootSpot` (coluna AA de Partidas), novo formato

- Grade 6×6 sobre a imagem da arena. Colunas **A–F** da esquerda para a direita, linhas **1–6** de cima para baixo.
- Valor gravado: códigos de célula separados por `;`, com **no máximo uma** célula marcada como principal com `*`.
  Exemplos: `C3*;C4`, `B2`, `C3*;D3;D4`.
- Regex de validação (servidor e cliente): `^[A-F][1-6]\*?(;[A-F][1-6]\*?)*$` e no máximo um `*`.
- Sugestão: gravar a principal primeiro e as demais em ordem alfabética (só estética; a planilha não depende da ordem).
- Registros antigos em texto livre continuam na planilha. Eles só são ignorados pelo mapa.

**Orientação (importante):** as coordenadas são sempre do ponto de vista da **própria aliança do robô**, com a aliança dele à esquerda (como a Vermelha na imagem `arena.png`).
- Robô da **Vermelha**: o app mostra a imagem como está.
- Robô da **Azul**: o app mostra a imagem **girada 180°**, mantendo os rótulos A–F / 1–6 nas mesmas posições da tela.
- O código gravado é o rótulo da célula na tela. Assim os dados de Vermelha e Azul se somam sem conversão na planilha.
- Por isso a aliança precisa estar escolhida antes do mapa (já é assim: aliança está no passo 0).

### 2.2 `placarAlianca` (coluna **AD** de Partidas), campo novo

- Número inteiro, 0 a 999, ou vazio.
- Placar final **da aliança** do robô scoutado, digitado no fim da partida.
- Os dois scouters da mesma aliança podem digitar; a planilha usa o **maior** valor por (tipo, partida, aliança).
- Recomendação de UX: campo opcional no último passo, com dica "placar que apareceu no telão para a sua aliança". Se o placar mostrar faltas separadas, preferir o total sem faltas cometidas pela aliança adversária (opcional; deixar isso como dica, não como regra).

### 2.3 Coluna AC (pontosEstimados)

Continua sendo a ARRAYFORMULA em `AC1`. **Nada deve ser gravado em AC.**
Na planilha de teste havia valores colados em `AC32:AC131` que bloqueavam a ARRAYFORMULA (o cabeçalho mostrava `#REF!`). Eu limpei `AC2:AC`; agora a coluna é calculada pela fórmula para todas as linhas.

---

## 3. O que mudar no código

### 3.1 `index.html` (app do scouter)

1. **Substituir o input de texto `shootSpot`** (hoje `inpH('shootSpot', ...)` no passo 3) por um componente de mapa:
   - Fundo: `assets/arena.png` (anexo deste handoff; precisa ser commitado no repositório nesse caminho, pois a planilha carrega a imagem pela URL raw do GitHub).
   - Sobreposição de grade 6×6 com rótulos A–F (topo) e 1–6 (lateral).
   - Toque numa célula: desmarcada → marcada → principal → desmarcada. Ao marcar uma nova principal, a anterior volta a "marcada".
   - Visual: marcada = preenchimento roxo translúcido; principal = roxo forte com estrela.
   - Para robô da Azul, girar a imagem 180° (CSS `transform: rotate(180deg)` só na imagem, não na grade).
   - Campo continua obrigatório (`REQ` já tem `shootSpot`): exigir pelo menos 1 célula.
   - Botão "Limpar" pequeno.
   - Se a aliança mudar depois do mapa preenchido, manter as células (o código é relativo à aliança, então continua válido).
2. **Novo campo `placarAlianca`** no último passo (numérico, `inputmode="numeric"`, opcional).
3. Adicionar `placarAlianca` em `FIELDS` e em `blank()` (valor inicial `''`).
4. O texto de ajuda do campo de tiro passa a ser algo como "Toque onde o robô atira. Toque de novo para marcar a posição principal."

### 3.2 `apps-script/Code.gs`

1. **Gravação da linha:** a coluna AC é fórmula, então `placarAlianca` não pode simplesmente entrar no fim de `COLS` (cairia em AC). Duas opções:
   - (a) manter `COLS` como está (A..AB), gravar A..AB com `setValues` e depois gravar `placarAlianca` em AD (coluna 30) separadamente; ou
   - (b) gravar A..AB e AD num único `setValues` de A..AD passando o valor atual de AC... **não recomendado**, sobrescreve a fórmula.
   Usar (a).
2. **Validação em `clean_()`:**
   - `shootSpot`: regex da seção 2.1 e no máximo um `*`.
   - `placarAlianca`: vazio ou inteiro 0–999 (incluir em `NUMS`, mas aceitando vazio).
   - Atenção: `safe_()` prefixa `'` em textos que começam com `= + - @`. `C3*;C4` não é afetado.
3. **`setupPartidas_`**: cabeçalho `placarAlianca` em **AD1**; garantir que a aba tenha 30 colunas.
4. **`setupConfig_`**: linhas 10–15 (seção 4.1).
5. **`_calcCmp`**: colunas T:X (seção 4.2).
6. **`_calc`**: coluna S (OPR) (seção 4.3).
7. **`setupRanking_`**: nova fórmula em B4, cabeçalho em R3, nova opção "OPR (placar real)" na validação de D1 (seção 4.4).
8. **`setupComparar_`**: linhas 26–48 (seção 4.5).
9. **Novas funções** `setupMapaTiro_`, `setupPlacarReal_`, `setupTiro_` (seções 4.6 a 4.8), chamadas em `setupSpreadsheet_` e incluídas na lista `names`.
10. `limparEventoTeste()` deve limpar também a coluna AD.

> **Atenção, versão do Code.gs:** a planilha de teste tem coisas que o `Code.gs` do GitHub que eu li não tem: aba `_calcCmp`, filtros de tipo de partida (Ranking B1/D1/F1/H1 e Comparar B1), colunas de precisão, "Últimas 5", "Tendência", e a linha **22 "Notas (todas)"** no Comparar (que entrou enquanto eu trabalhava, empurrando a estimativa para as linhas 25–27). As linhas do Comparar citadas aqui já consideram a linha 22. Se o seu `Code.gs` local já gera esse layout, só acrescente o que está abaixo; se não, sincronize primeiro.

### 3.3 Fórmulas no Apps Script

Todas as fórmulas do apêndice estão na sintaxe **en_US** (vírgula como separador, `{a,b}` para colunas em matriz), que é a que `setFormula` usa no Apps Script mesmo com a planilha em pt_BR. Podem ser coladas como string.

---

## 4. Como a planilha de teste ficou

### 4.1 Config (linhas 10–15)

Entradas em azul, editáveis. Pesos iniciais são palpites, para calibrar com a aba Placar real.

| Linha | A | B | Formato |
|---|---|---|---|
| 10 | Sinergia e OPR (negrito) | | |
| 11 | Peso: disputa de posição inicial | 0.5 | 0% |
| 12 | Peso: disputa de coleta no auto | 0.3 | 0% |
| 13 | Peso: sobreposição de tiro | 0.3 | 0% |
| 14 | λ do OPR | 3 | 0 |
| 15 | Sinergia mínima | 0.85 | 0% |

A coluna C tem a explicação de cada uma (texto no apêndice).

### 4.2 `_calcCmp` (oculta), colunas T:X

Perfil por equipe, respeitando o filtro de tipo de `R2` (o mesmo do Comparar):

| Col | Cabeçalho | Significado |
|---|---|---|
| T | % início HIVE alta | fração das partidas começando na HIVE alta |
| U | % coleta no chão | entre partidas com autônomo: Chão conta 1, Ambas conta ½ |
| V | % coleta na flor | idem para Flor |
| W | Pontos no auto | média de LEAVE·B2 + PARK auto·B3 + tips auto·B5 |
| X | Pontos de tips no teleop | média de tips teleop·B5 |

Os cabeçalhos de T:X precisam ser idênticos aos rótulos de `Comparar!A30:A34`, porque o Comparar busca por `MATCH` do rótulo.

### 4.3 `_calc` (oculta), coluna S

`S1` = "OPR (placar real)"; `S2` = busca do OPR na aba Placar real.

### 4.4 Ranking

- `B4`: mesma fórmula de antes, mas lendo `_calc!A:S` e com a coluna 19 (OPR) no fim do `CHOOSECOLS`.
- `R3`: "OPR (placar real)" (formato copiado de Q3); `R4:R203` formato `0.0`.
- Validação de `D1` (Ordenar por) ganhou a opção "OPR (placar real)".

### 4.5 Comparar (linhas 26–48)

| Linha | Conteúdo |
|---|---|
| 25 | Pontos estimados (sem mudança) |
| 26 | Teto (sem mudança; restaurei a fórmula original) |
| 27 | **Previsão**: agora compara os **pontos ajustados** (linha 44) quando existem; senão usa a linha 25 |
| 29 | Cabeçalho PERFIL DE ESTRATÉGIA (formato copiado de A24) |
| 30–34 | % início HIVE alta, % coleta no chão, % coleta na flor, Pontos no auto, Pontos de tips no teleop (B:E, `MAP` sobre B3:E3) |
| 35 | Zona de tiro principal por equipe, ex.: `C3 (67%)` |
| 36 | OPR (placar real) |
| 37 | OPR − média scout |
| 39 | Cabeçalho SINERGIA DA ALIANÇA |
| 40–46 | Uma coluna por aliança: B (B:C mescladas) = Azul, D (D:E mescladas) = Vermelha |
| 48 | Nota de rodapé (movida da antiga linha 28) |

Linhas 40–46:

| Linha | Rótulo | Fórmula (aliança com equipes X e Y) | Formato |
|---|---|---|---|
| 40 | Disputa da posição inicial | pX·pY + (1−pX)(1−pY), p = % HIVE alta | 0% |
| 41 | Disputa da fonte de coleta no auto | chãoX·chãoY + florX·florY | 0% |
| 42 | Sobreposição das zonas de tiro | Σ min(dX, dY) sobre as 36 células, d = distribuição normalizada | 0% |
| 43 | Perda estimada (pts) | min(1, 40·Config!B11 + 41·Config!B12) · min(autoX, autoY) + 42 · Config!B13 · min(tipsX, tipsY) | 0.0 |
| 44 | Pontos ajustados | linha 25 − linha 43 | 0.0 |
| 45 | Sinergia | linha 44 ÷ linha 25 (verde ≥ Config!B15, vermelho abaixo) | 0% |
| 46 | Leitura | "Complementares" ou "Atenção: …" listando conflitos ≥ 50% | texto |

Formatação condicional da linha 45 (custom formula, sem separadores para funcionar em qualquer locale):
- vermelho `#FFD1D1`: `=B45<INDIRECT("Config!B15")`
- verde `#C8F7D4`: `=N(B45)>=INDIRECT("Config!B15")`

### 4.6 Nova aba "Mapa de tiro" (visível, depois do Comparar)

- `B1`: equipe (validação `=Equipes!$A$2:$A`, fundo amarelo). `D1`: tipo de partida (Todas, Qualificatória, Treino, Playoff; fundo amarelo). Proteção só de aviso, com B1 e D1 liberadas.
- `G1`: número de partidas da equipe com mapa no formato novo (denominador).
- Grade esquerda `C4:H9` (cabeçalhos A–F em C3:H3, 1–6 em B4:B9): % das partidas em que atirou daquela célula. Uma única fórmula `MAKEARRAY` em C4.
- Grade direita `J4:O9` (cabeçalhos em J3:O3 e I4:I9): % das partidas em que a célula foi a principal. `MAKEARRAY` em J4.
- Escala de cor em ambas: branco (0) → roxo `#8B3DFF` (100%). Bordas cinza. Células 60×60 px (colunas C:H e J:O = 60 px; linhas 4–9 = 60 px).
- `C12:H17` mesclado (também 60 px por célula) com `=IMAGE("https://raw.githubusercontent.com/mhl2102/Scout-Biobuzz/main/assets/arena.png",1)`, para comparar a grade com a arena na mesma escala. **A imagem só aparece depois que `assets/arena.png` estiver no repositório** (e pode pedir "Permitir acesso" na primeira abertura).
- `B19`: nota explicando a orientação.

### 4.7 Nova aba "Placar real" (visível, depois do Mapa de tiro)

Uma linha por aliança-partida com placar registrado:

| Col | Conteúdo |
|---|---|
| A:C | Tipo, Partida, Aliança (`SORT(UNIQUE(FILTER(...)))` das linhas com AD numérico) |
| D, E | Equipe 1 e Equipe 2 da aliança |
| F | Placar real (maior AD do grupo) |
| G | Estimado = soma das médias de `pontosEstimados` de cada equipe naquela partida |
| H | Diferença (real − estimado) |
| J:K | **OPR** por equipe (uma fórmula `LET` em J2 que retorna equipe + OPR) |
| L | Média scout (média de AC da equipe, todas as partidas) |
| M | OPR − média scout |
| N | Alianças com placar em que a equipe aparece |
| P:Q | Resumo: alianças com placar (Q2), diferença média (Q3), placar real ÷ estimado (Q4) |

**OPR com regularização (ridge) puxando para o scout:** resolve
`(AᵀA + λI)·opr = Aᵀ·s + λ·prior`
onde A é a matriz aliança×equipe (1 se a equipe estava na aliança), s os placares, prior a média scout de cada equipe e λ = `Config!B14`.
Com poucos placares o OPR fica perto da média do scout; com mais partidas, os placares mandam. Isso evita a matriz singular que o OPR puro tem no começo do evento.

Como ler: **OPR − média scout** negativo = a equipe pontua bem quando scoutada, mas a aliança não sobe tanto (pode estar "roubando" pontos do parceiro ou o scout superestima). Positivo = ela soma mais do que aparece no scout.

### 4.8 Nova aba "_tiro" (oculta)

- `A2:A37`: os 36 códigos (A1, B1, …, F1, A2, …, F6).
- `B1:E1` = `Comparar!B3:E3`; `F1` = `'Mapa de tiro'!B1`.
- `B2:F2`: `MAP` com o peso de cada célula para cada equipe = nº de partidas em que usou a célula + nº em que foi principal (a principal pesa 2).
- `G2` = filtro de tipo do Comparar (`'_calcCmp'!R2`); `H2` = filtro do Mapa.

### 4.9 Partidas (teste)

- `AD1` = `placarAlianca` (formato copiado de AB1). A aba ganhou a coluna AD.
- `AC2:AC` limpo (ver 2.3).
- **Linhas 132–163: dados de teste** (`id` começando com `sin-`, scouter "Teste sinergia"): 8 qualificatórias (201–208), 4 equipes por partida, 16 alianças com placar, mapas no formato novo. Cada equipe tem um perfil fixo (posição inicial, fonte de coleta, zona de tiro) e os placares foram gerados com perda por conflito, então dá para conferir se a sinergia e o OPR fazem sentido. Podem ser apagados com `limparEventoTeste()`.

---

## 5. Calibração dos pesos (depois do código no ar)

1. Juntar umas 15–20 alianças com placar.
2. Na aba Placar real, olhar a coluna H (real − estimado) e o resumo Q3/Q4.
3. Se alianças com "Disputa" alta no Comparar tiverem diferença sistematicamente mais negativa, subir os pesos em Config!B11:B13; se não, baixar.
4. `Q4` (real ÷ estimado) muito diferente de 100% indica que o placar real tem pontos que o estimado não conta (bolas na HIVE, faltas). Isso desloca o OPR para cima ou para baixo, mas não afeta a comparação entre equipes.

---

## 6. Checklist para o chat do código

- [ ] Commitar `assets/arena.png` (anexo).
- [ ] Componente de mapa no passo 3 (seção 3.1), com rotação para Azul.
- [ ] Campo `placarAlianca` no último passo.
- [ ] `Code.gs`: gravar AD separado de AC, validações, setups (seção 3.2) usando as fórmulas do apêndice.
- [ ] Testar na planilha de teste: enviar 4 registros de uma mesma partida (2 Azul, 2 Vermelha) com mapa e placar, e conferir Placar real, Mapa de tiro e Comparar.
- [ ] Só então rodar o setup na produção (ou pedir para aplicar as mesmas mudanças lá pela planilha).

---

## Apêndice: fórmulas exatas (sintaxe en_US, para `setFormula`)


### Config A10:C15


**Config!A10**: `Sinergia e OPR`

**Config!A11**: `Peso: disputa de posição inicial`

**Config!B11**: `0.5`

**Config!C11**: `Fração dos pontos de auto da equipe mais fraca no auto que se perde quando as duas preferem a mesma HIVE. Valor inicial, calibrar com a aba Placar real.`

**Config!A12**: `Peso: disputa de coleta no auto`

**Config!B12**: `0.3`

**Config!C12**: `Fração dos pontos de auto da equipe mais fraca no auto que se perde quando as duas coletam da mesma fonte. Valor inicial, calibrar com a aba Placar real.`

**Config!A13**: `Peso: sobreposição de tiro`

**Config!B13**: `0.3`

**Config!C13**: `Fração dos pontos de tips no teleop da equipe mais fraca que se perde com 100% de sobreposição das zonas de tiro. Valor inicial, calibrar com a aba Placar real.`

**Config!A14**: `λ do OPR`

**Config!B14**: `3`

**Config!C14**: `Quantas partidas de "peso" a média do scout tem no OPR. Maior = OPR fica mais perto do scout enquanto há poucos placares.`

**Config!A15**: `Sinergia mínima`

**Config!B15**: `0.85`

**Config!C15**: `Abaixo disso o Comparar marca a aliança em vermelho.`


### _calcCmp T1:X2


**_calcCmp!T1**: `% início HIVE alta`

**_calcCmp!U1**: `% coleta no chão`

**_calcCmp!V1**: `% coleta na flor`

**_calcCmp!W1**: `Pontos no auto`

**_calcCmp!X1**: `Pontos de tips no teleop`

**_calcCmp!T2**
```
=MAP(A2:A201,C2:C201,LAMBDA(t,q,IF(N(q)=0,"",COUNTIFS(Partidas!$F:$F,t,Partidas!$H:$H,$R$2,Partidas!$J:$J,"HIVE alta")/q)))
```

**_calcCmp!U2**
```
=MAP(A2:A201,LAMBDA(t,IF(t="","",LET(na,COUNTIFS(Partidas!$F:$F,t,Partidas!$H:$H,$R$2,Partidas!$K:$K,"Sim"),IF(na=0,"",(COUNTIFS(Partidas!$F:$F,t,Partidas!$H:$H,$R$2,Partidas!$N:$N,"Chão")+COUNTIFS(Partidas!$F:$F,t,Partidas!$H:$H,$R$2,Partidas!$N:$N,"Ambas")/2)/na)))))
```

**_calcCmp!V2**
```
=MAP(A2:A201,LAMBDA(t,IF(t="","",LET(na,COUNTIFS(Partidas!$F:$F,t,Partidas!$H:$H,$R$2,Partidas!$K:$K,"Sim"),IF(na=0,"",(COUNTIFS(Partidas!$F:$F,t,Partidas!$H:$H,$R$2,Partidas!$N:$N,"Flor")+COUNTIFS(Partidas!$F:$F,t,Partidas!$H:$H,$R$2,Partidas!$N:$N,"Ambas")/2)/na)))))
```

**_calcCmp!W2**
```
=MAP(A2:A201,C2:C201,LAMBDA(t,q,IF(N(q)=0,"",(COUNTIFS(Partidas!$F:$F,t,Partidas!$H:$H,$R$2,Partidas!$L:$L,"Sim")*Config!$B$2+COUNTIFS(Partidas!$F:$F,t,Partidas!$H:$H,$R$2,Partidas!$M:$M,"Sim")*Config!$B$3+SUMIFS(Partidas!$Q:$Q,Partidas!$F:$F,t,Partidas!$H:$H,$R$2)*Config!$B$5)/q)))
```

**_calcCmp!X2**
```
=MAP(A2:A201,C2:C201,LAMBDA(t,q,IF(N(q)=0,"",SUMIFS(Partidas!$S:$S,Partidas!$F:$F,t,Partidas!$H:$H,$R$2)*Config!$B$5/q)))
```


### _calc S1:S2


**_calc!S1**: `OPR (placar real)`

**_calc!S2**
```
=MAP(A2:A201,LAMBDA(t,IF(t="","",IFERROR(VLOOKUP(t,'Placar real'!$J$2:$K$201,2,FALSE),""))))
```


### Ranking
**Ranking!R3**: `OPR (placar real)`

**Ranking!B4**
```
=IFERROR(CHOOSECOLS(SORT(FILTER('_calc'!A2:S201,ISNUMBER('_calc'!C2:C201),'_calc'!C2:C201>=MAX(1,N($H$1))),MATCH($D$1,'_calc'!A1:S1,0),$F$1="Menor primeiro"),1,2,3,4,5,6,7,15,16,8,9,10,11,12,13,14,19),"Nenhuma equipe com esses filtros")
```


### Placar real A1:Q6


**'Placar real'!A1**: `Tipo`

**'Placar real'!B1**: `Partida`

**'Placar real'!C1**: `Aliança`

**'Placar real'!D1**: `Equipe 1`

**'Placar real'!E1**: `Equipe 2`

**'Placar real'!F1**: `Placar real`

**'Placar real'!G1**: `Estimado (soma do scout)`

**'Placar real'!H1**: `Diferença (real − estimado)`

**'Placar real'!J1**: `Equipe`

**'Placar real'!K1**: `OPR`

**'Placar real'!L1**: `Média scout`

**'Placar real'!M1**: `OPR − média scout`

**'Placar real'!N1**: `Alianças com placar`

**'Placar real'!P1**: `Resumo`

**'Placar real'!A2**
```
=IFERROR(SORT(UNIQUE(FILTER({Partidas!H2:H,Partidas!E2:E,Partidas!I2:I},ISNUMBER(Partidas!AD2:AD))),1,TRUE,2,TRUE,3,TRUE),"")
```

**'Placar real'!D2**
```
=MAP(A2:A500,B2:B500,C2:C500,LAMBDA(t,m,a,IF(m="","",IFERROR(INDEX(UNIQUE(FILTER(Partidas!F2:F,Partidas!H2:H=t,Partidas!E2:E=m,Partidas!I2:I=a)),1,1),""))))
```

**'Placar real'!E2**
```
=MAP(A2:A500,B2:B500,C2:C500,LAMBDA(t,m,a,IF(m="","",IFERROR(INDEX(UNIQUE(FILTER(Partidas!F2:F,Partidas!H2:H=t,Partidas!E2:E=m,Partidas!I2:I=a)),2,1),""))))
```

**'Placar real'!F2**
```
=MAP(A2:A500,B2:B500,C2:C500,LAMBDA(t,m,a,IF(m="","",MAXIFS(Partidas!AD:AD,Partidas!H:H,t,Partidas!E:E,m,Partidas!I:I,a))))
```

**'Placar real'!G2**
```
=MAP(A2:A500,B2:B500,D2:D500,E2:E500,LAMBDA(t,m,x,y,IF(m="","",IFERROR(AVERAGEIFS(Partidas!AC:AC,Partidas!F:F,x,Partidas!H:H,t,Partidas!E:E,m),0)+IFERROR(AVERAGEIFS(Partidas!AC:AC,Partidas!F:F,y,Partidas!H:H,t,Partidas!E:E,m),0))))
```

**'Placar real'!H2**
```
=MAP(F2:F500,G2:G500,LAMBDA(r,e,IF(r="","",r-e)))
```

**'Placar real'!J2**
```
=IFERROR(LET(dd,FILTER(D2:F500,D2:D500<>"",E2:E500<>"",ISNUMBER(F2:F500)),ta,INDEX(dd,0,1),tb,INDEX(dd,0,2),sc,INDEX(dd,0,3),tm,SORT(UNIQUE(VSTACK(ta,tb))),k,ROWS(tm),ma,ARRAYFORMULA((ta=TRANSPOSE(tm))+(tb=TRANSPOSE(tm))),pr,MAP(tm,LAMBDA(x,IFERROR(AVERAGEIF(Partidas!F:F,x,Partidas!AC:AC),0))),lam,Config!$B$14,idm,ARRAYFORMULA(--(SEQUENCE(k)=TRANSPOSE(SEQUENCE(k)))),mm,ARRAYFORMULA(MMULT(TRANSPOSE(ma),ma)+lam*idm),vb,ARRAYFORMULA(MMULT(TRANSPOSE(ma),sc)+lam*pr),HSTACK(tm,MMULT(MINVERSE(mm),vb))),"")
```

**'Placar real'!L2**
```
=MAP(J2:J201,LAMBDA(t,IF(t="","",IFERROR(AVERAGEIF(Partidas!F:F,t,Partidas!AC:AC),""))))
```

**'Placar real'!M2**
```
=MAP(K2:K201,L2:L201,LAMBDA(o,m,IF(OR(o="",m=""),"",o-m)))
```

**'Placar real'!N2**
```
=MAP(J2:J201,LAMBDA(t,IF(t="","",COUNTIF(D2:E500,t))))
```

**'Placar real'!P2**: `Alianças com placar`

**'Placar real'!Q2**
```
=COUNT(F2:F500)
```

**'Placar real'!P3**: `Diferença média (real − estimado)`

**'Placar real'!Q3**
```
=IF(Q2=0,"",AVERAGE(H2:H500))
```

**'Placar real'!P4**: `Placar real ÷ estimado`

**'Placar real'!Q4**
```
=IF(Q2=0,"",SUM(F2:F500)/SUM(G2:G500))
```

**'Placar real'!P6**: `Uma linha por aliança em cada partida com placar registrado. Equipe 1 e 2 vêm das linhas da aba Partidas; se dois scouters digitarem o placar, vale o maior.`


### _tiro A1:H2 (A3:A37 = demais códigos B1…F6, em ordem de linha)


**_tiro!A1**: `Célula`

**_tiro!B1**
```
=Comparar!B3
```

**_tiro!C1**
```
=Comparar!C3
```

**_tiro!D1**
```
=Comparar!D3
```

**_tiro!E1**
```
=Comparar!E3
```

**_tiro!F1**
```
='Mapa de tiro'!B1
```

**_tiro!G1**: `Filtro Comparar`

**_tiro!H1**: `Filtro Mapa`

**_tiro!A2**: `A1`

**_tiro!B2**
```
=MAP($A$2:$A$37,LAMBDA(c,IF(B$1="",0,COUNTIFS(Partidas!$F:$F,B$1,Partidas!$H:$H,$G$2,Partidas!$AA:$AA,"*"&c&"*")+COUNTIFS(Partidas!$F:$F,B$1,Partidas!$H:$H,$G$2,Partidas!$AA:$AA,"*"&c&"~**"))))
```

**_tiro!C2**
```
=MAP($A$2:$A$37,LAMBDA(c,IF(C$1="",0,COUNTIFS(Partidas!$F:$F,C$1,Partidas!$H:$H,$G$2,Partidas!$AA:$AA,"*"&c&"*")+COUNTIFS(Partidas!$F:$F,C$1,Partidas!$H:$H,$G$2,Partidas!$AA:$AA,"*"&c&"~**"))))
```

**_tiro!D2**
```
=MAP($A$2:$A$37,LAMBDA(c,IF(D$1="",0,COUNTIFS(Partidas!$F:$F,D$1,Partidas!$H:$H,$G$2,Partidas!$AA:$AA,"*"&c&"*")+COUNTIFS(Partidas!$F:$F,D$1,Partidas!$H:$H,$G$2,Partidas!$AA:$AA,"*"&c&"~**"))))
```

**_tiro!E2**
```
=MAP($A$2:$A$37,LAMBDA(c,IF(E$1="",0,COUNTIFS(Partidas!$F:$F,E$1,Partidas!$H:$H,$G$2,Partidas!$AA:$AA,"*"&c&"*")+COUNTIFS(Partidas!$F:$F,E$1,Partidas!$H:$H,$G$2,Partidas!$AA:$AA,"*"&c&"~**"))))
```

**_tiro!F2**
```
=MAP($A$2:$A$37,LAMBDA(c,IF(F$1="",0,COUNTIFS(Partidas!$F:$F,F$1,Partidas!$H:$H,$H$2,Partidas!$AA:$AA,"*"&c&"*")+COUNTIFS(Partidas!$F:$F,F$1,Partidas!$H:$H,$H$2,Partidas!$AA:$AA,"*"&c&"~**"))))
```

**_tiro!G2**
```
='_calcCmp'!R2
```

**_tiro!H2**
```
=IF('Mapa de tiro'!D1="Todas","*",'Mapa de tiro'!D1)
```


### Mapa de tiro
Linhas 4–9 de B e I recebem os números 1–6; C3:H3 e J3:O3 as letras A–F.


**'Mapa de tiro'!A1**: `Equipe`

**'Mapa de tiro'!C1**: `Tipo de partida`

**'Mapa de tiro'!D1**: `Todas`

**'Mapa de tiro'!F1**: `Partidas com mapa`

**'Mapa de tiro'!G1**
```
=IF($B$1="","",SUMPRODUCT((Partidas!$F$2:$F=$B$1)*(((($D$1="Todas")+(Partidas!$H$2:$H=$D$1))>0))*REGEXMATCH(Partidas!$AA$2:$AA&"","^[A-F][1-6]")))
```

**'Mapa de tiro'!B2**: `% das partidas em que atirou da célula`

**'Mapa de tiro'!I2**: `% das partidas em que foi a posição principal`

**'Mapa de tiro'!C3**: `A`

**'Mapa de tiro'!D3**: `B`

**'Mapa de tiro'!E3**: `C`

**'Mapa de tiro'!F3**: `D`

**'Mapa de tiro'!G3**: `E`

**'Mapa de tiro'!H3**: `F`

**'Mapa de tiro'!J3**: `A`

**'Mapa de tiro'!K3**: `B`

**'Mapa de tiro'!L3**: `C`

**'Mapa de tiro'!M3**: `D`

**'Mapa de tiro'!N3**: `E`

**'Mapa de tiro'!O3**: `F`

**'Mapa de tiro'!B4**: `1`

**'Mapa de tiro'!C4**
```
=IF(N($G$1)=0,"",MAKEARRAY(6,6,LAMBDA(r,c,COUNTIFS(Partidas!$F:$F,$B$1,Partidas!$H:$H,IF($D$1="Todas","*",$D$1),Partidas!$AA:$AA,"*"&CHAR(64+c)&r&"*")/$G$1)))
```

**'Mapa de tiro'!I4**: `1`

**'Mapa de tiro'!J4**
```
=IF(N($G$1)=0,"",MAKEARRAY(6,6,LAMBDA(r,c,COUNTIFS(Partidas!$F:$F,$B$1,Partidas!$H:$H,IF($D$1="Todas","*",$D$1),Partidas!$AA:$AA,"*"&CHAR(64+c)&r&"~**")/$G$1)))
```

**'Mapa de tiro'!B5**: `2`

**'Mapa de tiro'!I5**: `2`

**'Mapa de tiro'!B6**: `3`

**'Mapa de tiro'!I6**: `3`

**'Mapa de tiro'!B7**: `4`

**'Mapa de tiro'!I7**: `4`

**'Mapa de tiro'!B8**: `5`

**'Mapa de tiro'!I8**: `5`

**'Mapa de tiro'!B9**: `6`

**'Mapa de tiro'!I9**: `6`

**'Mapa de tiro'!B11**: `Arena (mesma escala e orientação da grade)`

**'Mapa de tiro'!C12**
```
=IMAGE("https://raw.githubusercontent.com/mhl2102/Scout-Biobuzz/main/assets/arena.png",1)
```

**'Mapa de tiro'!B19**: `Grade vista do lado da aliança da própria equipe: a aliança dela fica à esquerda (coluna A), como a Vermelha na imagem. Para robôs da Aliança Azul o app gira a arena 180° antes de gravar. Registros antigos em texto livre não entram no mapa.`


### Comparar A26:E48
Células vazias não listadas. Linhas 40–46: B e D carregam a fórmula; C e E ficam vazias (mescladas com B e D).


**Comparar!B26**
```
=IF(COUNT(B7:C7)=0,"",SUM(B7:C7))
```

**Comparar!B27**
```
=IF(COUNT(B25,D25)<2,"Preencha as equipes das duas alianças",LET(az,IF(ISNUMBER(B44),B44,B25),vm,IF(ISNUMBER(D44),D44,D25),IF(ABS(az-vm)<1,"Equilibrada",IF(az>vm,"Azul","Vermelha")&" favorita por "&ROUND(ABS(az-vm),1)&" pts")&IF(COUNT(B6:E6)<4,"  ⚠ "&(4-COUNT(B6:E6))&" equipe(s) sem dados nesse tipo","")))
```

**Comparar!A29**: `PERFIL DE ESTRATÉGIA`

**Comparar!A30**: `% início HIVE alta`

**Comparar!B30**
```
=MAP($B$3:$E$3,LAMBDA(t,IF(t="","",IFERROR(VLOOKUP(t,'_calcCmp'!$A$2:$X$201,MATCH($A30,'_calcCmp'!$A$1:$X$1,0),FALSE),""))))
```

**Comparar!A31**: `% coleta no chão`

**Comparar!B31**
```
=MAP($B$3:$E$3,LAMBDA(t,IF(t="","",IFERROR(VLOOKUP(t,'_calcCmp'!$A$2:$X$201,MATCH($A31,'_calcCmp'!$A$1:$X$1,0),FALSE),""))))
```

**Comparar!A32**: `% coleta na flor`

**Comparar!B32**
```
=MAP($B$3:$E$3,LAMBDA(t,IF(t="","",IFERROR(VLOOKUP(t,'_calcCmp'!$A$2:$X$201,MATCH($A32,'_calcCmp'!$A$1:$X$1,0),FALSE),""))))
```

**Comparar!A33**: `Pontos no auto`

**Comparar!B33**
```
=MAP($B$3:$E$3,LAMBDA(t,IF(t="","",IFERROR(VLOOKUP(t,'_calcCmp'!$A$2:$X$201,MATCH($A33,'_calcCmp'!$A$1:$X$1,0),FALSE),""))))
```

**Comparar!A34**: `Pontos de tips no teleop`

**Comparar!B34**
```
=MAP($B$3:$E$3,LAMBDA(t,IF(t="","",IFERROR(VLOOKUP(t,'_calcCmp'!$A$2:$X$201,MATCH($A34,'_calcCmp'!$A$1:$X$1,0),FALSE),""))))
```

**Comparar!A35**: `Zona de tiro principal`

**Comparar!B35**
```
=IF(B$3="","",LET(cc,'_tiro'!$A$2:$A$37,w,'_tiro'!B$2:B$37,IF(SUM(w)=0,"Sem mapa",INDEX(cc,MATCH(MAX(w),w,0))&" ("&TEXT(MAX(w)/SUM(w),"0%")&")")))
```

**Comparar!C35**
```
=IF(C$3="","",LET(cc,'_tiro'!$A$2:$A$37,w,'_tiro'!C$2:C$37,IF(SUM(w)=0,"Sem mapa",INDEX(cc,MATCH(MAX(w),w,0))&" ("&TEXT(MAX(w)/SUM(w),"0%")&")")))
```

**Comparar!D35**
```
=IF(D$3="","",LET(cc,'_tiro'!$A$2:$A$37,w,'_tiro'!D$2:D$37,IF(SUM(w)=0,"Sem mapa",INDEX(cc,MATCH(MAX(w),w,0))&" ("&TEXT(MAX(w)/SUM(w),"0%")&")")))
```

**Comparar!E35**
```
=IF(E$3="","",LET(cc,'_tiro'!$A$2:$A$37,w,'_tiro'!E$2:E$37,IF(SUM(w)=0,"Sem mapa",INDEX(cc,MATCH(MAX(w),w,0))&" ("&TEXT(MAX(w)/SUM(w),"0%")&")")))
```

**Comparar!A36**: `OPR (placar real)`

**Comparar!B36**
```
=MAP($B$3:$E$3,LAMBDA(t,IF(t="","",IFERROR(VLOOKUP(t,'Placar real'!$J$2:$M$201,2,FALSE),"—"))))
```

**Comparar!A37**: `OPR − média scout`

**Comparar!B37**
```
=MAP($B$3:$E$3,LAMBDA(t,IF(t="","",IFERROR(VLOOKUP(t,'Placar real'!$J$2:$M$201,4,FALSE),"—"))))
```

**Comparar!A39**: `SINERGIA DA ALIANÇA (desconta conflitos de estratégia)`

**Comparar!A40**: `Disputa da posição inicial`

**Comparar!B40**
```
=IF(COUNT(B30:C30)<2,"",B30*C30+(1-B30)*(1-C30))
```

**Comparar!D40**
```
=IF(COUNT(D30:E30)<2,"",D30*E30+(1-D30)*(1-E30))
```

**Comparar!A41**: `Disputa da fonte de coleta no auto`

**Comparar!B41**
```
=IF(COUNT(B31:C32)<4,"",B31*C31+B32*C32)
```

**Comparar!D41**
```
=IF(COUNT(D31:E32)<4,"",D31*E31+D32*E32)
```

**Comparar!A42**: `Sobreposição das zonas de tiro`

**Comparar!B42**
```
=LET(a,'_tiro'!B$2:B$37,b,'_tiro'!C$2:C$37,IF(OR(B$3="",C$3="",SUM(a)=0,SUM(b)=0),"",SUMPRODUCT((a/SUM(a)+b/SUM(b)-ABS(a/SUM(a)-b/SUM(b)))/2)))
```

**Comparar!D42**
```
=LET(a,'_tiro'!D$2:D$37,b,'_tiro'!E$2:E$37,IF(OR(D$3="",E$3="",SUM(a)=0,SUM(b)=0),"",SUMPRODUCT((a/SUM(a)+b/SUM(b)-ABS(a/SUM(a)-b/SUM(b)))/2)))
```

**Comparar!A43**: `Perda estimada (pts)`

**Comparar!B43**
```
=IF(COUNT(B33:C34)<4,"",MIN(1,N(B40)*Config!$B$11+N(B41)*Config!$B$12)*MIN(B33:C33)+N(B42)*Config!$B$13*MIN(B34:C34))
```

**Comparar!D43**
```
=IF(COUNT(D33:E34)<4,"",MIN(1,N(D40)*Config!$B$11+N(D41)*Config!$B$12)*MIN(D33:E33)+N(D42)*Config!$B$13*MIN(D34:E34))
```

**Comparar!A44**: `Pontos ajustados`

**Comparar!B44**
```
=IF(OR(B25="",B43=""),"",B25-B43)
```

**Comparar!D44**
```
=IF(OR(D25="",D43=""),"",D25-D43)
```

**Comparar!A45**: `Sinergia`

**Comparar!B45**
```
=IF(OR(B44="",N(B25)=0),"",B44/B25)
```

**Comparar!D45**
```
=IF(OR(D44="",N(D25)=0),"",D44/D25)
```

**Comparar!A46**: `Leitura`

**Comparar!B46**
```
=IF(B45="","",IF(B45>=Config!$B$15,"Complementares",LET(x,TEXTJOIN(", ",TRUE,IF(N(B40)>=1/2,"mesma posição inicial",""),IF(N(B41)>=1/2,"mesma fonte de coleta",""),IF(N(B42)>=1/2,"mesma zona de tiro","")),"Atenção: "&IF(x="","vários conflitos pequenos",x))))
```

**Comparar!D46**
```
=IF(D45="","",IF(D45>=Config!$B$15,"Complementares",LET(x,TEXTJOIN(", ",TRUE,IF(N(D40)>=1/2,"mesma posição inicial",""),IF(N(D41)>=1/2,"mesma fonte de coleta",""),IF(N(D42)>=1/2,"mesma zona de tiro","")),"Atenção: "&IF(x="","vários conflitos pequenos",x))))
```

**Comparar!A48**: `Escolha o tipo de partida em B1 e as equipes na linha 3 (B–C = Aliança Azul, D–E = Aliança Vermelha). Verde = melhor valor da linha (em % pifou, o menor). Precisão: 1 = Baixa, 2 = Média, 3 = Alta. A Previsão usa os pontos ajustados pela sinergia quando há dados; pesos e limite na aba Config.`


### Partidas
**Partidas!AD1**: `placarAlianca`  
`AC1` continua com a ARRAYFORMULA de pontosEstimados, sem mudança.
