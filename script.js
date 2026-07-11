/* No Anime TMDB — Version 2.3.1 */

(function () {
    'use strict';

    var GLOBAL_FLAG = '__NO_ANIME_TMDB_ACTIVE__';

    if (window[GLOBAL_FLAG]) {
        return;
    }

    window[GLOBAL_FLAG] = true;

    /*
     * Заблокированные языки:
     * Япония, Южная Корея, Индия, Таиланд.
     */
    var BLOCKED_LANGUAGES = createLookup([
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
    ]);

    /*
     * Заблокированные страны:
     * Япония, Южная Корея, Индия, Таиланд.
     */
    var BLOCKED_COUNTRIES = createLookup([
        'JP',
        'KR',
        'IN',
        'TH'
    ]);

    var CYRILLIC_PATTERN = /[А-ЯЁа-яё]/;

    var BLOCKED_SCRIPT_PATTERN =
        /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u0900-\u097f\u0980-\u09ff\u0a00-\u0a7f\u0b80-\u0bff\u0c00-\u0c7f\u0c80-\u0cff\u0d00-\u0d7f\u0e00-\u0e7f]/;

    var ANIME_PATTERN =
        /(?:^|[^a-zа-яё])(?:anime|аниме|manga|манга|shonen|shounen|seinen|isekai|otaku|anilibria|crunchyroll)(?:$|[^a-zа-яё])/i;

    /*
     * Хранилище показанных карточек для больших каталогов.
     * Необходимо для удаления дублей между страницами.
     */
    var catalogStates = Object.create(null);

    var lastStatesCleanup = 0;

    var STATE_LIFETIME = 30 * 60 * 1000;
    var CLEANUP_INTERVAL = 5 * 60 * 1000;
    var FIRST_PAGE_RESET_DELAY = 3000;

    function createLookup(values) {
        var lookup = Object.create(null);

        for (var i = 0; i < values.length; i++) {
            lookup[values[i]] = true;
        }

        return lookup;
    }

    function toText(value) {
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

    function getRestrictedContentMap() {
        var settings = window.lampa_settings;

        return settings &&
            settings.lgbt &&
            typeof settings.lgbt === 'object'
                ? settings.lgbt
                : null;
    }

    function isRestrictedContent(item, restrictedMap) {
        if (
            !restrictedMap ||
            item.id == null
        ) {
            return false;
        }

        var key =
            item.id +
            '_' +
            getMediaType(item);

        return Boolean(restrictedMap[key]);
    }

    function hasBlockedLanguage(item) {
        var language = item.original_language;

        if (!language) {
            return false;
        }

        return Boolean(
            BLOCKED_LANGUAGES[
                toText(language).toLowerCase()
            ]
        );
    }

    function hasBlockedCountry(item) {
        var countries = item.origin_country;
        var i;

        if (Array.isArray(countries)) {
            for (i = 0; i < countries.length; i++) {
                if (
                    BLOCKED_COUNTRIES[
                        toText(countries[i]).toUpperCase()
                    ]
                ) {
                    return true;
                }
            }
        }

        countries = item.production_countries;

        if (!Array.isArray(countries)) {
            return false;
        }

        for (i = 0; i < countries.length; i++) {
            var country = countries[i] || {};

            var code =
                country.iso_3166_1 ||
                country.code ||
                country.name;

            if (
                BLOCKED_COUNTRIES[
                    toText(code).toUpperCase()
                ]
            ) {
                return true;
            }
        }

        return false;
    }

    function hasBlockedOriginalScript(item) {
        var originalTitle =
            item.original_title ||
            item.original_name;

        return originalTitle
            ? BLOCKED_SCRIPT_PATTERN.test(originalTitle)
            : false;
    }

    function hasAnimeKeywords(item, localizedTitle) {
        var originalTitle =
            item.original_title ||
            item.original_name ||
            '';

        var overview = item.overview || '';

        return ANIME_PATTERN.test(
            localizedTitle +
            ' ' +
            originalTitle +
            ' ' +
            overview
        );
    }

    function shouldBlock(item, restrictedMap) {
        if (
            !item ||
            typeof item !== 'object'
        ) {
            return false;
        }

        /*
         * Встроенный список ограниченного контента ByLampa.
         */
        if (
            isRestrictedContent(
                item,
                restrictedMap
            )
        ) {
            return true;
        }

        /*
         * Оставляем только карточки с названием на кириллице.
         */
        var localizedTitle =
            item.title ||
            item.name ||
            '';

        if (
            !localizedTitle ||
            !CYRILLIC_PATTERN.test(localizedTitle)
        ) {
            return true;
        }

        /*
         * Быстрые проверки выполняются раньше текстовых.
         */
        if (hasBlockedLanguage(item)) {
            return true;
        }

        if (hasBlockedCountry(item)) {
            return true;
        }

        if (hasBlockedOriginalScript(item)) {
            return true;
        }

        /*
         * Самая затратная проверка выполняется последней.
         */
        return hasAnimeKeywords(
            item,
            localizedTitle
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

        var title =
            item.original_title ||
            item.original_name ||
            item.title ||
            item.name ||
            '';

        var date =
            item.release_date ||
            item.first_air_date ||
            '';

        return (
            type +
            ':' +
            toText(title).toLowerCase() +
            ':' +
            toText(date)
        );
    }

    /*
     * Общая функция фильтрации.
     *
     * seen:
     * - для горизонтального блока создаётся новый объект;
     * - для полного каталога хранится между страницами.
     */
    function filterItems(items, seen) {
        if (!Array.isArray(items)) {
            return items;
        }

        var restrictedMap =
            getRestrictedContentMap();

        var result = [];

        for (var i = 0; i < items.length; i++) {
            var item = items[i];

            if (
                shouldBlock(
                    item,
                    restrictedMap
                )
            ) {
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

        return result;
    }

    /*
     * Фильтрация горизонтального блока.
     * Дубли отслеживаются только внутри текущего блока.
     */
    function filterRowResponse(data) {
        if (
            !data ||
            typeof data !== 'object' ||
            !Array.isArray(data.results)
        ) {
            return data;
        }

        data.results = filterItems(
            data.results,
            Object.create(null)
        );

        return data;
    }

    function getPage(params) {
        if (!params) {
            return 1;
        }

        var page = Number(params.page);

        if (page > 0) {
            return page;
        }

        var match = toText(params.url).match(
            /[?&]page=(\d+)/i
        );

        return match
            ? Number(match[1])
            : 1;
    }

    function removePageParameter(url) {
        return toText(url)
            .replace(
                /([?&])page=\d+(&?)/i,
                function (_, prefix, suffix) {
                    if (
                        prefix === '?' &&
                        suffix
                    ) {
                        return '?';
                    }

                    return suffix
                        ? prefix
                        : '';
                }
            )
            .replace(/[?&]$/, '');
    }

    function getCatalogKey(params) {
        params = params || {};

        return [
            removePageParameter(params.url),
            toText(params.genres),
            toText(params.keywords),
            toText(params.sort_by),
            toText(params.year),
            toText(params.query)
        ].join('|');
    }

    function getCatalogState(params) {
        var key = getCatalogKey(params);
        var page = getPage(params);
        var now = Date.now();
        var state = catalogStates[key];

        if (!state) {
            state = {
                seen: Object.create(null),
                firstPageTime: 0,
                touched: now
            };

            catalogStates[key] = state;
        }

        /*
         * Сбрасываем список дублей при новом открытии каталога.
         * Повторные запросы первой страницы в течение трёх секунд
         * считаются частью одного открытия.
         */
        if (
            page === 1 &&
            now - state.firstPageTime >
                FIRST_PAGE_RESET_DELAY
        ) {
            state.seen = Object.create(null);
            state.firstPageTime = now;
        }

        state.touched = now;

        return state;
    }

    function cleanupCatalogStates() {
        var now = Date.now();

        if (
            now - lastStatesCleanup <
            CLEANUP_INTERVAL
        ) {
            return;
        }

        lastStatesCleanup = now;

        var keys = Object.keys(catalogStates);

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var state = catalogStates[key];

            if (
                now - state.touched >
                STATE_LIFETIME
            ) {
                delete catalogStates[key];
            }
        }
    }

    /*
     * Фильтрация полного каталога.
     * Один список seen используется для всех страниц каталога.
     */
    function filterCatalogResponse(data, params) {
        if (
            !data ||
            typeof data !== 'object' ||
            !Array.isArray(data.results)
        ) {
            return data;
        }

        cleanupCatalogStates();

        var state = getCatalogState(params);

        data.results = filterItems(
            data.results,
            state.seen
        );

        return data;
    }

    function patchList(tmdbSource) {
        var originalList = tmdbSource.list;

        if (
            typeof originalList !== 'function' ||
            originalList.__noAnimePatched
        ) {
            return;
        }

        function patchedList(
            params,
            oncomplete,
            onerror
        ) {
            var callback = oncomplete;

            if (typeof oncomplete === 'function') {
                callback = function () {
                    var args =
                        Array.prototype.slice.call(
                            arguments
                        );

                    args[0] = filterCatalogResponse(
                        args[0],
                        params
                    );

                    return oncomplete.apply(
                        this,
                        args
                    );
                };
            }

            return originalList.call(
                this,
                params,
                callback,
                onerror
            );
        }

        patchedList.__noAnimePatched = true;
        tmdbSource.list = patchedList;
    }

    function wrapPart(part) {
        if (
            typeof part !== 'function' ||
            part.__noAnimeWrapped
        ) {
            return part;
        }

        function wrappedPart() {
            var args =
                Array.prototype.slice.call(
                    arguments
                );

            var callback = args[0];

            if (typeof callback === 'function') {
                args[0] = function () {
                    var callbackArgs =
                        Array.prototype.slice.call(
                            arguments
                        );

                    callbackArgs[0] =
                        filterRowResponse(
                            callbackArgs[0]
                        );

                    return callback.apply(
                        this,
                        callbackArgs
                    );
                };
            }

            return part.apply(this, args);
        }

        wrappedPart.__noAnimeWrapped = true;

        return wrappedPart;
    }

    /*
     * Вертикальные страницы состоят из горизонтальных блоков,
     * которые загружаются через Api.partNext().
     */
    function patchPartNext(api) {
        var originalPartNext = api.partNext;

        if (
            typeof originalPartNext !== 'function' ||
            originalPartNext.__noAnimePatched
        ) {
            return;
        }

        function patchedPartNext(
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
        }

        patchedPartNext.__noAnimePatched = true;
        api.partNext = patchedPartNext;
    }

    function initialize() {
        var lampa = window.Lampa;

        if (
            !lampa ||
            !lampa.Api ||
            !lampa.Api.sources ||
            !lampa.Api.sources.tmdb
        ) {
            setTimeout(initialize, 200);
            return;
        }

        patchList(
            lampa.Api.sources.tmdb
        );

        patchPartNext(
            lampa.Api
        );
    }

    initialize();
})();
