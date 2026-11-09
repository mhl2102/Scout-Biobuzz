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
let delay = 0, posts = 0, failNext = 0;

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/exec') {
    if (failNext > 0 && req.method === 'POST') { failNext--; res.writeHead(502); return res.end('Bad Gateway'); }
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
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.png') ? 'image/png' : 'text/javascript' }); res.end(fs.readFileSync(f));
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

  const cell = k => page.click(`[data-act=cell][data-v="${k}"]`);
  async function fillMatch(match, team, opts = {}) {
    await page.click('[data-act=step][data-v="0"]');
    if (opts.event) await chip('origin', opts.event);
    await page.fill('[data-m=f][data-k=match]', String(match));
    await page.click('[data-act=pickOpen]');
    await page.fill('[data-u=pq]', String(team));
    await page.click(`[data-act=pickTeam][data-v="${team}"]`);
    await chip('type', 'Qualificatória'); await chip('alliance', opts.alliance || 'Vermelha');
    await page.click('[data-act=next]');
    await chip('aStart', 'HIVE alta'); await chip('aHas', 'Sim'); await chip('aLeave', 'Sim');
    await cnt('aBalls', 2); await cnt('aTips', 1); await chip('aCollect', 'Chão'); await chip('aPark', 'Não'); await chip('aAcc', 'Média');
    await page.click('[data-act=next]');
    await cnt('tBalls', 5); await cnt('tGarden', 3); await chip('tFlower', 'Não'); await chip('tPark', 'Sim'); await chip('tBroke', 'Não'); await chip('tAcc', 'Alta');
    await page.click('[data-act=next]');
    await chip('shootSpeed', 'Rápido'); await chip('robotSpeed', 'Médio');
    await page.click('[data-act=spotClear]').catch(() => {});
    await cell('C3'); await cell('C3'); await cell('C4');
    if (opts.placar != null) await page.fill('[data-m=f][data-k=placarAlianca]', String(opts.placar));
    await page.click('[data-act=save]');
  }

  const color = sel => page.$eval(sel, e => getComputedStyle(e).backgroundColor);
  const txt = re => page.waitForFunction(r => new RegExp(r).test(document.getElementById('app').textContent), re.source, { timeout: 15000 });

  // 0) senha antes do nome: errada é recusada, certa libera o nome; depois nunca mais pede
  await page.goto(base);
  await page.waitForSelector('[data-u=pw]');
  assert.strictEqual(await page.locator('[data-u=nm]').count(), 0, 'nome só depois da senha');
  await page.fill('[data-u=pw]', 'errada'); await page.click('[data-act=auth]');
  await txt(/Senha incorreta/);
  await page.fill('[data-u=pw]', 'senha-de-teste'); await page.press('[data-u=pw]', 'Enter');
  await page.waitForSelector('[data-u=nm]');
  assert.ok((await body()).includes('Senha da equipe confirmada'));
  await page.fill('[data-u=nm]', 'Teste Robô');
  await page.click('[data-act=go]');
  await page.waitForSelector('[data-act=pickOpen]');
  await page.reload(); await page.waitForSelector('[data-act=pickOpen]');
  assert.strictEqual(await page.locator('[data-u=pw]').count(), 0, 'senha não é pedida de novo');
  assert.strictEqual(posts, 2, 'só as duas conferências de senha');
  console.log('ok: senha na primeira tela, uma vez só');

  // 0b) barra inferior: fixa, verde/vermelho, validação por etapa
  const dockBox = await page.locator('.dock').boundingBox();
  assert.ok(dockBox.y + dockBox.height >= 843, 'dock encostado no rodapé');
  assert.strictEqual(await color('[data-act=next]'), 'rgb(21, 128, 61)', 'Próximo verde');
  await page.click('[data-act=next]');
  await txt(/Faltam \d+ campo\(s\) nesta etapa/);
  assert.ok(await page.locator('.fld.miss').count() >= 3, 'campos marcados');
  console.log('ok: validação por etapa');

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

  // 0c) mapa de tiro: obrigatório, ciclo de toques, uma principal, rotação para Azul
  await page.fill('[data-m=f][data-k=match]', '5');
  await page.click('[data-act=pickOpen]'); await page.click('[data-act=pickTeam][data-v="16041"]');
  await chip('type', 'Treino'); await chip('alliance', 'Vermelha');
  await page.click('[data-act=next]');
  await chip('aStart', 'HIVE baixa'); await chip('aHas', 'Não');
  await page.click('[data-act=next]');
  await chip('tFlower', 'Não'); await chip('tPark', 'Não'); await chip('tBroke', 'Não'); await chip('tAcc', 'Baixa');
  await page.click('[data-act=next]');
  await chip('shootSpeed', 'Lento'); await chip('robotSpeed', 'Lento');
  await page.click('[data-act=save]');
  await txt(/Marque pelo menos uma célula no mapa/);
  const shot = () => page.evaluate(() => JSON.parse(localStorage.getItem('bb_draft') || '{}').shootSpot);
  const rot = () => page.$eval('.mimg', e => getComputedStyle(e).transform);
  assert.strictEqual(await rot(), 'none', 'Vermelha: imagem como está');
  const box = await page.locator('.mboard').boundingBox();
  assert.ok(box.width >= 300 && Math.abs(box.width - box.height) < 2, 'mapa quadrado e grande: ' + box.width);
  await cell('B2'); await cell('D5'); await cell('D5'); await page.waitForTimeout(400);
  assert.strictEqual(await shot(), 'D5*;B2');
  await cell('B2'); await page.waitForTimeout(400);
  assert.strictEqual(await shot(), 'B2*;D5', 'nova principal devolve a anterior para marcada');
  await cell('B2'); await page.waitForTimeout(400);
  assert.strictEqual(await shot(), 'D5', 'terceiro toque desmarca');
  assert.strictEqual(await page.locator('.mc.main').count(), 0);
  await page.click('[data-act=spotClear]'); await page.waitForTimeout(400);
  assert.strictEqual(await shot(), '');
  await cell('A1');
  await page.click('[data-act=step][data-v="0"]'); await chip('alliance', 'Azul');
  await page.click('[data-act=step][data-v="3"]');
  assert.notStrictEqual(await rot(), 'none', 'Azul: imagem girada');
  assert.strictEqual(await page.getAttribute('[data-act=cell][data-v="A1"]', 'aria-pressed'), 'true', 'célula mantida ao trocar a aliança');
  const a1 = await page.locator('[data-act=cell][data-v="A1"]').boundingBox();
  assert.ok(a1.x - box.x < 5 && a1.y - box.y < 5, 'rótulos não giram: A1 continua no canto superior esquerdo');
  await page.fill('[data-m=f][data-k=placarAlianca]', '9a');
  assert.strictEqual(await page.inputValue('[data-m=f][data-k=placarAlianca]'), '9', 'placar só com dígitos');
  await page.fill('[data-m=f][data-k=placarAlianca]', '1234');
  assert.strictEqual(await page.inputValue('[data-m=f][data-k=placarAlianca]'), '123', 'placar até 3 dígitos');
  await page.click('[data-act=save]');
  await txt(/Tudo enviado/);
  let rows = rowsOf('Seletiva RS');
  const PS = books[G.EVENTS['Seletiva RS']].getSheetByName('Partidas');
  assert.strictEqual(rows.length, 1); assert.strictEqual(rows[0][26], 'A1'); assert.strictEqual(rows[0][8], 'Azul');
  assert.strictEqual(PS.getRange(2, 30).getValues()[0][0], 123, 'placar em AD');
  assert.strictEqual(PS.getRange(2, 29).getValues()[0][0], '', 'AC intocada');
  console.log('ok: mapa de tiro e placar da aliança');
  await page.screenshot({ path: path.join(process.env.SHOT_DIR || '/tmp', 'bb-e2e-mapa.png') });

  // 1) salvar envia sozinho
  await fillMatch(7, 1003, { event: 'Evento teste', placar: 87 });
  await txt(/Tudo enviado/);
  rows = rowsOf('Evento teste');
  assert.strictEqual(rows.length, 1); assert.strictEqual(rows[0][3], 'Teste Robô'); assert.strictEqual(rows[0][5], 1003); assert.strictEqual(rows[0][4], 7);
  assert.strictEqual(rows[0][26], 'C3*;C4', 'mapa gravado');
  assert.strictEqual(await page.inputValue('[data-m=f][data-k=match]'), '8', 'próxima partida já preenchida');
  console.log('ok: envio automático ao salvar');

  // 2) modo avião: salva na fila e reenvia quando volta a conexão
  await ctx.setOffline(true);
  await fillMatch(8, 1004);
  await page.waitForFunction(() => /Sem conexão\. 1 partida/.test(document.getElementById('app').textContent));
  assert.strictEqual(rowsOf('Evento teste').length, 1);
  await ctx.setOffline(false);
  await page.waitForFunction(() => document.getElementById('app').textContent.includes('Tudo enviado'), null, { timeout: 15000 });
  assert.strictEqual(rowsOf('Evento teste').length, 2);
  console.log('ok: fila offline reenvia ao voltar a conexão');

  // 3) fechar com partida na fila e reabrir
  await ctx.setOffline(true);
  await fillMatch(9, 1005);
  await page.waitForFunction(() => /Sem conexão\. 1 partida/.test(document.getElementById('app').textContent));
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
    const r = await fetch('/exec', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ key: 'senha-de-teste', row: { id, criadoEm: new Date().toISOString(), scouter: 'x', match: 9, team: 1005, origin: 'Evento teste', type: 'Qualificatória', alliance: 'Azul', aStart: 'HIVE alta', aHas: 'Não', tBalls: 1, tFlower: 'Não', tPark: 'Não', tBroke: 'Sim', tAcc: 'Baixa', shootSpeed: 'Lento', robotSpeed: 'Lento', shootSpot: 'B2' } }) });
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
    for (let i = 0; i < 20; i++) ob.push({ id: 'rapido' + i + 'x', tries: 0, err: '', row: { id: 'rapido' + i + 'x', criadoEm: new Date().toISOString(), scouter: 'Lote', match: 100 + i, team: 1001 + (i % 8), origin: 'Evento teste', type: 'Treino', alliance: 'Azul', aStart: 'HIVE baixa', aHas: 'Não', aLeave: 'Não', aBalls: 0, aTips: 0, aCollect: 'Não coletou', aPark: 'Não', aAcc: '', tBalls: i, tTips: 0, tGarden: 1, tFlower: 'Não', tPark: 'Sim', tBroke: 'Não', tAcc: 'Média', shootSpeed: 'Médio', robotSpeed: 'Médio', shootSpot: 'C3', notes: '' } });
    localStorage.setItem('bb_outbox', JSON.stringify(ob));
  });
  await p2.reload();
  await p2.waitForFunction(() => document.getElementById('app').textContent.includes('Tudo enviado'), null, { timeout: 30000 });
  assert.strictEqual(rowsOf('Evento teste').length, 24);
  console.log('ok: 20 envios em sequência');

  // 7) equipe removida da planilha: item fica com erro e não trava os outros
  delay = 0;
  await p2.evaluate(() => {
    const ob = [{ id: 'semequipe1', tries: 0, err: '', row: { id: 'semequipe1', criadoEm: new Date().toISOString(), scouter: 'Lote', match: 300, team: 4242, origin: 'Evento teste', type: 'Treino', alliance: 'Azul', aStart: 'HIVE baixa', aHas: 'Não', tBalls: 1, tFlower: 'Não', tPark: 'Sim', tBroke: 'Não', tAcc: 'Média', shootSpeed: 'Médio', robotSpeed: 'Médio', shootSpot: 'C3' } },
      { id: 'boa0000001', tries: 0, err: '', row: { id: 'boa0000001', criadoEm: new Date().toISOString(), scouter: 'Lote', match: 301, team: 1001, origin: 'Evento teste', type: 'Treino', alliance: 'Azul', aStart: 'HIVE baixa', aHas: 'Não', tBalls: 1, tFlower: 'Não', tPark: 'Sim', tBroke: 'Não', tAcc: 'Média', shootSpeed: 'Médio', robotSpeed: 'Médio', shootSpot: 'C3' } }];
    localStorage.setItem('bb_outbox', JSON.stringify(ob));
  });
  await p2.reload();
  await p2.waitForFunction(() => document.getElementById('app').textContent.includes('equipe não cadastrada'), null, { timeout: 10000 });
  assert.strictEqual(rowsOf('Evento teste').length, 25);
  console.log('ok: erro de equipe não trava a fila');

  // 8) servidor falha uma vez: nova tentativa sozinha
  await p2.evaluate(() => localStorage.setItem('bb_outbox', '[]')); await p2.reload();
  failNext = 1;
  await fillMatch(400, 1006, { event: 'Evento teste' });
  await p2.waitForFunction(() => document.getElementById('app').textContent.includes('Tudo enviado'), null, { timeout: 15000 });
  assert.strictEqual(rowsOf('Evento teste').length, 26);
  console.log('ok: nova tentativa automática após falha do servidor');

  await p2.screenshot({ path: path.join(process.env.SHOT_DIR || '/tmp', 'bb-e2e.png'), fullPage: true });
  assert.deepStrictEqual(errs, [], 'erros no console: ' + errs.join(' | '));
  console.log('TODOS OS TESTES PASSARAM');
  await browser.close(); srv.close();
})().catch(async e => { console.error('FALHOU:', e.message.split('\n').slice(0,3).join(' '), (e.stack.match(/e2e.js:(\d+)/g)||[]).join(',')); try { console.error('TELA:', (await (global.__pg.textContent('#app'))).slice(0, 600)); } catch (x) {} process.exit(1); });
