// BFF (Backend-for-Frontend) for the Norce Academy Storefront demo.
// Proxies Norce Commerce API calls, handles OAuth2 authentication,
// and caches responses. Serves the local JSON fixtures in /mockdata only when
// MOCK_DATA=true; incomplete live configuration is a startup error rather than
// a quiet fall back to fixtures of another tenant.

// dotenv-expand lets .env reference other environment variables, e.g.
//   OAUTH_ID="${MY_CLIENT_ID}"
// so credentials can live in the shell or a secret manager and never be
// written into a file in the repo. Plain dotenv does not expand on its own.
require('dotenv-expand').expand(require('dotenv').config());
const express = require('express');
const cache = require('memory-cache');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const logRequests = process.env.LOG_REQUESTS !== 'false';
// Log every incoming request
if (logRequests) {
    app.use((req, res, next) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
        next();
    });
}
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 3000;
const cacheDuration = 3600 * 1000; // 1 hour

const apiConfig = {
    api_base: process.env.API_BASE,
    identity_path: process.env.IDENTITY_PATH || "/identity/1.0/connect/token",
    product_service: process.env.PRODUCT_SERVICE || "/commerce/product/1.1",
    metadata_service: process.env.METADATA_SERVICE || "/commerce/metadata/1.1",
    oauth_scope: process.env.OAUTH_SCOPE || "playground",
    // No default: 1042 is the Norce Open Demo application. Pointing the site at
    // another tenant while silently keeping NOD's id gives confusing empty
    // results instead of a clear error.
    application_id: process.env.APPLICATION_ID,
    // Root category that the product list and filters are scoped to.
    category_seed: process.env.CATEGORY_SEED,
    oauth_id: process.env.OAUTH_ID,
    oauth_secret: process.env.OAUTH_SECRET,
};


// Mock mode is asked for, never fallen into. Missing credentials used to send
// the BFF here silently, which meant `run.ps1 -a <id>` served the Norce Open
// Demo fixtures instead of the application that was asked for - a working
// storefront showing the wrong tenant, which is worse than an error.
const useMockData = process.env.MOCK_DATA === 'true';

if (useMockData) {
    console.log('BFF is running in mock data mode (MOCK_DATA=true).');
    console.log('Product data is served from /mockdata, which is a capture of Norce Open Demo.');
    if (apiConfig.application_id && apiConfig.application_id !== '1042') {
        console.log(`[CONFIG] APPLICATION_ID is ${apiConfig.application_id}, but mock mode does not call Norce, so it has no effect.`);
    }
} else {
    const missing = [
        ['API_BASE', apiConfig.api_base],
        ['OAUTH_ID', apiConfig.oauth_id],
        ['OAUTH_SECRET', apiConfig.oauth_secret],
        ['APPLICATION_ID', apiConfig.application_id],
        ['CATEGORY_SEED', apiConfig.category_seed]
    ].filter((entry) => !entry[1]).map((entry) => entry[0]);

    if (missing.length) {
        console.error('='.repeat(70));
        console.error('[CONFIG] Live mode, but the configuration is incomplete.');
        console.error(`[CONFIG] Not set: ${missing.join(', ')}`);
        if (apiConfig.application_id) {
            console.error(`[CONFIG] APPLICATION_ID ${apiConfig.application_id} says which tenant to read, but not`);
            console.error('[CONFIG] where to reach it or with what credentials. It cannot stand in for the rest.');
        }
        console.error('[CONFIG] Copy bff/.env.example to bff/.env and fill it in, or set MOCK_DATA=true');
        console.error('[CONFIG] to work from the fixtures on purpose.');
        console.error('='.repeat(70));
        process.exit(1);
    }

    console.log(`[CONFIG] Live mode: application ${apiConfig.application_id}, root category ${apiConfig.category_seed}, ${apiConfig.api_base}`);
}

const dataDir = path.join(__dirname, '../mockdata');
function readJson(fileName, res) {
    try {
        const filePath = path.join(dataDir, fileName);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error(`Error reading mock data file ${fileName}:`, error);
        res.status(500).json({ error: 'Mock data not available' });
        return null;
    }
}


async function getAuthToken() {
    const cachedToken = cache.get('authToken');
    if (cachedToken) {
        return cachedToken;
    }

    const tokenUrl = `${apiConfig.api_base}${apiConfig.identity_path}`;
    const credentials = new URLSearchParams();
    credentials.append('grant_type', 'client_credentials');
    credentials.append('client_id', apiConfig.oauth_id);
    credentials.append('client_secret', apiConfig.oauth_secret);
    credentials.append('scope', apiConfig.oauth_scope);

    try {
        const response = await axios.post(tokenUrl, credentials, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const token = response.data.access_token;
        cache.put('authToken', token, response.data.expires_in * 1000);
        return token;
    } catch (error) {
        console.error('Failed to fetch auth token:', error);
        throw new Error('Failed to authenticate with the API');
    }
}

async function fetchData(url, cacheKey) {
    if (!apiConfig.api_base) {
        console.error('ERROR: apiConfig.api_base is undefined. Cannot fetch data from external API.');
        throw new Error('API_BASE is not configured. Please check your .env file.');
    }

    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        console.log(`[CACHE HIT] Key: ${cacheKey}`);
        return cachedData;
    }

    try {
        const token = await getAuthToken();
        console.log(`[NORCE REQUEST] URL: ${url}`);

        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'applicationId': apiConfig.application_id
            }
        });

        cache.put(cacheKey, response.data, cacheDuration);
        return response.data;
    } catch (error) {
        console.error(`[NORCE ERROR] Failed to fetch data from ${url}:`, error.message);
        throw error;
    }
}

// Norce Product Service — fetch a single product by its unique name (slug)
app.get('/api/product/:uniqueName', async (req, res) => {
    if (useMockData) {
        const data = readJson('product.json', res);
        if (data) {
            res.json(data);
        }
        return;
    }

    const { uniqueName } = req.params;
    const { culture } = req.query;

    const queryParams = new URLSearchParams({
        format: 'json',
        uniqueName: uniqueName,
        statusSeed: '1,3',                          // Active (1) + Coming Soon (3)
        ...(culture && { cultureCode: culture }),    // Norce uses cultureCode for localized responses
    }).toString();

    const url = `${apiConfig.api_base}${apiConfig.product_service}/GetProductByUniqueName?${queryParams}`;
    const cacheKey = `product_${uniqueName}_${culture}`;

    try {
        const productData = await fetchData(url, cacheKey);
        res.json(productData);
    } catch (error) {
        if (error.response && error.response.status === 404) {
            res.status(404).json({ error: 'Product not found' });
        } else {
            res.status(500).json({ error: 'Failed to fetch product data' });
        }
    }
});

// Norce Product Service — fetch related products (accessories, alternatives, etc.)
app.get('/api/relations/:productId', async (req, res) => {
    if (useMockData) {
        const data = readJson('relations.json', res);
        if (data) {
            res.json(data);
        }
        return;
    }

    const { productId } = req.params;
    const { culture } = req.query;

    const queryParams = new URLSearchParams({
        format: 'json',
        productId: productId,
        statusSeed: '1,3',
        ...(culture && { cultureCode: culture }),
    }).toString();

    const url = `${apiConfig.api_base}${apiConfig.product_service}/ListProductRelations?${queryParams}`;
    const cacheKey = `relations_${productId}_${culture}`;

    try {
        const relationsData = await fetchData(url, cacheKey);
        res.json(relationsData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch relations data' });
    }
});

// Norce Product Service — fetch active promotions for a product
app.get('/api/promos/:uniqueName', async (req, res) => {
    if (useMockData) {
        const data = readJson('promos.json', res);
        if(data){
            res.json(data);
        }
        return;
    }
    const { uniqueName } = req.params;
    const { culture } = req.query;

    const queryParams = new URLSearchParams({
        format: 'json',
        uniqueName: uniqueName,
        statusSeed: '1,3',
        ...(culture && { cultureCode: culture }),
    }).toString();

    const url = `${apiConfig.api_base}${apiConfig.product_service}/ListPromotionsByProductUniqueName?${queryParams}`;
    const cacheKey = `promos_${uniqueName}_${culture}`;

    try {
        const promosData = await fetchData(url, cacheKey);
        res.json(promosData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch promos data' });
    }
});

// Norce Product Service — fetch all product flags (New, Sale, etc.)
app.get('/api/flags', async (req, res) => {
    if (useMockData) {
        const data = readJson('flags.json', res);
        if (data) {
            res.json(data);
        }
        return;
    }

    const { culture } = req.query;
    const queryParams = new URLSearchParams({
        format: 'json',
        ...(culture && { cultureCode: culture }),
    }).toString();

    const url = `${apiConfig.api_base}${apiConfig.product_service}/ListFlags?${queryParams}`;
    const cacheKey = `flags_${culture}`;

    try {
        const flagsData = await fetchData(url, cacheKey);
        res.json(flagsData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch flags data' });
    }
});

// Norce Product Service — list products with optional filters
app.get('/api/products', async (req, res) => {
    if (useMockData) {
        const data = readJson('productlist.json', res);
        if (data) res.json(data);
        return;
    }

    const { culture, ...query } = req.query;
    const queryString = new URLSearchParams({
        ...query,                                    // Pass through filter params from the frontend
        format: 'json',
        categorySeed: apiConfig.category_seed,           // CATEGORY_SEED - root category to scope the catalogue to
        statusSeed: '1,3',
        ...(culture && { cultureCode: culture }),
    }).toString();

    const url = `${apiConfig.api_base}${apiConfig.product_service}/ListProducts2?${queryString}`;
    const cacheKey = `products_${queryString}`;

    try {
        const productsData = await fetchData(url, cacheKey);
        res.json(productsData);
    } catch (error) {
        console.error('Failed to fetch products:', error.message);
        res.status(500).json({ error: 'Failed to fetch products data' });
    }
});

// Norce Product Service — fetch available filter facets (brand, price range, etc.)
app.get('/api/productfilters', async (req, res) => {
    if (useMockData) {
        const data = readJson('productfilters.json', res);
        if (data) {
            res.json(data);
        }
        return;
    }

    const { culture, ...query } = req.query;
    const queryString = new URLSearchParams({
        ...query,
        format: 'json',
        categorySeed: apiConfig.category_seed,
        statusSeed: '1,3',
        ...(culture && { cultureCode: culture }),
    }).toString();

    const url = `${apiConfig.api_base}${apiConfig.product_service}/ListProductFilters2?${queryString}`;
    const cacheKey = `products_filters_${queryString}`;

    try {
        const filtersData = await fetchData(url, cacheKey);
        res.json(filtersData);
    } catch (error) {
        console.error('Failed to fetch product filters data:', error.message);
        res.status(500).json({ error: 'Failed to fetch product filters data' });
    }
});

// Norce Metadata Service — fetch available cultures/languages from the application config.
// GetApplication answers with the whole application object. The frontend wants
// the culture list plus the storefront's own name, so trim it to that rather
// than shipping the entire payload to the browser.
//
// Both the mock and the live branch must run through the same shaping -
// returning the raw object in mock mode is what used to leave the language
// selector missing whenever the BFF ran without credentials.
function shapeApplication(appData) {
    const cultures = Array.isArray(appData?.Cultures?.List)
        ? appData.Cultures.List
        : Array.isArray(appData) ? appData : null;

    if (!cultures) return null;

    return {
        Id: appData?.Id ?? null,
        Name: appData?.Name ?? null,
        Url: appData?.Url ?? null,
        // The client owning this application. The media CDN serves each client
        // under its own id, so the frontend uses this to build image URLs -
        // that way switching APPLICATION_ID switches the images too.
        ClientId: appData?.Client?.Id ?? null,
        ClientName: appData?.Client?.Name ?? null,
        Cultures: cultures
    };
}

app.get('/api/application', async (req, res) => {
    if (useMockData) {
        const data = readJson('cultures.json', res);
        if (data) {
            const application = shapeApplication(data);
            if (application) {
                res.json(application);
            } else {
                console.error('Unexpected shape in mockdata/cultures.json');
                res.status(500).json({ error: 'Unexpected application shape' });
            }
        }
        return;
    }

    const queryParams = new URLSearchParams({
        format: 'json',
        applicationId: apiConfig.application_id,
    }).toString();

    const url = `${apiConfig.api_base}${apiConfig.metadata_service}/GetApplication?${queryParams}`;
    const cacheKey = `application`;

    try {
        const appData = await fetchData(url, cacheKey);
        const application = shapeApplication(appData);

        if (application) {
            res.json(application);
        } else {
            console.error('Unexpected response shape from GetApplication:', appData);
            res.status(500).json({ error: 'Unexpected application shape' });
        }
    } catch (error) {
        console.error('Failed to fetch application:', error.message);
        res.status(500).json({ error: 'Failed to fetch application data' });
    }
});

// Storefront theme - brand colour, logo font and logo, read from a hidden
// product in the PIM. The application itself has a Description field, but
// GetApplication does not return it (only the Management and Query APIs do),
// and a storefront BFF should not carry admin credentials to read a colour.
//
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
const themePartNo = process.env.THEME_PARTNO
    || (apiConfig.application_id && `npv-theme-${apiConfig.application_id}`);

// Only these fonts can be chosen. The frontend loads them from Google Fonts,
// and a whitelist keeps PIM data from injecting anything into a stylesheet.
const themeFonts = ['Inter', 'Montserrat', 'Raleway', 'Oswald', 'Playfair Display', 'Lora', 'Roboto Slab', 'Pacifico'];
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
async function loadTheme(cultureCode) {
    let base = cache.get('theme');
    if (!base) {
        const product = await readThemeProduct();
        base = {
            theme: shapeTheme(product),
            perCulture: themeValues(product).theme_per_culture === 'True'
        };
        if (!Object.keys(base.theme).length) {
            console.log(`[THEME] No theme values on ${themePartNo}; using the default style.`);
        }
        cache.put('theme', base, cacheDuration);
    }

    if (!base.perCulture || !cultureCode) return base.theme;

    const cacheKey = `theme_${cultureCode}`;
    let theme = cache.get(cacheKey);
    if (!theme) {
        // Values that are missing or invalid in this culture keep the default
        // culture's value rather than dropping to the default style.
        try {
            theme = { ...base.theme, ...shapeTheme(await readThemeProduct(cultureCode)) };
        } catch (error) {
            console.warn(`[THEME] Could not read ${themePartNo} in ${cultureCode}; using the default culture's theme.`, error.message);
            return base.theme;
        }
        cache.put(cacheKey, theme, cacheDuration);
    }
    return theme;
}

app.get('/api/theme', async (req, res) => {
    if (useMockData) {
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

app.listen(port, () => {
    console.log(`BFF server listening at http://localhost:${port}`);
});
