# AI Agent Reference

Technical reference for AI agents working on this codebase.

## Architecture

- **BFF (`bff/index.js`)** — Express server proxying Norce Commerce APIs. Handles OAuth2 client_credentials flow with in-memory token caching (via `memory-cache`). All endpoints accept an optional `culture` query parameter, mapped to `cultureCode` in Norce API calls.
- **Frontend (`productpage-vue/`)** — Vue 3 + Composition API + TypeScript. Uses `vue-router` (two routes: `/` and `/product/:uniqueName`) and `vue-i18n` for translations.
- **Mock mode** — BFF serves JSON from `/mockdata` when credentials are missing or `MOCK_DATA=true`. The frontend must always call BFF endpoints — never fetch mock files directly. Use the shared `useMockData` flag for the mock branch in a route; re-reading `process.env.MOCK_DATA` misses the credentials-missing case. And run mock and live responses through the same shaping code — `/api/application` used to return the raw `GetApplication` object in mock mode, which silently removed the language selector.

## Branches

- **`storefront`** — storefront only, no basket/checkout code (*Developer Fundamentals: Storefront*).
- **`main`** — that same base plus basket, NCO and non-PSP payment (*Developer Fundamentals: Checkout*). Default branch.

**`storefront` is the base and `main` is built on top of it.** `git diff storefront main` is therefore exactly what checkout adds, and that diff is something the lessons ask participants to read — so it has to stay honest.

**Shared code is changed on `storefront`, and then `storefront` is merged into `main`.** Do not port a shared change to each branch separately. Two hand-kept-identical commits read fine right up until they differ by one line, and from then on the storefront-only change shows up as a *deletion* in the checkout diff. Merging keeps `storefront` an ancestor of `main`, so the relationship holds by construction instead of by discipline. Shared code here means the BFF product endpoints, `ProductCard`, `useHelpers`, the types and the locales.

Two consequences of that rule:

- **Everything on `storefront` is merged into `main` eventually.** A commit deliberately left unmerged breaks the ancestry, which is why this section is worded identically on both branches instead of saying "this branch".
- **Files that legitimately differ per branch** — the READMEs, and the parts of this file that describe checkout — are resolved in `main`'s favour during that merge. They still differ in content; `main` simply carries the later commit. The ancestry is about commits, not about files being identical.

Check the relationship with `git merge-base --is-ancestor storefront main`, which must succeed.

## BFF Endpoints (storefront branch)

| Endpoint | Norce Service Call | Mock file |
|---|---|---|
| `GET /api/products?culture=xx` | `ListProducts2` | `productlist.json` |
| `GET /api/productfilters?culture=xx` | `ListProductFilters2` | `productfilters.json` |
| `GET /api/product/:uniqueName?culture=xx` | `GetProductByUniqueName` | `product.json` |
| `GET /api/relations/:productId?culture=xx` | `ListProductRelations` | `relations.json` |
| `GET /api/promos/:uniqueName?culture=xx` | `ListPromotionsByProductUniqueName` | `promos.json` |
| `GET /api/flags?culture=xx` | `ListFlags` | `flags.json` |
| `GET /api/application` | `GetApplication` (Metadata Service) | `cultures.json` |

## Key Conventions

- **Pedagogical code** — this is a training demo. Prefer clear, inline code over deep abstraction. Larger components are fine if they're easier to follow in a live demo. Do not paper over an unclear API contract with a long fallback chain: find the right field and write down why.
- **Price fields differ per service** — the Product Service returns `Price` (ex VAT) and `PriceIncVat`. Do not mix inc/ex VAT fields in one fallback chain.
- **Money formatting** — use `formatMoney()` from `useHelpers`; the selected culture decides the format, never a hard-coded locale.
- **Types are enforced** — `npm run typecheck` (`vue-tsc --noEmit`) must pass; `npm run build` runs it first.
- **CSS** — plain CSS in separate `.css` files imported by components, plus a global `style.css`.
- **TypeScript types** — interfaces live in `src/types/`. Respect these contracts.
- **Norce filter format** — `key1|val1,val2;key2|val3` (semicolon-separated groups, pipe-separated key/values, comma-separated multi-values). `parf` is the exception: its values join with `*` (AND between parametrics, OR within one), and its tokens are `L<pid>_<valueId>`, `M<pid>_<valueId>` or `V<pid>_<from>-<to>`.
- **`/api/application`** — one `GetApplication` call gives both the culture list and the storefront name (`Name`). The header title comes from there, not from a hard-coded string.
- **`RangeSlider.vue`** — shared two-handle slider used by the price filter and every numeric parametric, so they stay consistent. It owns the step-to-value mapping, including the logarithmic one for very wide spans.
- **Nothing tenant-specific in source** — `APPLICATION_ID`, `CATEGORY_SEED` and the media CDN host are configuration. `categorySeed` used to be hard-coded as `5` in three places and `APPLICATION_ID` defaulted to NOD's `1042`, which made switching tenants a source edit.
- **Media CDN** — image and file `Key`s need a client-specific host (`VITE_MEDIA_CDN_BASE`). `Path` is only populated for external links like YouTube, so never rely on it for images.
- **A 5xx from the BFF does not mean the BFF is down** — it answered; an upstream Norce call failed. Only a missing response means unreachable.
- **`ProductCard.vue`** — reuse this component for any product grid. Extend with props rather than duplicating.
- **Translations** — all user-facing strings use `vue-i18n` keys in `src/locales/en.json` and `sv.json`.

## Updating Mock Data

Use the HTTP files in `fetchdata/` (e.g. via VS Code REST Client) to refresh `/mockdata` JSON files from a live Norce environment. Keep mock data structure aligned with real API responses.
