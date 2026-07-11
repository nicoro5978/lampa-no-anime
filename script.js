/* No Anime TMDB — Version 2.1.1 */

(function () {
    'use strict';

    var BLOCK_LANGUAGES = {
        ja: true,
        ko: true,
        hi: true,
        te: true,
        ta: true,
        ml: true,
        kn: true,
        bn: true,
        mr: true,
        pa: true,
        ur: true,
        th: true
    };

    var BLOCK_COUNTRIES = {
        JP: true,
        KR: true,
        IN: true,
        TH: true
    };

    var CYRILLIC_RE = /[А-ЯЁа-яё]/;

    var BLOCKED_SCRIPT_RE =
        /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u0900-\u097f\u0980-\u09ff\u0a00-\u0a7f\u0b80-\u0bff\u0c00-\u0c7f\u0c80-\u0cff\u0d00-\u0d7f\u0e00-\u0e7f]/;

    var ANIME_RE =
        /(?:^|[^a-zа-яё])(?:anime|аниме|manga|манга|shonen|shounen|seinen|isekai|otaku|anilibria|crunchyroll)(?:$|[^a-zа-яё])/i;

    var queued = [];
    var queuedSet = new WeakSet();
    var framePending = false;

    function text(value) {
        return String(value || '');
    }

    function hasBlockedCountry(data) {
        var countries = data.origin_country;

        if (Array.isArray(countries)) {
            for (var i = 0; i < countries.length; i++) {
                if (BLOCK_COUNTRIES[text(countries[i]).toUpperCase()]) {
                    return true;
                }
            }
        }

        countries = data.production_countries;

        if (Array.isArray(countries)) {
            for (var j = 0; j < countries.length; j++) {
                var country = countries[j] || {};

                var code = text(
                    country.iso_3166_1 ||
                    country.code ||
                    country.name
                ).toUpperCase();

                if (BLOCK_COUNTRIES[code]) {
                    return true;
                }
            }
        }

        return false;
    }

    function shouldBlock(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }

        var title = text(data.title || data.name);

        if (!CYRILLIC_RE.test(title)) {
            return true;
        }

        var language = text(data.original_language).toLowerCase();

        if (BLOCK_LANGUAGES[language]) {
            return true;
        }

        if (hasBlockedCountry(data)) {
            return true;
        }

        if (
            BLOCKED_SCRIPT_RE.test(text(data.original_title)) ||
            BLOCKED_SCRIPT_RE.test(text(data.original_name))
        ) {
            return true;
        }

        return ANIME_RE.test([
            data.title,
            data.name,
            data.original_title,
            data.original_name,
            data.overview
        ].filter(Boolean).join(' '));
    }

    function removeCard(card) {
        if (!card || card.__noAnimeRemoved) {
            return;
        }

        card.__noAnimeRemoved = true;

        if (card.parentNode) {
            card.parentNode.removeChild(card);
        }
    }

    function processCard(card) {
        if (
            !card ||
            card.nodeType !== 1 ||
            card.__noAnimeRemoved
        ) {
            return;
        }

        /*
         * Встроенный фильтр ByLampa добавляет этот элемент
         * уже после создания карточки.
         */
        if (card.querySelector('.card__filter')) {
            removeCard(card);
            return;
        }

        var data = card.card_data;

        if (!data || typeof data !== 'object') {
            if (!card.__noAnimeRetry) {
                card.__noAnimeRetry = true;

                setTimeout(function () {
                    card.__noAnimeRetry = false;
                    queueCard(card);
                }, 100);
            }

            return;
        }

        if (shouldBlock(data)) {
            removeCard(card);
        }
    }

    function flushQueue() {
        framePending = false;

        var cards = queued;

        queued = [];
        queuedSet = new WeakSet();

        for (var i = 0; i < cards.length; i++) {
            processCard(cards[i]);
        }
    }

    function queueCard(card) {
        if (
            !card ||
            card.nodeType !== 1 ||
            card.__noAnimeRemoved ||
            queuedSet.has(card)
        ) {
            return;
        }

        queuedSet.add(card);
        queued.push(card);

        if (framePending) {
            return;
        }

        framePending = true;

        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(flushQueue);
        } else {
            setTimeout(flushQueue, 0);
        }
    }

    function scanNode(node) {
        if (!node || node.nodeType !== 1) {
            return;
        }

        if (node.classList.contains('card')) {
            queueCard(node);
        }

        if (node.classList.contains('card__filter')) {
            var ownerCard = node.closest('.card');

            if (ownerCard) {
                queueCard(ownerCard);
            }
        }

        if (!node.querySelectorAll) {
            return;
        }

        var cards = node.querySelectorAll('.card');

        for (var i = 0; i < cards.length; i++) {
            queueCard(cards[i]);
        }

        var filters = node.querySelectorAll('.card__filter');

        for (var j = 0; j < filters.length; j++) {
            var card = filters[j].closest('.card');

            if (card) {
                queueCard(card);
            }
        }
    }

    function start() {
        var cards = document.querySelectorAll('.card');

        for (var i = 0; i < cards.length; i++) {
            queueCard(cards[i]);
        }

        new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var nodes = mutations[i].addedNodes;

                for (var j = 0; j < nodes.length; j++) {
                    scanNode(nodes[j]);
                }
            }
        }).observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    if (document.body) {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start, {
            once: true
        });
    }
})();
