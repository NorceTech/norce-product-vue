# Norce Academy – Developer Fundamentals: Storefront

A Vue 3 webshop storefront built on **Norce Commerce**, used as a training demo in the Norce Academy "Developer Fundamentals Storefront" course.

The project demonstrates how to build a product browsing experience on top of the Norce Commerce Product and Metadata APIs using a Node.js BFF (Backend-for-Frontend) pattern.


## What You'll Learn

This storefront covers the core topics of the course:

- **BFF pattern** — a lightweight Express server that proxies Norce Commerce API calls, handles OAuth2 authentication, and caches responses.
- **Product listing** — fetching products with `ListProducts2`, applying filters with `ListProductFilters2`, and displaying flags with `ListFlags`.
- **Product detail page** — loading a single product with `GetProductByUniqueName`, showing variant selection, image galleries, spec grids, and related products via `ListProductRelations`.
- **Multi-language support** — cultures fetched from `GetApplication` (Metadata Service), with `vue-i18n` for UI translations and `cultureCode` passed to every API call.
- **Mock data mode** — the BFF auto-detects missing credentials and serves local JSON files from `/mockdata`, so the demo runs without API access.


## Project Structure

```
├── bff/                    # Node.js Express BFF
│   ├── index.js            # All endpoints and OAuth logic
│   └── .env.example        # Environment variable template
├── productpage-vue/        # Vue 3 frontend (Vite)
│   └── src/
│       ├── views/          # ProductListView, ProductPage
│       ├── components/     # ProductCard, LanguageSelector, PromoStrip
│       ├── composables/    # useCulture, useHelpers
│       ├── services/       # api.ts — all BFF calls
│       ├── types/          # TypeScript interfaces
│       └── locales/        # en.json, sv.json
├── mockdata/               # JSON fixtures for mock mode
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

### Option B: Manual Start

**Terminal 1 — BFF:**
```bash
cd bff
npm install
npm run dev
```

`npm run dev` runs the BFF under `node --watch`, so editing `index.js` reloads
it — no manual restart. (`npm start` runs it without watching.)

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
| `LOG_REQUESTS` | Log incoming BFF requests | `true` |

If `API_BASE`, `OAUTH_ID` or `OAUTH_SECRET` are missing, the BFF switches to
mock mode. Setting `MOCK_DATA=false` without them does not silently serve
fixtures — it prints a banner naming what is missing.

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
default produces an empty shop rather than an error.

### Frontend (`productpage-vue/.env`)

| Variable | Description | Default |
|---|---|---|
| `VITE_MEDIA_CDN_BASE` | Media CDN host for image and file keys | Norce Open Demo |

Norce returns images and files as keys (GUIDs) — only external links (e.g.
YouTube) come back with a `Path`. The host those keys hang off is
client-specific:

```
playground:  https://<partner-slug>.playground.cdn-norce.tech/
stage:       https://<client-slug>.stage.cdn-norce.tech/
production:  https://<client-slug>.cdn-norce.tech/
```

Point this at the wrong client and every product image 404s while everything
else looks fine.


## BFF Endpoints

| Endpoint | Norce API | Mock file |
|---|---|---|
| `GET /api/products` | `ListProducts2` | `productlist.json` |
| `GET /api/productfilters` | `ListProductFilters2` | `productfilters.json` |
| `GET /api/product/:uniqueName` | `GetProductByUniqueName` | `product.json` |
| `GET /api/relations/:productId` | `ListProductRelations` | `relations.json` |
| `GET /api/promos/:uniqueName` | `ListPromotionsByProductUniqueName` | `promos.json` |
| `GET /api/flags` | `ListFlags` | `flags.json` |
| `GET /api/application` | `GetApplication` (Metadata) | `cultures.json` |

`/api/application` returns `{ Id, Name, Url, Cultures }`. It used to be
`/api/cultures` and threw away everything but the culture list — including
`Name`, which is the storefront's own title and is what the header shows.


## Branches

One branch per course:

- **`storefront`** — products, filtering, product detail and multi-language,
  with no basket or checkout code (this branch). Used in
  *Developer Fundamentals: Storefront*.
- **`main`** — the full demo, adding basket, NCO (Norce Checkout Order) and
  non-PSP payment. Used in *Developer Fundamentals: Checkout*, and the default
  branch.

`main` is the default, so remember to check this branch out:

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
