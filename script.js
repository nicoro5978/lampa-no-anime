/* No Anime TMDB — Version 2.2.4 */

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

    /*
     * Для каждого каталога храним уже показанные карточки,
     * чтобы удалять повторы между страницами.
     */
    var catalogStates = Object.create(null);

    function string(value) {
        return String(value || '');
    }

    function isRestrictedContent(item) {
        if (
            !item ||
            item.id === undefined ||
            item.id === null
        ) {
            return false;
        }

        var restricted =
            window.lampa_settings &&
            window.lampa_settings.lgbt;

        if (!restricted || typeof restricted !== 'object') {
            return false;
        }

        var type =
            item.media_type ||
            (
                item.first_air_date ||
                item.original_name
                    ? 'tv'
                    : 'movie'
            );

        var key = item.id + '_' + type;

        return Boolean(restricted[key]);
    }

    function hasBlockedCountry(item) {
        var countries = item.origin_country;

        if (Array.isArray(countries)) {
            for (var i = 0; i < countries.length; i++) {
                var originCode =
                    string(countries[i]).toUpperCase();

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

        /*
         * Удаляем контент, который ByLampa сама
         * помечает встроенным списком ограничений.
         */
        if (isRestrictedContent(item)) {
            return true;
        }

        var localizedTitle = string(
            item.title || item.name
        );

        /*
         * Оставляем только карточки с названием
         * на кириллице.
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
            BLOCKED_SCRIPT_RE.test(
                string(item.original_title)
            ) ||
            BLOCKED_SCRIPT_RE.test(
                string(item.original_name)
            )
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

    function getItemKey(item) {
        if (!item || typeof item !== 'object') {
            return '';
        }

        var mediaType =
            item.media_type ||
            (
                item.original_name ||
                item.first_air_date
                    ? 'tv'
                    : 'movie'
            );

        if (
            item.id !== undefined &&
            item.id !== null
        ) {
            return mediaType + ':' + item.id;
        }

        return [
            mediaType,
            string(
                item.original_title ||
                item.original_name ||
                item.title ||
                item.name
            ).toLowerCase(),
            string(
                item.release_date ||
                item.first_air_date
            )
        ].join(':');
    }

    function getPage(params) {
        if (!params || typeof params !== 'object') {
            return 1;
        }

        var directPage = Number(params.page);

        if (directPage > 0) {
            return directPage;
        }

        var url = string(params.url);
        var match = url.match(/[?&]page=(\d+)/i);

        return match ? Number(match[1]) : 1;
    }

    function getCatalogKey(params) {
        if (!params || typeof params !== 'object') {
            return 'default';
        }

        var url = string(params.url)
            .replace(
                /([?&])page=\d+(&?)/i,
                function (_, prefix, suffix) {
                    if (prefix === '?' && suffix) {
                        return '?';
                    }

                    return suffix ? prefix : '';
                }
            )
            .replace(/[?&]$/, '');

        return [
            url,
            string(params.genres),
            string(params.keywords),
            string(params.sort_by),
            string(params.year),
            string(params.query)
        ].join('|');
    }

    function getCatalogState(params) {
        var key = getCatalogKey(params);
        var page = getPage(params);
        var now = Date.now();
        var state = catalogStates[key];

        if (!state) {
            state = catalogStates[key] = {
                seen: Object.create(null),
                lastFirstPage: 0,
                touched: now
            };
        }

        /*
         * При новом открытии каталога сбрасываем
         * список ранее показанных карточек.
         */
        if (
            page === 1 &&
            now - state.lastFirstPage > 3000
        ) {
            state.seen = Object.create(null);
            state.lastFirstPage = now;
        }

        state.touched = now;

        return state;
    }

    function filterResponse(data, params) {
        if (
            !data ||
            typeof data !== 'object' ||
            !Array.isArray(data.results)
        ) {
            return data;
        }

        var state = getCatalogState(params);
        var filtered = [];

        for (var i = 0; i < data.results.length; i++) {
            var item = data.results[i];

            if (shouldBlock(item)) {
                continue;
            }

            var key = getItemKey(item);

            if (key && state.seen[key]) {
                continue;
            }

            if (key) {
                state.seen[key] = true;
            }

            filtered.push(item);
        }

        data.results = filtered;

        return data;
    }

    function cleanupOldStates() {
        var now = Date.now();
        var keys = Object.keys(catalogStates);

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];

            if (
                now - catalogStates[key].touched >
                30 * 60 * 1000
            ) {
                delete catalogStates[key];
            }
        }
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

        source.list = function (
            params,
            oncomplete,
            onerror
        ) {
            var filteredComplete =
                typeof oncomplete === 'function'
                    ? function (data) {
                        cleanupOldStates();

                        oncomplete(
                            filterResponse(data, params)
                        );
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
         * Фильтруем только большую сетку каталога.
         * DOM, main() и category() не изменяем.
         */
        patchList(source);
    }

    init();
})();
