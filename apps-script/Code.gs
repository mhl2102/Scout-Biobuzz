/**
 * BIOBUZZ Scout · versão Planilha · Apps Script
 *
 * Recebe as partidas enviadas pelo site e grava na planilha do evento.
 * Cada evento tem a sua planilha, então o "Evento teste" nunca mistura
 * dados com a Seletiva.
 *
 * Senha da equipe: Configurações do projeto > Propriedades do script >
 * SCOUT_KEY. Ela nunca fica neste arquivo nem no site.
 *
 * Funções para rodar à mão no editor:
 *   setup()             monta ou refaz a estrutura das planilhas (pode rodar de novo)
 *   limparEventoTeste() apaga as partidas da planilha de teste
 */

const EVENTS = {
  'Seletiva RS': '1ov75brRKteBhUnTYTJvuuhZXz-ftMr5Ma_Fq339AFyg',
  'Evento teste': '15OcV-Eve36FfeRi6-OMgrieWwy7y6oYNM3IRYBBJ2KY'
};
const TEST_EVENT = 'Evento teste';

// Colunas da aba Partidas, na ordem. pontosEstimados é fórmula (coluna AC).
const COLS = ['id', 'recebidoEm', 'criadoEm', 'scouter', 'match', 'team', 'origin', 'type', 'alliance',
  'aStart', 'aHas', 'aLeave', 'aPark', 'aCollect', 'aAcc', 'aBalls', 'aTips',
  'tBalls', 'tTips', 'tGarden', 'tFlower', 'tPark', 'tBroke', 'tAcc',
  'shootSpeed', 'robotSpeed', 'shootSpot', 'notes'];
const NUMS = ['match', 'team', 'aBalls', 'aTips', 'tBalls', 'tTips', 'tGarden'];
const SN = ['Sim', 'Não'];
const ENUMS = {
  type: ['Treino', 'Qualificatória', 'Playoff'],
  alliance: ['Vermelha', 'Azul'],
  aStart: ['HIVE baixa', 'HIVE alta'],
  aHas: SN, aLeave: SN, aPark: SN, tFlower: SN, tPark: SN, tBroke: SN,
  aCollect: ['Chão', 'Flor', 'Ambas', 'Não coletou'],
  aAcc: ['Baixa', 'Média', 'Alta', ''], tAcc: ['Baixa', 'Média', 'Alta'],
  shootSpeed: ['Lento', 'Médio', 'Rápido'], robotSpeed: ['Lento', 'Médio', 'Rápido']
};
const REQ = ['match', 'team', 'origin', 'type', 'alliance', 'aStart', 'aHas', 'tBalls', 'tFlower', 'tPark',
  'tBroke', 'tAcc', 'shootSpeed', 'robotSpeed', 'shootSpot'];
const REQ_AUTO = ['aLeave', 'aBalls', 'aCollect', 'aPark', 'aAcc'];
const MAX_TEAMS = 200;

// Equipes carregadas pelo setup() quando a aba Equipes está vazia
const SEED_TEAMS = {
  'Seletiva RS': [
    [14391, 'Under Ctrl'], [15932, 'Out of Ctrl'], [16041, 'BAHTECH'], [16062, 'TchêStorm'],
    [16786, 'Cavalo Vendado'], [21342, 'Lösungsjäger'], [31200, 'JaguaRS'], [31258, 'Technoibots'],
    [33984, 'Fantech'], [39036, 'AeroPampa'], [39097, 'Querência Bots'], [39247, 'TECH TOWERS']
  ],
  'Evento teste': [
    [1001, 'Teste Alfa'], [1002, 'Teste Beta'], [1003, 'Teste Gama'], [1004, 'Teste Delta'],
    [1005, 'Teste Épsilon'], [1006, 'Teste Zeta'], [1007, 'Teste Eta'], [1008, 'Teste Teta']
  ]
}; // linhas reservadas nas abas de cálculo

/* ================= Web App ================= */

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'ping';
  if (action === 'teams') return out_({ ok: true, events: listEvents_() });
  return out_({ ok: true });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_row' }); }
  if (!body || typeof body !== 'object') return out_({ ok: false, error: 'bad_row' });

  const key = PropertiesService.getScriptProperties().getProperty('SCOUT_KEY');
  if (!key || String(body.key || '') !== key) return out_({ ok: false, error: 'bad_key' });

  const row = clean_(body.row);
  if (!row) return out_({ ok: false, error: 'bad_row' });
  if (!EVENTS[row.origin]) return out_({ ok: false, error: 'bad_event' });

  const ss = SpreadsheetApp.openById(EVENTS[row.origin]);
  if (!teamSet_(ss)[row.team]) return out_({ ok: false, error: 'bad_team' });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return out_({ ok: false, error: 'busy' });
  try {
    const sh = ss.getSheetByName('Partidas');
    const last = lastDataRow_(sh);
    const data = last > 1 ? sh.getRange(2, 1, last - 1, 9).getValues() : [];
    let at = -1, dup = null;
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (String(r[0]) === row.id) { at = i + 2; continue; }
      if (!dup && +r[4] === row.match && +r[5] === row.team && String(r[7]) === row.type) {
        dup = { scouter: String(r[3]), criadoEm: r[2] instanceof Date ? r[2].toISOString() : String(r[2]) };
      }
    }
    row.recebidoEm = new Date();
    const vals = [COLS.map(c => row[c] === undefined ? '' : row[c])];
    let status;
    if (at > 0) {
      sh.getRange(at, 1, 1, COLS.length).setValues(vals);
      status = 'updated';
    } else {
      if (last + 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 500);
      sh.getRange(last + 1, 1, 1, COLS.length).setValues(vals);
      status = 'created';
    }
    SpreadsheetApp.flush();
    return out_({ ok: true, id: row.id, status: status, dup: dup });
  } finally {
    lock.releaseLock();
  }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Valida e normaliza a linha. Devolve null se algo obrigatório faltar ou vier fora do esperado. */
function clean_(r) {
  if (!r || typeof r !== 'object') return null;
  const o = {};
  const id = String(r.id || '').trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return null;
  o.id = id;
  o.origin = String(r.origin || '').trim();
  o.scouter = safe_(String(r.scouter || '').trim().slice(0, 60));
  if (!o.scouter) return null;
  const c = new Date(r.criadoEm);
  o.criadoEm = isNaN(c.getTime()) ? '' : c;

  NUMS.forEach(k => {
    const v = r[k];
    o[k] = (v === '' || v === null || v === undefined) ? '' : Number(v);
  });
  for (const k of NUMS) {
    if (o[k] === '') continue;
    if (!isFinite(o[k]) || o[k] < 0 || o[k] > 99999 || Math.floor(o[k]) !== o[k]) return null;
  }
  if (!(o.match >= 1) || !(o.team >= 1)) return null;

  Object.keys(ENUMS).forEach(k => { o[k] = String(r[k] == null ? '' : r[k]).trim(); });
  for (const k of Object.keys(ENUMS)) {
    if (o[k] !== '' && ENUMS[k].indexOf(o[k]) < 0) return null;
  }
  o.shootSpot = safe_(String(r.shootSpot || '').trim().slice(0, 200));
  o.notes = safe_(String(r.notes || '').trim().slice(0, 1000));

  const need = REQ.concat(o.aHas === 'Sim' ? REQ_AUTO : []);
  for (const k of need) { if (o[k] === '' || o[k] === undefined) return null; }
  if (o.aHas !== 'Sim') { o.aLeave = 'Não'; o.aBalls = 0; o.aTips = 0; o.aCollect = 'Não coletou'; o.aPark = 'Não'; o.aAcc = ''; }
  ['aTips', 'tTips', 'tGarden'].forEach(k => { if (o[k] === '') o[k] = 0; });
  return o;
}

/** Evita que um texto começando com = + - @ vire fórmula na planilha. */
function safe_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }

/** Última linha com id na coluna A (a coluna de fórmula não conta). */
function lastDataRow_(sh) {
  const n = sh.getMaxRows();
  const a = sh.getRange(1, 1, n, 1).getValues();
  for (let i = a.length - 1; i >= 0; i--) if (String(a[i][0]) !== '') return i + 1;
  return 1;
}

function readTeams_(ss) {
  const sh = ss.getSheetByName('Equipes');
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
    .filter(r => r[0] !== '' && isFinite(Number(r[0])) && Number(r[0]) > 0)
    .map(r => ({ team: Number(r[0]), name: String(r[1] || '').trim() }));
}

function teamSet_(ss) {
  const s = {};
  readTeams_(ss).forEach(t => { s[t.team] = 1; });
  return s;
}

function listEvents_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('events');
  if (hit) return JSON.parse(hit);
  const list = Object.keys(EVENTS).map(name => {
    let teams = [];
    try { teams = readTeams_(SpreadsheetApp.openById(EVENTS[name])); } catch (err) { teams = []; }
    teams.sort((a, b) => a.team - b.team);
    return { name: name, teams: teams };
  });
  cache.put('events', JSON.stringify(list), 60);
  return list;
}

/* ================= Montagem das planilhas ================= */

function setup() {
  Object.keys(EVENTS).forEach(name => setupSpreadsheet_(SpreadsheetApp.openById(EVENTS[name]), name));
  CacheService.getScriptCache().remove('events');
}

function limparEventoTeste() {
  const sh = SpreadsheetApp.openById(EVENTS[TEST_EVENT]).getSheetByName('Partidas');
  const last = lastDataRow_(sh);
  if (last > 1) sh.getRange(2, 1, last - 1, COLS.length).clearContent();
}

function setupSpreadsheet_(ss, eventName) {
  ss.setSpreadsheetTimeZone('America/Sao_Paulo');
  // As fórmulas abaixo usam a sintaxe em inglês (vírgula separa argumentos). Em pt_BR a vírgula é
  // decimal e tudo vira #ERROR!, então escreve em en_US e volta para pt_BR no fim: o Sheets
  // converte as fórmulas já gravadas para a sintaxe do novo idioma.
  ss.setSpreadsheetLocale('en_US');
  const names = ['Partidas', 'Equipes', 'Ranking', 'Comparar', 'Gráficos', 'Config', '_calc'];
  const sh = {};
  names.forEach((n, i) => {
    let s = ss.getSheetByName(n);
    if (!s) s = ss.insertSheet(n, i);
    sh[n] = s;
  });
  // apaga a aba padrão vazia (Página1 / Sheet1)
  ss.getSheets().forEach(s => {
    if (names.indexOf(s.getName()) < 0 && s.getLastRow() === 0) ss.deleteSheet(s);
  });
  names.forEach((n, i) => { ss.setActiveSheet(sh[n]); ss.moveActiveSheet(i + 1); });

  // remove proteções feitas por uma execução anterior
  ss.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => { if (p.getDescription().indexOf('BIOBUZZ') === 0) p.remove(); });

  setupConfig_(sh.Config);
  setupEquipes_(sh.Equipes, eventName);
  setupPartidas_(sh.Partidas);
  setupCalc_(sh._calc);
  setupRanking_(sh.Ranking);
  setupComparar_(sh.Comparar, sh.Equipes);
  setupGraficos_(sh['Gráficos']);
  ss.setActiveSheet(sh.Partidas);
  SpreadsheetApp.flush();
  ss.setSpreadsheetLocale('pt_BR');
  SpreadsheetApp.flush();
}

function header_(s, vals) {
  s.getRange(1, 1, 1, vals.length).setValues([vals]).setFontWeight('bold').setBackground('#2e2350').setFontColor('#ffffff');
  s.setFrozenRows(1);
}

function protect_(s, label) {
  const p = s.protect().setDescription('BIOBUZZ ' + label).setWarningOnly(true);
  return p;
}

function setupConfig_(s) {
  s.clear();
  header_(s, ['Item', 'Pontos', 'Observação']);
  s.getRange(2, 1, 5, 3).setValues([
    ['LEAVE (autônomo)', 3, 'Saiu da base no autônomo'],
    ['PARK no autônomo', 5, 'Na LOADING ZONE no fim do autônomo'],
    ['PARK no fim', 5, 'Na LOADING ZONE no fim da partida'],
    ['HIVE TIP', 20, 'Por tip, autônomo + teleop'],
    ['GARDEN', 1, 'Por elemento no GARDEN no fim']
  ]);
  s.getRange(8, 1).setValue('Bolas na HIVE não entram na pontuação estimada; são só dado estatístico.').setFontStyle('italic');
  s.autoResizeColumns(1, 3);
  protect_(s, 'Config');
}

function setupEquipes_(s, eventName) {
  header_(s, ['Número', 'Nome']);
  // só preenche se a aba ainda estiver vazia; depois disso a lista é mantida à mão
  const seed = SEED_TEAMS[eventName];
  if (s.getLastRow() < 2 && seed) s.getRange(2, 1, seed.length, 2).setValues(seed);
  s.getRange('A:A').setNumberFormat('0');
  s.setColumnWidth(1, 90); s.setColumnWidth(2, 260);
}

function setupPartidas_(s) {
  header_(s, COLS.concat(['pontosEstimados']));
  s.getRange('AC1').setFormula(
    '={"pontosEstimados";ARRAYFORMULA(IF(A2:A="","",' +
    '(L2:L="Sim")*Config!$B$2+(M2:M="Sim")*Config!$B$3+(V2:V="Sim")*Config!$B$4+' +
    '(Q2:Q+S2:S)*Config!$B$5+T2:T*Config!$B$6))}');
  s.getRange('B:C').setNumberFormat('dd/MM/yyyy HH:mm:ss');
  s.getRange('A:A').setNumberFormat('@');
  s.getRange('AC:AC').setBackground('#f1eaff');
  // mesma equipe na mesma partida (e tipo) registrada mais de uma vez
  const dup = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($F2<>"",COUNTIFS($E:$E,$E2,$F:$F,$F2,$H:$H,$H2)>1)')
    .setBackground('#ffd77a')
    .setRanges([s.getRange('A2:AC')])
    .build();
  s.setConditionalFormatRules([dup]);
  protect_(s, 'Partidas');
}

// métricas por equipe, na ordem das colunas de _calc (A..N)
const METRICS = ['Equipe', 'Nome', 'Partidas', 'Pontos (média)', 'Pontos (máx)', 'Bolas auto', 'Bolas teleop',
  'Tips', 'GARDEN', '% LEAVE', '% PARK auto', '% PARK final', '% pifou', '% com autônomo'];

function setupCalc_(s) {
  s.clear();
  header_(s, METRICS);
  s.getRange('A2').setFormula('=IFERROR(FILTER(Equipes!A2:B,Equipes!A2:A<>""),"")');
  const P = 'Partidas!';
  const f = [];
  for (let r = 2; r <= MAX_TEAMS + 1; r++) {
    const t = '$A' + r, n = '$C' + r, ok = 'N(' + n + ')=0';
    const cnt = (col) => 'COUNTIFS(' + P + '$F:$F,' + t + ',' + P + '$' + col + ':$' + col + ',"Sim")/' + n;
    const avg = (col) => 'AVERAGEIF(' + P + '$F:$F,' + t + ',' + P + '$' + col + ':$' + col + ')';
    const wrap = (x) => '=IF(' + ok + ',"",' + x + ')';
    f.push([
      '=IF(' + t + '="","",COUNTIF(' + P + '$F:$F,' + t + '))',
      wrap(avg('AC')),
      wrap('MAXIFS(' + P + '$AC:$AC,' + P + '$F:$F,' + t + ')'),
      wrap(avg('P')),
      wrap(avg('R')),
      wrap('(SUMIF(' + P + '$F:$F,' + t + ',' + P + '$Q:$Q)+SUMIF(' + P + '$F:$F,' + t + ',' + P + '$S:$S))/' + n),
      wrap(avg('T')),
      wrap(cnt('L')),
      wrap(cnt('M')),
      wrap(cnt('V')),
      wrap(cnt('W')),
      wrap(cnt('K'))
    ]);
  }
  s.getRange(2, 3, MAX_TEAMS, 12).setFormulas(f);
  s.hideSheet();
  protect_(s, '_calc');
}

function setupRanking_(s) {
  s.clear();
  header_(s, ['#'].concat(METRICS));
  const end = MAX_TEAMS + 1;
  s.getRange('A2').setFormula('=ARRAYFORMULA(IF(B2:B' + end + '="","",ROW(B2:B' + end + ')-1))');
  s.getRange('B2').setFormula('=IFERROR(SORT(FILTER(_calc!A2:N' + end + ',ISNUMBER(_calc!D2:D' + end + ')),4,FALSE),"")');
  s.getRange('B:B').setNumberFormat('0');
  s.getRange('E:J').setNumberFormat('0.0');
  s.getRange('K:O').setNumberFormat('0%');
  s.getRange('E2:E').setFontWeight('bold');
  s.setColumnWidth(3, 200);
  s.getRange('A' + (end + 2)).setValue('Ordenado pela pontuação estimada média. Bolas, tips e GARDEN são médias por partida.').setFontStyle('italic');
  protect_(s, 'Ranking');
}

function setupComparar_(s, equipes) {
  s.clear();
  s.getRange('A1').setValue('Equipe').setFontWeight('bold');
  const cells = s.getRange('B1:E1');
  cells.clearContent().setBackground('#fff4cc').setFontWeight('bold').setHorizontalAlignment('center');
  cells.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(equipes.getRange('A2:A'), true).setAllowInvalid(false).build());
  const labels = METRICS.slice(1); // Nome .. % com autônomo
  s.getRange(2, 1, labels.length, 1).setValues(labels.map(l => [l])).setFontWeight('bold');
  const f = [];
  for (let i = 0; i < labels.length; i++) {
    const row = [], col = i + 2; // coluna dentro de _calc!A:N
    ['B', 'C', 'D', 'E'].forEach(c => row.push('=IF(' + c + '$1="","",IFERROR(VLOOKUP(' + c + '$1,_calc!$A$2:$N$' + (MAX_TEAMS + 1) + ',' + col + ',FALSE),""))'));
    f.push(row);
  }
  s.getRange(2, 2, labels.length, 4).setFormulas(f).setHorizontalAlignment('center');
  s.getRange('B4:E9').setNumberFormat('0.0');
  s.getRange('B10:E14').setNumberFormat('0%');
  const best = (range, fn) => SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND(ISNUMBER(B' + range.getRow() + '),COUNT($B' + range.getRow() + ':$E' + range.getRow() + ')>1,B' + range.getRow() + '=' + fn + '($B' + range.getRow() + ':$E' + range.getRow() + '))')
    .setBackground('#c8f7d4').setBold(true).setRanges([range]).build();
  const rules = [];
  for (let r = 4; r <= 14; r++) rules.push(best(s.getRange('B' + r + ':E' + r), r === 13 ? 'MIN' : 'MAX'));
  s.setConditionalFormatRules(rules);
  s.setColumnWidth(1, 150);
  for (let c = 2; c <= 5; c++) s.setColumnWidth(c, 140);
  s.getRange('A16').setValue('Escolha até 4 equipes na linha 1. Verde é o melhor valor de cada linha (em % pifou, o menor).').setFontStyle('italic');
  protect_(s, 'Comparar').setUnprotectedRanges([s.getRange('B1:E1')]);
}

function setupGraficos_(s) {
  s.clear();
  s.getCharts().forEach(c => s.removeChart(c));
  header_(s, ['Equipe', 'Pontos (média)', 'Pontuação estimada', 'Bolas auto', 'Bolas teleop', 'Bolas na HIVE: auto (roxo) e teleop (amarelo)']);
  const end = MAX_TEAMS + 1;
  s.getRange('A2').setFormula('=ARRAYFORMULA(IF(Ranking!B2:B' + end + '="","",Ranking!B2:B' + end + '&IF(Ranking!C2:C' + end + '="",""," · "&Ranking!C2:C' + end + ')))');
  s.getRange('B2').setFormula('=ARRAYFORMULA(IF(Ranking!B2:B' + end + '="","",Ranking!E2:E' + end + '))');
  s.getRange('D2').setFormula('=ARRAYFORMULA(IF(Ranking!B2:B' + end + '="","",Ranking!G2:G' + end + '))');
  s.getRange('E2').setFormula('=ARRAYFORMULA(IF(Ranking!B2:B' + end + '="","",Ranking!H2:H' + end + '))');
  const fc = [], ff = [];
  for (let r = 2; r <= end; r++) {
    fc.push(['=IF(ISNUMBER(B' + r + '),SPARKLINE(B' + r + ',{"charttype","bar";"max",MAX($B$2:$B$' + end + ');"color1","#8b3dff"}),"")']);
    ff.push(['=IF(ISNUMBER(D' + r + '),SPARKLINE({D' + r + ',E' + r + '},{"charttype","bar";"max",MAX($D$2:$D$' + end + ')+MAX($E$2:$E$' + end + ');"color1","#8b3dff";"color2","#f5b800"}),"")']);
  }
  s.getRange(2, 3, MAX_TEAMS, 1).setFormulas(fc);
  s.getRange(2, 6, MAX_TEAMS, 1).setFormulas(ff);
  s.getRange('B:B').setNumberFormat('0.0');
  s.getRange('D:E').setNumberFormat('0.0');
  s.setColumnWidth(1, 220); s.setColumnWidth(3, 320); s.setColumnWidth(6, 320);
  protect_(s, 'Gráficos');
}
