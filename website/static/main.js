// Live stats: ONE stream per page, shared by every page script.
// Page scripts call statsSource.addEventListener('message', fn) as before.
// If the stream fails, we close it and wait longer before each retry
// (3 s, 6 s, 12 s, 24 s, 48 s, then 60 s) instead of the browser's fixed 3 s retry.
(function (window) {
    var STREAM_URL = '/api/live_stats';
    var FIRST_DELAY = 3000;
    var MAX_DELAY = 60000;
    var source = null;
    var listeners = [];
    var failures = 0;

    function connect() {
        if (typeof window.EventSource !== 'function') return;
        var es = new window.EventSource(STREAM_URL);
        source = es;
        es.onopen = function () { failures = 0; };
        es.onerror = function () {
            if (source !== es) return;
            es.close();
            source = null;
            var delay = Math.min(MAX_DELAY, FIRST_DELAY * Math.pow(2, failures));
            failures++;
            window.setTimeout(connect, delay);
        };
        for (var i = 0; i < listeners.length; i++) es.addEventListener(listeners[i][0], listeners[i][1]);
    }

    window.statsSource = {
        addEventListener: function (type, fn) {
            listeners.push([type, fn]);
            if (source) source.addEventListener(type, fn);
        },
        removeEventListener: function (type, fn) {
            listeners = listeners.filter(function (l) { return l[0] !== type || l[1] !== fn; });
            if (source) source.removeEventListener(type, fn);
        },
        // Used when a new page body replaces the old one (hotSwap).
        removeAllListeners: function () {
            for (var i = 0; i < listeners.length; i++) {
                if (source) source.removeEventListener(listeners[i][0], listeners[i][1]);
            }
            listeners = [];
        }
    };

    connect();
})(window);

$(function(){

    var hotSwap = function(page, pushSate){
        if (pushSate) history.pushState(null, null, '/' + page);
        $('.pure-menu-selected').removeClass('pure-menu-selected');
        $('a[href="/' + page + '"]').parent().addClass('pure-menu-selected');
        $.get("/get_page", {id: page}, function(data){
            window.statsSource.removeAllListeners();
            $('main').html(data);
        }, 'html')
    };

    $('.hot-swapper').click(function(event){
        if (event.which !== 1) return;
        var pageId = $(this).attr('href').slice(1);
        hotSwap(pageId, true);
        event.preventDefault();
        return false;
    });

    window.addEventListener('load', function() {
        setTimeout(function() {
            window.addEventListener("popstate", function(e) {
                hotSwap(location.pathname.slice(1));
            });
        }, 0);
    });

});
