'use strict';
// Routes in libs/website.js and libs/api.js, run for real on a local port (validation round 2026-10-25).
// stats.js (Redis) is replaced by a fake that copies its lookup rule: Redis HSCAN MATCH address + "*".
// WEIRD-INPUT-3: /constructor, /__proto__ ... gave 500 "Something broke!".
// WEIRD-INPUT-4: worker_stats?. / ?* / ?D returned other miners' workers and money.
// WEIRD-INPUT-7: /miner_stats showed the address the last visitor looked up.
// Run: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');
const { repoRoot, livePoolConfigs, siteData } = require('./helpers/site-render');

const A = 'DSftST6gv7d1XYSvYhKXNauddAWoVnzGAS';
const B = 'DQfy9eqbuC6gq4gdqkAhmXT37Pijq6shak';
const C = 'dgb1qk9z8n53s0w2z42f8g0swerszz8s6wtprcvmyvu';
const MINERS = [A, B, C];

// Redis glob (MATCH) as a RegExp: * ? [..] and \ escapes.
function globToRegExp(glob) {
    let re = '';
    for (let i = 0; i < glob.length; i++) {
        const ch = glob[i];
        if (ch === '*') re += '[\\s\\S]*';
        else if (ch === '?') re += '[\\s\\S]';
        else if (ch === '\\' && i + 1 < glob.length) re += glob[++i].replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
        else if (ch === '[') {
            const end = glob.indexOf(']', i + 1);
            if (end < 0) { re += '\\['; continue; }
            let body = glob.slice(i + 1, end);
            const neg = body[0] === '^';
            if (neg) body = body.slice(1);
            re += '[' + (neg ? '^' : '') + body.replace(/[\]\\]/g, '\\$&') + ']';
            i = end;
        } else re += ch.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
    }
    try { return new RegExp('^' + re + '$'); } catch (e) { return /^$/; }
}

function FakeStats() {
    const self = this;
    const data = siteData();
    const pool = Object.keys(data.stats.pools)[0];
    const workers = {};
    MINERS.forEach((m, i) => { workers[m + '.rig' + i] = { shares: 10 + i, invalidshares: 0, currRoundShares: 5 + i, hashrate: 100 * (i + 1) }; });
    data.stats.pools[pool].workers = workers;
    delete data.stats.address;
    const redisKeys = {}; // worker -> money, like <coin>:balances
    MINERS.forEach((m, i) => { redisKeys[m + '.rig' + i] = { balance: i + 1, paid: 1000 * (i + 1), immature: 0 }; });
    this.stats = data.stats;
    this.statsString = JSON.stringify(data.stats);
    this.statPoolHistory = [];
    this.statHistory = [{ time: 1, pools: { [pool]: { workers } } }];
    this.getGlobalStats = (cb) => { self.stats = siteData().stats; self.stats.pools[pool].workers = workers; delete self.stats.address; cb(); };
    this.getBlocks = (cb) => cb({});
    const match = (address) => { const re = globToRegExp(address.split('.')[0] + '*'); return Object.keys(redisKeys).filter((k) => re.test(k)); };
    this.getBalanceByAddress = (address, cb) => {
        const keys = match(address);
        let held = 0, paid = 0;
        const balances = keys.map((k) => { held += redisKeys[k].balance; paid += redisKeys[k].paid; return { worker: k, balance: redisKeys[k].balance, paid: redisKeys[k].paid }; });
        self.stats.balances = balances;
        self.stats.address = address;
        setImmediate(() => cb({ totalHeld: held, totalPaid: paid, totalImmature: 0, balances }));
    };
    this.getTotalSharesByAddress = (address, cb) => {
        setImmediate(() => cb(match(address).reduce((s, k) => s + workers[k].currRoundShares, 0)));
    };
}

let base, server, restoreConsole = () => {};
test.after(() => { restoreConsole(); if (server) server.close(); });

test.before(async () => {
    process.chdir(repoRoot);
    process.env.portalConfig = JSON.stringify({
        website: { enabled: true, host: '127.0.0.1', port: 0, stratumHost: 'digihash.digibyte.io', stats: { updateInterval: 3600 } },
        redis: { host: '127.0.0.1', port: 1 }
    });
    process.env.pools = JSON.stringify(livePoolConfigs());
    const fakes = {
        'stratum-pool': { daemon: {} },
        'stratum-pool/lib/util.js': {},
        'node-watch': () => {},
        './stats.js': FakeStats
    };
    const realLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (Object.prototype.hasOwnProperty.call(fakes, request)) return fakes[request];
        if (request === 'express') {
            const express = realLoad.apply(this, arguments);
            const wrapped = function () {
                const app = express();
                const listen = app.listen.bind(app);
                app.listen = (...args) => { server = listen(...args); return server; };
                return app;
            };
            Object.assign(wrapped, express);
            return wrapped;
        }
        return realLoad.apply(this, arguments);
    };
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => realSetInterval(...args).unref();
    const noop = () => {};
    const silentConsole = console.error;
    console.error = noop; // the 500 handler logs a stack trace per request
    try {
        require(path.join(repoRoot, 'libs', 'website.js'))({ debug: noop, error: noop, special: noop, warning: noop });
    } finally {
        Module._load = realLoad;
        global.setInterval = realSetInterval;
    }
    restoreConsole = () => { console.error = silentConsole; };
    for (let i = 0; i < 100 && !(server && server.address()); i++) await new Promise((r) => setTimeout(r, 20));
    base = 'http://127.0.0.1:' + server.address().port;
    for (let i = 0; i < 100; i++) { // wait for the templates
        if ((await fetch(base + '/stats')).status === 200) return;
        await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('website did not start');
});

const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.text() }; };
const minerOf = (w) => w.split('.')[0];

test('WEIRD-INPUT-3: Object.prototype names are 404, not 500 or an empty 200', async () => {
    for (const name of ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', '__defineGetter__']) {
        assert.equal((await get('/' + name)).status, 404, '/' + name);
        assert.equal((await get('/get_page?id=' + name)).status, 404, '/get_page?id=' + name);
    }
    assert.equal((await get('/stats')).status, 200);
    assert.equal((await get('/')).status, 200);
    assert.equal((await get('/get_page?id=stats')).status, 200);
});

test('WEIRD-INPUT-7: /miner_stats and /get_page?id=miner_stats are 404 after another visitor looks up an address', async () => {
    const own = await get('/workers/' + A);
    assert.equal(own.status, 200);
    assert.match(own.body, new RegExp('var _miner = "' + A + '"'));
    assert.equal((await get('/miner_stats')).status, 404);
    assert.equal((await get('/get_page?id=miner_stats')).status, 404);
    // Arrays and objects in the query string (qs parser) must not reach the page either.
    for (const q of ['id[]=miner_stats', 'id=miner_stats&id=x', 'id[0]=miner_stats', 'id[a]=stats', 'id[]=constructor']) {
        assert.equal((await get('/get_page?' + q)).status, 404, '/get_page?' + q);
    }
});

test('WEIRD-INPUT-4: worker_stats with ".", "*", "D", "dgb1", a glob or empty text is an error, not other miners', async () => {
    for (const q of ['.', '*', 'D', 'dgb1', 'D[QS]*', '?', '\\*', '.rig0', A.slice(0, 20)]) {
        const r = await get('/api/worker_stats?' + q);
        assert.equal(r.status, 200);
        assert.deepEqual(JSON.parse(r.body), { result: 'error' }, 'worker_stats?' + q);
    }
});

test('WEIRD-INPUT-4: a real address gets only its own workers and money', async () => {
    for (const [i, m] of MINERS.entries()) {
        const j = JSON.parse((await get('/api/worker_stats?' + m + '.rig' + i)).body);
        assert.equal(j.miner, m);
        assert.ok(Object.keys(j.workers).includes(m + '.rig' + i));
        for (const w of Object.keys(j.workers).concat(Object.keys(j.history))) assert.equal(minerOf(w), m, w);
        assert.equal(j.paid, 1000 * (i + 1));
    }
});

test('WEIRD-INPUT-4: /workers/<not an address> is 404', async () => {
    for (const q of ['D', '*', '..x', 'D%5BQS%5D*', 'x'.repeat(91)]) assert.equal((await get('/workers/' + q)).status, 404, q);
});

test('a mistyped worker address gets a friendly page, not a bare error, and is not echoed', async () => {
    const res = await get('/workers/notanaddress<b>');
    assert.equal(res.status, 404);
    const body = res.body;
    assert.match(body, /No miner found for this address/);
    assert.match(body, /href="\/workers"/);
    assert.doesNotMatch(body, /notanaddress|<b>|Cannot GET/);
});

// Fuzz: 300 random page names and 300 random addresses.
test('fuzz: 300 page names never give 500; only known pages give 200', async () => {
    let seed = 20261025;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const known = ['', 'getting_started', 'stats', 'tbs', 'workers', 'api', 'admin', 'mining_key', 'payments'];
    const special = Object.getOwnPropertyNames(Object.prototype).concat(['miner_stats', 'index', 'home', 'user_shares', 'Stats', 'prototype']);
    for (let i = 0; i < 300; i++) {
        let name;
        const r = rnd();
        if (r < 0.3) name = pick(known);
        else if (r < 0.6) name = pick(special);
        else { name = ''; const n = 1 + Math.floor(rnd() * 14); for (let k = 0; k < n; k++) name += String.fromCharCode(33 + Math.floor(rnd() * 94)); }
        if (name === '.' || name === '..') continue; // the URL parser removes these path segments
        const viaPage = rnd() < 0.5;
        const url = viaPage ? '/get_page?id=' + encodeURIComponent(name) : '/' + encodeURIComponent(name);
        const res = await get(url);
        assert.notEqual(res.status, 500, url);
        const isKnown = known.includes(name);
        if (isKnown) assert.equal(res.status, 200, url);
        if (name === 'miner_stats') assert.equal(res.status, 404, url);
        if (!isKnown && res.status === 200 && !viaPage) assert.fail('unknown page served: ' + url);
        if (viaPage && !isKnown) assert.equal(res.status, 404, url);
    }
});

test('fuzz: 300 random addresses never return another miner\'s workers or money', async () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const chars = 'DSdgb1qQfy9*?[]^\\.-_ ' + A + C;
    for (let i = 0; i < 300; i++) {
        let q;
        const r = rnd();
        if (r < 0.2) q = pick(MINERS) + (rnd() < 0.5 ? '.rig' + Math.floor(rnd() * 3) : '');
        else if (r < 0.5) { const m = pick(MINERS); q = m.slice(0, Math.floor(rnd() * m.length)) + pick(['', '*', '?', '[a-z]*', '.']); }
        else { q = ''; const n = Math.floor(rnd() * 50); for (let k = 0; k < n; k++) q += pick(chars.split('')); }
        const res = await get('/api/worker_stats?' + q.replace(/ /g, '%20').replace(/#/g, '%23'));
        assert.notEqual(res.status, 500, q);
        const j = JSON.parse(res.body);
        if (j.result === 'error') continue;
        assert.match(j.miner, /^[A-Za-z0-9]{26,90}$/, 'only address-shaped text gets data: ' + JSON.stringify(q));
        for (const w of Object.keys(j.workers).concat(Object.keys(j.history))) assert.equal(minerOf(w), j.miner, 'worker ' + w + ' for ' + q);
        // Money comes from Redis MATCH <text>*. 26+ characters can only ever be the start of one address,
        // so the totals are one miner's own, never a mix (a '?' in the query cuts the text short).
        const owners = MINERS.filter((m) => m.startsWith(j.miner));
        assert.ok(owners.length <= 1, 'no mix of miners for ' + q);
        assert.equal(j.paid, owners.length ? 1000 * (MINERS.indexOf(owners[0]) + 1) : 0, 'money for ' + q);
        const page = await get('/workers/' + encodeURIComponent(q));
        assert.notEqual(page.status, 500);
    }
});
