'use strict';
// Website template and browser-script checks (QA bugs 2026-10-24).
// Templates are rendered with dot exactly like libs/website.js does.
// Run: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dot = require('dot');

const repoRoot = path.resolve(__dirname, '..');
dot.templateSettings.strip = false;

function render(file, data) {
    const p = path.join(repoRoot, 'website', file === 'index.html' ? '' : 'pages', file);
    return dot.template(fs.readFileSync(p, 'utf8'))(data);
}

// Inline <script> blocks (no src) in a rendered page.
function inlineScripts(html) {
    const out = [];
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html))) out.push(m[1]);
    return out;
}

const PAY_TIME = 1792809186691; // 2026-10-24T02:33:06.691Z

function sampleData() {
    const pool = 'digibyte-odo';
    const block = 'aa:bb:24437612:DSftST6gv7d1XYSvYhKXNauddAWoVnzGAS.w1:1792799356508';
    return {
        portalConfig: { website: { stratumHost: 'digihash.digibyte.io' } },
        poolsConfigs: {
            [pool]: { coin: { name: pool, algorithm: 'odo', explorer: {
                txURL: 'https://digiexplorer.info/tx/', blockURL: 'https://digiexplorer.info/block/' } }, ports: {} }
        },
        stats: {
            algos: {},
            pools: {
                [pool]: {
                    name: pool, symbol: 'DGB', algorithm: 'odo',
                    minerCount: 1, workerCount: 1, hashrate: 1, hashrateString: '1 MH/s', luckDays: '0.058',
                    workers: {}, miners: {},
                    blocks: { pending: 0, confirmed: 1, orphaned: 0 },
                    poolStats: { networkHash: 10, networkBlocks: 24437612, networkHashString: '10 MH/s',
                        networkDiff: '1.5', networkConnections: 8, networkVersion: 'v9', validBlocks: 1,
                        totalPaid: '221.5', validShares: 10, invalidShares: 0 },
                    pending: { blocks: [], confirms: {} },
                    confirmed: { blocks: [block] },
                    payments: [{ time: PAY_TIME, txid: 'cc', shares: 14737.9, paid: 221.5, miners: 1,
                        blocks: [24437612], amounts: { DSftST6gv7d1XYSvYhKXNauddAWoVnzGAS: 221.5 } }]
                }
            }
        }
    };
}

// B10: the language script ran getElementById('language-select') on a page that has no such element.
test('B10: language script does not throw when the page has no language picker', async () => {
    const html = render('index.html', { page: '', selected: '', stats: {}, poolConfigs: {}, portalConfig: {} });
    const code = inlineScripts(html).find((s) => s.includes('setLanguage'));
    assert.ok(code, 'language script is present');

    let onReady;
    const errors = [];
    const doc = {
        documentElement: { lang: 'en-US' },
        addEventListener: (evt, fn) => { if (evt === 'DOMContentLoaded') onReady = fn; },
        querySelectorAll: () => [{ getAttribute: () => 'stats', set textContent(v) { this.v = v; } }],
        getElementById: () => null
    };
    const translations = JSON.parse(fs.readFileSync(path.join(repoRoot, 'website/static/translations.json'), 'utf8'));
    const ctx = vm.createContext({
        document: doc,
        console: { error: (...a) => errors.push(a.join(' ')) },
        fetch: async () => ({ ok: true, json: async () => translations })
    });
    const rejections = [];
    const onRej = (e) => rejections.push(e);
    process.on('unhandledRejection', onRej);
    try {
        vm.runInContext(code, ctx);
        assert.equal(typeof onReady, 'function');
        onReady();
        await new Promise((r) => setTimeout(r, 20));
    } finally {
        process.off('unhandledRejection', onRej);
    }
    assert.deepEqual(rejections.map(String), []);
    assert.deepEqual(errors, []);
});

// B11: stats.html wrote .attr('id', ""digibyte-odo"") into its pie-chart script.
test('B11: every inline script on the stats page is valid JavaScript', () => {
    const html = render('stats.html', sampleData());
    const scripts = inlineScripts(html);
    assert.ok(scripts.length > 0);
    for (const s of scripts) {
        assert.doesNotThrow(() => new vm.Script(s), 'script does not parse:\n' + s.slice(0, 300));
    }
});

// B12: the API sends luckDays as a string ("64.561"), and "64.561".toFixed does not exist.
test('B12: worker page formats luck sent as a string', () => {
    const code = fs.readFileSync(path.join(repoRoot, 'website/static/miner_stats.js'), 'utf8');
    const noop = () => {};
    const ctx = vm.createContext({
        $: Object.assign(noop, { getJSON: noop }),
        nv: { utils: { windowResize: noop } },
        statsSource: { addEventListener: noop },
        _miner: 'D'
    });
    vm.runInContext(code, ctx);
    assert.equal(ctx.getReadableLuckTime('64.561'), '64.561 Days');
    assert.equal(ctx.getReadableLuckTime('0.5'), '12.00 Hours');
    assert.equal(ctx.getReadableLuckTime(0.01), '14.40 Minutes');
});

// B13: payments.html readableDate() had no return statement.
test('B13: payments page shows the payment time', () => {
    const html = render('payments.html', sampleData());
    const row = html.slice(html.indexOf('<tr class="pure-table-odd">'));
    const timeCell = row.match(/<td[^>]*>[\s\S]*?<\/td>\s*<td>([\s\S]*?)<\/td>/)[1].trim();
    assert.equal(timeCell, '2026-10-24 02:33:06 UTC');
});

test('footer shows the current year, not a fixed one', () => {
    const html = render('index.html', { page: '', selected: '', stats: {}, poolConfigs: {}, portalConfig: {} });
    assert.match(html, new RegExp('© ' + new Date().getFullYear()));
    assert.doesNotMatch(fs.readFileSync(path.join(repoRoot, 'website/index.html'), 'utf8'), /©\s*20\d\d/);
});
