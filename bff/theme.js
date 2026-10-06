// Demo plumbing - not part of what this app teaches, and not a pattern to copy.
//
// This lets one demo codebase look different per tenant without a CMS, by
// reading colours and a font from a hidden product in the PIM. In a real
// storefront, brand styling belongs in the frontend code or in a CMS: the PIM
// holds products, and a product that exists only to carry settings has to be
// kept out of listings, search, feeds and exports by convention.
//
// Nothing else depends on it. Without a theme product, the storefront shows
// its default style, so this file can be skipped when reading the BFF.
//
// Why a product: the application itself has a Description field, but
// GetApplication does not return it (only the Management and Query APIs do),
// and a storefront BFF should not carry admin credentials to read a colour.

const cache = require('memory-cache');
const fs = require('fs');
const path = require('path');

// Handed over from index.js by registerTheme at the bottom of this file.
let apiConfig, fetchData, readJson, useMockData, cacheDuration, dataDir;

// The theme product is set up like this in Norce:
//   - PartNo npv-theme-<applicationId>. PartNo lookups are client wide, not per
//     application, so the application id in the name is what keeps two
//     storefronts on the same client apart. THEME_PARTNO overrides it.
//   - Status 4 (Hidden) with the status locked. Every list, filter and search
//     call in this BFF passes statusSeed 1,3, so a Hidden product never shows
//     up in the storefront. The lock matters: with the client setting
//     SkuStatusHiddenIfNoImage on, the status job flips Hidden to Active as
//     soon as the product gets an image - and the logo is its image.
//   - No price on the application's price lists. The list procedures only
//     return products with a price, so this keeps it out of listings even for
//     a caller that passes no statusSeed at all (the default, 1,2,3,4,5,
//     includes Hidden).
//   - A category of its own ("Storefront settings"), shared by every theme
//     product on the client and placed outside the CATEGORY_SEED tree so it
//     never shows in navigation. All theme_* parametrics must be linked to it:
//     with a primary category, the Product Service only returns parametrics
//     that are public or linked to that category, and an unlinked theme value
//     silently vanishes.
//   - Type 7 (Download): not deliverable, so no freight and no stock handling
//     if it ever ends up in a basket.
//
// Hidden is a storefront convention, not something the API enforces: a
// storefront that lists with the default statusSeed would show the product if
// it had a price.
//
// Set in registerTheme, once the application id is known.
let themePartNo;

// Only these fonts can be chosen. The frontend loads them from Google Fonts,
// and a whitelist keeps PIM data from injecting anything into a stylesheet.
const themeFonts = ['Inter', 'Montserrat', 'Raleway', 'Oswald', 'Playfair Display', 'Lora', 'Roboto Slab', 'Pacifico', 'Racing Sans One', 'Bebas Neue', 'Space Grotesk'];
const hexColor = /^#[0-9a-f]{6}$/i;

// Parametrics are matched on Code, which is the same in every culture. Name
// is translated and would break the theme in any culture but the one it was
// written in. The value is read from Value2, not Value: Value is Value2 plus
// the parametric's unit, so a unit set by mistake would turn "#0b5d4b" into
// "#0b5d4b px". Booleans come back as "True"/"False" in every culture.
function themeValues(product) {
    const values = {};
    for (const parametric of product?.Parametrics ?? []) {
        if (parametric.Code) values[parametric.Code] = parametric.Value2?.trim();
    }
    return values;
}

// Anything that fails validation is dropped, and the frontend falls back to
// its default style for that value.
function shapeTheme(product) {
    if (!product?.Id) return {};

    const values = themeValues(product);
    const theme = {};
    if (hexColor.test(values.theme_primary_color ?? '')) {
        theme.PrimaryColor = values.theme_primary_color;
    }
    if (hexColor.test(values.theme_accent_color ?? '')) {
        theme.AccentColor = values.theme_accent_color;
    }
    if (themeFonts.includes(values.theme_logo_font)) {
        theme.LogoFont = values.theme_logo_font;
    }
    if (product.ImageKey) {
        theme.LogoImageKey = product.ImageKey;
    }
    return theme;
}

// Reads the theme product, optionally in one culture. A PartNo that does not
// exist is not an error: Norce answers 200 with an empty body, and shapeTheme
// turns that into "no theme". A 404 is treated the same way in case another
// service version answers with one.
//
// statusSeed 4,5 rather than just 4: the theme product has no price, and the
// Product Service drops a SKU without a price unless the seed contains 5. The
// product then comes back with StatusId 5 and IsBuyable false - that is the
// service rewriting it, not the status in the PIM.
async function readThemeProduct(cultureCode) {
    const queryParams = new URLSearchParams({
        format: 'json',
        partNo: themePartNo,
        statusSeed: '4,5',
        ...(cultureCode && { cultureCode })
    }).toString();

    const url = `${apiConfig.api_base}${apiConfig.product_service}/GetProductByPartNo?${queryParams}`;
    try {
        // fetchData stores an empty answer too, but its cache check is a
        // truthiness test, so an empty answer never counts as a hit and Norce
        // is asked again. That is why loadTheme caches the shaped theme,
        // including "no theme".
        return await fetchData(url, `theme_product_${cultureCode ?? 'default'}`);
    } catch (error) {
        if (error.response?.status === 404) return null;
        throw error;
    }
}

// One theme for every culture, unless the theme product opts in.
//
// A text parametric has a default value plus an optional value per culture,
// and Norce returns the culture's value when there is one. Reading the theme
// in the visitor's culture would therefore let a single value typed into the
// Norwegian culture give Norway a different colour without anyone meaning to.
// So the theme is read without a culture - Norce then answers in the
// application's default culture - and only a theme product with the boolean
// theme_per_culture set to true is read again in the visitor's culture. The
// flag itself is always taken from the culture-less read, so it cannot differ
// per culture.
//
// Separate markets are often separate applications, and those already get a
// theme each through the PartNo. This is for several cultures in one
// application.
//
// The shaped theme is cached, not the raw response, so a missing theme product
// is cached too instead of asking Norce again on every page load. A failed
// call is not cached and is retried on the next load.
//
// A culture's theme is built on top of the base theme, and a culture read
// also carries the default values for everything the culture does not set.
// So a culture entry remembers which base it was built on (baseVersion), and is
// read again - past fetchData's raw cache too - once the base has been
// refreshed. Otherwise an edit to the default would reach the default culture
// an hour before it reached the others.
// A counter rather than a timestamp: two reads in the same millisecond would
// otherwise look like the same base.
let baseVersion = 0;

async function loadTheme(cultureCode) {
    let base = cache.get('theme');
    if (!base) {
        const product = await readThemeProduct();
        base = {
            theme: shapeTheme(product),
            perCulture: themeValues(product).theme_per_culture === 'True',
            version: ++baseVersion
        };
        if (!Object.keys(base.theme).length) {
            console.log(`[THEME] No theme values on ${themePartNo}; using the default style.`);
        }
        cache.put('theme', base, cacheDuration);
    }

    if (!base.perCulture || !cultureCode) return base.theme;

    const cacheKey = `theme_${cultureCode}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.baseVersion === base.version) return cached.theme;

    // Built on an older base, or never read: drop the raw response too, so the
    // read below asks Norce instead of fetchData's cache.
    if (cached) cache.del(`theme_product_${cultureCode}`);

    // Values that are missing or invalid in this culture keep the default
    // culture's value rather than dropping to the default style.
    let theme;
    try {
        theme = { ...base.theme, ...shapeTheme(await readThemeProduct(cultureCode)) };
    } catch (error) {
        console.warn(`[THEME] Could not read ${themePartNo} in ${cultureCode}; using the default culture's theme.`, error.message);
        return base.theme;
    }
    cache.put(cacheKey, { theme, baseVersion: base.version }, cacheDuration);
    return theme;
}

module.exports = function registerTheme(app, deps) {
    ({ apiConfig, fetchData, readJson, useMockData, cacheDuration, dataDir } = deps);
    themePartNo = process.env.THEME_PARTNO
        || (apiConfig.application_id && `npv-theme-${apiConfig.application_id}`);

    app.get('/api/theme', async (req, res) => {
        if (useMockData) {
            // Refreshing the mock from fetch.http against an application with
            // no theme product saves Norce's empty 200 body as an empty file.
            // That is "no theme", as it is in live mode, not broken mock data.
            // A missing file is left to readJson, which reports it.
            let raw = null;
            try { raw = fs.readFileSync(path.join(dataDir, 'theme.json'), 'utf8'); } catch { }
            if (raw !== null && !raw.trim()) {
                res.json({});
                return;
            }
            const data = readJson('theme.json', res);
            if (data) {
                res.json(shapeTheme(data));
            }
            return;
        }

        // Culture codes only, so a made-up value cannot grow the cache.
        const { culture } = req.query;
        const cultureCode = /^[a-z]{2}(-[a-z]{2})?$/i.test(culture ?? '') ? culture : null;

        // The theme is decoration. If it cannot be read, the storefront shows its
        // default style instead of failing - but the log says why.
        try {
            res.json(await loadTheme(cultureCode));
        } catch (error) {
            console.warn(`[THEME] Could not read ${themePartNo}; using the default style.`, error.message);
            res.json({});
        }
    });
};
