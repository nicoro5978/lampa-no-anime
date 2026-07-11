/* No Anime TMDB — Version 2.3.0 */

(function () {
    'use strict';

    if (window.__NO_ANIME_TMDB_ACTIVE__) {
        return;
    }

    window.__NO_ANIME_TMDB_ACTIVE__ = true;

    var BLOCK_LANGUAGES = Object.create(null);
    var BLOCK_COUNTRIES = Object.create(null);

    [
        'ja',
        'ko',
        'hi',
        'te',
        'ta',
        'ml',
        'kn',
        'bn',
        'mr',
        'pa',
        'ur',
        'th'
    ].forEach(function (code) {
        BLOCK_LANGUAGES[code] = true;
    });

    [
        'JP',
        'KR',
        'IN',
        'TH'
    ].forEach(function (code) {
        BLOCK_COUNTRIES[code] = true;
    });

    var CYRILLIC_RE = /[А-ЯЁа-яё]/;

    var BLOCKED_SCRIPT_RE =
        /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u0900-\u097f\u0980-\u09ff\u0a00-\u0a7f\u0b80-\u0bff\u0c00-\u0c7f\u0c80-\u0cff\u0d00-\u0d7f\u0e00-\u0e7f]/;

    var ANIME_RE =
        /(?:^|[^a-zа-яё])(?:anime|аниме|manga|манга|shonen|shounen|seinen|isekai|otaku|anilibria|crunchyroll)(?:$|[^a-zа-яё])/i;

    /*
     * Состояние используется только для большого каталога,
     * чтобы удалять дубли между подгружаемыми страницами.
     */
    var catalogStates = Object.create(null);

    function toString(value) {
        return value == null ? '' : String(value);
    }

    function getMediaType(item) {
        if (item.media_type) {
            return item.media_type;
        }

        return (
            item.first_air_date ||
            item.original_name
        ) ? 'tv' : 'movie';
    }

    function isRestrictedContent(item) {
        if (
            !item ||
            item.id == null
        ) {
            return false;
        }

        var settings =
            window.lampa_settings &&
            window.lampa_settings.lgbt;

        if (
            !settings ||
            typeof settings !== 'object'
        ) {
            return false;
        }

        var key =
            item.id + '_' + getMediaType(item);

        return Boolean(settings[key]);
    }

    function hasBlockedCountry(item) {
        var countries = item.origin_country;
        var i;

        if (Array.isArray(countries)) {
            for (i = 0; i < countries.length; i++) {
                if (
                    BLOCK_COUNTRIES[
                        toString(countries[i]).toUpperCase()
                    ]
                ) {
                    return true;
                }
            }
        }

        countries = item.production_countries;

        if (Array.isArray(countries)) {
            for (i = 0; i < countries.length; i++) {
                var country = countries[i] || {};

                var code = toString(
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

    function shouldBlock(item) {
        if (
            !item ||
            typeof item !== 'object'
        ) {
            return false;
        }

        /*
         * Встроенный список ограниченного контента ByLampa.
         */
        if (isRestrictedContent(item)) {
            return true;
        }

        /*
         * Оставляем только локализованные названия
         * с кириллицей.
         */
        var title = item.title || item.name || '';

        if (!CYRILLIC_RE.test(title)) {
            return true;
        }

        var language = toString(
            item.original_language
        ).toLowerCase();

        if (BLOCK_LANGUAGES[language]) {
            return true;
        }

        if (hasBlockedCountry(item)) {
            return true;
        }

        var originalTitle =
            item.original_title ||
            item.original_name ||
            '';

        if (BLOCKED_SCRIPT_RE.test(originalTitle)) {
            return true;
        }

        /*
         * Проверку описания выполняем последней,
         * так как она самая затратная.
         */
        return ANIME_RE.test(
            title + ' ' +
            originalTitle + ' ' +
            toString(item.overview)
        );
    }

    function getItemKey(item) {
        if (
            !item ||
            typeof item !== 'object'
        ) {
            return '';
        }

        var type = getMediaType(item);

        if (item.id != null) {
            return type + ':' + item.id;
        }

        return [
            type,
            toString(
                item.original_title ||
                item.original_name ||
                item.title ||
                item.name
            ).toLowerCase(),
            toString(
                item.release_date ||
                item.first_air_date
            )
        ].join(':');
    }

    /*
     * Фильтрация одного горизонтального блока.
     * Дубли удаляются только внутри этого блока.
     */
    function filterRowResults(data) {
        if (
            !data ||
            typeof data !== 'object' ||
            !Array.isArray(data.results)
        ) {
            return data;
        }

        var source = data.results;
        var result = [];
        var seen = Object.create(null);

        for (var i = 0; i < source.length; i++) {
            var item = source[i];

            if (shouldBlock(item)) {
                continue;
            }

            var key = getItemKey(item);

            if (key && seen[key]) {
                continue;
            }

            if (key) {
                seen[key] = true;
            }

            result.push(item);
        }

        data.results = result;

        return data;
    }

    function getPage(params) {
        if (
            params &&
            Number(params.page) > 0
        ) {
            return Number(params.page);
        }

        var url = toString(
            params && params.url
        );

        var match = url.match(
            /[?&]page=(\d+)/i
        );

        return match ? Number(match[1]) : 1;
    }

    function removePageFromUrl(url) {
        return toString(url)
            .replace(
                /([?&])page=\d+(&?)/i,
                function (_, prefix, suffix) {
                    if (
                        prefix === '?' &&
                        suffix
                    ) {
                        return '?';
                    }

                    return suffix ? prefix : '';
                }
            )
            .replace(/[?&]$/, '');
    }

    function getCatalogKey(params) {
        params = params || {};

        return [
            removePageFromUrl(params.url),
            toString(params.genres),
            toString(params.keywords),
            toString(params.sort_by),
            toString(params.year),
            toString(params.query)
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
                firstPageTime: 0,
                touched: now
            };
        }

        /*
         * Новое открытие первой страницы каталога.
         */
        if (
            page === 1 &&
            now - state.firstPageTime > 3000
        ) {
            state.seen = Object.create(null);
            state.firstPageTime = now;
        }

        state.touched = now;

        return state;
    }

    /*
     * Фильтрация большого каталога.
     * Дубли удаляются между всеми его страницами.
     */
    function filterCatalogResults(
        data,
        params
    ) {
        if (
            !data ||
            typeof data !== 'object' ||
            !Array.isArray(data.results)
        ) {
            return data;
        }

        var source = data.results;
        var result = [];
        var state = getCatalogState(params);

        for (var i = 0; i < source.length; i++) {
            var item = source[i];

            if (shouldBlock(item)) {
                continue;
            }

            var key = getItemKey(item);

            if (
                key &&
                state.seen[key]
            ) {
                continue;
            }

            if (key) {
                state.seen[key] = true;
            }

            result.push(item);
        }

        data.results = result;

        return data;
    }

    function cleanupCatalogStates() {
        var now = Date.now();
        var keys = Object.keys(catalogStates);

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];

            if (
                now -
                catalogStates[key].touched >
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
            source.list.__noAnimePatched
        ) {
            return;
        }

        var originalList = source.list;

        source.list = function (
            params,
            oncomplete,
            onerror
        ) {
            var callback = oncomplete;

            if (typeof callback === 'function') {
                callback = function (data) {
                    cleanupCatalogStates();

                    oncomplete(
                        filterCatalogResults(
                            data,
                            params
                        )
                    );
                };
            }

            return originalList.call(
                this,
                params,
                callback,
                onerror
            );
        };

        source.list.__noAnimePatched = true;
    }

    function wrapPart(part) {
        if (
            typeof part !== 'function' ||
            part.__noAnimePartWrapped
        ) {
            return part;
        }

        var wrapped = function () {
            var args =
                Array.prototype.slice.call(
                    arguments
                );

            var callback = args[0];

            if (typeof callback === 'function') {
                args[0] = function (data) {
                    return callback(
                        filterRowResults(data)
                    );
                };
            }

            return part.apply(this, args);
        };

        wrapped.__noAnimePartWrapped = true;

        return wrapped;
    }

    /*
     * Api.partNext загружает вертикально расположенные
     * горизонтальные блоки main/category.
     *
     * Мы фильтруем данные каждой части до создания карточек,
     * не вмешиваясь в main() и category().
     */
    function patchPartNext(api) {
        if (
            !api ||
            typeof api.partNext !== 'function' ||
            api.partNext.__noAnimePatched
        ) {
            return;
        }

        var originalPartNext = api.partNext;

        api.partNext = function (
            parts,
            limit,
            partLoaded,
            partEmpty
        ) {
            if (Array.isArray(parts)) {
                for (
                    var i = 0;
                    i < parts.length;
                    i++
                ) {
                    parts[i] = wrapPart(parts[i]);
                }
            }

            return originalPartNext.call(
                this,
                parts,
                limit,
                partLoaded,
                partEmpty
            );
        };

        api.partNext.__noAnimePatched = true;
    }

    function init() {
        var lampa = window.Lampa;

        if (
            !lampa ||
            !lampa.Api ||
            !lampa.Api.sources ||
            !lampa.Api.sources.tmdb
        ) {
            setTimeout(init, 200);
            return;
        }

        patchList(
            lampa.Api.sources.tmdb
        );

        patchPartNext(
            lampa.Api
        );
    }

    init();
})();
