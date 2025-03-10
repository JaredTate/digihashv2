var request = require('axios');
var crypto = require('crypto');

module.exports = function() {
    'use strict';

    // Module dependencies

    // Constants
    var version         = '0.0.1',
        PUBLIC_API_URL  = 'http://www.coinwarz.com/v1/api/profitability/?apikey=YOUR_API_KEY&algo=all',
        USER_AGENT      = 'nomp/node-open-mining-portal';

    // Constructor
    function CoinWarz(key, secret){
        // Generate headers signed by this user's key and secret.
        // The secret is encapsulated and never exposed
        this._getPrivateHeaders = function(parameters){
            var paramString, signature;

            if (!key || !secret){
                throw 'CoinWarz: Error. API key and secret required';
            }

            // Sort parameters alphabetically and convert to `arg1=foo&arg2=bar`
            paramString = Object.keys(parameters).sort().map(function(param){
                return encodeURIComponent(param) + '=' + encodeURIComponent(parameters[param]);
            }).join('&');

            signature = crypto.createHmac('sha512', secret).update(paramString).digest('hex');

            return {
                Key: key,
                Sign: signature
            };
        };
    }

    // If a site uses non-trusted SSL certificates, set this value to false
    CoinWarz.STRICT_SSL = true;

    // Helper methods
    function joinCurrencies(currencyA, currencyB){
        return currencyA + '_' + currencyB;
    }

    // Prototype
    CoinWarz.prototype = {
        constructor: CoinWarz,

        // Make an API request
        _request: function(options, callback){
            if (!('headers' in options)){
                options.headers = {};
            }

            options.headers['User-Agent'] = USER_AGENT;
            options.json = true;
            options.strictSSL = CoinWarz.STRICT_SSL;

            request(options, function(err, response, body) {
                callback(err, body);
            });

            return this;
        },

        // Make a public API request
        _public: function(parameters, callback){
            var options = {
                method: 'GET',
                url: PUBLIC_API_URL,
                qs: parameters
            };

            return this._request(options, callback);
        },


        /////


        // PUBLIC METHODS

        getTicker: function(callback){
            var parameters = {
                    method: 'marketdatav2'
                };

            return this._public(parameters, callback);
        },

        getOrderBook: function(currencyA, currencyB, callback){
            var parameters = {
                    command: 'returnOrderBook',
                    currencyPair: joinCurrencies(currencyA, currencyB)
                };

            return this._public(parameters, callback);
        },

        getTradeHistory: function(currencyA, currencyB, callback){
            var parameters = {
                    command: 'returnTradeHistory',
                    currencyPair: joinCurrencies(currencyA, currencyB)
                };

            return this._public(parameters, callback);
        },
    };

    return CoinWarz;
};