# DigiHash V2 Repository Map

Scope: all repository files except `.git`, `node_modules`, build artifacts, and binary image assets (`*.png`, `*.ico`, `*.svg`).

## CI / Metadata

### .circleci/config.yml
- Purpose: CircleCI pipeline definition for Node project checks.
- Classes/Functions/Exports: N/A (YAML config).

### .github/FUNDING.yml
- Purpose: GitHub funding metadata.
- Classes/Functions/Exports: N/A.

### .github/workflows/node.js.yml
- Purpose: GitHub Actions workflow for Node CI.
- Classes/Functions/Exports: N/A.

### .gitignore
- Purpose: ignore patterns for Git.
- Classes/Functions/Exports: N/A.

### LICENSE
- Purpose: MIT license text.
- Classes/Functions/Exports: N/A.

### README.md
- Purpose: project setup/usage documentation.
- Classes/Functions/Exports: N/A.

### ARCHITECTURE.md
- Purpose: high-level architecture documentation for this repository.
- Classes/Functions/Exports: N/A.

### REPO_MAP.md
- Purpose: file-by-file source map for this repository.
- Classes/Functions/Exports: N/A.

### package.json
- Purpose: npm package metadata/scripts/dependencies.
- Classes/Functions/Exports: N/A.

### package-lock.json
- Purpose: locked dependency tree.
- Classes/Functions/Exports: N/A.

## Runtime Entry

### init.js
- Exports: none (process entrypoint).
- Functions:
  - `buildPoolConfigs()` — loads/validates pool + coin configs, merges defaults.
  - `roundTo(n, digits)` — helper rounding.
  - `spawnPoolWorkers()` — forks pool workers, routes IPC events.
  - `startCliListener()` — starts TCP command listener.
  - `processCoinSwitchCommand(params, options, reply)` — validates/sends switch commands.
  - `startPaymentProcessor()` — optional payment worker spawn.
  - `startWebsite()` — optional website worker spawn.
  - `startProfitSwitch()` — optional profit-switch worker spawn.
  - IIFE `init()` — boot sequence.

## Libraries

### libs/api.js
- Exports: constructor function `(logger, portalConfig, poolConfigs)`.
- Methods:
  - `handleApiRequest(req,res,next)` — serves stats/pool_stats/blocks/payments/worker_stats/live_stats.
  - `handleAdminApiRequest(req,res,next)` — admin routes (currently pools dump).

### libs/apiBittrex.js
- Exports: `Bittrex` API wrapper module.
- Functions/Methods:
  - `Bittrex(key, secret)` + private header signer.
  - `joinCurrencies(a,b)`.
  - Prototype methods: `_request`, `_public`, `_private`, `getTicker`, `getOrderBook`, `getTradeHistory`, `myBalances`, `myOpenOrders`, `myTradeHistory`, `buy`, `sell`, `cancelOrder`, `withdraw`.

### libs/apiCoinWarz.js
- Exports: `CoinWarz` API wrapper module.
- Functions/Methods:
  - `CoinWarz(key, secret)` + private header signer.
  - `joinCurrencies(a,b)`.
  - Prototype methods: `_request`, `_public`, `getTicker`, `getOrderBook`, `getTradeHistory`.

### libs/apiCryptsy.js
- Exports: `Cryptsy` API wrapper module.
- Functions/Methods:
  - `Cryptsy(key, secret)` + private header signer.
  - `joinCurrencies(a,b)`.
  - Prototype methods: `_request`, `_public`, `_private`, `getTicker`, `getOrderBook`, `getTradeHistory`, `myBalances`, `myOpenOrders`, `myTradeHistory`, `buy`, `sell`, `cancelOrder`, `withdraw`.

### libs/apiMintpal.js
- Exports: `Mintpal` API wrapper module.
- Functions/Methods:
  - `Mintpal(key, secret)` + private header signer.
  - `joinCurrencies(a,b)`.
  - Prototype methods: `_request`, `_public`, `_private`, `getTicker`, `getBuyOrderBook`, `getOrderBook`, `getTradeHistory`, `myBalances`, `myOpenOrders`, `myTradeHistory`, `buy`, `sell`, `cancelOrder`, `withdraw`.

### libs/apiPoloniex.js
- Exports: `Poloniex` API wrapper module.
- Functions/Methods:
  - `Poloniex(key, secret)` + private header signer.
  - `joinCurrencies(a,b)`.
  - Prototype methods: `_request`, `_public`, `_private`, `getTicker`, `get24hVolume`, `getOrderBook`, `getTradeHistory`, `myBalances`, `myOpenOrders`, `myTradeHistory`, `buy`, `sell`, `cancelOrder`, `withdraw`.

### libs/cliListener.js
- Exports: `listener(port)` EventEmitter-like constructor.
- Methods:
  - `start()` — binds localhost TCP socket, parses newline JSON commands, emits `command`/`log`.

### libs/logUtil.js
- Exports: `PoolLogger`.
- Functions:
  - `severityToColor(severity,text)`.
  - `log(...)` internal formatter.
  - Dynamic methods created for `debug`, `warning`, `error`, `special`.

### libs/mposCompatibility.js
- Exports: constructor `(logger, poolConfig)`.
- Methods:
  - `handleAuth(workerName,password,authCallback)` — validates/creates MPOS workers.
  - `handleShare(isValidShare,isValidBlock,shareData)` — inserts share rows into MySQL.
  - `handleDifficultyUpdate(workerName,diff)` — updates worker difficulty in MySQL.

### libs/paymentProcessor.js
- Exports: worker constructor `(logger)`.
- Major functions:
  - `SetupForPool(logger,poolOptions,setupFinished)`.
  - Validation helpers: `validateAddress`, `validateTAddress`, `validateZAddress`, `getBalance`.
  - Wallet/UTXO helpers: `listUnspent`, `listUnspentZ`, `sendTToZ`, `sendZToT`.
  - Market/network cache helpers: `cacheMarketStats`, `cacheNetworkStats`.
  - Payout math/state helpers incl. `roundTo`, `coinsRound`, `checkForDuplicateBlockHeight`, `handleAddress`.
  - Core loop: `processPayments` (defined in file) schedules periodic payout processing.

### libs/poolWorker.js
- Exports: worker constructor `(logger)`.
- Responsibilities:
  - Builds stratum pools from `process.env.pools`.
  - Handles IPC messages (`banIP`, `blocknotify`, `coinswitch`).
  - Wires handlers for auth/share/difficulty in MPOS/internal modes.
- Methods:
  - `getFirstPoolForAlgorithm(algorithm)`.
  - `setDifficultyForProxyPort(pool, coin, algo)`.

### libs/profitSwitch.js
- Exports: worker constructor `(logger)`.
- Methods:
  - `getProfitDataPoloniex(callback)`.
  - `getMarketDepthFromPoloniex(symbolA,symbolB,coinPrice,callback)`.
  - `getProfitDataCryptsy(callback)`.
  - `getProfitDataMintpal(callback)`.
  - `getMarketDepthFromMintpal(symbolA,symbolB,coinPrice,callback)`.
  - `getProfitDataBittrex(callback)`.
  - `getMarketDepthFromBittrex(symbolA,symbolB,coinPrice,callback)`.
  - `getCoindDaemonInfo(callback)`.
  - `getDaemonInfoForCoin(symbol,cfg,callback)`.
  - `getMiningRate(callback)`.
  - `switchToMostProfitableCoins()`.

### libs/shareProcessor.js
- Exports: constructor `(logger, poolConfig)`.
- Methods:
  - `handleShare(isValidShare,isValidBlock,shareData)` — writes share/block counters + hashrate timeline + pending blocks into Redis.

### libs/stats.js
- Exports: constructor `(logger, portalConfig, poolConfigs)`.
- Top-level helpers:
  - `rediscreateClient(port,host,pass)`.
  - `sortProperties(obj, sortedBy, isNumericSort, reverse)`.
- Internal helpers include: `setupStatsRedis`, `gatherStatHistory`, `addStatPoolHistory`, `roundTo`, `coinsRound`, `readableSeconds`, sorting helpers.
- Public methods:
  - `getBlocks(cback)`
  - `getCoins(cback)`
  - `getPayout(address,cback)`
  - `getTotalSharesByAddress(address,cback)`
  - `getBalanceByAddress(address,cback)`
  - `getGlobalStats(callback)`
  - `getReadableHashRateString(hashrate)`

### libs/website.js
- Exports: worker constructor `(logger)`.
- Functions/route handlers:
  - `processTemplates()`, `readPageFiles(files)`
  - `buildUpdatedWebsite()` periodic stat/SSE refresh
  - `buildKeyScriptPage()` generates mining key helper page data
  - `getPage(pageId)`
  - route handlers: `minerpage`, `payout`, `shares`, `usershares`, `route`
- Sets up Express routes, static serving, optional TLS server.

### libs/workerapi.js
- Exports: `workerapi` constructor.
- Methods:
  - `start(poolObj)` — starts small HTTP API exposing worker-level status payload.

## Coin Profiles

### coins/digibyte.odo.json
- Purpose: DigiByte Odo algorithm coin profile.
- Classes/Functions/Exports: N/A (JSON keys: name/symbol/algorithm/network bytes/explorer/etc).

### coins/digibyte.qubit.json
- Purpose: DigiByte Qubit profile.
- Classes/Functions/Exports: N/A.

### coins/digibyte.scrypt.json
- Purpose: DigiByte Scrypt profile.
- Classes/Functions/Exports: N/A.

### coins/digibyte.sha256.json
- Purpose: DigiByte SHA256 profile.
- Classes/Functions/Exports: N/A.

### coins/digibyte.skein.json
- Purpose: DigiByte Skein profile.
- Classes/Functions/Exports: N/A.

### coins/testnet.odo.json
- Purpose: testnet Odo profile.
- Classes/Functions/Exports: N/A.

### coins/testnet.qubit.json
- Purpose: testnet Qubit profile.
- Classes/Functions/Exports: N/A.

### coins/testnet.scrypt.json
- Purpose: testnet Scrypt profile.
- Classes/Functions/Exports: N/A.

### coins/testnet.sha256.json
- Purpose: testnet SHA256 profile.
- Classes/Functions/Exports: N/A.

### coins/testnet.skein.json
- Purpose: testnet Skein profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples/bellcoin.json
- Purpose: example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples/bitzeny.json
- Purpose: example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples/dash.json
- Purpose: example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples/koto.json
- Purpose: example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples/kumacoin.json
- Purpose: example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples/ltncg.json
- Purpose: example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples/monacoin.json
- Purpose: example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples/sugarchain.json
- Purpose: example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples/susucoin.json
- Purpose: example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples/yenten.json
- Purpose: example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples-testnet/bellcoin.json
- Purpose: testnet example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples-testnet/bitzeny.json
- Purpose: testnet example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples-testnet/dash.json
- Purpose: testnet example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples-testnet/koto.json
- Purpose: testnet example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples-testnet/kumacoin.json
- Purpose: testnet example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples-testnet/ltncg.json
- Purpose: testnet example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples-testnet/monacoin.json
- Purpose: testnet example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples-testnet/sugarchain.json
- Purpose: testnet example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples-testnet/susucoin.json
- Purpose: testnet example coin profile.
- Classes/Functions/Exports: N/A.

### coins/coins-examples-testnet/yenten.json
- Purpose: testnet example coin profile.
- Classes/Functions/Exports: N/A.

## Pool Configurations

### pool_configs/digibyte.odo.json
- Purpose: live pool config for DigiByte Odo.
- Classes/Functions/Exports: N/A (JSON).

### pool_configs/digibyte.qubit.json
- Purpose: live pool config for DigiByte Qubit.
- Classes/Functions/Exports: N/A.

### pool_configs/digibyte.scrypt.json
- Purpose: live pool config for DigiByte Scrypt.
- Classes/Functions/Exports: N/A.

### pool_configs/digibyte.sha256.json
- Purpose: live pool config for DigiByte SHA256.
- Classes/Functions/Exports: N/A.

### pool_configs/digibyte.skein.json
- Purpose: live pool config for DigiByte Skein.
- Classes/Functions/Exports: N/A.

### pool_configs/testnet.odo.json
- Purpose: testnet pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/testnet.qubit.json
- Purpose: testnet pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/testnet.scrypt.json
- Purpose: testnet pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/testnet.sha256.json
- Purpose: testnet pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/testnet.skein.json
- Purpose: testnet pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/examples/bellcoin.json
- Purpose: example pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/examples/bitzeny.json
- Purpose: example pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/examples/bitzeny_testnet.json
- Purpose: example testnet pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/examples/dash.json
- Purpose: example pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/examples/koto.json
- Purpose: example pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/examples/kumacoin.json
- Purpose: example pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/examples/lightningcash-gold.json
- Purpose: example pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/examples/monacoin.json
- Purpose: example pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/examples/sugarchain.json
- Purpose: example pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/examples/susucoin.json
- Purpose: example pool config.
- Classes/Functions/Exports: N/A.

### pool_configs/examples/yenten.json
- Purpose: example pool config.
- Classes/Functions/Exports: N/A.

## Top-Level Config / Examples

### config_example.json
- Purpose: canonical portal configuration template.
- Classes/Functions/Exports: N/A (JSON).

### examples/example_nginx
- Purpose: reverse-proxy config example for deployment.
- Classes/Functions/Exports: N/A.

## Scripts / Utilities

### scripts/blocknotify.c
- Exports: standalone C executable `main(argc, argv)`.
- Functionality: sends JSON `blocknotify` command to local CLI TCP port.

### scripts/cli.js
- Exports: none (CLI script).
- Functionality: parses args/options and sends command JSON to NOMP CLI listener.

### scripts/getbalance.py
- Exports: none (Python script).
- Functions/classes: none declared.
- Functionality: periodic wallet balance sampling into `balance.json`.

### scripts/kotobalance.service
- Purpose: systemd unit to run balance collector.
- Classes/Functions/Exports: N/A.

### scripts/statsb.js
- Exports: none (browser script).
- Functions:
  - `buildChartDataB`, `calculateAverageBalance`, `getReadableBalanceString`, `timeOfDayFormatB`, `displayChartsB`, `triggerChartUpdatesB`, `updateChartB`.

### scripts/stats.js_plus_pending_graph
- Exports: none (browser script template/variant).
- Functions:
  - `buildChartData`, `calculateAverageHashrate`, `getReadableHashRateString`, `timeOfDayFormat`, `displayCharts`, `triggerChartUpdates`.

## Website Templates

### website/index.html
- Purpose: base doT layout shell, nav/footer, JS language/menu logic.
- Inline JS functions: `capitalizeFirstLetter`, `toggleHorizontal`, `toggleMenu`, `closeMenu`, `loadTranslations`, `setLanguage`, `getServerLanguage`.
- Module exports: N/A.

### website/key.html
- Purpose: doT template for mining key conversion helper page.
- Classes/Functions/Exports: N/A (template).

### website/pages/admin.html
- Purpose: admin page fragment template.
- Classes/Functions/Exports: N/A.

### website/pages/api.html
- Purpose: API docs page fragment template.
- Classes/Functions/Exports: N/A.

### website/pages/getting_started.html
- Purpose: getting-started page fragment template.
- Classes/Functions/Exports: N/A.

### website/pages/home.html
- Purpose: home page fragment template.
- Classes/Functions/Exports: N/A.

### website/pages/miner_stats.html
- Purpose: miner stats page fragment; sets `_miner`/`_workerCount` context for JS.
- Classes/Functions/Exports: N/A.

### website/pages/mining_key.html
- Purpose: mining key tool page fragment template.
- Classes/Functions/Exports: N/A.

### website/pages/payments.html
- Purpose: payments page fragment template.
- Classes/Functions/Exports: N/A.

### website/pages/stats.html
- Purpose: pool stats page fragment template.
- Classes/Functions/Exports: N/A.

### website/pages/tbs.html
- Purpose: tabular stats page fragment template.
- Classes/Functions/Exports: N/A.

### website/pages/workers.html
- Purpose: workers page fragment template.
- Classes/Functions/Exports: N/A.

## Website Static Sources

### website/static/admin.js
- Exports: none.
- Object methods: `docCookies.getItem`, `setItem`, `removeItem`, `hasItem`.
- Functions: `showLogin`, `showAdminCenter`, `tryLogin`, `displayMenu`, `apiRequest`.

### website/static/main.js
- Exports: none.
- Functions: `hotSwap(page,pushState)` (internal in jQuery ready handler).
- Sets global `window.statsSource` (`EventSource('/api/live_stats')`).

### website/static/miner_stats.js
- Exports: none.
- Functions:
  - `getReadableHashRateString`, `getReadableLuckTime`, `timeOfDayFormat`, `getWorkerNameFromAddress`
  - `buildChartData`, `updateChartData`, `calculateAverageHashrate`, `triggerChartUpdates`, `displayCharts`
  - `updateStats`, `updateWorkerStats`, `addWorkerToDisplay`, `rebuildWorkerDisplay`

### website/static/stats.js
- Exports: none.
- Functions:
  - `buildChartData`, `calculateAverageHashrate`, `getReadableHashRateString`, `getReadableLuckTime`
  - `timeOfDayFormat`, `displayCharts`, `triggerChartUpdates`, `rebuildAllChart`

### website/static/style.css
- Purpose: core site styling/theme/responsive rules.
- Classes/Functions/Exports: N/A (CSS).

### website/static/translations.json
- Purpose: i18n string table consumed by `website/index.html` language loader.
- Classes/Functions/Exports: N/A (JSON).
