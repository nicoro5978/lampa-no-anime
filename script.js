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

    var ANIME_WORDS_RE =
        /(?:^|[^a-zа-яё])(?:anime|аниме|manga|манга|shonen|shounen|seinen|isekai|otaku|anilibria|crunchyroll)(?:$|[^a-zа-яё])/i;

    var pendingCards = [];
    var pendingSet = new WeakSet();
    var frameRequested = false;

    function string(value) {
        return String(value || '');
    }

    function hasCyrillicTitle(data) {
        return CYRILLIC_RE.test(string(data.title || data.name));
    }

    function hasBlockedLanguage(data) {
        return Boolean(
            BLOCK_LANGUAGES[string(data.original_language).toLowerCase()]
        );
    }

    function hasBlockedCountry(data) {
        var countries = data.origin_country;

        if (Array.isArray(countries)) {
            for (var i = 0; i < countries.length; i++) {
                if (BLOCK_COUNTRIES[string(countries[i]).toUpperCase()]) {
                    return true;
                }
            }
        }

        countries = data.production_countries;

        if (Array.isArray(countries)) {
            for (var j = 0; j < countries.length; j++) {
                var country = countries[j] || {};
                var code = string(
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

    function hasBlockedOriginalScript(data) {
        return (
            BLOCKED_SCRIPT_RE.test(string(data.original_title)) ||
            BLOCKED_SCRIPT_RE.test(string(data.original_name))
        );
    }

    function hasAnimeWords(data) {
        return ANIME_WORDS_RE.test([
            data.title,
            data.name,
            data.original_title,
            data.original_name,
            data.overview
        ].filter(Boolean).join(' '));
    }

    function isBlocked(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }

        if (!hasCyrillicTitle(data)) {
            return true;
        }

        return (
            hasBlockedLanguage(data) ||
            hasBlockedCountry(data) ||
            hasBlockedOriginalScript(data) ||
            hasAnimeWords(data)
        );
    }

    function removeCard(card) {
        card.__contentFilterRemoved = true;

        if (card.parentNode) {
            card.parentNode.removeChild(card);
        }
    }

    function processCard(card) {
        if (
            !card ||
            card.nodeType !== 1 ||
            card.__contentFilterRemoved
        ) {
            return;
        }

        if (
            card.querySelector &&
            card.querySelector('.card__filter')
        ) {
            removeCard(card);
            return;
        }

        var data = card.card_data;

        /*
         * card_data иногда добавляется уже после появления карточки.
         * В таком случае проверим её ещё раз немного позже.
         */
        if (!data || typeof data !== 'object') {
            if (!card.__contentFilterRetryScheduled) {
                card.__contentFilterRetryScheduled = true;

                setTimeout(function () {
                    card.__contentFilterRetryScheduled = false;
                    queueCard(card);
                }, 100);
            }

            return;
        }

        if (card.__contentFilterDataChecked) {
            return;
        }

        card.__contentFilterDataChecked = true;

        if (isBlocked(data)) {
            removeCard(card);
        }
    }

    function flushQueue() {
        frameRequested = false;

        var cards = pendingCards;
        pendingCards = [];
        pendingSet = new WeakSet();

        for (var i = 0; i < cards.length; i++) {
            processCard(cards[i]);
        }
    }

    function queueCard(card) {
        if (
            !card ||
            card.nodeType !== 1 ||
            card.__contentFilterRemoved ||
            pendingSet.has(card)
        ) {
            return;
        }

        pendingSet.add(card);
        pendingCards.push(card);

        if (!frameRequested) {
            frameRequested = true;

            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(flushQueue);
            } else {
                setTimeout(flushQueue, 0);
            }
        }
    }

    function scanNode(node) {
        if (!node || node.nodeType !== 1) {
            return;
        }

        var ownerCard = node.closest
            ? node.closest('.card')
            : null;

        if (ownerCard) {
            queueCard(ownerCard);
        }

        if (
            node.classList &&
            node.classList.contains('card')
        ) {
            queueCard(node);
        }

        if (!node.querySelectorAll) {
            return;
        }

        var cards = node.querySelectorAll('.card');

        for (var i = 0; i < cards.length; i++) {
            queueCard(cards[i]);
        }
    }

    function start() {
        scanNode(document.body);

        new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var mutation = mutations[i];

                for (var j = 0; j < mutation.addedNodes.length; j++) {
                    scanNode(mutation.addedNodes[j]);
                }

                /*
                 * Повторно проверяем карточку, внутрь которой добавились
                 * новые элементы, например .card__filter.
                 */
                if (
                    mutation.target &&
                    mutation.target.nodeType === 1
                ) {
                    var card = mutation.target.closest
                        ? mutation.target.closest('.card')
                        : null;

                    if (card) {
                        queueCard(card);
                    }
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
