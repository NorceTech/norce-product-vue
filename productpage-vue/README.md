# productpage-vue

The Vue 3 frontend of the reference storefront. It renders the product list,
the product detail page, filtering and the language switch, and it talks only
to the BFF in `../bff` — never to the Norce APIs directly.

See the [repository README](../README.md) for prerequisites, how to start both
parts, configuration and the branch layout. Nothing is configured in this
directory beyond `.env` (copy `.env.example`), which holds only the media CDN
host.

## Layout

```text
src/
├── assets/       # global CSS and images
├── components/   # reusable components
├── composables/  # shared state and helpers
├── locales/      # en.json, sv.json (vue-i18n)
├── services/     # api.ts — every BFF call
├── types/        # TypeScript interfaces
└── views/        # one component per route
```

TypeScript is checked rather than transpiled away: `npm run typecheck` runs
`vue-tsc --noEmit`, and `npm run build` runs the check first.
