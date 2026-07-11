/* No Anime TMDB — Version 2.1.0 */

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

    var HIDDEN_CLASS = 'no-anime-tmdb-hidden';
    var STYLE_ID = 'no-anime-tmdb-style';

    var pendingCards = [];
    var pendingSet = new WeakSet();
    var frameScheduled = false;

    function string(value) {
        return String(value || '');
    }

    function installStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        var style = document.createElement('style');

        style.id = STYLE_ID;
        style.textContent =
            '.' + HIDDEN_CLASS + '{' +
                'display:none!important;' +
                'width:0!important;' +
                'min-width:0!important;' +
                'max-width:0!important;' +
                'height:0!important;' +
                'min-height:0!important;' +
                'max-height:0!important;' +
                'margin:0!important;' +
                'padding:0!important;' +
                'border:0!important;' +
                'overflow:hidden!important;' +
                'pointer-events:none!important;' +
            '}';

        document.head.appendChild(style);
    }

    function hasCyrillicTitle(data) {
        return CYRILLIC_RE.test(
            string(data.title || data.name)
        );
    }

    function hasBlockedLanguage(data) {
        var language = string(
            data.original_language
        ).toLowerCase();

        return Boolean(BLOCK_LANGUAGES[language]);
    }

    function hasBlockedCountry(data) {
        var countries = data.origin_country;

        if (Array.isArray(countries)) {
            for (var i = 0; i < countries.length; i++) {
                var originCode = string(
                    countries[i]
                ).toUpperCase();

                if (BLOCK_COUNTRIES[originCode]) {
                    return true;
                }
            }
        }

        countries = data.production_countries;

        if (Array.isArray(countries)) {
            for (var j = 0; j < countries.length; j++) {
                var country = countries[j] || {};

                var productionCode = string(
                    country.iso_3166_1 ||
                    country.code ||
                    country.name
                ).toUpperCase();

                if (BLOCK_COUNTRIES[productionCode]) {
                    return true;
                }
            }
        }

        return false;
    }

    function hasBlockedOriginalScript(data) {
        return (
            BLOCKED_SCRIPT_RE.test(
                string(data.original_title)
            ) ||
            BLOCKED_SCRIPT_RE.test(
                string(data.original_name)
            )
        );
    }

    function hasAnimeWords(data) {
        var combinedText = [
            data.title,
            data.name,
            data.original_title,
            data.original_name,
            data.overview
        ].filter(Boolean).join(' ');

        return ANIME_WORDS_RE.test(combinedText);
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
            hasBlockedCountry(data) ||
            hasBlockedOriginalScript(data) ||
            hasAnimeWords(data)
        );
    }

    function getCardContainer(card) {
        if (!card || !card.parentElement) {
            return card;
        }

        var parent = card.parentElement;

        /*
         * Некоторые версии Lampa помещают карточку
         * в отдельную обёртку. Скрываем именно её,
         * чтобы она не занимала место в ряду.
         */
        if (
            parent.children.length === 1 &&
            (
                parent.classList.contains('scroll__item') ||
                parent.classList.contains('items-line__item') ||
                parent.classList.contains('card-wrapper') ||
                parent.classList.contains('selector')
            )
        ) {
            return parent;
        }

        return card;
    }

    function hideCard(card) {
        if (!card || card.__noAnimeHidden) {
            return;
        }

        card.__noAnimeHidden = true;

        var container = getCardContainer(card);

        if (container) {
            container.classList.add(HIDDEN_CLASS);
        }
    }

    function shouldHideCard(card) {
        if (!card) {
            return false;
        }

        if (
            card.querySelector &&
            card.querySelector('.card__filter')
        ) {
            return true;
        }

        return isBlockedByData(card.card_data);
    }

    function processCard(card) {
        if (
            !card ||
            card.nodeType !== 1 ||
            card.__noAnimeHidden
        ) {
            return;
        }

        /*
         * card_data может появиться немного позже,
         * чем сама карточка.
         */
        if (
            !card.card_data &&
            !card.querySelector('.card__filter')
        ) {
            if (!card.__noAnimeRetry) {
                card.__noAnimeRetry = true;

                setTimeout(function () {
                    card.__noAnimeRetry = false;
                    queueCard(card);
                }, 80);
            }

            return;
        }

        if (shouldHideCard(card)) {
            hideCard(card);
        }
    }

    function flushQueue() {
        frameScheduled = false;

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
            card.__noAnimeHidden ||
            pendingSet.has(card)
        ) {
            return;
        }

        pendingSet.add(card);
        pendingCards.push(card);

        if (frameScheduled) {
            return;
        }

        frameScheduled = true;

        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(flushQueue);
        } else {
            setTimeout(flushQueue, 0);
        }
    }

    function processAddedNode(node) {
        if (!node || node.nodeType !== 1) {
            return;
        }

        if (
            node.classList &&
            node.classList.contains('card')
        ) {
            queueCard(node);
        }

        if (
            node.classList &&
            node.classList.contains('card__filter')
        ) {
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
        installStyles();

        var cards = document.querySelectorAll('.card');

        for (var i = 0; i < cards.length; i++) {
            queueCard(cards[i]);
        }

        var observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var mutation = mutations[i];

                for (
                    var j = 0;
                    j < mutation.addedNodes.length;
                    j++
                ) {
                    processAddedNode(
                        mutation.addedNodes[j]
                    );
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
        document.addEventListener(
            'DOMContentLoaded',
            start,
            { once: true }
        );
    }
})();
