'use strict';
// Shared by the website tests: render DigiHash templates with the live pool configs,
// the same two steps as processTemplates() in libs/website.js.

const fs = require('fs');
const path = require('path');
const dot = require('dot');
const minify = require('node-json-minify');

const repoRoot = path.resolve(__dirname, '..', '..');
dot.templateSettings.strip = false;

const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const tplCache = {};
function tpl(file) {
    if (!tplCache[file]) tplCache[file] = dot.template(read(path.join('website', file === 'index.html' ? '' : 'pages', file)));
    return tplCache[file];
}

// The enabled mainnet pools, loaded the way init.js loads them.
function livePoolConfigs() {
    const out = {};
    for (const f of fs.readdirSync(path.join(repoRoot, 'pool_configs')).filter((n) => /^digibyte\..*\.json$/.test(n)).sort()) {
        const c = JSON.parse(minify(read('pool_configs/' + f)));
        if (!c.enabled) continue;
        c.coin = JSON.parse(minify(read('coins/' + c.coin)));
        c.coin.name = c.coin.name.toLowerCase();
        out[c.coin.name] = c;
    }
    return out;
}

const ADDR = 'DSftST6gv7d1XYSvYhKXNauddAWoVnzGAS';

function siteData() {
    const poolsConfigs = livePoolConfigs();
    const pools = {};
    for (const p in poolsConfigs) {
        pools[p] = {
            name: p, symbol: 'DGB', algorithm: poolsConfigs[p].coin.algorithm,
            minerCount: 1, workerCount: 1, shareCount: 10, hashrate: 1, hashrateString: '1 MH/s', luckDays: '0.058',
            workers: { [ADDR + '.rig1']: { shares: 10, invalidshares: 0, currRoundShares: 8.5, hashrateString: '1 MH/s' } },
            miners: { [ADDR]: { shares: 10, invalidshares: 0, currRoundShares: 8.5, hashrateString: '1 MH/s' } },
            blocks: { pending: 0, confirmed: 1, orphaned: 0 },
            poolStats: { networkHash: 10, networkBlocks: 24437612, networkHashString: '10 MH/s', networkDiff: '1.5',
                networkConnections: 8, networkVersion: 'v9', validBlocks: 1, totalPaid: '221.5', validShares: 10, invalidShares: 0 },
            pending: { blocks: [], confirms: {} },
            confirmed: { blocks: [] },
            payments: [{ time: 1792809186691, txid: 'cc', shares: 14737.9, paid: 221.5, miners: 1, blocks: [24437612], amounts: { [ADDR]: 221.5 } }]
        };
    }
    return {
        poolsConfigs,
        portalConfig: { website: { stratumHost: 'digihash.digibyte.io' }, switching: {} },
        stats: { time: 1792809186, global: { workers: 1, hashrate: 1 }, algos: {}, address: ADDR, pools }
    };
}

function renderPage(file, data) {
    data = data || siteData();
    return tpl(file)({ poolsConfigs: data.poolsConfigs, stats: data.stats, portalConfig: data.portalConfig });
}
function renderSite(selected, data) {
    data = data || siteData();
    const page = renderPage((selected || 'home') + '.html', data);
    return tpl('index.html')({ page, selected, stats: data.stats, poolConfigs: data.poolsConfigs, portalConfig: data.portalConfig });
}

function inlineScripts(html) {
    const out = [];
    const re = /<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html))) out.push(m[1]);
    return out;
}

module.exports = { repoRoot, read, tpl, livePoolConfigs, ADDR, siteData, renderPage, renderSite, inlineScripts };
