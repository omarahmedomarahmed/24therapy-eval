// Per platform: sign the Kit Licence and NDA, read Keys/Kits/Widget/Playground, download kits,
// save colours + logo in the widget builder, add the local test origin. Writes evals/<slug>/portal/.
const fs = require('fs'), path = require('path');
const { open, shot } = require('./portal-lib');
const P = JSON.parse(fs.readFileSync(__dirname + '/../base/platforms.json')).find(x => x.n == process.argv[2]);
const KITS = { node:'server-node', python:'server-python', php:'server-php', dotnet:'server-dotnet', java:'server-java',
  web:'browser', android:'android', flutter:'flutter', 'react-native':'react-native', ios:'ios' };
const root = path.resolve(__dirname, '..'), dir = `${root}/evals/${P.slug}/portal`, kitDir = `${root}/kits/${P.slug}`;
fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(kitDir, { recursive: true });
const steps = []; let t0 = Date.now(), i = 0;
async function step(p, title, code, result) {
  i++; const f = `${String(i).padStart(2,'0')}-${title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.png`;
  await shot(p, `${dir}/${f}`);
  steps.push({ step: i, title, code, screenshot: `portal/${f.replace('.png','.webp')}`, result, seconds: +((Date.now()-t0)/1000).toFixed(1) }); t0 = Date.now();
}
(async () => {
  const { b, p } = await open(P.n);
  await step(p, 'Signed in to the partner portal', 'https://www.24therapy.app/portal/sign-in', 'Home shows the next step');
  if (await p.$('input[name=agree]')) {
    await p.check('input[name=agree]'); await step(p, 'Tick the Kit Licence and NDA', 'Home: I have read ... and I sign it', 'ticked');
    await p.click('main button:has-text("Sign")'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
  }
  const signed = /Signed|signed/.test(await p.innerText('main'));
  await step(p, 'Kit Licence and NDA signed', 'Sign', signed ? 'Signed. The kits are open to your team.' : 'not signed');
  // Your stack
  try {
    await p.click('main >> text=Change').catch(()=>{}); await p.waitForTimeout(500);
    const app = { web:'web', android:'android', flutter:'flutter', 'react-native':'react-native', ios:'ios' }[P.client];
    await p.selectOption('select[name=backend]', P.server, {timeout:5000}); await p.selectOption('select[name=video]', P.video);
    await p.selectOption('select[name=app]', app).catch(async () => {
      const opts = await p.$$eval('select[name=app] option', o => o.map(x => x.value)); const m = opts.find(v => v.includes(P.client.slice(0,3)));
      if (m) await p.selectOption('select[name=app]', m); });
    await p.click('form:has(select[name=backend]) button[type=submit]'); await p.waitForLoadState('networkidle');
    await step(p, 'Set your stack', `${P.server} + ${P.video} + ${P.client}`, (await p.innerText('main')).match(/Your stack\s*\n\s*([^\n]+)/)?.[1] || 'saved');
  } catch (e) { steps.push({ step: ++i, title: 'Set your stack', result: 'failed: ' + e.message.split('\n')[0] }); }
  for (const [u, t] of [['/portal/keys','Keys page'], ['/portal/kits','Kits page'], ['/portal/playground','Playground page']]) {
    await p.goto('https://www.24therapy.app' + u, { waitUntil: 'networkidle' });
    await step(p, t, u, (await p.innerText('main')).split('\n').filter(Boolean).slice(0,3).join(' / '));
  }
  // Downloads
  await p.goto('https://www.24therapy.app/portal/kits', { waitUntil: 'networkidle' });
  const got = [];
  for (const k of [KITS[P.server], KITS[P.client], 'cli']) {
    try {
      const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click(`a[href="/portal/kits/download/${k}"]`)]);
      const f = `${kitDir}/${d.suggestedFilename()}`; await d.saveAs(f); got.push(path.basename(f));
    } catch (e) { got.push(`${k}: ${e.message.split('\n')[0]}`); }
  }
  steps.push({ step: ++i, title: 'Download the kits', code: 'Kits > Download', result: got.join(', '), seconds: 0 });
  // Widget origins
  await p.goto('https://www.24therapy.app/portal/widget', { waitUntil: 'networkidle' });
  const origin = `http://localhost:${P.port}`;
  const cur = await p.inputValue('#f-origins');
  if (!cur.includes(origin)) { await p.fill('#f-origins', (cur.trim() + '\n' + origin).trim()); await p.click('button:has-text("Save origins")'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1000); }
  const msg = (await p.innerText('main')).split('\n').find(l => /saved|origin|refused|invalid/i.test(l)) || '';
  await step(p, 'Add the test origin', `Widget > Origins: ${origin}`, (await p.inputValue('#f-origins')).includes(origin) ? `${origin} saved` : `refused: ${msg}`);
  // Builder
  await p.click('main >> text=Builder'); await p.waitForTimeout(800);
  await p.fill('#wb-theme-primary', P.primary); await p.fill('#wb-theme-ink', P.ink); await p.fill('#wb-theme-surface', P.surface);
  await p.fill('#wb-theme-logo', P.logo); await p.selectOption('#wb-locale', { label: 'Arabic' });
  await p.selectOption('#wb-stack', { label: P.stack }).catch(() => {});
  await p.fill('#wb-origin', origin);
  await step(p, 'Fill the widget builder', `primary ${P.primary}, ink ${P.ink}, surface ${P.surface}, logo ${P.logo}`, 'filled');
  await p.click('button:has-text("Save these choices")'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
  const after = await p.inputValue('#wb-theme-primary').catch(() => '');
  const prev = await p.$('text=Live preview'); if (prev) await prev.scrollIntoViewIfNeeded();
  await step(p, 'Builder saved, live preview in platform colours', 'Save these choices', after.toLowerCase() === P.primary.toLowerCase() ? 'saved' : `after save primary=${after}`);
  const snippet = await p.$eval('main pre, main code', e => e.innerText).catch(() => '');
  fs.writeFileSync(`${dir}/widget-snippet.html`, snippet);
  await b.close();
  fs.writeFileSync(`${dir}/steps.json`, JSON.stringify(steps, null, 2));
  console.log(JSON.stringify(steps.map(s => [s.step, s.title, s.result])));
})().catch(e => { console.error('FAIL', e.message); fs.writeFileSync(`${dir}/steps.json`, JSON.stringify(steps, null, 2)); process.exit(1); });
