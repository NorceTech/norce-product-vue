import { createRouter, createWebHistory } from 'vue-router';
import ProductPage from '../views/ProductPage.vue';
import ProductListView from '../views/ProductListView.vue';

const routes = [
  {
    path: '/',
    name: 'ProductListView',
    component: ProductListView,
  },
  {
    path: '/product/:uniqueName',
    name: 'ProductPage',
    component: ProductPage,
    props: true,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
