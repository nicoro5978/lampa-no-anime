/* No Anime TMDB — Version 2.2.2 */

(function () {
    'use strict';

    if (window.__NO_ANIME_TMDB_ACTIVE__) {
        return;
    }

    window.__NO_ANIME_TMDB_ACTIVE__ = true;

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

    function string(value) {
        return String(value || '');
    }

    function hasBlockedCountry(item) {
        var countries = item.origin_country;

        if (Array.isArray(countries)) {
            for (var i = 0; i < countries.length; i++) {
                var originCode = string(countries[i]).toUpperCase();

                if (BLOCK_COUNTRIES[originCode]) {
                    return true;
                }
            }
        }

        countries = item.production_countries;

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

    function shouldBlock(item) {
        if (!item || typeof item !== 'object') {
            return false;
        }

        var localizedTitle = string(
            item.title || item.name
        );

        /*
         * Оставляем только карточки,
         * локализованное название которых содержит кириллицу.
         */
        if (!CYRILLIC_RE.test(localizedTitle)) {
            return true;
        }

        var language = string(
            item.original_language
        ).toLowerCase();

        if (BLOCK_LANGUAGES[language]) {
            return true;
        }

        if (hasBlockedCountry(item)) {
            return true;
        }

        if (
            BLOCKED_SCRIPT_RE.test(string(item.original_title)) ||
            BLOCKED_SCRIPT_RE.test(string(item.original_name))
        ) {
            return true;
        }

        var searchableText = [
            item.title,
            item.name,
            item.original_title,
            item.original_name,
            item.overview
        ].filter(Boolean).join(' ');

        return ANIME_RE.test(searchableText);
    }

    function filterResponse(data) {
        if (
            !data ||
            typeof data !== 'object' ||
            !Array.isArray(data.results)
        ) {
            return data;
        }

        data.results = data.results.filter(function (item) {
            return !shouldBlock(item);
        });

        return data;
    }

    function patchList(source) {
        if (
            !source ||
            typeof source.list !== 'function' ||
            source.list.__noAnimeTmdbPatched
        ) {
            return;
        }

        var originalList = source.list;

        source.list = function (params, oncomplete, onerror) {
            var filteredComplete =
                typeof oncomplete === 'function'
                    ? function (data) {
                        oncomplete(filterResponse(data));
                    }
                    : oncomplete;

            return originalList.call(
                this,
                params,
                filteredComplete,
                onerror
            );
        };

        source.list.__noAnimeTmdbPatched = true;
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

        /*
         * ВАЖНО:
         * main() и category() намеренно не изменяются.
         * Их перехват вызывал повторную отрисовку секций и дубли.
         */
        patchList(source);
    }

    init();
})();
