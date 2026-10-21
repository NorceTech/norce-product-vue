import { createRouter, createWebHistory } from 'vue-router';
import ProductPage from '../views/ProductPage.vue';
import ProductListView from '../views/ProductListView.vue';
import api from '../services/api';
import { useCulture } from '../composables/useCulture';

// An address without a culture - the start page, or a product link from before
// the culture was part of the path - goes to the application's primary culture.
// That is the culture Norce itself answers in when a call names none, and
// GetApplication says which one it is. App.vue asks for the same application;
// the BFF caches it, so asking twice costs one cache hit.
async function toPrimaryCulture(to) {
  const { data } = await api.getApplication();
  if (!data?.PrimaryCulture) {
    throw new Error('GetApplication returned no primary culture');
  }
  return `/${data.PrimaryCulture}${to.fullPath}`;
}

const routes = [
  {
    // Every page sits under its culture, written exactly as GetApplication
    // returns it: /sv-SE/product/... Unique names are per culture, so a product
    // address only means something together with the culture it was made in.
    path: '/:culture',
    children: [
      {
        path: '',
        name: 'ProductListView',
        component: ProductListView,
      },
      {
        path: 'product/:uniqueName',
        name: 'ProductPage',
        component: ProductPage,
        props: true,
      },
    ],
  },
  // No component: these never render, they always move on. The names are what
  // makes Vue Router match them at all - a record with neither a component nor
  // a name is taken for a parent of other routes.
  { path: '/', name: 'StartWithoutCulture', beforeEnter: toPrimaryCulture },
  { path: '/product/:uniqueName', name: 'ProductWithoutCulture', beforeEnter: toPrimaryCulture },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// The address decides the culture; useCulture only holds it for the rest of the
// app - the API client, the translations, the basket. Links to a named route
// keep it without saying so, because Vue Router fills a missing required param
// from the current address.
//
// After the navigation, not before: a view that is being left must not see the
// new culture while it is still mounted, or it would reload itself in a
// language it is about to stop showing.
const { updateCulture } = useCulture();
router.afterEach((to, from, failure) => {
  if (!failure && to.params.culture) {
    updateCulture(to.params.culture);
  }
});

export default router;
