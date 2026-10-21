# AI Agent Reference

Technical reference for AI agents working on this codebase.

## Architecture

- **BFF (`bff/index.js`)** — Express server proxying Norce Commerce APIs. Handles OAuth2 client_credentials flow with in-memory token caching (via `memory-cache`). All endpoints accept an optional `culture` query parameter, mapped to `cultureCode` in Norce API calls.
- **Frontend (`productpage-vue/`)** — Vue 3 + Composition API + TypeScript. Uses `vue-router` (two routes under the culture: `/:culture/` and `/:culture/product/:uniqueName`) and `vue-i18n` for translations.
- **Mock mode** — BFF serves JSON from `/mockdata` only when `MOCK_DATA=true`; incomplete live configuration is a startup error, not a fall back to fixtures. The frontend must always call BFF endpoints — never fetch mock files directly. Use the shared `useMockData` flag for the mock branch in a route; re-reading `process.env.MOCK_DATA` misses the credentials-missing case. And run mock and live responses through the same shaping code — `/api/application` used to return the raw `GetApplication` object in mock mode, which silently removed the language selector.

## Branches

- **`storefront`** — the whole Storefront course, basket included, with no checkout code (*Storefront Development*).
- **`main`** — that same base plus checkout: NCO and non-PSP payment (the upcoming Checkout course). Default branch.

**The basket belongs to `storefront`, not to checkout.** `basket-and-customers` is module 6 of the
Storefront course, so a participant who finishes that module and checks `storefront` out has to find
basket code there. The branch point follows the course, and the course ends at the basket.

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
| `GET /api/productpage/:uniqueName?culture=xx` | `GetProductByUniqueName`, `ListPromotionsByProductUniqueName`, `ListFlags` in parallel, then `ListProductRelations` | the four below |
| `GET /api/product/:uniqueName?culture=xx` | `GetProductByUniqueName` | `product.json` |
| `GET /api/relations/:productId?culture=xx` | `ListProductRelations` | `relations.json` |
| `GET /api/promos/:uniqueName?culture=xx` | `ListPromotionsByProductUniqueName` | `promos.json` |
| `GET /api/flags?culture=xx` | `ListFlags` | `flags.json` |
| `GET /api/uniquename/:productId?culture=xx` | `GetProduct` | `product.json` |
| `GET /api/application` | `GetApplication` (Metadata Service) | `cultures.json` |
| `GET /api/basket/:basketId` | `GetBasket` (Shopping Service) | in-memory (`mockBasket.js`) |
| `POST /api/basket` | `CreateBasket` | in-memory |
| `POST /api/basket/:basketId/items` | `InsertBasketItem` | in-memory |
| `PUT /api/basket/:basketId/items/:itemId` | `UpdateBasketItem` | in-memory |
| `DELETE /api/basket/:basketId/items/:lineNo` | `DeleteBasketItem` | in-memory |

The product page makes one call, `/api/productpage`. The BFF composes it from `getProduct`,
`getPromos` and `getFlags` in parallel, then `getRelations` on the product's `Id` — one function per
Norce call, each with its own mock branch, so mock and live run the same orchestration. Keep the
composition in the BFF: a product page that sequences Norce calls from the browser is the pattern
the Storefront Architecture module warns against. Promotions, flags and relations degrade to `[]`
and are named in `errors`; only the product can fail the request. `GetProductByUniqueName` answers
an unknown name with 200 and `null`, not 404, so the endpoint checks for `null` itself. The four
functions take an optional `timeout` that goes on to `fetchData`, which applies it to the token
request too. Only `/api/productpage` passes one, `pageCallTimeout` (4 s): a cold token and two
rounds of reads stay under the browser's 15 s, so a hanging extra fails inside that instead of
holding the product. The single-call routes, the product list and the metadata reads make one
round and pass no timeout, so they keep the browser's full 15 s.

The four single-call routes below it are no longer used by the frontend. They stay because lessons
name them (the endpoint table in *Fetching Product Data*, the `/api/product/any-name` exercise in
*Storefront Architecture*), and are removed together with that lesson change, not before.

`/api/uniquename/:productId` is the product page's language switch. Unique names are per culture
(Open Demo's product 13 is `blaklader-4949-softshell-jakke` in sv-SE, `…-jacket` in en-GB), and
`GetProductByUniqueName` matches a name only in the requested culture or as the product's default
name — see `GetIdPartNoAndUniqueUrlNameByName`. So the page sends the `Id`, which is the same in
every culture, gets the name back from `GetProduct` and `router.replace`s to it. Page loads still go
by unique name, as the lessons teach. Back and Forward across a switch need no lookup: the culture
is in the address, so each entry says which culture its name belongs to.

The basket endpoints take only `PartNo` and `Quantity` from the browser — see `toBasketItem()`.
Forwarding a client-supplied price to `InsertBasketItem` is a price manipulation hole, and the wrong
pattern to copy into a real storefront. `CreateBasket` here sets no payment or delivery method:
choosing those is checkout's job.

`GET /api/theme?culture=xx` (`GetProductByPartNo`, `theme.json`) is left out of the table on purpose: it is demo plumbing in `bff/theme.js`, not part of what the lessons teach.

## Key Conventions

- **Pedagogical code** — this is a training demo. Prefer clear, inline code over deep abstraction. Larger components are fine if they're easier to follow in a live demo. Do not paper over an unclear API contract with a long fallback chain: find the right field and write down why.
- **Price fields differ per service** — the Product Service returns `Price` (ex VAT) and `PriceIncVat`. Do not mix inc/ex VAT fields in one fallback chain.
- **Money formatting** — use `formatMoney()` from `useHelpers`; the selected culture decides the format, never a hard-coded locale.
- **Types are enforced** — `npm run typecheck` (`vue-tsc --noEmit`) must pass; `npm run build` runs it first.
- **Costs never reach the browser** — products and baskets pass through unmapped, except the merchant's costs: `withoutCosts()` drops `CostPurchase` and `CostUnit` from a product and each of its variants, `basketWithoutCosts()` drops `Cost` and `CostUnit` from basket rows. A new route that returns a product or a basket goes through them.
- **CSS** — plain CSS in separate `.css` files imported by components, plus a global `style.css`.
- **TypeScript types** — interfaces live in `src/types/`. Respect these contracts.
- **Norce filter format** — `key1|val1,val2;key2|val3` (semicolon-separated groups, pipe-separated key/values, comma-separated multi-values). `parf` is the exception: its values join with `*` (AND between parametrics, OR within one), and its tokens are `L<pid>_<valueId>`, `M<pid>_<valueId>` or `V<pid>_<from>-<to>`.
- **`/api/application`** — one `GetApplication` call gives the culture list, the primary culture (`PrimaryCulture`, Norce's `Cultures.Default`) and the storefront name (`Name`). The header title comes from there, not from a hard-coded string.
- **The culture lives in the address** — `/sv-SE/product/…`, the code exactly as `GetApplication` returns it. Unique names are per culture, so a product address only means something with its culture; kept in localStorage, a shared link, a bookmark or Back after a language switch found nothing. The router is the only writer of `useCulture`'s ref (`router.afterEach`), so the language selector navigates instead of setting it, and links to a named route keep the culture without passing it, because Vue Router fills a missing required param from the current address. An address without a culture (`/`, an old `/product/:uniqueName`) goes to the application's primary culture, the same one Norce answers in when a call names none — that is the point being shown, so there is no browser-side memory of the last choice. A culture the application does not offer is moved to the primary culture in `App.vue`.
- **`/api/theme` is demo-only, not a pattern** — it lets one demo codebase look different per tenant without a CMS; a real storefront keeps brand styling in frontend code or a CMS, not in a hidden PIM product. Keep it beside the lesson code: the BFF part lives in `bff/theme.js` with one line in `index.js`, the frontend part in `useTheme.ts` and `BrandMark.vue`, and nothing else may depend on it. Every file carries a comment saying so. The theme product is brand colour, logo font and logo from a hidden product (`npv-theme-<applicationId>`, status 4, locked, no price, in a category of its own outside `CATEGORY_SEED` with the `theme_*` parametrics linked), fetched with `GetProductByPartNo` and `statusSeed=4,5`. `GetApplication` does not return the application's Description, which is why it is not used. Parametrics are keyed on `Code` and read from `Value2`; everything is validated and whitelisted, and no theme means the default style. The theme is read without culture unless the product sets `theme_per_culture`.
- **`RangeSlider.vue`** — shared two-handle slider used by the price filter and every numeric parametric, so they stay consistent. It owns the step-to-value mapping, including the logarithmic one for very wide spans.
- **Nothing tenant-specific in source** — `APPLICATION_ID`, `CATEGORY_SEED` and the media CDN host are configuration. `categorySeed` used to be hard-coded as `5` in three places and `APPLICATION_ID` defaulted to NOD's `1042`, which made switching tenants a source edit.
- **Mock mode is asked for, never fallen into** — `MOCK_DATA=true` and nothing else. `run.ps1 -Mock` sets it for one run whatever `bff/.env` says, and refuses to be combined with `-a`, `-s` or `-e`. Missing credentials are a startup error naming what is absent, because the old fallback served the Open Demo fixtures whenever `.env` was incomplete: a working storefront showing the wrong tenant, which reads as success. `run.ps1` sets `MOCK_DATA=false` when `-a`, `-s` or `-e` names a tenant or host, and it has to be the script that does it — by the time `index.js` reads `process.env`, a value from the command line and one from `bff/.env` are indistinguishable.
- **`run.ps1 -s <slug> -e <environment>`** composes the API host, and sets `NCO_BASE` to the same host. Moving one without the other puts Commerce and Checkout in different environments, which fails deep in the order flow rather than at startup. Production has no environment segment in the host name.
- **Media CDN** — image and file `Key`s need a client-specific host (`VITE_MEDIA_CDN_HOST`), which `run.ps1 -e` moves with the API host. `Path` is only populated for external links like YouTube, so never rely on it for images.
- **A 5xx from the BFF does not mean the BFF is down** — it answered; an upstream Norce call failed. Only a missing response means unreachable.
- **`ProductCard.vue`** — reuse this component for any product grid. Extend with props rather than duplicating.
- **`RouterView` is keyed on the page, not the culture** — the path without its culture segment. Another product is another page, so it is built from scratch; keyed on culture alone, a related-product link changed the URL and nothing else. A language switch keeps the view, so every view that shows culture-specific data watches the culture itself. A new view must do the same, or it keeps the old language. `ProductPage` takes the culture as a prop and watches that: only a living page on the same unique name sees it change, so Back to the product in another language is a new page rather than a switch.
- **Translations** — all user-facing strings use `vue-i18n` keys in `src/locales/en.json` and `sv.json`.

## Updating Mock Data

Use the HTTP files in `fetchdata/` (e.g. via VS Code REST Client) to refresh `/mockdata` JSON files from a live Norce environment. Keep mock data structure aligned with real API responses.
