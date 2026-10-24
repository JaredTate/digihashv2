'use strict';
// Browser checks (Playwright) for the 2026-10-24 website fixes, on a static render of the templates.
// Playwright is not a dependency of this repo, so this file SKIPS unless it can load it:
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright  (or playwright installed where Node finds it)
//   CHROMIUM_PATH=/path/to/chrome-headless-shell        (optional, if Playwright's own browser is missing)
// The pages load jQuery and fonts from cdnjs, so the checks also skip when offline.
// Run: npm test   (or: PLAYWRIGHT_MODULE=... node --test test/website-browser.test.js)

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { repoRoot, ADDR, siteData, renderSite } = require('./helpers/site-render');

function loadPlaywright() {
    for (const id of [process.env.PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean)) {
        try { return require(id); } catch (e) { /* try next */ }
    }
    return null;
}

function startServer() {
    const server = http.createServer((req, res) => {
        const u = decodeURIComponent(req.url.split('?')[0]);
        if (u.startsWith('/static/')) {
            const file = path.join(repoRoot, 'website', path.normalize(u));
            if (!file.startsWith(path.join(repoRoot, 'website', 'static'))) { res.statusCode = 404; return res.end(); }
            fs.readFile(file, (err, buf) => {
                if (err) { res.statusCode = 404; return res.end(); }
                if (file.endsWith('.js')) res.setHeader('content-type', 'application/javascript');
                if (file.endsWith('.css')) res.setHeader('content-type', 'text/css');
                res.end(buf);
            });
            return;
        }
        if (u === '/api/worker_stats') {
            res.setHeader('content-type', 'application/json');
            return res.end(JSON.stringify({ miner: 'x', totalHash: 0, totalShares: 0, networkHash: 0, immature: 0, balance: 0, paid: 0, workers: {}, history: {} }));
        }
        if (u === '/api/pool_stats') { res.setHeader('content-type', 'application/json'); return res.end('[]'); }
        if (u.startsWith('/api/')) { res.statusCode = 503; return res.end(); }
        const data = siteData();
        let sel = u.slice(1);
        if (sel.startsWith('workers/')) { data.stats.address = sel.slice(8); sel = 'miner_stats'; }
        res.setHeader('content-type', 'text/html; charset=utf-8');
        try { res.end(renderSite(sel, data)); } catch (e) { res.statusCode = 500; res.end(String(e)); }
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const pw = loadPlaywright();

test('browser: lookup, pop-up, tables, not-found and one stream on a phone', { skip: pw ? false : 'Playwright not available (set PLAYWRIGHT_MODULE)' }, async (t) => {
    const server = await startServer();
    const base = 'http://127.0.0.1:' + server.address().port;
    const launch = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
    let browser;
    try {
        browser = await pw.chromium.launch(launch);
    } catch (e) {
        server.close();
        t.skip('no Chromium for Playwright: ' + e.message.split('\n')[0]);
        return;
    }
    const errors = [];
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    // Count EventSource objects the page makes.
    await ctx.addInitScript(() => {
        const ES = window.EventSource;
        window.__esCount = 0;
        window.EventSource = function (url) { window.__esCount++; return new ES(url); };
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    try {
        await page.goto(base + '/workers', { waitUntil: 'load' });
        if (!(await page.evaluate(() => typeof window.jQuery === 'function'))) {
            t.skip('jQuery did not load from the CDN (offline?)');
            return;
        }

        await t.test('Enter in the 3rd box opens that address', async () => {
            await page.locator('input[name="lookup"]').nth(2).fill('  ' + ADDR + ' ');
            await Promise.all([page.waitForURL('**/workers/' + ADDR), page.locator('input[name="lookup"]').nth(2).press('Enter')]);
        });

        await t.test('the Lookup button of the 2nd box uses the 2nd box', async () => {
            await page.goto(base + '/workers', { waitUntil: 'load' });
            await page.locator('input[name="lookup"]').nth(1).fill('dgb1qvmn6cx976q37fz9h5crgc5nvw6wuxcc2gwfdce');
            await Promise.all([page.waitForURL('**/workers/dgb1qvmn6cx976q37fz9h5crgc5nvw6wuxcc2gwfdce'),
                page.locator('.miner-lookup button').nth(1).click()]);
        });

        await t.test('empty submit shows a message and stays on /workers', async () => {
            await page.goto(base + '/workers', { waitUntil: 'load' });
            await page.locator('input[name="lookup"]').nth(3).press('Enter');
            await page.waitForTimeout(200);
            assert.equal(new URL(page.url()).pathname, '/workers');
            assert.match(await page.locator('.lookup-msg').nth(3).innerText(), /address/i);
        });

        await t.test('all Workers table columns are inside the table box at 390 px', async () => {
            const r = await page.evaluate(() => {
                const box = document.querySelector('.poolMinerTable');
                const right = box.getBoundingClientRect().right;
                return { right, th: [...box.querySelectorAll('th')].map((h) => h.getBoundingClientRect().right), doc: document.documentElement.scrollWidth };
            });
            for (const x of r.th) assert.ok(x <= r.right + 1, 'column edge ' + x + ' > box ' + r.right);
            assert.ok(r.doc <= 390, 'page width ' + r.doc);
        });

        await t.test('pop-up from the dropdown fits the phone and the close button is visible', async () => {
            await page.goto(base + '/getting_started', { waitUntil: 'load' });
            await page.selectOption('#coinSelect', 'digibyte-sha256');
            const r = await page.evaluate(() => {
                const b = document.getElementById('coinInfo').getBoundingClientRect();
                const c = document.getElementById('coinInfoClose').getBoundingClientRect();
                return { b: { x: b.x, r: b.right, y: b.y, bottom: b.bottom }, c: { x: c.x, r: c.right, y: c.y }, vw: innerWidth, vh: innerHeight,
                    text: document.getElementById('coinInfo').innerText };
            });
            assert.ok(r.b.x >= 0 && r.b.r <= r.vw, 'pop-up x ' + JSON.stringify(r.b));
            assert.ok(r.b.y >= 0 && r.b.bottom <= r.vh, 'pop-up y ' + JSON.stringify(r.b));
            assert.ok(r.c.x >= 0 && r.c.r <= r.vw && r.c.y >= 0, 'close button ' + JSON.stringify(r.c));
            assert.match(r.text, /stratum\+tcp:\/\/digihash\.digibyte\.io:3008/);
            assert.match(r.text, /DigiByte \(DGB\) address/);
            // Scroll to the bottom: the close button stays on screen.
            await page.evaluate(() => { document.getElementById('coinInfo').scrollTop = 99999; });
            const cy = await page.evaluate(() => document.getElementById('coinInfoClose').getBoundingClientRect().y);
            assert.ok(cy >= 0 && cy < 100, 'close button still at the top: ' + cy);
            await page.click('#coinInfoClose');
            assert.equal(await page.isVisible('#coinInfo'), false);
        });

        await t.test('unknown address shows the not-found message, no Infinity', async () => {
            await page.goto(base + '/workers/hello%20there', { waitUntil: 'load' });
            await page.waitForSelector('#minerNotFound', { state: 'visible', timeout: 5000 });
            const text = await page.locator('main').innerText();
            assert.match(text, /No miner found for this address yet/);
            assert.doesNotMatch(text, /Infinity|NaN|undefined/);
        });

        await t.test('one live-stats stream per page', async () => {
            for (const p of ['/', '/stats', '/workers/' + ADDR]) {
                await page.goto(base + p, { waitUntil: 'load' });
                await page.waitForTimeout(300);
                assert.equal(await page.evaluate(() => window.__esCount), 1, p);
            }
        });

        await t.test('no sideways scroll at 320 px', async () => {
            await page.setViewportSize({ width: 320, height: 568 });
            for (const p of ['/', '/stats', '/getting_started', '/workers']) {
                await page.goto(base + p, { waitUntil: 'load' });
                const w = await page.evaluate(() => document.documentElement.scrollWidth);
                assert.ok(w <= 320, p + ' is ' + w + ' px wide');
            }
        });

        assert.deepEqual(errors.filter((e) => !/EventSource|live_stats/.test(e)), [], 'no page errors');
    } finally {
        await browser.close();
        server.close();
    }
});
