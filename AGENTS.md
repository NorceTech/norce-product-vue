# AI Agent Reference

Technical reference for AI agents working on this codebase.

## Architecture

- **BFF (`bff/index.js`)** — Express server proxying Norce Commerce APIs (Product, Metadata, Shopping services) and NCO (Norce Checkout Order). Handles OAuth2 client_credentials flow with in-memory token caching.
- **Frontend (`productpage-vue/`)** — Vue 3 + Composition API + TypeScript. Uses `vue-router` (three routes: `/`, `/product/:uniqueName`, `/checkout`) and `vue-i18n`.
- **Mock mode** — BFF serves JSON from `/mockdata` when credentials are missing or `MOCK_DATA=true`. The frontend must always call BFF endpoints — never fetch mock files directly. Use the shared `useMockData` flag for the mock branch in a route; re-reading `process.env.MOCK_DATA` misses the credentials-missing case.
- **`bff/mockBasket.js`** — in-memory basket for mock mode, so add/update/remove work offline. Mirrors the Shopping Service response shape. Prices are resolved from the mock catalogue server-side.

## Branches

- **`storefront`** — storefront only, no basket/checkout code (*Developer Fundamentals: Storefront*).
- **`main`** — that same base plus basket, NCO and non-PSP payment (*Developer Fundamentals: Checkout*). Default branch.

**`storefront` is the base and `main` is built on top of it.** `git diff storefront main` is therefore exactly what checkout adds, and that diff is something the lessons ask participants to read — so it has to stay honest.

**Shared code is changed on `storefront`, and then `storefront` is merged into `main`.** Do not port a shared change to each branch separately. Two hand-kept-identical commits read fine right up until they differ by one line, and from then on the storefront-only change shows up as a *deletion* in the checkout diff. Merging keeps `storefront` an ancestor of `main`, so the relationship holds by construction instead of by discipline. Shared code here means the BFF product endpoints, `ProductCard`, `useHelpers`, the types and the locales.

Two consequences of that rule:

- **Everything on `storefront` is merged into `main` eventually.** A commit deliberately left unmerged breaks the ancestry, which is why this section is worded identically on both branches instead of saying "this branch".
- **Files that legitimately differ per branch** — the READMEs, and the parts of this file that describe checkout — are resolved in `main`'s favour during that merge. They still differ in content; `main` simply carries the later commit. The ancestry is about commits, not about files being identical.

Check the relationship with `git merge-base --is-ancestor storefront main`, which must succeed.

## Key Conventions

- **Pedagogical code** — this is a training demo. Prefer clear, inline code over deep abstraction. Do not paper over an unclear API contract with a long fallback chain: find the right field and write down why.
- **Never send prices from the client** — basket calls carry `PartNo` and `Quantity` only. The BFF whitelists them in `toBasketItem()`. A browser-supplied price is a price manipulation hole and the wrong pattern for students to copy.
- **Price fields differ per service** — Product Service returns `Price` (ex VAT) and `PriceIncVat`. Shopping Service basket rows return `Price: 0`; the charged price is `PriceDisplay` / `PriceDisplayIncVat`, and `PriceOriginal` is the pre-promotion price.
- **Basket rows are not all products** — `Type: 1` is a product row; other types are fee rows (freight) that Norce maintains. Use `productItems` / `feeItems` from `useBasket`, never raw `basket.Items`, for editable UI.
- **Types are enforced** — `npm run typecheck` (`vue-tsc --noEmit`) must pass; `npm run build` runs it first.
- **CSS** — plain CSS in separate `.css` files imported by components, plus a global `style.css`.
- **TypeScript types** — interfaces live in `src/types/`. Basket types are in `Basket.ts`.
- **Norce filter format** — `key1|val1,val2;key2|val3`. `parf` is the exception: its values join with `*` (AND between parametrics, OR within one), and its tokens are `L<pid>_<valueId>`, `M<pid>_<valueId>` or `V<pid>_<from>-<to>`.
- **`/api/application`** — one `GetApplication` call gives the culture list, the storefront name (`Name`) and the owning client (`Client.Id`). The header title comes from there, and so does the media CDN path — media is served per client at `media.<env>.cdn-norce.tech/<clientId>/`, so pointing `APPLICATION_ID` at another tenant moves the images too.
- **`run.ps1 -ApplicationId <id> -CategorySeed <id>`** — switches tenant and root category without editing files. Neither dotenv nor Vite's loadEnv overrides variables already in the environment, which is what makes it work.
- **`RangeSlider.vue`** — shared two-handle slider used by the price filter and every numeric parametric, so they stay consistent. It owns the step-to-value mapping, including the logarithmic one for very wide spans.
- **Nothing tenant-specific in source** — `APPLICATION_ID`, `CATEGORY_SEED`, the NCO merchant/channel/payment method and the media CDN host are all configuration. `categorySeed` used to be hard-coded as `5` in three places and `APPLICATION_ID` defaulted to NOD's `1042`, which made switching tenants a source edit.
- **Mock mode is asked for, never fallen into** — `MOCK_DATA=true` and nothing else. Missing credentials are a startup error naming what is absent, because the old fallback served the Open Demo fixtures whenever `.env` was incomplete: a working storefront showing the wrong tenant, which reads as success. `run.ps1` sets `MOCK_DATA=false` when `-a`, `-s` or `-e` names a tenant or host, and it has to be the script that does it — by the time `index.js` reads `process.env`, a value from the command line and one from `bff/.env` are indistinguishable.
- **`run.ps1 -s <slug> -e <environment>`** composes the API host, and sets `NCO_BASE` to the same host. Moving one without the other puts Commerce and Checkout in different environments, which fails deep in the order flow rather than at startup. Production has no environment segment in the host name.
- **Checkout writes** — the basket and NCO endpoints create rows in whatever tenant the BFF is pointed at. The switch that changes tenant also decides where those rows land, which is why live mode says so at startup.
- **Media CDN** — image and file `Key`s need a client-specific host (`VITE_MEDIA_CDN_BASE`). `Path` is only populated for external links like YouTube, so never rely on it for images.
- **`ProductCard.vue`** — reuse for any product grid. Extend with props rather than duplicating.
- **`useBasket.ts`** — composable managing basket state, localStorage persistence, and all basket API calls. `clearBasket()` deletes the rows in Norce before dropping the local reference; clearing only localStorage leaves a full basket behind on the server.
- **Translations** — all user-facing strings use `vue-i18n` keys in `src/locales/en.json` and `sv.json`.

## Updating Mock Data

Use the HTTP files in `fetchdata/` to refresh `/mockdata` JSON files from a live Norce environment.
