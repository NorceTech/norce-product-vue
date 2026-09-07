// Helper functions for working with Norce product data.

interface FileLike {
    Key?: string;
    Path?: string | null;
    Name?: string;
    ImageAltText?: string;
    VariantImageAltText?: string;
}

import type { Flag } from '@/types/Flag'

// Norce media CDN. Each client's media lives under its own id:
//   https://media.<environment>.cdn-norce.tech/<clientId>/<fileKey>
//
// The client id comes from GetApplication (Client.Id), so the storefront works
// out where its own images live rather than being configured separately - point
// APPLICATION_ID at another tenant and the images follow. Only the environment
// is configuration, via VITE_MEDIA_CDN_HOST.
const MEDIA_CDN_HOST: string = (
    import.meta.env.VITE_MEDIA_CDN_HOST || 'https://media.playground.cdn-norce.tech'
).replace(/\/+$/, '');

let mediaClientId: number | string | null = null;

/** Set once the application has loaded - see App.vue. */
export const setMediaClient = (clientId: number | string | null | undefined): void => {
    mediaClientId = clientId ?? null;
};

// Empty until the application is known. Views only render after App.vue has
// loaded it, so in practice this is set before any image is asked for.
const mediaBase = (): string =>
    mediaClientId == null ? '' : `${MEDIA_CDN_HOST}/${mediaClientId}/`;

// The key is the file's unique identifier in Norce media storage. The query
// string controls transforms (e.g. ?h=640 for height).
export const cdnImg = (key: string, q: string = ''): string => {
    const base = mediaBase();
    return base ? `${base}${key}${q}` : '';
};

// Path is only populated for external links (e.g. YouTube). Images carry a Key
// that must be combined with the CDN host.
export const fileUrl = (f: FileLike): string => {
    if (f.Path) return f.Path;
    const base = mediaBase();
    return base ? `${base}${f.Key}` : '';
};

// Norce returns dates in Microsoft JSON format: "/Date(1234567890000)/"
// The culture is a parameter for the same reason as in formatMoney: a hard-coded
// locale leaves Swedish dates on an English page.
export const parseNorcedate = (
    msJson: string | null | undefined,
    culture: string = 'sv-SE',
): string => {
    if (!msJson) return '-';
    const match = msJson.match(/\d+/);
    if (!match) return '-';
    return new Date(Number(match[0])).toLocaleDateString(culture, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

// Money formatting. The culture the user picked decides the number format and
// the basket/product currency decides the symbol - never hard-code either, in an
// app whose whole point is partly multi-culture support.
export const formatMoney = (
    value: number | null | undefined,
    currencyCode: string = 'SEK',
    culture: string = 'sv-SE',
): string =>
    (value ?? 0).toLocaleString(culture, { style: 'currency', currency: currencyCode });

export const getAlt = (obj: FileLike, fallback: string = ''): string =>
    obj.ImageAltText || obj.VariantImageAltText || obj.Name || fallback;

// Only show flags from groups 1 (Marketing) and 4 (Product).
// Skip internal selection flags used for merchandising rules.
export const showFlag = (f: Flag): boolean =>
    [1, 4].includes(f.GroupId) &&
    !['fl_selections_aproducts', 'fl_selections_bproducts', 'fl_selections_cproducts'].includes(f.Code);
