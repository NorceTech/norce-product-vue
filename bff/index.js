// BFF (Backend-for-Frontend) for the Norce Academy Storefront demo.
// Proxies Norce Commerce API calls, handles OAuth2 authentication,
// and caches responses. Serves the local JSON fixtures in /mockdata only when
// MOCK_DATA=true; incomplete live configuration is a startup error rather than
// a quiet fall back to fixtures of another tenant. In mock mode the basket is
// kept in memory (see mockBasket.js) so add/update/remove work offline.

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
const mockBasket = require('./mockBasket');

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
    shopping_service: process.env.SHOPPING_SERVICE || "/commerce/shopping/1.1",
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
    console.log('The basket lives in memory (mockBasket.js), so add, update and remove work offline.');
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

async function fetchDataNoCache(url) {
    if (!apiConfig.api_base) {
        console.error('ERROR: apiConfig.api_base is undefined. Cannot fetch data from external API.');
        throw new Error('API_BASE is not configured. Please check your .env file.');
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

        return response.data;
    } catch (error) {
        console.error(`[NORCE ERROR] Failed to fetch data from ${url}:`, error.message);
        throw error;
    }
}

async function sendData(method, url, data) {
    if (!apiConfig.api_base) {
        console.error('ERROR: apiConfig.api_base is undefined. Cannot send data to external API.');
        throw new Error('API_BASE is not configured. Please check your .env file.');
    }

    try {
        const token = await getAuthToken();
        console.log(`[NORCE REQUEST] ${method.toUpperCase()} URL: ${url}`);

        const response = await axios({
            method,
            url,
            data,
            headers: {
                'Authorization': `Bearer ${token}`,
                'applicationId': apiConfig.application_id,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        console.error(`[NORCE ERROR] Failed to send data to ${url}:`, error.message);
        throw error;
    }
}

// Only PartNo and Quantity are accepted from the browser. Price, PriceIncVat
// and PriceListId must never travel client -> BFF -> Norce: the price list
// decides the price, server side. Forwarding a client-supplied price to
// InsertBasketItem is a price manipulation hole, and the wrong pattern to copy
// into a real storefront.
function toBasketItem(raw) {
    if (!raw || !raw.PartNo) return null;

    const quantity = Number(raw.Quantity);
    return {
        PartNo: String(raw.PartNo),
        Quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1
    };
}

function buildContextParams(source) {
    const cultureCode = source.cultureCode || source.culture;
    const params = new URLSearchParams({
        format: 'json',
        ...(source.pricelistSeed && { pricelistSeed: source.pricelistSeed }),
        ...(source.currencyId && { currencyId: source.currencyId }),
        ...(cultureCode && { cultureCode })
    });
    return params.toString();
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


// Norce Shopping Service — get basket by ID
app.get('/api/basket/:basketId', async (req, res) => {
    if (useMockData) {
        res.json(mockBasket.get());
        return;
    }

    const { basketId } = req.params;
    const queryParams = buildContextParams(req.query);
    const url = `${apiConfig.api_base}${apiConfig.shopping_service}/GetBasket?${queryParams}&id=${basketId}`;

    try {
        const basketData = await fetchDataNoCache(url);
        res.json(basketData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch basket' });
    }
});

// Norce Shopping Service — create a new basket
app.post('/api/basket', async (req, res) => {
    if (useMockData) {
        const seedItems = req.body?.items ?? req.body?.Items;
        // Through toBasketItem, exactly as the live path below. Skipping it let
        // mock mode accept a negative or absurd quantity that live mode would
        // have normalised to 1 — and a fixture that behaves differently from the
        // real thing teaches the wrong lesson.
        const items = (Array.isArray(seedItems) ? seedItems : []).map(toBasketItem).filter(Boolean);
        res.json(mockBasket.create(items));
        return;
    }

    const body = req.body || {};
    const queryParams = new URLSearchParams({
        format: 'json',
        ipAddress: body.ipAddress || req.ip || '127.0.0.1',
        createdBy: body.createdBy || 1,
        ...(body.pricelistSeed && { pricelistSeed: body.pricelistSeed }),
        ...(body.currencyId && { currencyId: body.currencyId }),
        ...(body.cultureCode && { cultureCode: body.cultureCode }),
        ...(body.culture && { cultureCode: body.culture })
    }).toString();

    const url = `${apiConfig.api_base}${apiConfig.shopping_service}/CreateBasket?${queryParams}`;
    const rawItems = body.basket?.Items ?? body.Items ?? body.items;
    const basketBody = {
        Items: (Array.isArray(rawItems) ? rawItems : []).map(toBasketItem).filter(Boolean)
    };

    // No PaymentMethodId or DeliveryMethodId here. CreateBasket accepts both, but
    // choosing them is checkout's job, and this branch has no checkout — the
    // basket module is deliberately scoped to the basket itself. The checkout
    // branch defaults them from its own configuration, because NCO's initiate
    // rejects a basket that has no delivery method.

    try {
        const basketData = await sendData('post', url, basketBody);
        res.json(basketData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create basket' });
    }
});

// Norce Shopping Service — add item to basket
app.post('/api/basket/:basketId/items', async (req, res) => {
    if (useMockData) {
        const item = toBasketItem(req.body);
        if (!item) {
            res.status(400).json({ error: 'PartNo is required' });
            return;
        }
        res.json(mockBasket.insertItem(item.PartNo, item.Quantity));
        return;
    }

    const { basketId } = req.params;
    const body = req.body || {};
    const queryParams = new URLSearchParams({
        format: 'json',
        basketId,
        createdBy: body.createdBy || 1,
        ...(body.pricelistSeed && { pricelistSeed: body.pricelistSeed }),
        ...(body.currencyId && { currencyId: body.currencyId }),
        ...(body.cultureCode && { cultureCode: body.cultureCode }),
        ...(body.culture && { cultureCode: body.culture })
    }).toString();

    const url = `${apiConfig.api_base}${apiConfig.shopping_service}/InsertBasketItem?${queryParams}`;
    const itemBody = toBasketItem(body.item ?? body);

    if (!itemBody) {
        res.status(400).json({ error: 'PartNo is required' });
        return;
    }

    try {
        const basketData = await sendData('post', url, itemBody);
        res.json(basketData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to insert basket item' });
    }
});

// Norce Shopping Service — update basket item quantity
app.put('/api/basket/:basketId/items/:itemId', async (req, res) => {
    const { basketId, itemId } = req.params;
    const body = req.body || {};

    // The same request shape and the same normalisation in both modes. Read the
    // nested form too, and fall back to 1 rather than storing Infinity — which
    // serialises as null and makes the row unreadable.
    const source = body.item ?? body;
    const rawQuantity = Number(source?.Quantity);
    const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1;

    if (useMockData) {
        res.json(mockBasket.updateItem(itemId, quantity));
        return;
    }

    const queryParams = new URLSearchParams({
        format: 'json',
        basketId,
        ...(body.pricelistSeed && { pricelistSeed: body.pricelistSeed }),
        ...(body.currencyId && { currencyId: body.currencyId }),
        ...(body.cultureCode && { cultureCode: body.cultureCode }),
        ...(body.culture && { cultureCode: body.culture })
    }).toString();

    const url = `${apiConfig.api_base}${apiConfig.shopping_service}/UpdateBasketItem?${queryParams}`;
    // Quantity is the only thing an update may change, and the Id comes from the
    // route — never from the body. Honouring a body Id let PUT /items/10 with
    // {"Id": 11} update row 11, which is the route contract saying one thing and
    // the code doing another.
    const itemBody = {
        Id: Number(itemId),
        Quantity: quantity
    };

    try {
        const basketData = await sendData('post', url, itemBody);
        res.json(basketData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update basket item' });
    }
});

// Norce Shopping Service — remove item from basket
app.delete('/api/basket/:basketId/items/:lineNo', async (req, res) => {
    if (useMockData) {
        res.json(mockBasket.deleteItem(req.params.lineNo));
        return;
    }

    const { basketId, lineNo } = req.params;
    const queryParams = buildContextParams(req.query);
    const url = `${apiConfig.api_base}${apiConfig.shopping_service}/DeleteBasketItem?${queryParams}&basketId=${basketId}&lineNo=${lineNo}`;

    try {
        const basketData = await sendData('post', url, null);
        res.json(basketData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete basket item' });
    }
});

app.listen(port, () => {
    console.log(`BFF server listening at http://localhost:${port}`);
});
