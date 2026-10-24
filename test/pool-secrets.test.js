'use strict';
// Daemon RPC credentials must come from pool_configs/secrets.json (untracked)
// or DGB_RPC_USER_<ALGO> / DGB_RPC_PASS_<ALGO>, never from tracked configs.
// Run: node --test test/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { applyRpcSecrets, loadSecretsFile, envSuffix, PLACEHOLDER } = require('../libs/poolSecrets.js');

const repoRoot = path.resolve(__dirname, '..');

function samplePool() {
    return {
        enabled: true,
        daemons: [{ host: '127.0.0.1', port: 14011, user: PLACEHOLDER, password: PLACEHOLDER }],
        paymentProcessing: { daemon: { host: '127.0.0.1', port: 14011, user: PLACEHOLDER, password: PLACEHOLDER } }
    };
}

test('env suffix comes from the pool config file name', () => {
    assert.equal(envSuffix('digibyte.sha256.json'), 'SHA256');
    assert.equal(envSuffix('digibyte.odo.json'), 'ODO');
    assert.equal(envSuffix('testnet.skein.json'), 'TESTNET_SKEIN');
});

test('secrets file values go into every daemon and the payment daemon', () => {
    const secrets = { 'digibyte.sha256': { user: 'u1', password: 'p1' } };
    const pool = applyRpcSecrets(samplePool(), 'digibyte.sha256.json', secrets, {});
    assert.equal(pool.daemons[0].user, 'u1');
    assert.equal(pool.daemons[0].password, 'p1');
    assert.equal(pool.paymentProcessing.daemon.user, 'u1');
    assert.equal(pool.paymentProcessing.daemon.password, 'p1');
    assert.equal(pool.daemons[0].port, 14011, 'non-secret fields are kept');
});

test('environment variables override the secrets file', () => {
    const secrets = { 'digibyte.sha256': { user: 'u1', password: 'p1' } };
    const env = { DGB_RPC_USER_SHA256: 'envu', DGB_RPC_PASS_SHA256: 'envp' };
    const pool = applyRpcSecrets(samplePool(), 'digibyte.sha256.json', secrets, env);
    assert.equal(pool.daemons[0].user, 'envu');
    assert.equal(pool.paymentProcessing.daemon.password, 'envp');
});

test('missing credentials fail with a clear message that names both sources', () => {
    assert.throws(
        () => applyRpcSecrets(samplePool(), 'digibyte.scrypt.json', {}, {}),
        err => {
            assert.match(err.message, /digibyte\.scrypt/);
            assert.match(err.message, /pool_configs\/secrets\.json/);
            assert.match(err.message, /DGB_RPC_USER_SCRYPT/);
            assert.match(err.message, /DGB_RPC_PASS_SCRYPT/);
            return true;
        }
    );
});

test('a missing password alone also fails, and the message never echoes values', () => {
    const secrets = { 'digibyte.qubit': { user: 'visible-user-value' } };
    assert.throws(
        () => applyRpcSecrets(samplePool(), 'digibyte.qubit.json', secrets, {}),
        err => !err.message.includes('visible-user-value') && /password/.test(err.message)
    );
});

test('the placeholder itself is rejected as a credential', () => {
    const secrets = { 'digibyte.odo': { user: PLACEHOLDER, password: PLACEHOLDER } };
    assert.throws(() => applyRpcSecrets(samplePool(), 'digibyte.odo.json', secrets, {}));
});

test('loadSecretsFile returns {} when the file is absent', () => {
    assert.deepEqual(loadSecretsFile(path.join(os.tmpdir(), 'no-such-dgb-secrets.json')), {});
});

test('loadSecretsFile rejects invalid JSON without echoing its content', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dgbsec-')), 'secrets.json');
    fs.writeFileSync(file, '{"digibyte.sha256": {"password": "leakme"');
    assert.throws(() => loadSecretsFile(file), err => !err.message.includes('leakme'));
});

test('tracked pool configs and README hold only placeholders', () => {
    const dir = path.join(repoRoot, 'pool_configs');
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'secrets.json')) {
        const cfg = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        const daemons = (cfg.daemons || []).concat(cfg.paymentProcessing ? [cfg.paymentProcessing.daemon] : []);
        for (const d of daemons) {
            assert.equal(d.user, PLACEHOLDER, `${file} daemon user must be the placeholder`);
            assert.equal(d.password, PLACEHOLDER, `${file} daemon password must be the placeholder`);
        }
    }
    const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
    assert.doesNotMatch(readme, /^rpc(user|password)=(user|password)\s*$/m, 'README must not show the old rpc values');
});

test('pool_configs/secrets.json is gitignored', () => {
    const ignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
    assert.match(ignore, /^pool_configs\/secrets\.json$/m);
});
