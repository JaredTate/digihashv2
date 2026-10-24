'use strict';
// Daemon RPC credentials are kept out of the tracked pool configs.
// They come from pool_configs/secrets.json (gitignored) or from env vars
// DGB_RPC_USER_<ALGO> / DGB_RPC_PASS_<ALGO>. Env vars win. See SECRETS.md.

var fs = require('fs');

var SECRETS_FILE = 'pool_configs/secrets.json';
var PLACEHOLDER = 'SET_IN_SECRETS_JSON';

// digibyte.sha256.json -> SHA256, testnet.skein.json -> TESTNET_SKEIN
function envSuffix(fileName) {
    return fileName.replace(/\.json$/i, '').replace(/^digibyte\./i, '')
        .toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

function loadSecretsFile(filePath) {
    if (!fs.existsSync(filePath)) return {};
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        // Do not include e.message: it can quote the file's contents.
        throw new Error(filePath + ' is not valid JSON. See SECRETS.md for the format.');
    }
}

function applyRpcSecrets(poolOptions, fileName, secrets, env) {
    var key = fileName.replace(/\.json$/i, '');
    var suffix = envSuffix(fileName);
    var fromFile = (secrets && secrets[key]) || {};
    var user = env['DGB_RPC_USER_' + suffix] || fromFile.user;
    var password = env['DGB_RPC_PASS_' + suffix] || fromFile.password;

    var missing = [];
    if (!user || user === PLACEHOLDER) missing.push('user');
    if (!password || password === PLACEHOLDER) missing.push('password');
    if (missing.length) {
        throw new Error('Missing daemon RPC ' + missing.join(' and ') + ' for pool_configs/' + fileName
            + '. Set "' + key + '": {"user": "...", "password": "..."} in ' + SECRETS_FILE
            + ', or set DGB_RPC_USER_' + suffix + ' and DGB_RPC_PASS_' + suffix + '. See SECRETS.md.');
    }

    var daemons = (poolOptions.daemons || []).slice();
    if (poolOptions.paymentProcessing && poolOptions.paymentProcessing.daemon)
        daemons.push(poolOptions.paymentProcessing.daemon);
    daemons.forEach(function (d) {
        d.user = user;
        d.password = password;
    });
    return poolOptions;
}

module.exports = {
    SECRETS_FILE: SECRETS_FILE,
    PLACEHOLDER: PLACEHOLDER,
    envSuffix: envSuffix,
    loadSecretsFile: loadSecretsFile,
    applyRpcSecrets: applyRpcSecrets
};
