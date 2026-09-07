// BFF (Backend-for-Frontend) for the Norce Academy Checkout demo.
// Proxies Norce Commerce API calls (Product, Shopping, Metadata services)
// and NCO (Norce Checkout Order). Handles OAuth2 authentication and
// caches responses. Falls back to local JSON mock data when credentials
// are not configured; the basket is then kept in memory (see mockBasket.js)
// so add/update/remove actually work offline.

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
    nco_token: process.env.NCO_TOKEN,
    nco_base: process.env.NCO_BASE,
    nco_norce_adapter: process.env.NCO_NORCE_ADAPTER || "/checkout/norce-adapter",
    nco_nonpsp_adapter: process.env.NCO_NONPSP_ADAPTER || "/checkout/nonpsp-adapter",
    nco_order_api: process.env.NCO_ORDER_API || "/checkout/order",
    // No fallbacks for these: they are tenant-specific. A hard-coded default
    // silently points another tenant at the wrong merchant, channel or payment
    // method, and the mistake only surfaces deep inside the NCO flow. Missing
    // values are reported at startup instead (see below).
    nco_merchant: process.env.NCO_MERCHANT,
    nco_channel: process.env.NCO_CHANNEL,
    nco_payment_method_id: process.env.NCO_PAYMENT_METHOD_ID,
    nco_delivery_method_id: process.env.NCO_DELIVERY_METHOD_ID
};


const useMockData = process.env.MOCK_DATA === 'true' || !apiConfig.api_base || !apiConfig.oauth_id || !apiConfig.oauth_secret;

if (useMockData) {
    // Asking for live mode and not getting it is a misconfiguration, not a
    // happy fallback - say so loudly rather than quietly serving fixtures.
    if (process.env.MOCK_DATA === 'false') {
        const missing = [
            ['API_BASE', apiConfig.api_base],
            ['OAUTH_ID', apiConfig.oauth_id],
            ['OAUTH_SECRET', apiConfig.oauth_secret]
        ].filter((entry) => !entry[1]).map((entry) => entry[0]);

        console.warn('='.repeat(70));
        console.warn(`[CONFIG] MOCK_DATA=false, but falling back to MOCK MODE: ${missing.join(', ')} not set.`);
        console.warn('[CONFIG] Fill these in bff/.env to reach the live Norce APIs.');
        console.warn('='.repeat(70));
    }

    console.log('BFF is running in mock data mode.');
    console.log('Product data is served from /mockdata; the basket lives in memory (mockBasket.js).');
} else {
    const missingCore = ['API_BASE', 'APPLICATION_ID', 'CATEGORY_SEED']
        .filter((name) => !process.env[name]);

    if (missingCore.length) {
        console.error(`[CONFIG] Missing required settings: ${missingCore.join(', ')}`);
        console.error('[CONFIG] Product endpoints will fail. See bff/.env.example.');
    } else {
        console.log(`[CONFIG] Live mode: application ${apiConfig.application_id}, root category ${apiConfig.category_seed}, ${apiConfig.api_base}`);
    }

    // Report missing checkout configuration up front instead of failing with an
    // opaque 500 halfway through the payment flow.
    const missingNco = ['NCO_BASE', 'NCO_MERCHANT', 'NCO_CHANNEL', 'NCO_PAYMENT_METHOD_ID']
        .filter((name) => !process.env[name]);

    if (missingNco.length) {
        console.warn(`[CONFIG] Checkout (NCO) is not fully configured. Missing: ${missingNco.join(', ')}`);
        console.warn('[CONFIG] Product and basket endpoints work; /api/checkout/* will fail until these are set.');
    }
    if (!apiConfig.nco_delivery_method_id) {
        console.warn('[CONFIG] NCO_DELIVERY_METHOD_ID is not set. Baskets are created without a delivery method, which NCO initiate may reject.');
    }
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
        const token = await getAuthToken();        console.log(`[NORCE REQUEST] URL: ${url}`);

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

// Reply with a 500 that says why. In a training demo the reason is the lesson;
// a bare "Failed to ..." sends people to the logs for no good reason.
function failWith(res, fallback, error) {
    const status = error?.response?.status;
    res.status(500).json({
        error: fallback,
        reason: error?.message ?? String(error),
        ...(status && { upstreamStatus: status })
    });
}

async function sendNcoData(method, url, data) {
    const missing = [
        ['NCO_BASE', apiConfig.nco_base],
        ['NCO_MERCHANT', apiConfig.nco_merchant],
        ['NCO_CHANNEL', apiConfig.nco_channel]
    ].filter((entry) => !entry[1]).map((entry) => entry[0]);

    if (missing.length) {
        console.error(`ERROR: NCO is not configured. Missing: ${missing.join(', ')}`);
        throw new Error(`Missing NCO configuration: ${missing.join(', ')}. Please check your .env file.`);
    }

    try {
        const token = apiConfig.nco_token || await getAuthToken();
        const authHeader = token && String(token).toLowerCase().startsWith('bearer ')
            ? String(token)
            : `Bearer ${token}`;
        if (apiConfig.nco_token) {
            console.log('[NORCE REQUEST] Using NCO_TOKEN for checkout call.');
        }

        const headerLog = {
            'x-merchant': apiConfig.nco_merchant,
            'x-channel': apiConfig.nco_channel,
            'content-type': 'application/json',
            'authorization': token ? `${String(authHeader).slice(0, 10)}...` : 'Missing'
        };
        console.log(`[NORCE REQUEST] ${method.toUpperCase()} URL: ${url}`);
        console.log('[NORCE REQUEST] Headers:', headerLog);

        const response = await axios({
            method,
            url,
            data,
            headers: {
                'Authorization': authHeader,
                'x-merchant': apiConfig.nco_merchant,
                'x-channel': apiConfig.nco_channel,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        if (error.response) {
            console.error(`[NORCE ERROR] ${method.toUpperCase()} ${url} -> ${error.response.status}`, error.response.data);
        } else {
            console.error(`[NORCE ERROR] Failed to send data to ${url}:`, error.message);
        }
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
// Norce Product Service - fetch a single product by its unique name (slug)
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
        statusSeed: '1,3',
        ...(culture && { cultureCode: culture }), 
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

// Norce Product Service - fetch related products (accessories, alternatives, etc.)
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

// Norce Product Service - fetch active promotions for a product
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

// Norce Product Service - fetch all product flags (New, Sale, etc.)
app.get('/api/flags', async (req, res) => {
    if (useMockData) {
        const data = readJson('flags.json', res);
        if(data){
            res.json(data);
        }
        return;
    }

    const { culture } = req.query; // Extract culture from req.query
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

// Norce Product Service - list products with optional filters
app.get('/api/products', async (req, res) => {
    // Use the shared useMockData flag rather than re-reading MOCK_DATA here:
    // mock mode is also on when credentials are missing. Reading the env var
    // directly is what used to make this one endpoint return 500 on a fresh
    // clone with no .env, leaving the product list empty.
    if (useMockData) {
        const data = readJson('productlist.json', res);
        if (data) res.json(data);
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

// Norce Product Service - fetch available filter facets (brand, price range, etc.)
app.get('/api/productfilters', async (req, res) => {
    if (useMockData) {
        const data = readJson('productfilters.json', res);
        if(data){
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

// Norce Metadata Service - fetch available cultures/languages from the application config
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

// Norce Shopping Service - get basket by ID
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

// Norce Shopping Service - create a new basket
app.post('/api/basket', async (req, res) => {
    if (useMockData) {
        const seedItems = req.body?.items ?? req.body?.Items;
        res.json(mockBasket.create(Array.isArray(seedItems) ? seedItems : []));
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

    if (!basketBody.PaymentMethodId && apiConfig.nco_payment_method_id) {
        basketBody.PaymentMethodId = Number(apiConfig.nco_payment_method_id);
    }
    if (!basketBody.DeliveryMethodId && apiConfig.nco_delivery_method_id) {
        basketBody.DeliveryMethodId = Number(apiConfig.nco_delivery_method_id);
    }

    try {
        const basketData = await sendData('post', url, basketBody);
        res.json(basketData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create basket' });
    }
});

// Norce Shopping Service - add item to basket
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

// Norce Shopping Service - update basket item quantity
app.put('/api/basket/:basketId/items/:itemId', async (req, res) => {
    if (useMockData) {
        res.json(mockBasket.updateItem(req.params.itemId, req.body?.Quantity));
        return;
    }

    const { basketId, itemId } = req.params;
    const body = req.body || {};
    const queryParams = new URLSearchParams({
        format: 'json',
        basketId,
        ...(body.pricelistSeed && { pricelistSeed: body.pricelistSeed }),
        ...(body.currencyId && { currencyId: body.currencyId }),
        ...(body.cultureCode && { cultureCode: body.cultureCode }),
        ...(body.culture && { cultureCode: body.culture })
    }).toString();

    const url = `${apiConfig.api_base}${apiConfig.shopping_service}/UpdateBasketItem?${queryParams}`;
    // Quantity is the only thing an update may change; Id comes from the route.
    const source = body.item ?? body;
    const quantity = Number(source?.Quantity);
    const itemBody = {
        Id: Number(source?.Id ?? itemId),
        Quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1
    };

    try {
        const basketData = await sendData('post', url, itemBody);
        res.json(basketData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update basket item' });
    }
});

// Norce Shopping Service - remove item from basket
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

// NCO - initiate a checkout order from a Norce basket
app.post('/api/checkout/initiate', async (req, res) => {
    if (useMockData || !apiConfig.nco_base) {
        const data = readJson('checkout-initiate.json', res);
        if (data) {
            res.json(data);
        }
        return;
    }

    const body = req.body || {};
    const url = `${apiConfig.nco_base}${apiConfig.nco_norce_adapter}/api/v1/orders`;

    try {
        const orderData = await sendNcoData('post', url, body);
        res.json(orderData);
    } catch (error) {
        failWith(res, 'Failed to initiate checkout', error);
    }
});

// NCO Non-PSP adapter - create a payment (skips external payment provider)
app.post('/api/checkout/nonpsp/orders/:orderId/payments', async (req, res) => {
    if (useMockData || !apiConfig.nco_base) {
        const data = readJson('checkout-payment.json', res);
        if (data) {
            res.json(data);
        }
        return;
    }

    const { orderId } = req.params;
    const url = `${apiConfig.nco_base}${apiConfig.nco_nonpsp_adapter}/api/checkout/v1/orders/${orderId}/payments`;

    try {
        const paymentData = await sendNcoData('post', url, req.body || {});
        res.json(paymentData);
    } catch (error) {
        failWith(res, 'Failed to create non-PSP payment', error);
    }
});

// NCO Non-PSP adapter - update payment details
app.put('/api/checkout/nonpsp/orders/:orderId/payments/:paymentId', async (req, res) => {
    if (useMockData || !apiConfig.nco_base) {
        const data = readJson('checkout-payment.json', res);
        if (data) {
            res.json(data);
        }
        return;
    }

    const { orderId, paymentId } = req.params;
    const url = `${apiConfig.nco_base}${apiConfig.nco_nonpsp_adapter}/api/checkout/v1/orders/${orderId}/payments/${paymentId}`;

    try {
        const paymentData = await sendNcoData('put', url, req.body || {});
        res.json(paymentData);
    } catch (error) {
        failWith(res, 'Failed to update non-PSP payment', error);
    }
});

// NCO Non-PSP adapter - complete the payment and finalize the order
app.post('/api/checkout/nonpsp/orders/:orderId/payments/:paymentId/complete', async (req, res) => {
    if (useMockData || !apiConfig.nco_base) {
        const data = readJson('checkout-complete.json', res);
        if (data) {
            res.json(data);
        }
        return;
    }

    const { orderId, paymentId } = req.params;
    const url = `${apiConfig.nco_base}${apiConfig.nco_nonpsp_adapter}/api/checkout/v1/orders/${orderId}/payments/${paymentId}/complete`;

    try {
        const paymentData = await sendNcoData('post', url, req.body || {});
        res.json(paymentData);
    } catch (error) {
        failWith(res, 'Failed to complete non-PSP payment', error);
    }
});

// NCO Order API - update billing address on checkout order
app.put('/api/checkout/orders/:orderId/customer/billing', async (req, res) => {
    if (useMockData || !apiConfig.nco_base) {
        const data = readJson('checkout-billing.json', res);
        if (data) {
            res.json(data);
        }
        return;
    }

    const { orderId } = req.params;
    const url = `${apiConfig.nco_base}${apiConfig.nco_order_api}/api/v0/checkout/orders/${orderId}/customer/billing`;

    try {
        const billingData = await sendNcoData('put', url, req.body || {});
        res.json(billingData);
    } catch (error) {
        failWith(res, 'Failed to update billing details', error);
    }
});

// NCO Order API - update shipping address on checkout order
app.put('/api/checkout/orders/:orderId/customer/shipping', async (req, res) => {
    if (useMockData || !apiConfig.nco_base) {
        const data = readJson('checkout-shipping.json', res);
        if (data) {
            res.json(data);
        }
        return;
    }

    const { orderId } = req.params;
    const url = `${apiConfig.nco_base}${apiConfig.nco_order_api}/api/v0/checkout/orders/${orderId}/customer/shipping`;

    try {
        const shippingData = await sendNcoData('put', url, req.body || {});
        res.json(shippingData);
    } catch (error) {
        failWith(res, 'Failed to update shipping details', error);
    }
});

// Routes are registered above; start listening last so the file reads
// top-to-bottom: config, helpers, product endpoints, basket, checkout.
app.listen(port, () => {
    console.log(`BFF server listening at http://localhost:${port}`);
});
