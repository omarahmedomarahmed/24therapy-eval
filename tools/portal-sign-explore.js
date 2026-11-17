const { chromium } = require('playwright');
const [,, state] = process.argv;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ storageState: state, viewport:{width:1280,height:900} });
  const p = await ctx.newPage();
  await p.goto('https://www.24therapy.app/portal', { waitUntil:'networkidle' });
  if (await p.$('input[name=agree]')) { await p.check('input[name=agree]'); await p.click('button:has-text("Sign")'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(2000); }
  console.log((await p.innerText('main')).slice(0,800));
  await p.goto('https://www.24therapy.app/portal/kits', { waitUntil:'networkidle' });
  console.log('=== KITS\n'+(await p.innerText('main')).slice(0,6000));
  console.log(JSON.stringify(await p.$$eval('main a,main button', els=>els.map(e=>[(e.innerText||'').slice(0,50),e.getAttribute('href')]))));
  await p.goto('https://www.24therapy.app/portal/widget', { waitUntil:'networkidle' });
  await p.click('text=Builder'); await p.waitForTimeout(1500);
  console.log('=== BUILDER\n'+(await p.innerText('main')).slice(0,4000));
  console.log(JSON.stringify(await p.$$eval('main input,main button,main select,main textarea', els=>els.map(e=>[e.tagName,e.type,e.name,e.id,(e.innerText||e.value||e.placeholder||e.getAttribute('aria-label')||'').slice(0,40)]))));
  await ctx.storageState({ path: state });
  await b.close();
})();
