(function () {
    'use strict';

    var BLOCK_LANGUAGES = Object.freeze({
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
    });

    var BLOCK_COUNTRIES = Object.freeze({
        JP: true,
        KR: true,
        IN: true,
        TH: true
    });

    var CYRILLIC_RE = /[А-ЯЁа-яё]/;

    var BLOCKED_SCRIPT_RE =
        /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u0900-\u097f\u0980-\u09ff\u0a00-\u0a7f\u0b80-\u0bff\u0c00-\u0c7f\u0c80-\u0cff\u0d00-\u0d7f\u0e00-\u0e7f]/;

    var ANIME_WORDS_RE =
        /(?:^|[^a-zа-яё])(?:anime|аниме|manga|манга|shonen|shounen|seinen|isekai|otaku|anilibria|crunchyroll)(?:$|[^a-zа-яё])/i;

    var pendingCards = [];
    var pendingSet = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    var frameRequested = false;

    function normalize(value) {
        return String(value || '').trim();
    }

    function hasCyrillicTitle(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }

        return CYRILLIC_RE.test(normalize(data.title || data.name));
    }

    function hasBlockedLanguage(data) {
        var language = normalize(data.original_language).toLowerCase();

        return Boolean(BLOCK_LANGUAGES[language]);
    }

    function hasBlockedOriginCountry(data) {
        var countries = data.origin_country;

        if (!Array.isArray(countries)) {
            return false;
        }

        for (var i = 0; i < countries.length; i++) {
            var code = normalize(countries[i]).toUpperCase();

            if (BLOCK_COUNTRIES[code]) {
                return true;
            }
        }

        return false;
    }

    function hasBlockedProductionCountry(data) {
        var countries = data.production_countries;

        if (!Array.isArray(countries)) {
            return false;
        }

        for (var i = 0; i < countries.length; i++) {
            var country = countries[i] || {};
            var code = normalize(
                country.iso_3166_1 || country.code || country.name
            ).toUpperCase();

            if (BLOCK_COUNTRIES[code]) {
                return true;
            }
        }

        return false;
    }

    function hasBlockedOriginalScript(data) {
        return (
            BLOCKED_SCRIPT_RE.test(normalize(data.original_title)) ||
            BLOCKED_SCRIPT_RE.test(normalize(data.original_name))
        );
    }

    function hasAnimeKeywords(data) {
        var text = [
            data.title,
            data.name,
            data.original_title,
            data.original_name,
            data.overview
        ].filter(Boolean).join(' ');

        return ANIME_WORDS_RE.test(text);
    }

    function isBlockedByData(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }

        if (!hasCyrillicTitle(data)) {
            return true;
        }

        return (
            hasBlockedLanguage(data) ||
            hasBlockedOriginCountry(data) ||
            hasBlockedProductionCountry(data) ||
            hasBlockedOriginalScript(data) ||
            hasAnimeKeywords(data)
        );
    }

    function removeCard(card) {
        if (!card || card.__contentFilterRemoved) {
            return;
        }

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

        /*
         * .card__filter может быть добавлен после появления карточки,
         * поэтому эту проверку нельзя навсегда помечать как выполненную.
         */
        if (
            card.querySelector &&
            card.querySelector('.card__filter')
        ) {
            removeCard(card);
            return;
        }

        var data = card.card_data;

        if (!data || typeof data !== 'object') {
            return;
        }

        /*
         * Данные карточки обычно неизменны, поэтому проверяем их один раз.
         */
        if (card.__contentFilterDataChecked) {
            return;
        }

        card.__contentFilterDataChecked = true;

        if (isBlockedByData(data)) {
            removeCard(card);
        }
    }

    function flushQueue() {
        frameRequested = false;

        var cards = pendingCards;
        pendingCards = [];

        if (pendingSet) {
            pendingSet = new WeakSet();
        }

        for (var i = 0; i < cards.length; i++) {
            processCard(cards[i]);
        }
    }

    function queueCard(card) {
        if (
            !card ||
            card.nodeType !== 1 ||
            card.__contentFilterRemoved
        ) {
            return;
        }

        if (pendingSet) {
            if (pendingSet.has(card)) {
                return;
            }

            pendingSet.add(card);
        } else if (pendingCards.indexOf(card) !== -1) {
            return;
        }

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

    function queueCardsInside(root) {
        if (!root || root.nodeType !== 1) {
            return;
        }

        if (root.classList && root.classList.contains('card')) {
            queueCard(root);
        }

        /*
         * Если внутри добавился .card__filter,
         * повторно проверяем его родительскую карточку.
         */
        if (
            root.classList &&
            root.classList.contains('card__filter')
        ) {
            var ownerCard = root.closest
                ? root.closest('.card')
                : null;

            if (ownerCard) {
                queueCard(ownerCard);
            }
        }

        /*
         * Элемент мог быть добавлен внутрь уже существующей карточки.
         */
        if (root.closest) {
            var parentCard = root.closest('.card');

            if (parentCard) {
                queueCard(parentCard);
            }
        }

        if (!root.querySelectorAll) {
            return;
        }

        var cards = root.querySelectorAll('.card');

        for (var i = 0; i < cards.length; i++) {
            queueCard(cards[i]);
        }

        var filters = root.querySelectorAll('.card__filter');

        for (var j = 0; j < filters.length; j++) {
            var card = filters[j].closest
                ? filters[j].closest('.card')
                : null;

            if (card) {
                queueCard(card);
            }
        }
    }

    function start() {
        queueCardsInside(document.body);

        var observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var addedNodes = mutations[i].addedNodes;

                for (var j = 0; j < addedNodes.length; j++) {
                    queueCardsInside(addedNodes[j]);
                }
            }
        });

        observer.observe(document.body, {
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
