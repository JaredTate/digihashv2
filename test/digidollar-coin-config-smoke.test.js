#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const digibyteMainnetCoins = [
    'coins/digibyte.sha256.json',
    'coins/digibyte.scrypt.json',
    'coins/digibyte.skein.json',
    'coins/digibyte.qubit.json',
    'coins/digibyte.odo.json'
];

const unrelatedCoinConfigs = [
    'coins/coins-examples/bitzeny.json',
    'coins/coins-examples/dash.json',
    'coins/coins-examples/monacoin.json'
];

function loadCoinConfig(relativePath) {
    const filePath = path.join(repoRoot, relativePath);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function hasDigiDollarBehavior(coinConfig) {
    return coinConfig.digidollar === true;
}

for (const relativePath of digibyteMainnetCoins) {
    const coinConfig = loadCoinConfig(relativePath);

    assert.equal(coinConfig.symbol, 'DGB', `${relativePath} should remain a DigiByte coin config`);
    assert.ok(coinConfig.mainnet, `${relativePath} should be a mainnet coin config`);
    assert.equal(
        coinConfig.digidollar,
        true,
        `${relativePath} must explicitly enable DigiDollar`
    );
    assert.equal(
        hasDigiDollarBehavior(coinConfig),
        true,
        `${relativePath} should opt in to DigiDollar behavior`
    );
}

for (const relativePath of unrelatedCoinConfigs) {
    const coinConfig = loadCoinConfig(relativePath);

    assert.equal(
        hasDigiDollarBehavior(coinConfig),
        false,
        `${relativePath} should not opt in to DigiDollar behavior without an explicit flag`
    );
}

console.log(`ok - verified ${digibyteMainnetCoins.length} DigiByte mainnet configs and ${unrelatedCoinConfigs.length} unrelated configs`);
