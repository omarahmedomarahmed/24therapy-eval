// Download kit zips from the partner portal (after the Kit Licence and NDA are signed).
// usage: P1_PORTAL_EMAIL=... P1_PORTAL_PASSWORD=... node tools/portal-download.js 1 kits/relay server-node browser cli
const fs = require('fs'), path = require('path');
const { open } = require('./portal-lib');
const [n, dir, ...kits] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(dir, { recursive: true });
  const { b, p } = await open(n);
  await p.goto('https://www.24therapy.app/portal/kits', { waitUntil: 'networkidle' });
  for (const k of kits) {
    const [d] = await Promise.all([p.waitForEvent('download'), p.click(`a[href="/portal/kits/download/${k}"]`)]);
    await d.saveAs(path.join(dir, d.suggestedFilename())); console.log('downloaded', d.suggestedFilename());
  }
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
