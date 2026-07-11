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

    var STYLE_ID = 'no-anime-tmdb-style';
    var HIDDEN_CLASS = 'no-anime-tmdb-hidden';

    var pendingRows = new Set();
    var frameRequested = false;

    function text(value) {
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
                'visibility:hidden!important;' +
                'pointer-events:none!important;' +
            '}';

        document.head.appendChild(style);
    }

    function hasCyrillicTitle(data) {
        return CYRILLIC_RE.test(
            text(data.title || data.name)
        );
    }

    function hasBlockedLanguage(data) {
        var language = text(data.original_language).toLowerCase();

        return Boolean(BLOCK_LANGUAGES[language]);
    }

    function hasBlockedCountry(data) {
        var countries = data.origin_country;

        if (Array.isArray(countries)) {
            for (var i = 0; i < countries.length; i++) {
                var originCode = text(countries[i]).toUpperCase();

                if (BLOCK_COUNTRIES[originCode]) {
                    return true;
                }
            }
        }

        countries = data.production_countries;

        if (Array.isArray(countries)) {
            for (var j = 0; j < countries.length; j++) {
                var country = countries[j] || {};

                var productionCode = text(
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

    function hasBlockedScript(data) {
        return (
            BLOCKED_SCRIPT_RE.test(text(data.original_title)) ||
            BLOCKED_SCRIPT_RE.test(text(data.original_name))
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

        /*
         * Оставляем только карточки с названием на кириллице.
         */
        if (!hasCyrillicTitle(data)) {
            return true;
        }

        return (
            hasBlockedLanguage(data) ||
            hasBlockedCountry(data) ||
            hasBlockedScript(data) ||
            hasAnimeWords(data)
        );
    }

    function isFilteredCard(card) {
        if (!card) {
            return false;
        }

        /*
         * ByLampa добавляет этот слой карточкам,
         * которые сама помечает встроенным фильтром.
         */
        if (
            card.querySelector &&
            card.querySelector('.card__filter')
        ) {
            return true;
        }

        return isBlockedByData(card.card_data);
    }

    function hideCard(card, reason) {
        if (!card) {
            return;
        }

        card.classList.add(HIDDEN_CLASS);
        card.dataset.noAnimeReason = reason || 'filtered';
    }

    function showCard(card) {
        if (!card) {
            return;
        }

        card.classList.remove(HIDDEN_CLASS);
        delete card.dataset.noAnimeReason;
    }

    function getCardKey(card) {
        var data = card && card.card_data;

        if (!data || typeof data !== 'object') {
            return '';
        }

        var type = data.original_name || data.first_air_date
            ? 'tv'
            : 'movie';

        if (data.id !== undefined && data.id !== null) {
            return type + ':' + data.id;
        }

        return [
            type,
            text(data.original_title || data.original_name),
            text(data.release_date || data.first_air_date)
        ].join(':');
    }

    function findRow(card) {
        if (!card || !card.closest) {
            return document.body;
        }

        return card.closest(
            '.items-line,' +
            '.category-full,' +
            '.category,' +
            '.scroll,' +
            '.content,' +
            '.activity'
        ) || card.parentElement || document.body;
    }

    function findMoreButton(row) {
        if (!row || !row.querySelectorAll) {
            return null;
        }

        var candidates = row.querySelectorAll(
            '.items-line__more,' +
            '.category-full__more,' +
            '.selector,' +
            '.button,' +
            '[data-action="more"],' +
            '[class*="more"]'
        );

        for (var i = 0; i < candidates.length; i++) {
            var candidate = candidates[i];

            if (
                candidate.classList &&
                candidate.classList.contains('card')
            ) {
                continue;
            }

            var label = text(
                candidate.innerText ||
                candidate.textContent
            ).trim().toLowerCase();

            if (
                label === 'ещё' ||
                label === 'еще' ||
                label === 'more'
            ) {
                return candidate;
            }
        }

        return null;
    }

    function requestMore(row, hiddenCount) {
        if (!row || hiddenCount === 0) {
            return;
        }

        if (row.__noAnimeLoadingMore) {
            return;
        }

        var attempts = row.__noAnimeLoadAttempts || 0;

        /*
         * Ограничиваем количество автоматических подгрузок,
         * чтобы не получить бесконечный цикл.
         */
        if (attempts >= 5) {
            return;
        }

        var button = findMoreButton(row);

        if (!button) {
            return;
        }

        row.__noAnimeLoadingMore = true;
        row.__noAnimeLoadAttempts = attempts + 1;

        setTimeout(function () {
            try {
                button.dispatchEvent(
                    new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    })
                );
            } catch (error) {
                if (typeof button.click === 'function') {
                    button.click();
                }
            }

            setTimeout(function () {
                row.__noAnimeLoadingMore = false;
                queueRow(row);
            }, 500);
        }, 50);
    }

    function processRow(row) {
        if (!row || !row.querySelectorAll) {
            return;
        }

        var cards = row.querySelectorAll('.card');
        var seen = Object.create(null);
        var hiddenCount = 0;

        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];

            /*
             * Не отмечаем карточку навсегда проверенной:
             * card_data или .card__filter могут появиться позже.
             */
            if (isFilteredCard(card)) {
                hideCard(card, 'filtered');
                hiddenCount++;
                continue;
            }

            var key = getCardKey(card);

            if (key && seen[key]) {
                hideCard(card, 'duplicate');
                hiddenCount++;
                continue;
            }

            if (key) {
                seen[key] = true;
            }

            showCard(card);
        }

        requestMore(row, hiddenCount);
    }

    function flushRows() {
        frameRequested = false;

        var rows = Array.from(pendingRows);
        pendingRows.clear();

        for (var i = 0; i < rows.length; i++) {
            processRow(rows[i]);
        }
    }

    function queueRow(row) {
        if (!row) {
            return;
        }

        pendingRows.add(row);

        if (frameRequested) {
            return;
        }

        frameRequested = true;

        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(flushRows);
        } else {
            setTimeout(flushRows, 0);
        }
    }

    function scanNode(node) {
        if (!node || node.nodeType !== 1) {
            return;
        }

        if (
            node.classList &&
            node.classList.contains('card')
        ) {
            queueRow(findRow(node));
        }

        if (
            node.classList &&
            node.classList.contains('card__filter')
        ) {
            var owner = node.closest
                ? node.closest('.card')
                : null;

            if (owner) {
                queueRow(findRow(owner));
            }
        }

        if (!node.querySelectorAll) {
            return;
        }

        var cards = node.querySelectorAll('.card');

        for (var i = 0; i < cards.length; i++) {
            queueRow(findRow(cards[i]));
        }
    }

    function start() {
        installStyles();

        var existingCards = document.querySelectorAll('.card');

        for (var i = 0; i < existingCards.length; i++) {
            queueRow(findRow(existingCards[i]));
        }

        var observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var mutation = mutations[i];

                for (
                    var j = 0;
                    j < mutation.addedNodes.length;
                    j++
                ) {
                    scanNode(mutation.addedNodes[j]);
                }

                if (
                    mutation.target &&
                    mutation.target.nodeType === 1
                ) {
                    var card = mutation.target.closest
                        ? mutation.target.closest('.card')
                        : null;

                    if (card) {
                        queueRow(findRow(card));
                    }
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
