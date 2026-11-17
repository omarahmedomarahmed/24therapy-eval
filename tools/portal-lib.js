// Shared portal helpers. Credentials come from env only; nothing secret is printed.
const { chromium } = require('playwright');
const BASE = 'https://www.24therapy.app';
async function open(n, opts = {}) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...opts });
  const p = await ctx.newPage();
  await p.goto(BASE + '/portal/sign-in', { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', process.env[`P${n}_PORTAL_EMAIL`]);
  await p.fill('input[type=password]', process.env[`P${n}_PORTAL_PASSWORD`]);
  await Promise.all([p.waitForURL(/\/portal(\/)?$/), p.click('button[type=submit]')]);
  await p.waitForLoadState('networkidle');
  return { b, ctx, p };
}
// Hide anything that looks like a key, token or secret before a screenshot.
async function mask(p) {
  await p.evaluate(() => {
    const re = /(24t_sk_(test|live)_[A-Za-z0-9_-]*|whsec_[A-Za-z0-9_-]+|wgt_[A-Za-z0-9_-]+|plk_[A-Za-z0-9_-]+)/g;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) if (re.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(re, m => m.slice(0, m.indexOf('_', 4) + 1) + '••••');
    document.querySelectorAll('input').forEach(i => { if (/24t_sk_|whsec_/.test(i.value) || i.type === 'password') i.value = '••••'; });
    document.querySelectorAll('header, nav, aside').forEach(e => e.innerHTML = e.innerHTML.replace(/eval-[a-z]+@24therapy\.app/g, 'evaluator@example.com'));
  });
}
async function shot(p, file) { await mask(p); await p.screenshot({ path: file, fullPage: false }); }
module.exports = { open, mask, shot, BASE };
