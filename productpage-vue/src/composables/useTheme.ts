import { ref, computed } from 'vue';
import api from '@/services/api';
import { cdnImg } from '@/composables/useHelpers';
import type { Theme } from '@/types';

// Storefront theme from /api/theme: brand colour, accent colour, logo font and
// logo. The BFF validates every value, so this file only has to put them in
// place - and take them away again, because a culture switch can go from a
// themed culture to one without a theme.
//
// Everything lands as CSS variables on <html>, overriding the defaults in
// style.css. Removing a variable is what "default style" means here: the
// :root value in style.css shows through again.

// Shared across the app, like the culture in useCulture.
const theme = ref<Theme>({});

// Only the answer to the most recent call is applied. Switching culture twice
// quickly would otherwise let a slow first answer overwrite the second.
let latestRequest = 0;

const FONT_LINK_ID = 'theme-logo-font';

function setVar(name: string, value: string | undefined) {
    const style = document.documentElement.style;
    if (value) {
        style.setProperty(name, value);
    } else {
        style.removeProperty(name);
    }
}

// The logo font comes from Google Fonts, like the default fonts in index.html.
// The BFF only lets whitelisted names through, and encodeURIComponent keeps
// the name from ever being read as anything but a family name.
function loadFont(family: string | undefined) {
    document.getElementById(FONT_LINK_ID)?.remove();
    if (!family) return;

    const link = document.createElement('link');
    link.id = FONT_LINK_ID;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
    document.head.appendChild(link);
}

function applyTheme(next: Theme) {
    theme.value = next;
    setVar('--primary', next.PrimaryColor);
    setVar('--accent', next.AccentColor);
    // Quoted, because family names like "Playfair Display" contain spaces.
    setVar('--logo-font', next.LogoFont && `"${next.LogoFont}"`);
    loadFont(next.LogoFont);
}

// Call after the application has loaded: the logo URL needs the media client
// id that App.vue sets from GetApplication. The api client adds the culture.
async function loadTheme() {
    const request = ++latestRequest;
    let next: Theme = {};
    try {
        const { data } = await api.getTheme();
        next = data ?? {};
    } catch (error) {
        // The theme is decoration. The BFF already answers {} when Norce
        // fails, so getting here means the BFF itself did not answer.
        console.warn('Could not load the storefront theme; using the default style.', error);
    }
    if (request === latestRequest) applyTheme(next);
}

// ?h=... asks the media CDN for a scaled copy, so a large logo upload is not
// sent at full size to a header that shows it at a fraction of that.
const logoUrl = computed(() =>
    theme.value.LogoImageKey ? cdnImg(theme.value.LogoImageKey, '?h=160') : '');

export function useTheme() {
    return {
        theme,
        logoUrl,
        loadTheme,
    };
}
