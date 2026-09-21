// In-memory basket used when the BFF runs in mock mode.
//
// Why this exists: the checkout course is *about* the basket. Serving the same
// static basket.json for every call meant "add to cart", "change quantity" and
// "remove" all appeared to do nothing without live API credentials. This module
// makes those operations actually work offline.
//
// It deliberately mirrors what the Norce Shopping Service returns from
// GetBasket, including two details that trip people up:
//
//   1. `Price` on a basket row is 0.00. The price you display is `PriceDisplay`
//      (ex VAT) / `PriceDisplayIncVat` (inc VAT). `PriceOriginal` is the price
//      before promotions. This is the real Shopping Service contract, not a
//      quirk of the mock — see mockdata/basket.json.
//   2. Not every row is a product. `Type: 1` is a product row, `Type: 3` is a
//      fee row (freight). Never assume Items only contains things the customer
//      picked.
//
// Prices are resolved here, on the server, from the mock product catalogue —
// never taken from the request body. That is how the live Shopping Service
// behaves too, and it is the reason the frontend must not send prices.

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../mockdata');

// Same ids as mockdata/basket.json so a live basket and a mock basket look alike.
const BASKET_ID = 779;
const CURRENCY_ID = 2;
const CURRENCY_CODE = 'SEK';
const DEFAULT_VAT_RATE = 1.25;

// Freight is a fee row Norce adds to the basket, not a product the user picked.
const FREIGHT_ROW = {
    ProductId: 12,
    PartNo: '100000',
    Name: 'Freight fee',
    UniqueName: 'freight-fee',
    PriceListId: 4,
    PriceOriginal: 79.0,
    PriceDisplay: 0.0, // free freight in this demo application
    Type: 3,
    StatusId: 4,
    UOM: '',
    ImageKey: null,
};

let basket = null;
let nextItemId = 1540;
let nextLineNo = 1;
let catalogue = null;

function readMock(fileName) {
    const filePath = path.join(dataDir, fileName);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Build a PartNo -> product lookup from the mock product data. In mock mode the
// Product Service always returns product.json, so that is the catalogue.
function getCatalogue() {
    if (catalogue) return catalogue;

    catalogue = new Map();
    const add = (p) => {
        if (!p || !p.PartNo) return;
        catalogue.set(String(p.PartNo), {
            ProductId: p.Id,
            PartNo: String(p.PartNo),
            Name: p.Name,
            UniqueName: p.UniqueName,
            PriceListId: p.PriceListId ?? null,
            PriceExVat: p.Price ?? 0,
            PriceIncVat: p.PriceIncVat ?? null,
            VatRate: p.VatRate ?? DEFAULT_VAT_RATE,
            ImageKey: p.ImageKey ?? null,
            UOM: p.UOM ?? 'st',
        });
    };

    try {
        const product = readMock('product.json');
        add(product);
        (product.Variants || []).forEach(add);
    } catch (error) {
        console.error('[MOCK BASKET] Could not read product.json:', error.message);
    }

    return catalogue;
}

function round(value) {
    return Math.round(value * 100) / 100;
}

function buildRow(partNo, quantity) {
    const product = getCatalogue().get(String(partNo));

    if (!product) {
        // Unknown PartNo: create the row anyway so the flow is not blocked, but
        // do not invent a price. A 0 kr row is a visible signal that the mock
        // catalogue does not know this article.
        console.warn(`[MOCK BASKET] PartNo ${partNo} not found in mock catalogue - price set to 0.`);
        return {
            Id: nextItemId++,
            LineNo: nextLineNo++,
            ProductId: null,
            PartNo: String(partNo),
            Name: String(partNo),
            UniqueName: null,
            Quantity: quantity,
            Price: 0.0,
            PriceDisplay: 0.0,
            PriceDisplayIncVat: 0.0,
            PriceOriginal: 0.0,
            PriceOriginalIncVat: 0.0,
            VatRate: DEFAULT_VAT_RATE,
            PriceListId: null,
            UOM: 'st',
            ImageKey: null,
            Type: 1,
            StatusId: 1,
            IsBuyable: true,
            IsEditable: true,
        };
    }

    const vatRate = product.VatRate || DEFAULT_VAT_RATE;
    const exVat = product.PriceExVat;
    const incVat = product.PriceIncVat ?? round(exVat * vatRate);

    return {
        Id: nextItemId++,
        LineNo: nextLineNo++,
        ProductId: product.ProductId,
        PartNo: product.PartNo,
        Name: product.Name,
        UniqueName: product.UniqueName,
        Quantity: quantity,
        // Mirrors the live service: Price is 0, PriceDisplay is what is charged.
        Price: 0.0,
        PriceDisplay: exVat,
        PriceDisplayIncVat: incVat,
        PriceOriginal: exVat,
        PriceOriginalIncVat: incVat,
        VatRate: vatRate,
        PriceListId: product.PriceListId,
        UOM: product.UOM,
        ImageKey: product.ImageKey,
        Type: 1,
        StatusId: 1,
        IsBuyable: true,
        IsEditable: true,
    };
}

function buildFreightRow() {
    const vatRate = DEFAULT_VAT_RATE;
    return {
        ...FREIGHT_ROW,
        Id: nextItemId++,
        LineNo: nextLineNo++,
        Quantity: 1.0,
        Price: 0.0,
        PriceDisplayIncVat: round(FREIGHT_ROW.PriceDisplay * vatRate),
        PriceOriginalIncVat: round(FREIGHT_ROW.PriceOriginal * vatRate),
        VatRate: vatRate,
        IsBuyable: true,
        IsEditable: false,
    };
}

// Norce spells the freight bucket "Freigt" in the Summary object. Kept as-is so
// the mock matches the real response byte for byte.
function amountBucket(rows) {
    const amount = rows.reduce((sum, row) => sum + row.PriceDisplay * row.Quantity, 0);
    const amountIncVat = rows.reduce((sum, row) => sum + row.PriceDisplayIncVat * row.Quantity, 0);
    return {
        Amount: round(amount),
        Vat: round(amountIncVat - amount),
        AmountIncVat: round(amountIncVat),
    };
}

function recalculate() {
    const productRows = basket.Items.filter((row) => row.Type === 1);
    const freightRows = basket.Items.filter((row) => row.Type === 3);

    basket.Summary = {
        Items: amountBucket(productRows),
        Freigt: amountBucket(freightRows),
        Fees: { Amount: 0.0, Vat: 0.0, AmountIncVat: 0.0 },
        Total: amountBucket(basket.Items),
    };

    return basket;
}

function renumberLines() {
    basket.Items.forEach((row, index) => {
        row.LineNo = index + 1;
    });
    nextLineNo = basket.Items.length + 1;
}

function emptyBasket() {
    return {
        Id: BASKET_ID,
        CustomerId: null,
        CompanyId: null,
        StatusId: 3,
        CurrencyId: CURRENCY_ID,
        CurrencyCode: CURRENCY_CODE,
        Comment: null,
        OrderReference: null,
        DiscountCode: null,
        IsEditable: true,
        IsBuyable: true,
        Items: [],
        Info: [],
        AppliedPromotions: [],
        PaymentMethodId: null,
        DeliveryMethodId: null,
        SalesAreaId: 1,
        Summary: null,
    };
}

function ensureBasket() {
    if (!basket) {
        basket = emptyBasket();
        recalculate();
    }
    return basket;
}

/** GetBasket */
function get() {
    ensureBasket();
    return recalculate();
}

/** CreateBasket - optionally seeded with items */
function create(items = []) {
    basket = emptyBasket();
    nextItemId = 1540;
    nextLineNo = 1;

    const seed = Array.isArray(items) ? items : [];
    seed.filter((item) => item && item.PartNo).forEach((item) => {
        basket.Items.push(buildRow(item.PartNo, Number(item.Quantity) || 1));
    });

    if (basket.Items.length) {
        basket.Items.push(buildFreightRow());
    }

    return recalculate();
}

/** InsertBasketItem - adds quantity to an existing row if the PartNo is already there */
function insertItem(partNo, quantity = 1) {
    ensureBasket();

    const existing = basket.Items.find((row) => row.Type === 1 && row.PartNo === String(partNo));
    if (existing) {
        existing.Quantity += Number(quantity) || 1;
    } else {
        const freight = basket.Items.filter((row) => row.Type !== 1);
        const products = basket.Items.filter((row) => row.Type === 1);
        products.push(buildRow(partNo, Number(quantity) || 1));
        basket.Items = [...products, ...(freight.length ? freight : [buildFreightRow()])];
        renumberLines();
    }

    return recalculate();
}

/** UpdateBasketItem - by row Id */
function updateItem(itemId, quantity) {
    ensureBasket();

    const row = basket.Items.find((item) => String(item.Id) === String(itemId));
    if (row) {
        row.Quantity = Math.max(1, Number(quantity) || 1);
    }

    return recalculate();
}

/** DeleteBasketItem - by LineNo */
function deleteItem(lineNo) {
    ensureBasket();

    basket.Items = basket.Items.filter((row) => String(row.LineNo) !== String(lineNo));

    // Drop the freight row once the last product row is gone.
    if (!basket.Items.some((row) => row.Type === 1)) {
        basket.Items = [];
    }

    renumberLines();
    return recalculate();
}

module.exports = {
    get,
    create,
    insertItem,
    updateItem,
    deleteItem,
};
