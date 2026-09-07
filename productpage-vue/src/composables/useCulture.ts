import { ref, watch } from 'vue';

const STORAGE_KEY = 'user_culture';
const DEFAULT_CULTURE = 'sv-SE';

// Create a global ref so state is shared across the app
const culture = ref<string>(localStorage.getItem(STORAGE_KEY) || DEFAULT_CULTURE);

// Watch for changes and update localStorage
watch(culture, (newCulture) => {
  localStorage.setItem(STORAGE_KEY, newCulture);
});

export function useCulture() {
  const updateCulture = (newCulture: string) => {
    culture.value = newCulture;
  };

  return {
    culture,
    updateCulture,
  };
}
