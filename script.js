/* No Anime TMDB — Version 2.2.0 */

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

    function text(value) {
        return String(value || '');
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

    function shouldBlock(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }

        var title = text(data.title || data.name);

        /*
         * Оставляем только карточки,
         * название которых содержит кириллицу.
         */
        if (!CYRILLIC_RE.test(title)) {
            return true;
        }

        var language = text(
            data.original_language
        ).toLowerCase();

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

        var combinedText = [
            data.title,
            data.name,
            data.original_title,
            data.original_name,
            data.overview
        ].filter(Boolean).join(' ');

        return ANIME_RE.test(combinedText);
    }

    function filterResults(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        if (Array.isArray(data)) {
            return data.filter(function (item) {
                return !shouldBlock(item);
            });
        }

        if (Array.isArray(data.results)) {
            data.results = data.results.filter(function (item) {
                return !shouldBlock(item);
            });
        }

        return data;
    }

    function wrapComplete(callback) {
        if (typeof callback !== 'function') {
            return callback;
        }

        return function (data) {
            return callback.call(
                this,
                filterResults(data)
            );
        };
    }

    function patchMethod(source, methodName) {
        var original = source[methodName];

        if (
            typeof original !== 'function' ||
            original.__noAnimeTmdbPatched
        ) {
            return;
        }

        var patched = function () {
            var args = Array.prototype.slice.call(arguments);

            /*
             * У main, category и list второй аргумент —
             * callback успешного завершения.
             */
            if (typeof args[1] === 'function') {
                args[1] = wrapComplete(args[1]);
            }

            return original.apply(this, args);
        };

        patched.__noAnimeTmdbPatched = true;
        source[methodName] = patched;
    }

    /*
     * ByLampa добавляет .card__filter уже после получения
     * данных. Оставляем только лёгкое наблюдение за этим
     * конкретным элементом, без пересканирования каталога.
     */
    function removeFilteredCard(node) {
        if (!node || node.nodeType !== 1) {
            return;
        }

        if (
            node.classList &&
            node.classList.contains('card__filter')
        ) {
            var card = node.closest('.card');

            if (card) {
                card.remove();
            }

            return;
        }

        if (!node.querySelectorAll) {
            return;
        }

        var filters = node.querySelectorAll('.card__filter');

        for (var i = 0; i < filters.length; i++) {
            var ownerCard = filters[i].closest('.card');

            if (ownerCard) {
                ownerCard.remove();
            }
        }
    }

    function startFilterObserver() {
        new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var nodes = mutations[i].addedNodes;

                for (var j = 0; j < nodes.length; j++) {
                    removeFilteredCard(nodes[j]);
                }
            }
        }).observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function init() {
        var source =
            window.Lampa &&
            Lampa.Api &&
            Lampa.Api.sources &&
            Lampa.Api.sources.tmdb;

        if (!source) {
            setTimeout(init, 250);
            return;
        }

        patchMethod(source, 'list');
        patchMethod(source, 'category');
        patchMethod(source, 'main');

        if (document.body) {
            startFilterObserver();
        } else {
            document.addEventListener(
                'DOMContentLoaded',
                startFilterObserver,
                { once: true }
            );
        }
    }

    init();
})();
