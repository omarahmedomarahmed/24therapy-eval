const { open } = require('./portal-lib');
(async () => {
  const { b, p } = await open(1);
  if (await p.$('input[name=agree]')) { await p.check('input[name=agree]'); await p.click('main button:has-text("Sign")'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(2000); }
  console.log((await p.innerText('main')).slice(0,600));
  await p.goto('https://www.24therapy.app/portal/kits', { waitUntil:'networkidle' });
  console.log('=== KITS\n'+(await p.innerText('main')).slice(0,6000));
  console.log(JSON.stringify(await p.$$eval('main a,main button', els=>els.map(e=>[(e.innerText||'').slice(0,50),e.getAttribute('href')]))));
  await p.goto('https://www.24therapy.app/portal/widget', { waitUntil:'networkidle' });
  await p.click('main >> text=Builder'); await p.waitForTimeout(1500);
  console.log('=== BUILDER\n'+(await p.innerText('main')).slice(0,4000));
  console.log(JSON.stringify(await p.$$eval('main input,main button,main select,main textarea', els=>els.map(e=>[e.tagName,e.type,e.name,e.id,(e.innerText||e.value||e.placeholder||e.getAttribute('aria-label')||'').slice(0,40)]))));
  await b.close();
})();
