import { createApp, ref, provide, watch } from 'vue'
import App from './App.vue'
import router from './router'
import './assets/style.css'
import { setCulture } from './services/api' // Import setCulture
import { createI18n } from 'vue-i18n' // Import createI18n
import { useCulture } from './composables/useCulture' // Import useCulture

// Import translation files
import en from './locales/en.json'
import sv from './locales/sv.json'

const app = createApp(App)

const { culture } = useCulture(); // Use the global culture state

const isCultureInitialized = ref(false); // Flag to indicate when app is ready (cultures loaded etc)
app.provide('culture', culture)
app.provide('isCultureInitialized', isCultureInitialized);

// Locale keys must match the culture codes Norce returns from GetApplication.
// This application uses en-GB, so registering only 'en-US' meant English
// resolved through the fallback rather than as a real locale. Both codes are
// registered so either tenant setup works.
const messages = {
  'en-GB': en,
  'en-US': en,
  'sv-SE': sv
};

const i18n = createI18n({
  locale: culture.value, // set locale
  fallbackLocale: 'en-GB', // set fallback locale
  messages, // set locale messages
  legacy: false, // Use Composition API
  globalInjection: true, // Make $t available globally
});

// Watch for changes in the global culture ref and update the API service and i18n locale.
// Synchronously, as the router sets the culture: the first one is set right
// before the app mounts, and the first render and the first API calls have to
// be in that language already.
watch(culture, (newCulture) => {
  setCulture(newCulture);
  i18n.global.locale.value = newCulture; // Update i18n locale
}, { flush: 'sync' });

// Initialize the API service with the current culture
setCulture(culture.value);

// Mounted only once the first navigation is done, because that is what sets the
// culture: before it, nothing knows which language the page is in. An address
// without a culture waits here for GetApplication too - see router/index.js.
// Mounted even when that navigation failed, which Vue Router has already
// logged: with the BFF down, the header's warning banner is the only thing that
// can say so.
app.use(router).use(i18n);
router.isReady().catch(() => {}).finally(() => app.mount('#app'));
