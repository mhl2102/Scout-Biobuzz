// Teste local do Code.gs com um mock mínimo dos serviços do Apps Script.
// Uso: node apps-script/test/mock-test.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

const formulas = [];
let locale = 'pt_BR';
const enUS = () => assert.strictEqual(locale, 'en_US', 'fórmula gravada fora do en_US');
function colNum(s) { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
function chain(obj) { return new Proxy(obj, { get(t, p) { if (p in t) return t[p]; return () => chain(t); } }); }

class Sheet {
  constructor(name) { this.name = name; this.grid = {}; this.maxRows = 1000; this.prot = null; this.charts = []; }
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(_, n) { this.maxRows += n; }
  getLastRow() { let m = 0; for (const k in this.grid) { const r = +k.split(',')[0]; if (this.grid[k] !== '' && r > m) m = r; } return m; }
  getRange(a, c, nr, nc) {
    if (typeof a === 'string') {
      const m = a.match(/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/); if (!m) throw new Error('A1 inválido ' + a);
      const c1 = colNum(m[1]), r1 = m[2] ? +m[2] : 1, c2 = m[3] ? colNum(m[3]) : c1, r2 = m[4] ? +m[4] : (m[3] || !m[2] ? this.maxRows : r1);
      return new Range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    if (a < 1 || c < 1) throw new Error('getRange fora');
    if (a + (nr || 1) - 1 > this.maxRows) throw new Error('Range além do fim da aba');
    return new Range(this, a, c, nr || 1, nc || 1);
  }
  setFrozenRows() {} clear() { this.grid = {}; } autoResizeColumns() {} setColumnWidth() {} hideSheet() { this.hidden = true; }
  getCharts() { return this.charts; } removeChart() {} setConditionalFormatRules(r) { this.cf = r; }
  protect() { const s = this; this.prot = { d: '', setDescription(d) { this.d = d; return this; }, getDescription() { return this.d; }, setWarningOnly() { return this; }, setUnprotectedRanges() { return this; }, remove() { s.prot = null; } }; return this.prot; }
}
class Range {
  constructor(s, r, c, nr, nc) { Object.assign(this, { s, r, c, nr, nc }); }
  getRow() { return this.r; }
  getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const v = this.s.grid[(this.r + i) + ',' + (this.c + j)]; row.push(v === undefined ? '' : v); } o.push(row); } return o; }
  setValues(v) { assert.strictEqual(v.length, this.nr, 'setValues linhas'); v.forEach((row, i) => { assert.strictEqual(row.length, this.nc, 'setValues colunas'); row.forEach((x, j) => { this.s.grid[(this.r + i) + ',' + (this.c + j)] = x; }); }); return this; }
  setValue(x) { this.s.grid[this.r + ',' + this.c] = x; return this; }
  setFormula(f) { enUS(); formulas.push(this.s.name + ': ' + f); this.s.grid[this.r + ',' + this.c] = f; return this; }
  setFormulas(f) { enUS(); assert.strictEqual(f.length, this.nr); f.forEach((row, i) => { assert.strictEqual(row.length, this.nc); row.forEach((x, j) => { formulas.push(this.s.name + ': ' + x); this.s.grid[(this.r + i) + ',' + (this.c + j)] = x; }); }); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) delete this.s.grid[(this.r + i) + ',' + (this.c + j)]; return this; }
  setDataValidation() { return this; }
}
['setNumberFormat', 'setFontWeight', 'setBackground', 'setFontColor', 'setFontStyle', 'setHorizontalAlignment'].forEach(m => { Range.prototype[m] = function () { return this; }; });

class SS {
  constructor() { this.sheets = [new Sheet('Página1')]; }
  setSpreadsheetTimeZone() {} setSpreadsheetLocale(l) { locale = l; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n, i) { const s = new Sheet(n); this.sheets.splice(i, 0, s); return s; }
  getSheets() { return this.sheets.slice(); }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  setActiveSheet(s) { this.active = s; } moveActiveSheet() {}
  getProtections() { return this.sheets.map(s => s.prot).filter(Boolean); }
}
const books = {};
const props = {};
let lockFree = true;
const ctx = {
  SpreadsheetApp: {
    openById(id) { return books[id] || (books[id] = new SS()); }, flush() {},
    ProtectionType: { SHEET: 'SHEET' },
    newConditionalFormatRule: () => chain({ build() { return {}; } }),
    newDataValidation: () => chain({ build() { return {}; } })
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null }) },
  LockService: { getScriptLock: () => ({ tryLock() { if (!lockFree) return false; lockFree = false; return true; }, releaseLock() { lockFree = true; } }) },
  CacheService: { getScriptCache: () => ({ get() { return null; }, put() {}, remove() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType() { return { t }; } }) },
  console
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8') + '\n;this.__=({doGet,doPost,setup,limparEventoTeste,EVENTS,COLS});', ctx);
const G = ctx.__;
const res = o => JSON.parse(o.t);
const post = body => res(G.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }));

// 1. setup roda nas duas planilhas, duas vezes (idempotente)
G.setup(); G.setup();
assert.strictEqual(locale, 'pt_BR', 'volta para pt_BR no fim');
const idS = G.EVENTS['Seletiva RS'], idT = G.EVENTS['Evento teste'];
for (const id of [idS, idT]) {
  const names = books[id].sheets.map(s => s.name);
  assert.deepStrictEqual(names.slice().sort(), ['Comparar', 'Config', 'Equipes', 'Gráficos', 'Partidas', 'Ranking', '_calc'].sort(), 'abas: ' + names);
}
assert.strictEqual(books[idT].getSheetByName('Equipes').getLastRow(), 9, 'equipes de teste semeadas');
assert.strictEqual(books[idS].getSheetByName('Equipes').getLastRow(), 13, 'seletiva com 12 equipes');
// fórmulas: parênteses, chaves e aspas balanceados
let bad = 0;
for (const f of formulas) {
  const s = f.replace(/"[^"]*"/g, '""');
  if ((f.match(/"/g) || []).length % 2) bad++;
  let d = 0, b = 0; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === '{') b++; if (ch === '}') b--; if (d < 0 || b < 0) break; }
  if (d || b) { bad++; console.log('DESBALANCEADA', f); }
}
assert.strictEqual(bad, 0, 'fórmulas desbalanceadas');
console.log('setup ok,', formulas.length, 'fórmulas conferidas');

// 2. doGet
assert.deepStrictEqual(res(G.doGet({ parameter: { action: 'ping' } })), { ok: true });
const ev = res(G.doGet({ parameter: { action: 'teams' } }));
assert.strictEqual(ev.events.length, 2); assert.strictEqual(ev.events[1].teams[0].team, 1001);

// 3. doPost
props.SCOUT_KEY = 'senha-de-teste';
const base = { id: 'abc123def', criadoEm: new Date().toISOString(), scouter: 'Ana', match: 3, team: 1002, origin: 'Evento teste', type: 'Qualificatória', alliance: 'Azul', aStart: 'HIVE alta', aHas: 'Sim', aLeave: 'Sim', aPark: 'Não', aCollect: 'Chão', aAcc: 'Média', aBalls: 4, aTips: 1, tBalls: 10, tTips: 2, tGarden: 3, tFlower: 'Não', tPark: 'Sim', tBroke: 'Não', tAcc: 'Alta', shootSpeed: 'Rápido', robotSpeed: 'Médio', shootSpot: 'perto da HIVE', notes: '=HYPERLINK("x")' };
const P = books[idT].getSheetByName('Partidas');
assert.strictEqual(post({ key: 'errada', row: base }).error, 'bad_key');
assert.strictEqual(post('{não é json').error, 'bad_row');
assert.strictEqual(post({ key: 'senha-de-teste', row: Object.assign({}, base, { team: 9999 }) }).error, 'bad_team');
assert.strictEqual(post({ key: 'senha-de-teste', row: Object.assign({}, base, { origin: 'Outro' }) }).error, 'bad_event');
assert.strictEqual(post({ key: 'senha-de-teste', row: Object.assign({}, base, { tAcc: '' }) }).error, 'bad_row');
assert.strictEqual(post({ key: 'senha-de-teste', row: Object.assign({}, base, { type: 'X' }) }).error, 'bad_row');
let r = post({ key: 'senha-de-teste', row: base });
assert.deepStrictEqual([r.ok, r.status, r.dup], [true, 'created', null]);
assert.strictEqual(P.getRange(2, 1).getValues()[0][0], 'abc123def');
assert.strictEqual(P.getRange(2, 28).getValues()[0][0], "'=HYPERLINK(\"x\")", 'texto com = escapado');
r = post({ key: 'senha-de-teste', row: Object.assign({}, base, { tBalls: 12 }) });
assert.strictEqual(r.status, 'updated');
assert.strictEqual(P.getRange(2, 18).getValues()[0][0], 12);
assert.strictEqual(P.getRange(3, 1).getValues()[0][0], '', 'reenvio não duplica');
r = post({ key: 'senha-de-teste', row: Object.assign({}, base, { id: 'outro0001', scouter: 'Bia' }) });
assert.strictEqual(r.status, 'created'); assert.strictEqual(r.dup.scouter, 'Ana', 'aviso de duplicata');
// sem autônomo: campos auto preenchidos pelo script
r = post({ key: 'senha-de-teste', row: Object.assign({}, base, { id: 'semauto01', match: 4, aHas: 'Não', aLeave: '', aBalls: '', aCollect: '', aPark: '', aAcc: '' }) });
assert.strictEqual(r.status, 'created'); assert.strictEqual(P.getRange(4, 14).getValues()[0][0], 'Não coletou');
// 20 envios seguidos + crescimento da aba
P.maxRows = 10;
for (let i = 0; i < 20; i++) assert.strictEqual(post({ key: 'senha-de-teste', row: Object.assign({}, base, { id: 'lote' + String(i).padStart(4, '0'), match: 10 + i }) }).status, 'created');
assert.strictEqual(P.getRange('A1:A600').getValues().filter(x => x[0] !== '').length, 1 + 3 + 20);
// trava ocupada
lockFree = false; assert.strictEqual(post({ key: 'senha-de-teste', row: Object.assign({}, base, { id: 'travado01' }) }).error, 'busy'); lockFree = true;
// limpeza do teste
G.limparEventoTeste();
assert.strictEqual(P.getRange('A2:A600').getValues().filter(x => x[0] !== '').length, 0);
assert.strictEqual(books[idS].getSheetByName('Partidas').getRange('A2:A50').getValues().filter(x => x[0] !== '').length, 0, 'seletiva intocada');
console.log('doGet/doPost ok');
