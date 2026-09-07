// API client for the BFF. All calls go through /api/* on the same origin.
// An Axios interceptor appends the current culture to every GET request
// (except /cultures itself, which is needed to determine available cultures).

import axios from 'axios';

let currentCulture: string = 'en-US';
let bffHealthCallback: ((status: 'ok' | 'error') => void) | null = null;

const apiClient = axios.create({
  baseURL: '/api',
});

apiClient.interceptors.request.use(config => {
  if (config.method === 'get' && config.url && !config.url.includes('/application')) {
    config.params = {
      ...config.params,
      culture: currentCulture,
    };
  }
  return config;
});

// Track BFF health — shows a warning banner in App.vue on network/500 errors
apiClient.interceptors.response.use(
  response => {
    if (bffHealthCallback) {
      bffHealthCallback('ok'); // If successful, set status to ok
    }
    return response;
  },
  error => {
    if (bffHealthCallback) {
      // Only a missing response means the BFF is unreachable. A 5xx means it
      // answered - usually an upstream Norce call failed - and reporting that
      // as "backend is down" sends you looking in the wrong place.
      const unreachable = axios.isAxiosError(error) && !error.response;
      bffHealthCallback(unreachable ? 'error' : 'ok');
    }
    return Promise.reject(error);
  }
);

export const setCulture = (culture: string) => {
  currentCulture = culture;
};

export const setBffHealthCallback = (callback: (status: 'ok' | 'error') => void) => {
  bffHealthCallback = callback;
};

export default {
  getProduct(uniqueName: string) {
    return apiClient.get(`/product/${uniqueName}`);
  },
  getRelations(productId: string | number) {
    return apiClient.get(`/relations/${productId}`);
  },
  getPromos(uniqueName: string) {
    return apiClient.get(`/promos/${uniqueName}`);
  },
  getFlags() {
    return apiClient.get('/flags');
  },
  getProducts(params: Record<string, string>) {
    return apiClient.get('/products', { params });
  },
  getProductFilters(params: Record<string, string>) {
    return apiClient.get('/productfilters', { params });
  },
  getApplication() {
    return apiClient.get('/application');
  },
};
