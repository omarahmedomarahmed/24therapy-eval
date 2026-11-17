const { chromium } = require('playwright');
const [,, state, ...paths] = process.argv;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ storageState: state, viewport:{width:1280,height:900} });
  const p = await ctx.newPage();
  for (const path of paths) {
    await p.goto('https://www.24therapy.app'+path, { waitUntil:'networkidle' });
    console.log('=== '+path+' -> '+p.url());
    console.log((await p.innerText('main').catch(()=>p.innerText('body'))).slice(0,3500));
    console.log('CONTROLS', JSON.stringify(await p.$$eval('main input,main button,main select,main a[href*="kit"],main textarea,[role=tab]', els => els.map(e => [e.tagName,e.type,e.name,e.id,(e.innerText||e.value||e.placeholder||e.getAttribute('aria-label')||'').slice(0,40), e.getAttribute('href')]))));
  }
  await b.close();
})();
