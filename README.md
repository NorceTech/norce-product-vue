# Norce Academy – Developer Fundamentals: Checkout

A Vue 3 webshop storefront with checkout flow, built on **Norce Commerce**. Used as a training demo in the Norce Academy "Developer Fundamentals Checkout" course.

This project extends the storefront (product listing, filtering, product detail) with a **basket**, **Norce Checkout Order (NCO)**, and **non-PSP payment** flow.


## What You'll Learn

This checkout demo builds on the storefront and adds:

- **Basket management** — add/update/remove items via the Norce Shopping Service, with client-side state management in a Vue composable (`useBasket`).
- **Cart drawer** — slide-out cart UI with quantity editing and item removal.
- **NCO integration** — initiate a checkout order, update billing/shipping, and handle the payment flow via Norce Checkout Order APIs.
- **Non-PSP payment** — a simplified payment adapter that skips external payment providers, useful for B2B or invoice-based flows.
- **All storefront features** — product listing with `ListProducts2`, filters with `ListProductFilters2`, product detail with `GetProductByUniqueName`, variant selection, multi-language support, and mock data mode.


## Project Structure

```
├── bff/                    # Node.js Express BFF
│   ├── index.js            # All endpoints: products, basket, NCO
│   └── .env.example        # Environment variable template
├── productpage-vue/        # Vue 3 frontend (Vite)
│   └── src/
│       ├── views/          # ProductListView, ProductPage, CheckoutView
│       ├── components/     # ProductCard, LanguageSelector, PromoStrip, CartDrawer
│       ├── composables/    # useCulture, useHelpers, useBasket
│       ├── services/       # api.ts — all BFF calls
│       ├── types/          # TypeScript interfaces (incl. Basket types)
│       └── locales/        # en.json, sv.json
├── mockdata/               # JSON fixtures for mock mode
├── bff/mockBasket.js       # In-memory basket used in mock mode
├── run.ps1                 # PowerShell script to start everything
└── fetchdata/              # HTTP files for refreshing mock data
```


## Quick Start

### Prerequisites
- Node.js (v18+)
- npm

### Option A: Using `run.ps1` (Windows PowerShell)

```powershell
.\run.ps1
```

This installs dependencies (if needed), starts both the BFF and the frontend, and opens `http://localhost:5173` in your browser. Press `Ctrl+C` to stop.

Four switches point it somewhere else without editing a file, each with a short form:

| Switch | | Meaning |
|---|---|---|
| `-ApplicationId` | `-a` | Which application (storefront) to show |
| `-CategorySeed` | `-c` | Root category the product list is scoped to |
| `-Slug` | `-s` | Tenant slug in the API host name |
| `-Environment` | `-e` | `playground`, `stage` or `prod` |

```powershell
.\run.ps1 -a 1042 -c 5                 # Norce Open Demo on playground
.\run.ps1 -a 1234 -c 7 -e stage        # same slug, stage instead
.\run.ps1 -a 1234 -c 7 -s acme -e prod # a single-tenant customer
```

`-s` defaults to the multi-tenant `norcecommerce` slug and `-e` to `playground`.
The application id is what selects the tenant, so the neutral slug reaches most
of them — single-tenant customers have their own deployment and need `-s`.

**Naming a tenant or a host also selects live mode.** Asking for application 1234
and being served the Open Demo fixtures is never what was meant, so these
switches set `MOCK_DATA=false`. If the credentials are not in place, the BFF says
what is missing and stops rather than falling back to the fixtures.

The images follow the tenant on their own: the frontend derives the media CDN
host from the client id in `GetApplication`, so there is nothing else to change.

**Checkout writes.** The basket and NCO endpoints create rows in whatever tenant
the BFF is pointed at, so the switch that changes tenant also decides where an
order attempt lands. Live mode says so at startup.

### Option B: Manual Start

**Terminal 1 — BFF:**
```bash
cd bff
npm install
npm run dev
```

`npm run dev` runs the BFF under `node --watch`, so editing `index.js` or
`mockBasket.js` reloads it — no manual restart. (`npm start` runs it without
watching.) A reload resets the in-memory mock basket, so a cart you built up in
mock mode empties when you edit the backend.

The frontend needs no restart at all: Vite hot-reloads components, styles and
translations. Two things it does not pick up, because they are only read at
startup — `productpage-vue/.env` and `bff/.env`.

**Terminal 2 — Frontend:**
```bash
cd productpage-vue
npm install
npm run dev
```

Open `http://localhost:5173`.

TypeScript is checked with `vue-tsc`, not just transpiled away. `npm run build`
runs the check first; to check without building:

```bash
cd productpage-vue
npm run typecheck
```


## Which environment to run against

The defaults point at Norce Open Demo on playground, which needs no setup of its
own. If you have your own playground or stage application, use that instead and
work with your own data — that is the expected way to do the exercises. No lesson
depends on a particular product or category existing, so any application you can
reach will do.

Open Demo is shared, and its contents change while you work. Treat what you see
there as an example, not as a fixture.


## Configuration

Copy the examples and fill in your credentials:

```bash
cp bff/.env.example bff/.env
cp productpage-vue/.env.example productpage-vue/.env
```

Both `.env` files are gitignored.

### BFF (`bff/.env`)

| Variable | Description | Default |
|---|---|---|
| `MOCK_DATA` | Force mock mode (`true`/`false`) | auto-detected |
| `API_BASE` | Norce API base URL — `<slug>.api-<region>.playground.norce.tech` | — **required** |
| `OAUTH_ID` | OAuth2 client ID | — **required** |
| `OAUTH_SECRET` | OAuth2 client secret | — **required** |
| `OAUTH_SCOPE` | OAuth scope | `playground` |
| `APPLICATION_ID` | Norce application ID — decides which tenant you reach | — **required** |
| `CATEGORY_SEED` | Root category the product list and filters are scoped to | — **required** |
| `IDENTITY_PATH` | Token endpoint path | `/identity/1.0/connect/token` |
| `PRODUCT_SERVICE` | Product service path | `/commerce/product/1.1` |
| `METADATA_SERVICE` | Metadata service path | `/commerce/metadata/1.1` |
| `SHOPPING_SERVICE` | Shopping service path | `/commerce/shopping/1.1` |
| `LOG_REQUESTS` | Log incoming BFF requests | `true` |

Credentials do not have to be written into `.env`. The file supports variable
expansion, so it can point at environment variables that already exist on your
machine — handy when your secrets live in a shell profile or a secret manager
under different names:

```bash
OAUTH_ID="${MY_NORCE_CLIENT_ID}"
OAUTH_SECRET="${MY_NORCE_CLIENT_SECRET}"
```

Exporting `OAUTH_ID` and `OAUTH_SECRET` under those exact names works too,
since `dotenv` never overrides variables that are already set. Prefer the
expansion above over passing them on the command line: `run.ps1` launches the
BFF through `cmd.exe`, so anything you set only for one shell invocation does
not reach it.

`APPLICATION_ID` and `CATEGORY_SEED` deliberately have no defaults. They decide
which tenant and which slice of the catalogue the storefront shows, and a stale
default produces an empty shop rather than an error. Setting `MOCK_DATA=false`
without credentials does not silently serve fixtures either — the BFF prints a
banner saying it fell back to mock mode and which variables are missing.

### Frontend (`productpage-vue/.env`)

| Variable | Description | Default |
|---|---|---|
| `VITE_MEDIA_CDN_HOST` | Media CDN environment | `https://media.playground.cdn-norce.tech` |

Norce returns images and files as keys (GUIDs) — only external links (e.g.
YouTube) come back with a `Path`. Media is served per client:

```
https://media.<environment>.cdn-norce.tech/<clientId>/<fileKey>
```

The client id is **not** configured. It comes from `GetApplication`
(`Client.Id` — 1000 for Norce Open Demo, for instance), so switching
`APPLICATION_ID` switches the images with it. Only the environment is a
setting:

```
playground:  https://media.playground.cdn-norce.tech
stage:       https://media.stage.cdn-norce.tech
production:  https://media.cdn-norce.tech
```

The per-slug form (`https://<slug>.playground.cdn-norce.tech/<fileKey>`) serves
the same files, but needs the tenant slug — which the storefront has no way to
know from the application alone.

Checkout (NCO) variables. The four marked **required** have no default: a
tenant-specific fallback would silently point you at the wrong merchant or
payment method, so the BFF warns at startup instead when they are missing.

| Variable | Description | Default |
|---|---|---|
| `NCO_BASE` | NCO API base URL | — **required** |
| `NCO_MERCHANT` | NCO merchant identifier | — **required** |
| `NCO_CHANNEL` | NCO payment channel | — **required** |
| `NCO_PAYMENT_METHOD_ID` | Payment method set on the basket | — **required** |
| `NCO_DELIVERY_METHOD_ID` | Delivery method set on the basket | — (initiate may reject the order without it) |
| `NCO_NORCE_ADAPTER` | NCO Norce adapter path | `/checkout/norce-adapter` |
| `NCO_NONPSP_ADAPTER` | NCO non-PSP adapter path | `/checkout/nonpsp-adapter` |
| `NCO_ORDER_API` | NCO Order API path | `/checkout/order` |
| `NCO_TOKEN` | Pre-issued NCO bearer token (skips OAuth for NCO calls) | — |


## Mock Mode

If `API_BASE`, `OAUTH_ID` or `OAUTH_SECRET` are missing — or `MOCK_DATA=true` —
the BFF serves local data and no Norce credentials are needed. This is the
default first-run experience.

- **Product data** comes from the JSON fixtures in `/mockdata`.
- **The basket is real**, in the sense that it lives in memory in
  `bff/mockBasket.js`. Add, change quantity and remove all work, totals are
  recalculated, and the response mirrors the Shopping Service format — including
  two things worth noticing: basket rows return `Price: 0` (the charged price is
  `PriceDisplay` / `PriceDisplayIncVat`), and the basket contains a freight
  **fee row** (`Type: 3`) alongside the product rows (`Type: 1`).
- **The NCO checkout steps** are served from the `checkout-*.json` fixtures.
  They return canned responses, so the payment flow can be walked through, but
  no order is created. Exercising NCO for real needs live credentials.

`mockdata/basket.json` is kept as reference documentation of a real `GetBasket`
response; it is no longer served directly.

## BFF Endpoints

### Product endpoints (same as storefront)

| Endpoint | Norce API | Mock file |
|---|---|---|
| `GET /api/products` | `ListProducts2` | `productlist.json` |
| `GET /api/productfilters` | `ListProductFilters2` | `productfilters.json` |
| `GET /api/product/:uniqueName` | `GetProductByUniqueName` | `product.json` |
| `GET /api/relations/:productId` | `ListProductRelations` | `relations.json` |
| `GET /api/promos/:uniqueName` | `ListPromotionsByProductUniqueName` | `promos.json` |
| `GET /api/flags` | `ListFlags` | `flags.json` |
| `GET /api/application` | `GetApplication` (Metadata) | `cultures.json` |

`/api/application` returns `{ Id, Name, Url, ClientId, ClientName, Cultures }`. It used to be
`/api/cultures` and threw away everything but the culture list — including
`Name`, which is the storefront's own title and is what the header shows.

### Basket endpoints

Only `PartNo` and `Quantity` are accepted from the browser. Prices are never
read from the request body — the price list decides the price, server side.

| Endpoint | Norce API | Mock mode |
|---|---|---|
| `GET /api/basket/:basketId` | `GetBasket` | in-memory basket |
| `POST /api/basket` | `CreateBasket` | in-memory basket |
| `POST /api/basket/:basketId/items` | `InsertBasketItem` | in-memory basket |
| `PUT /api/basket/:basketId/items/:itemId` | `UpdateBasketItem` | in-memory basket |
| `DELETE /api/basket/:basketId/items/:lineNo` | `DeleteBasketItem` | in-memory basket |

### Checkout endpoints (NCO)

| Endpoint | NCO API | Mock file |
|---|---|---|
| `POST /api/checkout/initiate` | Initiate checkout order | `checkout-initiate.json` |
| `POST /api/checkout/nonpsp/.../payments` | Create non-PSP payment | `checkout-payment.json` |
| `PUT /api/checkout/nonpsp/.../payments/:id` | Update non-PSP payment | `checkout-payment.json` |
| `POST /api/checkout/nonpsp/.../complete` | Complete payment | `checkout-complete.json` |
| `PUT /api/checkout/orders/:id/customer/billing` | Update billing | `checkout-billing.json` |
| `PUT /api/checkout/orders/:id/customer/shipping` | Update shipping | `checkout-shipping.json` |


## Branches

One branch per course:

- **`main`** — the full demo: products, filtering, product detail, basket, NCO
  and non-PSP payment. Used in *Developer Fundamentals: Checkout*. This is the
  default branch, so a plain clone gives you the checkout demo.
- **`storefront`** — products, filtering, product detail and multi-language
  only, with no basket or checkout code. Used in
  *Developer Fundamentals: Storefront*.

For the storefront course:

```bash
git clone https://github.com/NorceTech/norce-product-vue.git
cd norce-product-vue
git checkout storefront
```


## Maintenance

Maintained by the Norce Academy team as the follow-along code for Developer
Fundamentals. The course lessons link to specific branches and tags, so changes
that move code between branches are coordinated with the lesson content rather
than made in passing.

For questions about the course itself, use the feedback button in Norce Academy.


## License

MIT — see [LICENSE](LICENSE).

Norce also publishes `Storm.Sample.Storefront`, a .NET sample storefront, which
is the reference for partners working on that stack. This repository is the one
the Academy courses follow, because it matches what the lessons teach.
