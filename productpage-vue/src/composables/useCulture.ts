import { ref } from 'vue';

// The culture of the page on screen. The address is where it lives - the router
// sets it here on every navigation (see router/index.js), and nothing else
// should. Empty until the first navigation has happened.
//
// It used to be kept in localStorage instead, which made the culture a property
// of the browser rather than of the address: a product link opened in another
// culture than it was made in found nothing, because unique names are per
// culture.
const culture = ref<string>('');

export function useCulture() {
  const updateCulture = (newCulture: string) => {
    culture.value = newCulture;
  };

  return {
    culture,
    updateCulture,
  };
}
