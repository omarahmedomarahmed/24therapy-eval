// Probe: sign in to the partner portal and dump page text (no secrets printed).
const { chromium } = require('playwright');
const [,, email, pass, out] = process.argv;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:1280,height:900}, acceptDownloads:true });
  const p = await ctx.newPage();
  await p.goto('https://www.24therapy.app/portal/sign-in', { waitUntil:'networkidle' });
  console.log('INPUTS', await p.$$eval('input,button', els => els.map(e => `${e.tagName}:${e.type}:${e.name}:${e.id}:${(e.innerText||e.placeholder||'').slice(0,30)}`)));
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', pass);
  await Promise.all([p.waitForLoadState('networkidle'), p.click('button[type=submit]')]);
  await p.waitForTimeout(3000);
  console.log('URL', p.url());
  console.log((await p.innerText('body')).slice(0, 4000));
  await ctx.storageState({ path: out });
  await b.close();
})();
