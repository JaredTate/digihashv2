'use strict';
// Per-page SEO tags in website/index.html (title, description, canonical,
// Open Graph, Twitter, JSON-LD, robots) and one <h1> per public page.
// Templates are rendered with dot exactly like libs/website.js does:
// the page body first, then index.html with { page, selected, stats, poolConfigs, portalConfig }.
// Run: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const dot = require('dot');

const repoRoot = path.resolve(__dirname, '..');
dot.templateSettings.strip = false;

const SITE = 'https://digihash.digibyte.io';
// Page names exactly as libs/website.js pageFiles maps them ('' = home).
const PUBLIC = { '': '/', getting_started: '/getting_started', stats: '/stats', workers: '/workers',
    payments: '/payments', tbs: '/tbs', api: '/api' };
const PRIVATE = ['admin', 'mining_key', 'miner_stats'];

const templates = {};
function tpl(file) {
    if (!templates[file]) {
        const p = path.join(repoRoot, 'website', file === 'index.html' ? '' : 'pages', file);
        templates[file] = dot.template(fs.readFileSync(p, 'utf8'));
    }
    return templates[file];
}

function sampleData() {
    const pool = 'digibyte-odo';
    const addr = 'DSftST6gv7d1XYSvYhKXNauddAWoVnzGAS';
    const block = 'aa:bb:24437612:' + addr + '.w1:1792799356508';
    return {
        portalConfig: { website: { stratumHost: 'digihash.digibyte.io', adminCenter: { enabled: true } }, switching: {} },
        poolsConfigs: {
            [pool]: { coin: { name: pool, symbol: 'DGB', algorithm: 'odo', explorer: {
                txURL: 'https://digiexplorer.info/tx/', blockURL: 'https://digiexplorer.info/block/' } },
            ports: { 3013: { diff: 0.01 }, 3037: { diff: 1 } } }
        },
        stats: {
            time: 1792809186, global: { workers: 1, hashrate: 1 },
            algos: { odo: { workers: 1, hashrate: 1, hashrateString: '1 MH/s' } },
            address: addr,
            balances: [], totalHeld: 0, totalPaid: 0, totalImmature: 0,
            pools: {
                [pool]: {
                    name: pool, symbol: 'DGB', algorithm: 'odo',
                    minerCount: 1, workerCount: 1, hashrate: 1, hashrateString: '1 MH/s', luckDays: '0.058',
                    shareCount: 10,
                    workers: { [addr + '.w1']: { shares: 10, invalidshares: 0, hashrateString: '1 MH/s', luckDays: '1' } },
                    miners: { [addr]: { shares: 10, invalidshares: 0, hashrateString: '1 MH/s', luckDays: '1' } },
                    blocks: { pending: 0, confirmed: 1, orphaned: 0 },
                    poolStats: { networkHash: 10, networkBlocks: 24437612, networkHashString: '10 MH/s',
                        networkDiff: '1.5', networkConnections: 8, networkVersion: 'v9', validBlocks: 1,
                        totalPaid: '221.5', validShares: 10, invalidShares: 0 },
                    pending: { blocks: [], confirms: {} },
                    confirmed: { blocks: [block] },
                    payments: [{ time: 1792809186691, txid: 'cc', shares: 14737.9, paid: 221.5, miners: 1,
                        blocks: [24437612], amounts: { [addr]: 221.5 } }]
                }
            }
        }
    };
}

// Same two steps as processTemplates() in libs/website.js.
function renderSite(selected, data) {
    data = data || sampleData();
    const file = (selected === '' ? 'home' : selected) + '.html';
    const page = tpl(file)({ poolsConfigs: data.poolsConfigs, stats: data.stats, portalConfig: data.portalConfig });
    return tpl('index.html')({ page, selected, stats: data.stats, poolConfigs: data.poolsConfigs, portalConfig: data.portalConfig });
}

function head(html) {
    const m = html.match(/<head>([\s\S]*?)<\/head>/);
    assert.ok(m, 'page has a <head>');
    return m[1];
}
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function metas(h, attr, key) {
    const re = new RegExp(`<meta\\s+${attr}="${key.replace(/[.:]/g, '\\$&')}"\\s+content="([^"]*)"\\s*/?>`, 'g');
    return [...h.matchAll(re)].map((m) => decode(m[1]));
}
function one(h, attr, key) {
    const all = metas(h, attr, key);
    assert.equal(all.length, 1, `exactly one <meta ${attr}="${key}">, got ${all.length}`);
    return all[0];
}
function canonicals(h) {
    return [...h.matchAll(/<link\s+rel="canonical"\s+href="([^"]*)"\s*\/?>/g)].map((m) => m[1]);
}
function titles(h) {
    return [...h.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => decode(m[1]));
}
function jsonLd(h) {
    return [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}
function ldNodes(h) {
    return jsonLd(h).flatMap((d) => (d['@graph'] ? d['@graph'].map((n) => ({ ...n, '@context': d['@context'] })) : [d]));
}

const rendered = {};
for (const name of Object.keys(PUBLIC).concat(PRIVATE)) rendered[name] = renderSite(name);

for (const [name, p] of Object.entries(PUBLIC)) {
    const label = name || 'home';
    const url = SITE + p;

    test(`${label}: html lang, charset, title and description`, () => {
        const html = rendered[name];
        assert.match(html, /^<!doctype html>\s*<html lang="en">/i);
        // libs/website.js swaps the lang per request with this exact regex.
        assert.equal(html.match(/<html lang=".*?">/g).length, 1);
        const h = head(html);
        assert.ok(h.indexOf('<meta charset="utf-8">') < h.indexOf('<title>'), 'charset comes before the title');
        const t = titles(h);
        assert.equal(t.length, 1, 'exactly one <title>');
        assert.ok(t[0].length > 10 && t[0].length <= 60, `title length ${t[0].length}: ${t[0]}`);
        assert.match(t[0], /DigiByte|DGB/);
        assert.match(t[0], /DigiHash/);
        const d = one(h, 'name', 'description');
        assert.ok(d.length >= 70 && d.length <= 160, `description length ${d.length}: ${d}`);
        const robots = metas(h, 'name', 'robots');
        assert.ok(robots.every((r) => !/noindex/.test(r)), 'public page must be indexable');
    });

    test(`${label}: canonical, Open Graph and Twitter tags`, () => {
        const h = head(rendered[name]);
        assert.deepEqual(canonicals(h), [url]);
        assert.equal(one(h, 'property', 'og:url'), url);
        assert.equal(one(h, 'property', 'og:title'), titles(h)[0]);
        assert.equal(one(h, 'property', 'og:description'), one(h, 'name', 'description'));
        assert.equal(one(h, 'property', 'og:type'), 'website');
        assert.equal(one(h, 'property', 'og:site_name'), 'DigiHash');
        const img = one(h, 'property', 'og:image');
        assert.equal(img, SITE + '/static/og-image.png');
        assert.ok(fs.existsSync(path.join(repoRoot, 'website', img.slice(SITE.length))), 'og image file exists');
        assert.equal(one(h, 'property', 'og:image:width'), '1200');
        assert.equal(one(h, 'property', 'og:image:height'), '630');
        assert.equal(one(h, 'name', 'twitter:card'), 'summary_large_image');
        assert.equal(one(h, 'name', 'twitter:title'), titles(h)[0]);
        assert.equal(one(h, 'name', 'twitter:description'), one(h, 'name', 'description'));
        assert.equal(one(h, 'name', 'twitter:image'), img);
    });

    test(`${label}: JSON-LD parses and matches the page`, () => {
        const h = head(rendered[name]);
        const nodes = ldNodes(h);
        assert.ok(nodes.length > 0, 'has JSON-LD');
        for (const n of nodes) assert.equal(n['@context'], 'https://schema.org');
        if (name === '') {
            const site = nodes.find((n) => n['@type'] === 'WebSite');
            assert.ok(site, 'home has WebSite');
            assert.equal(site.url, SITE + '/');
            assert.equal(site.name, 'DigiHash');
            assert.ok(site.description && site.description.length > 20);
        } else {
            const page = nodes.find((n) => n['@type'] === 'WebPage');
            assert.ok(page, 'inner page has WebPage');
            assert.equal(page.url, url);
            assert.equal(page.name, titles(h)[0]);
            assert.equal(page.isPartOf.url, SITE + '/');
            const bc = nodes.find((n) => n['@type'] === 'BreadcrumbList');
            assert.ok(bc, 'inner page has BreadcrumbList');
            assert.equal(bc.itemListElement.length, 2);
            assert.deepEqual(bc.itemListElement.map((i) => i.position), [1, 2]);
            assert.equal(bc.itemListElement[0].item, SITE + '/');
            assert.equal(bc.itemListElement[1].item, url);
            for (const i of bc.itemListElement) assert.equal(i['@type'], 'ListItem');
        }
    });

    test(`${label}: exactly one <h1> with plain words`, () => {
        const html = rendered[name];
        const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => m[1].trim());
        assert.equal(h1s.length, 1, `found ${h1s.length} <h1>`);
        assert.doesNotMatch(h1s[0], /[<{}]/, 'h1 is plain text');
        assert.match(h1s[0], /[A-Za-z]{3,}/);
        // The page body alone (served by /get_page) carries the same h1.
        const body = tpl((name || 'home') + '.html')({ poolsConfigs: sampleData().poolsConfigs, stats: sampleData().stats, portalConfig: sampleData().portalConfig });
        assert.equal((body.match(/<h1\b/gi) || []).length, 1);
    });
}

test('titles, descriptions and canonicals are unique across all pages', () => {
    const names = Object.keys(PUBLIC).concat(PRIVATE);
    const t = names.map((n) => titles(head(rendered[n]))[0]);
    const d = names.map((n) => one(head(rendered[n]), 'name', 'description'));
    const c = Object.keys(PUBLIC).map((n) => canonicals(head(rendered[n]))[0]);
    assert.equal(new Set(t).size, names.length, 'titles: ' + t.join(' | '));
    assert.equal(new Set(d).size, names.length);
    assert.equal(new Set(c).size, c.length);
});

for (const name of PRIVATE) {
    test(`${name}: noindex,follow, no canonical, no JSON-LD`, () => {
        const h = head(rendered[name]);
        assert.deepEqual(metas(h, 'name', 'robots'), ['noindex,follow']);
        assert.deepEqual(canonicals(h), []);
        assert.deepEqual(metas(h, 'property', 'og:url'), []);
        assert.deepEqual(jsonLd(h), []);
        const t = titles(h);
        assert.equal(t.length, 1);
        assert.ok(t[0].length <= 60);
        const d = one(h, 'name', 'description');
        assert.ok(d.length >= 70 && d.length <= 160, `description length ${d.length}`);
    });
}

// /workers/<address> renders indexesProcessed['miner_stats'] (libs/website.js minerpage).
test('worker detail page (/workers/<address>) is noindex,follow with no canonical', () => {
    const data = sampleData();
    data.stats.address = 'dgb1qvmn6cx976q37fz9h5crgc5nvw6wuxcc2gwfdce';
    const h = head(renderSite('miner_stats', data));
    assert.deepEqual(metas(h, 'name', 'robots'), ['noindex,follow']);
    assert.deepEqual(canonicals(h), []);
    assert.doesNotMatch(h, /dgb1qvmn6cx976q37fz9h5crgc5nvw6wuxcc2gwfdce/, 'address stays out of the head');
});

test('worker page escapes the address taken from the URL', () => {
    const data = sampleData();
    data.stats.address = 'x"><script>alert(1)</script>';
    const html = renderSite('miner_stats', data);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.doesNotMatch(html, /var _miner = "x"/);
});

// Fuzz: libs/website.js only ever passes known page names, but the template must
// never throw (a throw inside processTemplates would take the site down).
test('fuzz: random page names and garbage data never break the head', () => {
    let seed = 20261024;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const junk = () => pick([undefined, null, 0, -1, NaN, '', 'x', [], {}, { a: { b: null } }, true, 'admin', 1e9, [null]]);
    const names = Object.keys(PUBLIC).concat(PRIVATE, ['index', '__proto__', 'constructor', 'toString',
        'hasOwnProperty', '../admin', 'stats/../x', '<script>', '"quoted"', 'ÜNÏCÖDE', ' ', 'Stats', 'API']);
    const randomName = () => {
        const r = rnd();
        if (r < 0.4) return pick(names);
        if (r < 0.6) return junk();
        let s = '';
        const n = Math.floor(rnd() * 12);
        for (let i = 0; i < n; i++) s += String.fromCharCode(32 + Math.floor(rnd() * 95));
        return s;
    };
    for (let i = 0; i < 200; i++) {
        const data = { selected: randomName(), stats: junk(), poolConfigs: junk(), portalConfig: junk() };
        if (rnd() < 0.7) data.page = pick(['', '<p>body</p>', 42, 'x'.repeat(50)]);
        if (rnd() < 0.1) delete data.selected;
        let html;
        assert.doesNotThrow(() => { html = tpl('index.html')(data); }, 'render ' + i + ' ' + JSON.stringify(data.selected));
        const h = head(html);
        assert.doesNotMatch(html, /undefined|\[object |NaN/, `bad text in render ${i} (${String(data.selected)})`);
        for (const c of canonicals(h).concat(metas(h, 'property', 'og:url'))) {
            assert.ok(c === SITE + '/' || c.startsWith(SITE + '/') && /^[a-z_]+$/.test(c.slice(SITE.length + 1)), `canonical ${c}`);
        }
        assert.equal(titles(h).length, 1);
        assert.ok(titles(h)[0].length > 0);
        assert.equal(metas(h, 'name', 'description').length, 1);
        jsonLd(h); // must parse
        const known = typeof data.selected === 'string' && Object.prototype.hasOwnProperty.call(PUBLIC, data.selected);
        if (known) assert.deepEqual(canonicals(h), [SITE + PUBLIC[data.selected]]);
        else assert.deepEqual(metas(h, 'name', 'robots'), ['noindex,follow'], 'unknown pages are noindex: ' + String(data.selected));
    }
});
