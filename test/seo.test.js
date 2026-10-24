'use strict';
// Search-engine files. nginx on Box 1 maps /robots.txt and /sitemap.xml to
// these files under /static/, so the pool never needs a restart for them.
// Run: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const staticDir = path.resolve(__dirname, '..', 'website', 'static');
const pagesDir = path.resolve(__dirname, '..', 'website', 'pages');
const SITE = 'https://digihash.digibyte.io';

test('robots.txt allows crawling and points to the sitemap', () => {
    const robots = fs.readFileSync(path.join(staticDir, 'robots.txt'), 'utf8');
    assert.match(robots, /^User-agent: \*$/m);
    assert.match(robots, /^Disallow: \/admin$/m);
    assert.match(robots, new RegExp(`^Sitemap: ${SITE}/sitemap\\.xml$`, 'm'));
});

test('sitemap.xml lists the public pages, and each one exists', () => {
    const xml = fs.readFileSync(path.join(staticDir, 'sitemap.xml'), 'utf8');
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.deepEqual(locs, ['/', '/getting_started', '/stats', '/workers', '/payments', '/tbs', '/api'].map((p) => SITE + p));
    for (const loc of locs.slice(1)) {
        const page = loc.slice(SITE.length + 1);
        assert.ok(fs.existsSync(path.join(pagesDir, `${page}.html`)), `no page for ${loc}`);
    }
    assert.ok(!locs.some((l) => /admin|mining_key|miner_stats/.test(l)), 'private pages must not be listed');
});

// ---- robots.txt groups for AI and search crawlers (shared SEO brief, rule 1) ----

const CRAWLERS = ['Googlebot', 'Google-Extended', 'GoogleOther', 'Bingbot', 'Applebot', 'Applebot-Extended',
    'DuckDuckBot', 'DuckAssistBot', 'YandexBot', 'Baiduspider', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
    'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User',
    'CCBot', 'meta-externalagent', 'FacebookBot', 'Amazonbot', 'MistralAI-User', 'cohere-ai', 'YouBot'];

function robotsGroups(text) {
    const groups = [];
    let cur = null;
    let lastWasAgent = false;
    for (const raw of text.split('\n')) {
        const line = raw.replace(/#.*/, '').trim();
        if (!line) continue;
        const m = line.match(/^([A-Za-z-]+):\s*(.*)$/);
        assert.ok(m, 'bad robots.txt line: ' + raw);
        const key = m[1].toLowerCase();
        assert.ok(['user-agent', 'allow', 'disallow', 'sitemap'].includes(key), 'unknown field ' + m[1]);
        if (key === 'user-agent') {
            if (!lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
            cur.agents.push(m[2]);
            lastWasAgent = true;
        } else {
            lastWasAgent = false;
            if (key === 'sitemap') continue;
            assert.ok(cur, 'rule before any User-agent');
            cur.rules.push({ type: key, path: m[2] });
        }
    }
    return groups;
}

// Google rule: longest matching path wins; on a tie, Allow wins.
function allowed(group, urlPath) {
    let best = null;
    for (const r of group.rules) {
        if (!r.path || !urlPath.startsWith(r.path)) continue;
        if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === 'allow')) best = r;
    }
    return !best || best.type === 'allow';
}

test('robots.txt has one group per crawler, each keeping the private-path rules', () => {
    const text = fs.readFileSync(path.join(staticDir, 'robots.txt'), 'utf8');
    const groups = robotsGroups(text);
    const names = ['*'].concat(CRAWLERS);
    const seen = groups.flatMap((g) => g.agents.map((a) => a.toLowerCase()));
    assert.equal(new Set(seen).size, seen.length, 'no crawler is named twice');
    for (const name of names) {
        const g = groups.find((x) => x.agents.some((a) => a.toLowerCase() === name.toLowerCase()));
        assert.ok(g, 'no group for ' + name);
        const rules = g.rules.map((r) => `${r.type}: ${r.path}`);
        assert.ok(rules.includes('allow: /'), name + ' needs Allow: /');
        assert.ok(rules.includes('disallow: /admin'), name + ' needs Disallow: /admin');
        assert.ok(rules.includes('disallow: /api/'), name + ' needs Disallow: /api/');
        for (const p of ['/', '/getting_started', '/stats', '/workers', '/payments', '/tbs', '/api', '/workers/DSftST6gv7d1XYSvYhKXNauddAWoVnzGAS']) {
            assert.ok(allowed(g, p), `${name} must be allowed on ${p}`);
        }
        for (const p of ['/admin', '/api/stats', '/api/live_stats', '/api/admin/x', '/get_page?id=stats']) {
            assert.ok(!allowed(g, p), `${name} must be blocked on ${p}`);
        }
    }
    const lines = text.trim().split('\n');
    assert.equal(lines[lines.length - 1], `Sitemap: ${SITE}/sitemap.xml`);
});

// ---- llms.txt (https://llmstxt.org) ----

const LLMS = path.join(staticDir, 'llms.txt');
const PUBLIC_PATHS = ['/', '/getting_started', '/stats', '/workers', '/payments', '/tbs', '/api'];

test('llms.txt follows the llmstxt.org layout', () => {
    const text = fs.readFileSync(LLMS, 'utf8');
    const lines = text.split('\n');
    assert.match(lines[0], /^# \S/, 'first line is the H1 title');
    assert.ok(lines.some((l) => /^> \S.{40,}/.test(l)), 'has a > summary');
    assert.ok(lines.filter((l) => /^## \S/.test(l)).length >= 2, 'has ## sections');
    assert.equal((text.match(/^# /gm) || []).length, 1, 'only one H1');
    assert.match(text, /^## About$/m);
});

test('llms.txt links are absolute and every on-site link is a real public page', () => {
    const text = fs.readFileSync(LLMS, 'utf8');
    const links = [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((m) => m[2]);
    assert.ok(links.length >= PUBLIC_PATHS.length);
    for (const url of links) assert.equal(new URL(url).protocol, 'https:', 'absolute https link: ' + url);
    const onSite = links.filter((u) => u.startsWith(SITE + '/')).map((u) => u.slice(SITE.length));
    for (const p of onSite) {
        const ok = p === '/' || p === '/sitemap.xml' || fs.existsSync(path.join(pagesDir, p.slice(1) + '.html'));
        assert.ok(ok, 'llms.txt links to a page that does not exist: ' + p);
        assert.doesNotMatch(p, /admin|mining_key|miner_stats|\/api\//);
    }
    for (const p of PUBLIC_PATHS) assert.ok(onSite.includes(p), 'llms.txt misses ' + p);
    // Every page link is a list item with a one-line description.
    for (const p of PUBLIC_PATHS) {
        assert.match(text, new RegExp(`^- \\[[^\\]]+\\]\\(${(SITE + p).replace(/[./]/g, '\\$&')}\\): \\S`, 'm'));
    }
});

test('llms.txt connection facts match the pool configs and the home page', () => {
    const text = fs.readFileSync(LLMS, 'utf8');
    const cfgDir = path.resolve(__dirname, '..', 'pool_configs');
    const names = { sha256: 'SHA256', scrypt: 'Scrypt', skein: 'Skein', qubit: 'Qubit', odo: 'Odocrypt' };
    let enabled = 0;
    for (const f of fs.readdirSync(cfgDir).filter((x) => /^digibyte\..+\.json$/.test(x))) {
        const cfg = JSON.parse(fs.readFileSync(path.join(cfgDir, f), 'utf8'));
        const algo = f.split('.')[1];
        if (!cfg.enabled) {
            assert.doesNotMatch(text, new RegExp(Object.keys(cfg.ports).join('|')), `disabled ${algo} ports must not be listed`);
            continue;
        }
        enabled++;
        assert.ok(names[algo], 'unknown enabled algo ' + algo);
        const row = text.split('\n').find((l) => l.includes(names[algo]) && /\b30\d\d\b/.test(l));
        assert.ok(row, 'no port line for ' + names[algo]);
        for (const port of Object.keys(cfg.ports)) assert.match(row, new RegExp(`\\b${port}\\b`), `${names[algo]} port ${port}`);
        assert.match(text, new RegExp(`\\b${cfg.paymentProcessing.minimumPayment} DGB`), 'minimum payout');
    }
    assert.equal(enabled, 5, 'all 5 DigiByte algorithms are enabled');
    assert.match(text, /stratum\+tcp:\/\/digihash\.digibyte\.io:/);
    const home = fs.readFileSync(path.join(pagesDir, 'home.html'), 'utf8');
    const fee = home.match(/(\d+(?:\.\d+)?)% fee/)[1];
    assert.match(text, new RegExp(`\\b${fee.replace('.', '\\.')}% `), 'fee as stated on the home page');
    assert.doesNotMatch(text, /profit|guarantee|passive income|get rich|\broi\b|world's first|investment/i);
});

// ---- IndexNow key (public by design) ----

test('IndexNow key file body is exactly the key', () => {
    const key = '261e39d143d43afd6f4680a984cb1e39';
    assert.equal(fs.readFileSync(path.join(staticDir, key + '.txt'), 'utf8'), key);
});
