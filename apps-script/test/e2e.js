// Teste ponta a ponta: o site real (index.html) falando com o Code.gs real rodando num mock local.
// Uso: node apps-script/test/e2e.js
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..');

// --- backend: reaproveita o mock do mock-test, sem rodar as asserções dele
const src = fs.readFileSync(path.join(__dirname, 'mock-test.js'), 'utf8').split('// 1. setup roda')[0];
const sandbox = { require, __dirname, console, module: {} };
vm.createContext(sandbox);
vm.runInContext(src + '\n;this.G=G;this.books=books;this.props=props;', sandbox);
const { G, books, props } = sandbox;
G.setup(); props.SCOUT_KEY = 'senha-de-teste';
const rowsOf = ev => books[G.EVENTS[ev]].getSheetByName('Partidas').getRange('A2:AB200').getValues().filter(r => r[0] !== '');
let delay = 0, posts = 0;

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/exec') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => setTimeout(() => {
      const o = req.method === 'POST' ? (posts++, G.doPost({ postData: { contents: body } })) : G.doGet({ parameter: Object.fromEntries(u.searchParams) });
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(o.t);
    }, delay));
    return;
  }
  if (u.pathname === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8').replace(/scriptUrl:\s*'[^']*'/, "scriptUrl: '/exec'.replace(/^/, location.origin)"));
  }
  const f = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript' }); res.end(fs.readFileSync(f));
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => srv.listen(0, r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED/.test(m.text())) errs.push(m.text()); });
  global.__pg = page;
  const chip = async (k, v) => { const l = page.locator(`[data-act=chip][data-k="${k}"][data-v="${v}"]`); if ((await l.getAttribute('aria-pressed')) !== 'true') await l.click(); };
  const cnt = (k, n) => (async () => { for (let i = 0; i < n; i++) await page.click(`[data-act=cnt][data-k="${k}"][data-d="1"]`); })();
  const body = () => page.textContent('#app');

  async function fillMatch(match, team, opts = {}) {
    await page.click('[data-act=step][data-v="0"]');
    if (opts.event) await chip('origin', opts.event);
    await page.fill('[data-m=f][data-k=match]', String(match));
    await page.click('[data-act=pickOpen]');
    await page.fill('[data-u=pq]', String(team));
    await page.click(`[data-act=pickTeam][data-v="${team}"]`);
    await chip('type', 'Qualificatória'); await chip('alliance', 'Vermelha');
    await page.click('[data-act=next]');
    await chip('aStart', 'HIVE alta'); await chip('aHas', 'Sim'); await chip('aLeave', 'Sim');
    await cnt('aBalls', 2); await cnt('aTips', 1); await chip('aCollect', 'Chão'); await chip('aPark', 'Não'); await chip('aAcc', 'Média');
    await page.click('[data-act=next]');
    await cnt('tBalls', 5); await cnt('tGarden', 3); await chip('tFlower', 'Não'); await chip('tPark', 'Sim'); await chip('tBroke', 'Não'); await chip('tAcc', 'Alta');
    await page.click('[data-act=next]');
    await chip('shootSpeed', 'Rápido'); await chip('robotSpeed', 'Médio');
    await page.fill('[data-m=f][data-k=shootSpot]', 'perto da HIVE');
    await page.click('[data-act=save]');
  }

  await page.goto(base);
  await page.fill('[data-u=nm]', 'Teste Robô');
  await page.click('[data-act=go]');
  await page.waitForSelector('[data-act=pickOpen]');

  // seletor só mostra as equipes do evento escolhido
  await chip('origin', 'Evento teste');
  await page.click('[data-act=pickOpen]');
  assert.strictEqual(await page.locator('[data-act=pickTeam]').count(), 8, '8 equipes no evento teste');
  await page.click('button[data-act=pickClose]');
  await chip('origin', 'Seletiva RS');
  await page.click('[data-act=pickOpen]');
  assert.strictEqual(await page.locator('[data-act=pickTeam]').count(), 12, 'seletiva com 12 equipes');
  await page.click('button[data-act=pickClose]');
  console.log('ok: seletor de equipes por evento');

  // 1) primeiro envio: pede a senha; senha errada; senha certa
  await fillMatch(7, 1003, { event: 'Evento teste' });
  await sleep(300);
  assert.strictEqual(rowsOf('Evento teste').length, 0, 'sem senha não envia');
  await page.fill('[data-u=pw]', 'errada'); await page.click('[data-act=saveKey]');
  await page.waitForFunction(() => document.getElementById('app').textContent.includes('Senha incorreta'));
  await page.fill('[data-u=pw]', 'senha-de-teste'); await page.click('[data-act=saveKey]');
  await page.waitForFunction(() => document.getElementById('app').textContent.includes('Tudo enviado'));
  let rows = rowsOf('Evento teste');
  assert.strictEqual(rows.length, 1); assert.strictEqual(rows[0][3], 'Teste Robô'); assert.strictEqual(rows[0][5], 1003); assert.strictEqual(rows[0][4], 7);
  assert.strictEqual(await page.inputValue('[data-m=f][data-k=match]'), '8', 'próxima partida já preenchida');
  console.log('ok: senha errada pede de novo, senha certa envia');

  // 2) modo avião: salva na fila e reenvia quando volta a conexão
  await ctx.setOffline(true);
  await fillMatch(8, 1004);
  await page.waitForFunction(() => /Aguardando envio \(1\)/.test(document.getElementById('app').textContent));
  assert.strictEqual(rowsOf('Evento teste').length, 1);
  await ctx.setOffline(false);
  await page.waitForFunction(() => document.getElementById('app').textContent.includes('Tudo enviado'), null, { timeout: 15000 });
  assert.strictEqual(rowsOf('Evento teste').length, 2);
  console.log('ok: fila offline reenvia ao voltar a conexão');

  // 3) fechar com partida na fila e reabrir
  await ctx.setOffline(true);
  await fillMatch(9, 1005);
  await page.waitForFunction(() => /Aguardando envio \(1\)/.test(document.getElementById('app').textContent));
  await page.close();
  await ctx.setOffline(false);
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errs.push(e.message));
  await p2.goto(base);
  await p2.waitForFunction(() => document.getElementById('app').textContent.includes('Tudo enviado'), null, { timeout: 15000 });
  assert.strictEqual(rowsOf('Evento teste').length, 3);
  console.log('ok: reabrir o site envia a fila');

  // 4) mesmo id não duplica
  // reenvia direto o último registro gravado com o mesmo id
  const last = rowsOf('Evento teste')[2];
  const sameId = await p2.evaluate(async (id) => {
    const r = await fetch('/exec', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ key: 'senha-de-teste', row: { id, criadoEm: new Date().toISOString(), scouter: 'x', match: 9, team: 1005, origin: 'Evento teste', type: 'Qualificatória', alliance: 'Azul', aStart: 'HIVE alta', aHas: 'Não', tBalls: 1, tFlower: 'Não', tPark: 'Não', tBroke: 'Sim', tAcc: 'Baixa', shootSpeed: 'Lento', robotSpeed: 'Lento', shootSpot: 'x' } }) });
    return r.json();
  }, last[0]);
  assert.strictEqual(sameId.status, 'updated'); assert.strictEqual(rowsOf('Evento teste').length, 3);
  console.log('ok: reenvio do mesmo id atualiza a linha');

  // 5) duplicata local (mesma equipe, partida e tipo já enviados deste aparelho)
  page = p2; global.__pg = p2;
  await fillMatch(9, 1005, { event: 'Evento teste' });
  await p2.waitForFunction(() => document.getElementById('app').textContent.includes('Possível duplicata'));
  await p2.click('[data-act=saveForce]');
  await p2.waitForFunction(() => document.getElementById('app').textContent.includes('já tinha registro'), null, { timeout: 10000 });
  assert.strictEqual(rowsOf('Evento teste').length, 4);
  console.log('ok: aviso de duplicata local e do servidor');

  // 6) 20 envios rápidos com servidor lento
  delay = 150;
  await p2.evaluate(() => {
    const ob = JSON.parse(localStorage.getItem('bb_outbox') || '[]');
    for (let i = 0; i < 20; i++) ob.push({ id: 'rapido' + i + 'x', tries: 0, err: '', row: { id: 'rapido' + i + 'x', criadoEm: new Date().toISOString(), scouter: 'Lote', match: 100 + i, team: 1001 + (i % 8), origin: 'Evento teste', type: 'Treino', alliance: 'Azul', aStart: 'HIVE baixa', aHas: 'Não', aLeave: 'Não', aBalls: 0, aTips: 0, aCollect: 'Não coletou', aPark: 'Não', aAcc: '', tBalls: i, tTips: 0, tGarden: 1, tFlower: 'Não', tPark: 'Sim', tBroke: 'Não', tAcc: 'Média', shootSpeed: 'Médio', robotSpeed: 'Médio', shootSpot: 'meio', notes: '' } });
    localStorage.setItem('bb_outbox', JSON.stringify(ob));
  });
  await p2.reload();
  await p2.waitForFunction(() => document.getElementById('app').textContent.includes('Tudo enviado'), null, { timeout: 30000 });
  assert.strictEqual(rowsOf('Evento teste').length, 24);
  console.log('ok: 20 envios em sequência');

  // 7) equipe removida da planilha: item fica com erro e não trava os outros
  delay = 0;
  await p2.evaluate(() => {
    const ob = [{ id: 'semequipe1', tries: 0, err: '', row: { id: 'semequipe1', criadoEm: new Date().toISOString(), scouter: 'Lote', match: 300, team: 4242, origin: 'Evento teste', type: 'Treino', alliance: 'Azul', aStart: 'HIVE baixa', aHas: 'Não', tBalls: 1, tFlower: 'Não', tPark: 'Sim', tBroke: 'Não', tAcc: 'Média', shootSpeed: 'Médio', robotSpeed: 'Médio', shootSpot: 'meio' } },
      { id: 'boa0000001', tries: 0, err: '', row: { id: 'boa0000001', criadoEm: new Date().toISOString(), scouter: 'Lote', match: 301, team: 1001, origin: 'Evento teste', type: 'Treino', alliance: 'Azul', aStart: 'HIVE baixa', aHas: 'Não', tBalls: 1, tFlower: 'Não', tPark: 'Sim', tBroke: 'Não', tAcc: 'Média', shootSpeed: 'Médio', robotSpeed: 'Médio', shootSpot: 'meio' } }];
    localStorage.setItem('bb_outbox', JSON.stringify(ob));
  });
  await p2.reload();
  await p2.waitForFunction(() => document.getElementById('app').textContent.includes('equipe não cadastrada'), null, { timeout: 10000 });
  assert.strictEqual(rowsOf('Evento teste').length, 25);
  console.log('ok: erro de equipe não trava a fila');

  await p2.screenshot({ path: path.join(process.env.SHOT_DIR || '/tmp', 'bb-e2e.png'), fullPage: true });
  assert.deepStrictEqual(errs, [], 'erros no console: ' + errs.join(' | '));
  console.log('TODOS OS TESTES PASSARAM');
  await browser.close(); srv.close();
})().catch(async e => { console.error('FALHOU:', e.message.split('\n').slice(0,3).join(' '), (e.stack.match(/e2e.js:(\d+)/g)||[]).join(',')); try { console.error('TELA:', (await (global.__pg.textContent('#app'))).slice(0, 600)); } catch (x) {} process.exit(1); });
