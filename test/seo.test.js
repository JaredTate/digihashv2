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
