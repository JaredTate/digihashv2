'use strict';
// Website fixes from the 2026-10-25 validation round:
//   FIRST-TIMER-13  block totals add up (Total = Pending + Confirmed + Orphaned)
//   FIRST-TIMER-18  worker page: one "Round shares" number (summary = sum of the worker cards)
//   FIRST-TIMER-17  short glossary and title hints for pool words
//   FIRST-TIMER-19  axe-core: alt, iframe title, menu button name, footer links, contrast, focusable charts
//   FIRST-TIMER-21  one name "DigiHash", "1 Miner" / "2 Miners", links to digibyte.io and DigiExplorer
//   SLOW-8          44 px tap targets on phones
//   stats.html typo  id="statsLuckDays{=pool}}" (Luck never updated live)
// Templates are rendered with dot exactly like libs/website.js does.
// Run: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { read, ADDR, siteData, renderPage, renderSite, inlineScripts } = require('./helpers/site-render');

function cssRules(css) {
    const rules = {};
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
        for (const sel of m[1].split(',')) {
            const k = sel.trim().replace(/\s+/g, ' ');
            rules[k] = (rules[k] || '') + m[2];
        }
    }
    return rules;
}
// The phone (@media max-width) block of style.css.
function phoneCss() {
    const css = read('website/static/style.css');
    const start = css.indexOf('@media (max-width: 47.999em)');
    assert.ok(start >= 0, 'phone media block exists');
    let depth = 0, i = css.indexOf('{', start);
    const from = i + 1;
    for (; i < css.length; i++) { if (css[i] === '{') depth++; else if (css[i] === '}' && --depth === 0) break; }
    return cssRules(css.slice(from, i));
}
function luminance(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

function oddBlocks() {
    const data = siteData();
    for (const p in data.stats.pools) {
        Object.assign(data.stats.pools[p].blocks, { pending: 0, confirmed: 2960, orphaned: 46 });
        data.stats.pools[p].poolStats.validBlocks = 3013; // counter also counts 7 rejected duplicates
    }
    return data;
}

// ---------------------------------------------------------------- FIRST-TIMER-13

test('FIRST-TIMER-13: stats, tbs and payments show Total = Pending + Confirmed + Orphaned', () => {
    const data = oddBlocks();
    const stats = renderPage('stats.html', data);
    assert.match(text(stats), /Total Blocks 3006 /);
    assert.doesNotMatch(stats, /3013/);
    assert.match(stats, /id="statsValidBlocks[^"]+">3006</);
    const tbs = renderPage('tbs.html', data);
    assert.match(tbs, /<td>3006<\/td>\s*<td>0<\/td>\s*<td>2960<\/td>\s*<td>46<\/td>/);
    assert.doesNotMatch(tbs, /3013/);
    const pay = renderPage('payments.html', data);
    assert.match(pay, /id="statsValidBlocks[^"]+">3006</);
    assert.doesNotMatch(pay, /3013/);
});

test('FIRST-TIMER-13: the live update on /stats uses the same sum', () => {
    const code = inlineScripts(renderPage('stats.html')).find((s) => s.includes("statsSource.addEventListener('message'"));
    assert.ok(code);
    const set = {};
    let onMsg;
    const $ = (sel) => (typeof sel === 'function' ? sel() : { text: (v) => { set[sel] = v; } });
    const ctx = vm.createContext({
        $, document: { hidden: false },
        statsSource: { addEventListener: (t, fn) => { onMsg = fn; } },
        getReadableHashRateString: () => '1 H/s', calculateAverageHashrate: () => 1, getReadableLuckTime: (l) => l + ' Days'
    });
    vm.runInContext(code, ctx);
    const pool = { minerCount: 2, workerCount: 1, hashrate: 1, luckDays: '1', blocks: { pending: 1, confirmed: 2960, orphaned: 46 },
        poolStats: { validBlocks: 3013, totalPaid: '1', networkBlocks: 1, networkDiff: 1, networkHash: 10, networkConnections: 1 } };
    onMsg({ data: JSON.stringify({ pools: { 'digibyte-odo': pool } }) });
    assert.equal(set['#statsValidBlocksdigibyte-odo'], 3007);
    assert.equal(set['#statsLuckDaysdigibyte-odo'], '1 Days');
    assert.equal(set['#statsMinersdigibyte-odo'], '2 Miners');
    assert.equal(set['#statsWorkersdigibyte-odo'], '1 Worker');
});

// ---------------------------------------------------------------- stats.html typo

test('stats page: each pool has its own Luck element id (live updates find it)', () => {
    const data = siteData();
    const html = renderPage('stats.html', data);
    assert.doesNotMatch(html, /\{=pool\}\}/);
    for (const p in data.stats.pools) assert.match(html, new RegExp('id="statsLuckDays' + p + '"'));
});

// ---------------------------------------------------------------- FIRST-TIMER-18

function fakeJQuery() {
    const out = { text: {}, html: {}, getJSON: [] };
    const $ = (sel) => {
        if (typeof sel === 'function') return undefined;
        return {
            text: (v) => { if (v !== undefined) out.text[sel] = String(v); return out.text[sel] || ''; },
            html: (v) => { if (v !== undefined) out.html[sel] = String(v); return out.html[sel] || ''; },
            show: () => {}, hide: () => {}, toggle: () => {}, each: () => {}
        };
    };
    $.getJSON = (url, cb) => out.getJSON.push({ url, cb });
    return { $, out };
}

test('FIRST-TIMER-18: summary Round shares = sum of the worker cards, same label', () => {
    const { $, out } = fakeJQuery();
    const ctx = vm.createContext({ $, nv: { utils: { windowResize() {} }, addGraph() {} }, statsSource: { addEventListener() {} }, document: { hidden: false }, _miner: ADDR });
    vm.runInContext(read('website/static/miner_stats.js'), ctx);
    out.getJSON[0].cb({
        miner: ADDR, totalHash: 1, totalShares: 35207.75, networkHash: 1e9, immature: 0, balance: 0, paid: 0,
        workers: { [ADDR + '.a']: { hashrate: 1, currRoundShares: 33405.04 }, [ADDR + '.b']: { hashrate: 1, currRoundShares: 100.5 } },
        history: {}
    });
    assert.equal(out.text['#statsTotalShares'], '33505.54');
    assert.match(out.html['#boxesWorkers'], /Round shares:/);
    assert.match(renderPage('miner_stats.html'), /Round shares:/);
});

// ---------------------------------------------------------------- FIRST-TIMER-17

test('FIRST-TIMER-17: /stats has a short glossary of the pool words', () => {
    const html = renderPage('stats.html');
    const m = html.match(/<details class="glossary"[\s\S]*?<\/details>/);
    assert.ok(m, 'glossary block');
    for (const w of ['Luck', 'Share %', 'Round shares', 'Efficiency', 'Valid / Invalid shares', 'Orphaned', 'Difficulty', 'Tab Stats']) {
        assert.ok(m[0].includes('<dt>' + w + '</dt>'), 'glossary has ' + w);
    }
    assert.ok(text(m[0]).length < 1500, 'keep it short');
});

test('FIRST-TIMER-17: title hints on Luck, Share, Orphaned, Difficulty, Efficiency and Tab Stats', () => {
    const stats = renderPage('stats.html');
    for (const w of ['Luck', 'Share', 'Orphaned', 'Difficulty']) assert.match(stats, new RegExp('<span class="hint" title="[^"]{10,}">' + w), w);
    assert.match(renderPage('workers.html'), /<th title="[^"]{10,}">Efficiency<\/th>/);
    assert.match(renderPage('tbs.html'), /<th title="[^"]{10,}">Orphaned<\/th>/);
    assert.match(renderSite('stats'), /<a class="pure-menu-link" href="\/tbs" title="[^"]{10,}">/);
});

// ---------------------------------------------------------------- FIRST-TIMER-19

test('FIRST-TIMER-19: logo alt, iframe title, menu button name', () => {
    const html = renderSite('');
    assert.match(html, /<img id="logoImg"[^>]*\balt="DigiHash logo"/);
    assert.match(html, /<iframe[^>]*\btitle="[^"]+"/);
    assert.match(html, /<a href="#" class="custom-toggle" id="toggle"[^>]*\baria-label="Menu"/);
});

test('FIRST-TIMER-19: footer links are underlined (not told apart by color only)', () => {
    assert.match(cssRules(read('website/static/style.css'))['footer a'], /text-decoration:\s*underline/);
});

test('FIRST-TIMER-19: home welcome box and /stats block labels pass 4.5:1 contrast', () => {
    const home = cssRules(renderPage('home.html').match(/<style>([\s\S]*?)<\/style>/)[1]);
    const bg = home['#boxWelcome'].match(/background-color:\s*(#[0-9a-f]{6})/i)[1];
    assert.ok(contrast('#ffffff', bg) >= 4.5, 'white on ' + bg);
    assert.doesNotMatch(home['.boxStatsList'], /opacity/, 'faded text on the home stat boxes');
    const stats = renderPage('stats.html');
    const css = cssRules(stats.match(/<style>([\s\S]*?)<\/style>/)[1]);
    assert.doesNotMatch(css['.boxStatsList'], /opacity/);
    for (const c of [...stats.matchAll(/style="[^"]*\bcolor:\s*(#[0-9a-f]{6}|[a-z]+)[;"]/gi)].map((x) => x[1])) {
        assert.match(c, /^#[0-9a-f]{6}$/i, 'named colors are hard to check: ' + c);
        assert.ok(contrast(c, '#eeeeee') >= 4.5, c + ' on #eee');
    }
});

test('FIRST-TIMER-19: block-finder chart boxes that scroll on phones can get keyboard focus', () => {
    const html = renderPage('stats.html');
    const holders = [...html.matchAll(/<div class="chartHolder" id="pie[^"]*"[^>]*>/g)].map((m) => m[0]);
    assert.ok(holders.length > 0);
    for (const h of holders) { assert.match(h, /tabindex="0"/); assert.match(h, /aria-label="[^"]+"/); }
    const labels = holders.map((h) => h.match(/aria-label="([^"]+)"/)[1]);
    assert.equal(new Set(labels).size, labels.length, 'each chart region has its own name (axe landmark-unique)');
});

// ---------------------------------------------------------------- FIRST-TIMER-21

test('FIRST-TIMER-21: one visible name "DigiHash", and DigiByte spelled right', () => {
    for (const sel of ['', 'stats', 'workers', 'payments', 'tbs', 'getting_started']) {
        const t = text(renderSite(sel));
        assert.doesNotMatch(t, /DigiHash ?V2|DigiHashv2|DIGIHASH/, 'page ' + sel);
        assert.doesNotMatch(t, /Digibyte/, 'page ' + sel);
    }
    const heading = cssRules(read('website/static/style.css'))['.home-menu>a.pure-menu-heading'];
    assert.match(heading, /text-transform:\s*none/, 'menu heading is not upper-cased by Pure CSS');
});

test('FIRST-TIMER-21: "1 Miner" / "2 Miners" and "1 Worker" / "2 Workers"', () => {
    const data = siteData();
    const pools = Object.keys(data.stats.pools);
    data.stats.pools[pools[0]].minerCount = 1; data.stats.pools[pools[0]].workerCount = 1;
    data.stats.pools[pools[1]].minerCount = 2; data.stats.pools[pools[1]].workerCount = 2;
    data.stats.algos = { odo: { workers: 1, hashrateString: '1 H/s' }, sha256d: { workers: 3, hashrateString: '1 H/s' } };
    for (const page of ['stats', 'workers', '']) {
        const t = text(renderSite(page, data));
        assert.doesNotMatch(t, /\b1 (Miners|Workers)\b/, 'page ' + page);
        assert.doesNotMatch(t, /\b[02-9] (Miner|Worker)\b/, 'page ' + page);
        assert.match(t, /\b1 (Miner|Worker)\b/, 'page ' + page);
    }
});

test('FIRST-TIMER-21: the menu links to DigiByte Stats (digibyte.io) and DigiExplorer', () => {
    const html = renderSite('stats');
    const menu = html.match(/<ul class="pure-menu-list">[\s\S]*?<\/ul>/)[0];
    assert.match(menu, /<a [^>]*href="https:\/\/digibyte\.io\/?"[^>]*>DigiByte Stats<\/a>/);
    assert.match(menu, /<a [^>]*href="https:\/\/digiexplorer\.info\/?"[^>]*>DigiExplorer<\/a>/);
    assert.match(menu, /<a [^>]*href="https:\/\/www\.dgbat\.org\/"[^>]*title="[^"]+"/, 'DGBAT is explained');
    // Every menu entry is a Pure menu item, so it sits in the menu row on desktop (not stacked behind the page).
    for (const li of menu.match(/<li\b[^>]*>/g)) assert.match(li, /class="pure-menu-item"/, li);
});

// ---------------------------------------------------------------- SLOW-8

test('SLOW-8: phone menu links, menu button and /stats links are at least 44 px tall', () => {
    const phone = phoneCss();
    assert.match(phone['a.pure-menu-link'] || '', /min-height:\s*44px/);
    assert.match(phone['.custom-menu li > a:not(.pure-menu-link)'], /min-height:\s*44px/);
    assert.match(phone['.custom-toggle'], /width:\s*(4[4-9]|[5-9]\d)px/);
    assert.match(phone['#boxesLower .boxStatsList a'] || '', /min-height:\s*44px/);
    assert.match(phone['.miner-lookup input'] || '', /min-height:\s*44px/, 'Miner Lookup box');
    assert.match(phone['.miner-lookup button'] || '', /min-height:\s*44px/, 'Lookup button');
    assert.match(phone['.poolMinerTable a'] || '', /min-height:\s*44px/, 'table links');
});
