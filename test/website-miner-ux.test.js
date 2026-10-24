'use strict';
// Website fixes from the 2026-10-24 break-it round:
//   CHAOS-1 / FIRST-TIMER-5 / WEIRD-INPUT-2  Miner Lookup boxes and Enter key
//   WEIRD-INPUT-6 / FIRST-TIMER-12 / -18     worker page: "not found" message, units, no Infinity/NaN
//   FIRST-TIMER-3                            miner settings pop-up fits a phone
//   FIRST-TIMER-4 / SLOW-11                  wide tables and page width on phones
//   FIRST-TIMER-6                            Getting Started has fee, payout and stats text
//   SLOW-5                                   one live-stats stream per page, with backoff
// Templates are rendered with dot exactly like libs/website.js does.
// Run: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');

const { read, ADDR, siteData, renderPage, renderSite, inlineScripts } = require('./helpers/site-render');

// CSS of a <style> block or a .css file, as { selector: body } (last rule wins, media rules included).
function cssRules(css) {
    const rules = {};
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
        for (const sel of m[1].split(',')) rules[sel.trim().replace(/\s+/g, ' ')] = (rules[sel.trim().replace(/\s+/g, ' ')] || '') + m[2];
    }
    return rules;
}

// ---------------------------------------------------------------- Miner Lookup

function lookupForms(html) {
    return [...html.matchAll(/<form\b[^>]*class="[^"]*miner-lookup[^"]*"[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]);
}

function lookupContext() {
    const html = renderPage('workers.html');
    const code = inlineScripts(html).find((s) => s.includes('minerLookupSubmit'));
    assert.ok(code, 'lookup script is on the page');
    const ctx = vm.createContext({ window: { location: { href: '/workers' } } });
    vm.runInContext(code, ctx);
    return ctx;
}

function fakeForm(value) {
    const input = { value, focused: false, focus() { this.focused = true; } };
    const msg = { textContent: '' };
    return {
        input, msg,
        querySelector: (sel) => (sel.includes('input') ? input : sel.includes('lookup-msg') ? msg : null)
    };
}

test('lookup: every pool section has its own form, input and submit button', () => {
    const data = siteData();
    const html = renderPage('workers.html', data);
    const forms = lookupForms(html);
    assert.equal(forms.length, Object.keys(data.stats.pools).length);
    assert.ok(forms.length >= 5, 'five live pools render five lookup boxes');
    for (const f of forms) {
        assert.equal((f.match(/<input\b/g) || []).length, 1, 'one input per form');
        assert.match(f, /<button\b[^>]*type="submit"/, 'the button submits its own form');
        // A form submit is what Enter and the phone "Go" key trigger.
        assert.match(f, /onsubmit="return minerLookupSubmit\(this\);?"/);
        assert.match(f, /enterkeyhint="go"/);
        assert.match(f, /class="lookup-msg"/);
    }
});

test('lookup: no reference to the missing #btnSearch and no "first box only" read', () => {
    const src = read('website/pages/workers.html');
    assert.doesNotMatch(src, /btnSearch/);
    assert.doesNotMatch(src, /\$\('\.input-lg'\)\.val\(\)/);
});

test('lookup: each box goes to its own address, trimmed', () => {
    const ctx = lookupContext();
    const addrs = [ADDR, 'D8nJ1bVuMHYY27tZAMjUp6ivJ8Sj38zUJ8', 'DQfy9eqbuC6gq4gdqkAhmXT37Pijq6shak',
        'dgb1qvmn6cx976q37fz9h5crgc5nvw6wuxcc2gwfdce', 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'];
    addrs.forEach((a, i) => {
        const form = fakeForm(i % 2 ? '  ' + a + '\t ' : a);
        assert.equal(ctx.minerLookupSubmit(form), false, 'submit never reloads the page itself');
        assert.equal(ctx.window.location.href, '/workers/' + a, 'box ' + (i + 1));
        assert.equal(form.msg.textContent, '');
    });
});

test('lookup: empty or blank submit shows a message and stays on the page', () => {
    const ctx = lookupContext();
    for (const v of ['', '   ', '\t\n', undefined, null]) {
        ctx.window.location.href = '/workers';
        const form = fakeForm(v);
        assert.equal(ctx.minerLookupSubmit(form), false);
        assert.equal(ctx.window.location.href, '/workers');
        assert.match(form.msg.textContent, /address/i);
        assert.ok(form.input.focused, 'focus goes back to the box');
    }
});

test('lookup: bech32 addresses are lower-cased, other text is URL-encoded', () => {
    const ctx = lookupContext();
    assert.equal(ctx.minerLookupUrl('DGB1QVMN6CX976Q37FZ9H5CRGC5NVW6WUXCC2GWFDCE'), '/workers/dgb1qvmn6cx976q37fz9h5crgc5nvw6wuxcc2gwfdce');
    assert.equal(ctx.minerLookupUrl(ADDR), '/workers/' + ADDR, 'base58 keeps its case');
    assert.equal(ctx.minerLookupUrl('a/b?c#d e'), '/workers/' + encodeURIComponent('a/b?c#d e'));
    assert.equal(ctx.minerLookupUrl('D\uD800'), null, 'broken text does not throw');
});

test('fuzz: lookup URL for 200 random inputs is null or /workers/<encoded trimmed value>', () => {
    const ctx = lookupContext();
    let seed = 1024;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 200; i++) {
        let s = '';
        const n = Math.floor(rnd() * 40);
        for (let j = 0; j < n; j++) s += String.fromCharCode(rnd() < 0.8 ? 32 + Math.floor(rnd() * 95) : Math.floor(rnd() * 0x3000));
        const url = ctx.minerLookupUrl(s);
        const t = s.trim();
        if (!t) { assert.equal(url, null, JSON.stringify(s)); continue; }
        assert.ok(url.startsWith('/workers/'), url);
        assert.doesNotMatch(url.slice(9), /[\s/?#<>"]/, 'no raw separators in ' + url);
        const back = decodeURIComponent(url.slice(9));
        assert.equal(back, /^dgb1/i.test(t) ? t.toLowerCase() : t);
    }
});

// ---------------------------------------------------------------- worker page

// A tiny jQuery stand-in that records what the worker page writes.
function fakeJQuery() {
    const out = { text: {}, html: {}, shown: {}, getJSON: [] };
    const $ = (sel) => ({
        text(v) { if (v === undefined) return out.text[sel] || ''; out.text[sel] = String(v); return this; },
        html(v) { if (v === undefined) return out.html[sel] || ''; out.html[sel] = String(v); return this; },
        show() { out.shown[sel] = true; return this; },
        hide() { out.shown[sel] = false; return this; }
    });
    $.getJSON = (url, cb) => out.getJSON.push({ url, cb });
    return { $, out };
}

function minerStatsContext(miner) {
    const { $, out } = fakeJQuery();
    const listeners = [];
    const ctx = vm.createContext({
        $, nv: { utils: { windowResize() {} }, addGraph() {} },
        statsSource: { addEventListener: (t, fn) => listeners.push(fn) },
        document: { hidden: false },
        _miner: miner === undefined ? ADDR : miner
    });
    vm.runInContext(read('website/static/miner_stats.js'), ctx);
    return { ctx, out, listeners };
}

const NOT_FOUND = 'No miner found for this address yet. Check the address, or wait a few minutes after you start mining.';

function emptyApi(miner) {
    return { miner, totalHash: 0, totalShares: 0, networkHash: 0, immature: 0, balance: 0, paid: 0, workers: {}, history: {} };
}
function busyApi() {
    return {
        miner: ADDR, totalHash: 18530000, totalShares: 9563.951, networkHash: 1e9, immature: 1.5, balance: 0.12345678, paid: 216072.19822761,
        workers: { [ADDR + '.rig1']: { hashrate: 18530000, luckDays: '64.561', diff: 25000, currRoundShares: 8799.76, balance: 0.1, paid: 216072.19822761 } },
        history: { [ADDR + '.rig1']: [{ time: 1792809186, hashrate: 18530000 }] }
    };
}

function allOutput(out) {
    return Object.values(out.text).concat(Object.values(out.html)).join('\n');
}

test('worker page: the not-found message is in the page and hidden at first', () => {
    const html = renderPage('miner_stats.html');
    const m = html.match(/<div id="minerNotFound"[^>]*>([\s\S]*?)<\/div>/);
    assert.ok(m, 'message element exists');
    assert.equal(m[1].trim(), NOT_FOUND);
    assert.match(m[0], /display:\s*none/);
    assert.match(m[0], /role="status"/);
});

test('worker page: an address with no data shows the message, not zeros or Infinity', () => {
    const { out } = minerStatsContext('hello');
    assert.equal(out.getJSON.length, 1);
    assert.equal(out.getJSON[0].url, '/api/worker_stats?hello');
    out.getJSON[0].cb(emptyApi('hello'));
    assert.equal(out.shown['#minerNotFound'], true);
    assert.equal(out.shown['.minerData'], false);
    assert.doesNotMatch(allOutput(out), /Infinity|NaN|undefined/);
    // The API error answer is "no data" too.
    const b = minerStatsContext('');
    b.out.getJSON[0].cb({ result: 'error' });
    assert.equal(b.out.shown['#minerNotFound'], true);
});

test('worker page: real data shows units and hides the message', () => {
    const { out } = minerStatsContext();
    out.getJSON[0].cb(busyApi());
    assert.equal(out.shown['#minerNotFound'], false);
    assert.equal(out.shown['.minerData'], true);
    assert.equal(out.text['#statsTotalPaid'], '216,072.19822761 DGB');
    assert.equal(out.text['#statsTotalBal'], '0.12345678 DGB');
    assert.equal(out.text['#statsTotalImmature'], '1.5 DGB');
    assert.equal(out.text['#statsTotalShares'], '9563.95');
    assert.match(out.text['#statsHashrate'], / [KMGTPEZY]?H\/s$/);
    assert.equal(out.text['#statsLuckDays'], '64.561 Days');
    const box = out.html['#boxesWorkers'];
    assert.match(box, /216,072\.19822761 DGB/);
    assert.match(box, /0\.1 DGB/);
    assert.doesNotMatch(allOutput(out), /Infinity|NaN|undefined/);
});

test('worker page: a miner that appears later replaces the message with stats', () => {
    const { out, listeners } = minerStatsContext();
    out.getJSON[0].cb(emptyApi(ADDR));
    assert.equal(out.shown['#minerNotFound'], true);
    assert.equal(listeners.length, 1);
    listeners[0]({ data: '{}' });
    out.getJSON[1].cb(busyApi());
    assert.equal(out.shown['#minerNotFound'], false);
    assert.equal(out.text['#statsTotalPaid'], '216,072.19822761 DGB');
});

test('worker page: number helpers never print Infinity, NaN or undefined', () => {
    const { ctx } = minerStatsContext();
    for (const v of [undefined, null, NaN, Infinity, -Infinity, -5, '', 'abc', {}, [], '1e400']) {
        assert.equal(ctx.getReadableHashRateString(v), '0 H/s', String(v));
        assert.doesNotMatch(ctx.getReadableLuckTime(v), /Infinity|NaN|undefined/, String(v));
        assert.doesNotMatch(ctx.formatDGB(v), /Infinity|NaN|undefined/, String(v));
    }
    assert.equal(ctx.getReadableLuckTime(Infinity), '-');
    assert.doesNotMatch(ctx.getReadableHashRateString(1e30), /undefined/);
    assert.match(ctx.getReadableHashRateString(1e40), /YH\/s$/);
    assert.equal(ctx.formatDGB('216072.19822761'), '216,072.19822761 DGB');
    assert.equal(ctx.formatDGB(0), '0 DGB');
});

test('worker page: the address in the page script is a safe JS string (backslash, newline, quotes)', () => {
    for (const a of ['abc\\', 'abc\ndef', 'x"><script>alert(1)</script>', "it's", 'a\u2028b', '</script><b>']) {
        const data = siteData();
        data.stats.address = a;
        const html = renderSite('miner_stats', data);
        assert.doesNotMatch(html, /<script>alert|<\/script><b>/);
        const code = inlineScripts(html).find((s) => s.includes('_miner'));
        assert.doesNotThrow(() => new vm.Script(code), JSON.stringify(a));
        const ctx = vm.createContext({ document: { querySelector: () => ({ appendChild: () => ({}) }), createElement: () => ({}) } });
        ctx.document.querySelector = () => ({ appendChild: (el) => el });
        ctx.document.createElement = () => ({});
        vm.runInContext(code, ctx);
        assert.equal(ctx._miner, a.split('.')[0]);
    }
});

test('fuzz: 200 random addresses and API answers never break the worker page', () => {
    let seed = 777;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const junkNum = () => pick([0, -1, 1.5, 1e9, 1e30, NaN, Infinity, -Infinity, null, undefined, '', 'x', '12.5', 'Infinity', '1e400', {}, []]);
    const randStr = (max) => {
        let s = '';
        const n = Math.floor(rnd() * max);
        for (let j = 0; j < n; j++) s += pick(['\\', '\n', '"', "'", '<', '>', '&', '.', '/', ' ', '\u2028', '%', '*'].concat(
            String.fromCharCode(32 + Math.floor(rnd() * 95)), String.fromCharCode(Math.floor(rnd() * 0x3000))));
        return s;
    };
    for (let i = 0; i < 200; i++) {
        const addr = rnd() < 0.2 ? pick([undefined, null, '', 0, ADDR, ADDR + '.rig', 'dgb1' + randStr(5)]) : randStr(60);
        const data = siteData();
        data.stats.address = addr;
        let html;
        assert.doesNotThrow(() => { html = renderSite('miner_stats', data); }, 'render ' + i);
        assert.doesNotMatch(html, /Infinity|NaN|undefined/, 'render ' + i + ' ' + JSON.stringify(addr));
        assert.doesNotMatch(html, /<script>alert|<img|<b>/i);
        const code = inlineScripts(html).find((s) => s.includes('_miner'));
        assert.doesNotThrow(() => new vm.Script(code), 'script ' + i + ' ' + JSON.stringify(addr));
        // The label shows the address HTML-escaped.
        const label = html.match(/<div style="float:left; margin-right: 9px;">([\s\S]*?)<\/div>/)[1];
        assert.doesNotMatch(label, /[<>"]/, 'label is escaped: ' + label);

        // Random API answer for the same page.
        const miner = typeof addr === 'string' ? addr.split('.')[0] : '';
        const { out, listeners } = minerStatsContext(miner);
        const workers = {};
        const wn = Math.floor(rnd() * 4);
        for (let w = 0; w < wn; w++) {
            workers[miner + '.' + randStr(8)] = { hashrate: junkNum(), luckDays: junkNum(), diff: junkNum(),
                currRoundShares: junkNum(), balance: junkNum(), paid: junkNum() };
        }
        const history = {};
        for (const w in workers) if (rnd() < 0.5) history[w] = [{ time: 1792809186, hashrate: junkNum() }];
        const api = rnd() < 0.1 ? { result: 'error' } : { miner, totalHash: junkNum(), totalShares: junkNum(), networkHash: junkNum(),
            immature: junkNum(), balance: junkNum(), paid: junkNum(), workers, history };
        assert.doesNotThrow(() => out.getJSON[0].cb(api), 'api ' + i);
        assert.doesNotThrow(() => { listeners[0]({ data: '{}' }); out.getJSON[1].cb(api); }, 'live api ' + i);
        assert.doesNotMatch(allOutput(out), /Infinity|NaN|undefined/, 'api output ' + i + ' ' + JSON.stringify(api));
        assert.doesNotMatch(out.html['#boxesWorkers'] || '', /<script|<img|onerror/i);
    }
});

// ---------------------------------------------------------------- phone layout (CSS)

test('pop-up: the miner settings box fits a phone and scrolls inside', () => {
    const src = read('website/pages/getting_started.html');
    const css = cssRules(src.match(/<style>([\s\S]*?)<\/style>/)[1]);
    const box = css['#coinInfo'];
    assert.match(box, /max-width:\s*calc\(100vw\s*-\s*\d+px\)/);
    assert.match(box, /max-height:\s*calc\(100vh\s*-\s*\d+px\)/);
    assert.match(box, /overflow-y:\s*auto/);
    assert.match(box, /box-sizing:\s*border-box/);
    assert.doesNotMatch(box, /margin-left:\s*-375px/, 'no fixed half-width offset');
    const close = css['#coinInfoClose'];
    assert.match(close, /position:\s*sticky/, 'close button stays visible while the box scrolls');
    assert.match(css['.coinInfoValue'], /overflow-wrap:\s*anywhere/, 'long URLs wrap');
});

test('tables: every wide table sits in a sideways-scroll box', () => {
    const data = siteData();
    for (const page of ['workers.html', 'tbs.html', 'payments.html']) {
        const html = renderPage(page, data);
        const tables = (html.match(/<table\b/g) || []).length;
        const wrapped = (html.match(/<div class="poolMinerTable">\s*<table\b/g) || []).length;
        assert.ok(tables > 0, page);
        assert.equal(wrapped, tables, page + ': all tables wrapped');
    }
    const css = cssRules(read('website/static/style.css'));
    assert.match(css['.poolMinerTable'], /overflow-x:\s*auto/);
});

test('tables: worker addresses are shortened with an ellipsis and keep the full value in title', () => {
    const html = renderPage('workers.html');
    const cells = [...html.matchAll(/<td class="addr-cell"><a href="([^"]*)" title="([^"]*)">([^<]*)<\/a><\/td>/g)];
    assert.ok(cells.length >= 5, 'address cells found');
    for (const c of cells) {
        assert.equal(c[2], ADDR);
        assert.equal(c[3], ADDR);
        assert.equal(c[1], '/workers/' + ADDR);
    }
    const css = cssRules(read('website/static/style.css'));
    const a = css['.poolMinerTable .addr-cell a'];
    assert.match(a, /text-overflow:\s*ellipsis/);
    assert.match(a, /white-space:\s*nowrap/);
    assert.match(a, /max-width:/);
});

test('tables: a miner name with HTML in it is escaped on the workers page', () => {
    const data = siteData();
    const p = Object.keys(data.stats.pools)[0];
    data.stats.pools[p].miners = { '<img src=x onerror=alert(1)>': { shares: 1, invalidshares: 0, hashrateString: '1 H/s' },
        ['bad\uD800name']: { shares: 1, invalidshares: 0, hashrateString: '1 H/s' } };
    let html;
    // processTemplates() renders every page on a timer: a throw here would break the whole site.
    assert.doesNotThrow(() => { html = renderPage('workers.html', data); });
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /NaN/, 'missing currRoundShares shows 0, not NaN');
});

test('page width: the footer donate address and Getting Started stack fit a 320 px phone', () => {
    const css = cssRules(read('website/static/style.css'));
    assert.match(css['footer'], /overflow-wrap:\s*anywhere/);
    const gs = cssRules(read('website/pages/getting_started.html').match(/<style>([\s\S]*?)<\/style>/)[1]);
    assert.match(gs['#holder'], /flex-direction:\s*row/);
    // the phone media rule stacks the menu under the steps
    assert.match(read('website/pages/getting_started.html'), /@media \(max-width: 47\.999em\)\s*\{[\s\S]*#holder\s*\{\s*flex-direction:\s*column;/);
});

// ---------------------------------------------------------------- Getting Started

const ALGO_NAMES = { sha256d: 'SHA256', scrypt: 'Scrypt', skein: 'Skein', qubit: 'Qubit', odo: 'Odocrypt', groestlmyriad: 'Groestl' };

function feeOf(cfg) {
    let fee = 0;
    for (const k in cfg.rewardRecipients || {}) fee += Number(cfg.rewardRecipients[k]);
    return Math.round(fee * 100) / 100;
}

test('getting started: fee per algorithm matches pool_configs', () => {
    const data = siteData();
    const html = renderPage('getting_started.html', data);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const byFee = {};
    for (const p in data.poolsConfigs) {
        const c = data.poolsConfigs[p];
        (byFee[feeOf(c)] = byFee[feeOf(c)] || []).push(ALGO_NAMES[c.coin.algorithm]);
    }
    // Today: 10% on SHA256, Scrypt, Skein, Qubit and 9.5% on Odocrypt.
    assert.deepEqual(Object.keys(byFee).map(Number).sort((a, b) => a - b), [9.5, 10]);
    for (const fee in byFee) {
        const m = text.match(new RegExp(fee.replace('.', '\\.') + '% on ([A-Za-z0-9, ]+?)(;|\\.)'));
        assert.ok(m, fee + '% sentence: ' + text.slice(text.indexOf('Pool fee'), text.indexOf('Pool fee') + 200));
        assert.deepEqual(m[1].replace(/ and /g, ', ').split(/,\s*/).sort(), byFee[fee].slice().sort());
    }
});

test('getting started: minimum payout, worker page and address wording', () => {
    const data = siteData();
    const html = renderPage('getting_started.html', data);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const mins = new Set(Object.values(data.poolsConfigs).map((c) => c.paymentProcessing.minimumPayment));
    assert.deepEqual([...mins], [25]);
    assert.match(text, /Minimum payout: 25 DGB/);
    assert.match(text, /digihash\.digibyte\.io\/workers\/YOUR-ADDRESS/);
    assert.match(text, /any normal DigiByte \(DGB\) address/);
    assert.doesNotMatch(html, /wallet address'/, 'pop-up no longer says "your <coin> wallet address"');
    assert.match(html, /DigiByte \(DGB\) address/);
    assert.doesNotMatch(text, /Infinity|NaN|undefined/);
});

test('getting started: "Select a coin" is a real dropdown with a label and caret', () => {
    const data = siteData();
    const html = renderPage('getting_started.html', data);
    const sel = html.match(/<select id="coinSelect"[^>]*>([\s\S]*?)<\/select>/);
    assert.ok(sel, 'a <select> exists');
    assert.match(html, /<label for="coinSelect">/);
    const opts = [...sel[1].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(opts, [''].concat(Object.keys(data.poolsConfigs)));
    assert.match(html, /class="select-caret"/);
    assert.match(read('website/pages/getting_started.html'), /\.select-caret::after\s*\{[^}]*content:/);
});

test('getting started: pop-up data has every port and difficulty from pool_configs', () => {
    const data = siteData();
    const html = renderPage('getting_started.html', data);
    const infos = [...html.matchAll(/class="poolOption"[^>]*data-info="([^"]*)"/g)]
        .map((m) => JSON.parse(m[1].replace(/&quot;/g, '"')));
    assert.equal(infos.length, Object.keys(data.poolsConfigs).length);
    for (const info of infos) {
        const cfg = data.poolsConfigs[info.coin.name];
        assert.ok(cfg, info.coin.name);
        assert.deepEqual(Object.keys(info.ports), Object.keys(cfg.ports));
        for (const port in cfg.ports) assert.equal(info.ports[port].diff, cfg.ports[port].diff);
        assert.equal(info.fee, feeOf(cfg));
        assert.equal(info.minPayment, cfg.paymentProcessing.minimumPayment);
        assert.equal(info.host, 'digihash.digibyte.io');
    }
});

test('getting started: inline scripts parse and the 1-click miner link is not blocked by an alert', () => {
    const html = renderPage('getting_started.html');
    for (const s of inlineScripts(html)) assert.doesNotThrow(() => new vm.Script(s));
    assert.doesNotMatch(html, /development still in progress/);
});

// ---------------------------------------------------------------- live-stats stream

function streamContext() {
    const sources = [];
    const timers = [];
    class FakeEventSource {
        constructor(url) { this.url = url; this.closed = false; this.listeners = []; sources.push(this); }
        addEventListener(type, fn) { this.listeners.push([type, fn]); }
        removeEventListener(type, fn) { this.listeners = this.listeners.filter((l) => l[0] !== type || l[1] !== fn); }
        close() { this.closed = true; }
    }
    const ctx = vm.createContext({
        EventSource: FakeEventSource,
        setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
        clearTimeout() {},
        $: Object.assign(() => {}, { getJSON() {} }),
        history: { pushState() {} },
        document: { hidden: false },
        nv: { utils: { windowResize() {} } }
    });
    ctx.window = ctx;
    vm.runInContext(read('website/static/main.js'), ctx);
    return { ctx, sources, timers };
}

test('stream: no page template opens its own EventSource; only main.js does', () => {
    for (const f of fs.readdirSync(path.join(repoRoot, 'website/pages'))) {
        assert.doesNotMatch(read('website/pages/' + f), /new EventSource/, f);
    }
    assert.doesNotMatch(read('website/index.html'), /new EventSource/);
    for (const f of fs.readdirSync(path.join(repoRoot, 'website/static')).filter((n) => n.endsWith('.js') && n !== 'main.js')) {
        assert.doesNotMatch(read('website/static/' + f), /new EventSource/, f);
    }
    assert.equal((read('website/static/main.js').match(/new window\.EventSource|new EventSource/g) || []).length, 1);
});

test('stream: one page load opens exactly one stream, even with page scripts that listen', () => {
    const { ctx, sources } = streamContext();
    assert.equal(sources.length, 1);
    assert.equal(sources[0].url, '/api/live_stats');
    // Run the inline scripts of the pages that listen to the stream.
    for (const page of ['stats', 'miner_stats', '']) {
        for (const s of inlineScripts(renderSite(page))) {
            if (!/statsSource/.test(s)) continue;
            const run = s.replace(/document\.querySelector\('main'\)[^;]*;/g, '');
            vm.runInContext('(function($){' + run + '})(function(fn){ if (typeof fn === "function") fn(); })', ctx);
        }
    }
    assert.equal(sources.length, 1, 'still one stream');
    assert.ok(sources[0].listeners.length >= 2, 'page listeners are on the one stream');
});

test('stream: on error it closes and waits longer each time (backoff), then reattaches listeners', () => {
    const { ctx, sources, timers } = streamContext();
    const fn = () => {};
    ctx.statsSource.addEventListener('message', fn);
    const delays = [];
    for (let i = 0; i < 7; i++) {
        const s = sources[sources.length - 1];
        s.onerror();
        assert.equal(s.closed, true, 'the failed stream is closed (no 3 s browser retry)');
        assert.equal(sources.length, i + 1, 'no new stream until the timer fires');
        const t = timers[timers.length - 1];
        delays.push(t.ms);
        t.fn();
        assert.equal(sources.length, i + 2);
        assert.ok(sources[sources.length - 1].listeners.some((l) => l[1] === fn), 'listener moved to the new stream');
    }
    assert.ok(delays[0] >= 3000, 'first retry waits at least 3 s');
    for (let i = 1; i < delays.length; i++) assert.ok(delays[i] >= delays[i - 1], 'delays never shrink: ' + delays);
    assert.ok(delays[delays.length - 1] >= 30000 && delays[delays.length - 1] <= 60000, 'capped at 60 s: ' + delays);
    // A good connection resets the wait.
    sources[sources.length - 1].onopen();
    sources[sources.length - 1].onerror();
    assert.equal(timers[timers.length - 1].ms, delays[0]);
    // Retries per minute while failing: far below the old ~40.
    let total = 0, n = 0;
    for (const d of delays) { total += d; n++; if (total >= 60000) break; }
    assert.ok(n <= 6, 'at most 6 tries in the first minute, got ' + n);
});
