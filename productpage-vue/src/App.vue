<script setup lang="ts">
import { ref, provide, onMounted, inject, Ref } from 'vue'
import { RouterView } from 'vue-router'
import api, { setBffHealthCallback } from '@/services/api'
import LanguageSelector from '@/components/LanguageSelector.vue'
import { useCulture } from '@/composables/useCulture'
import { setMediaClient } from '@/composables/useHelpers'
import { useBasket } from '@/composables/useBasket'
import CartDrawer from '@/components/CartDrawer.vue'

// Debug overlay - shows API errors during development
type DebugError = { context: string; message: string };

const visible = ref(false);
const errors = ref<DebugError[]>([]);

function showDebugPopup(errorList: DebugError[]) {
  errors.value = errorList;
  visible.value = true;
}

function closeDebugPopup() {
  visible.value = false;
  errors.value = [];
}

// Provided as a plain object, so consumers call debugPopup.show(...) directly.
// It used to be consumed as debugPopup.value.show(...), which silently did
// nothing because .value was always undefined on a plain object.
provide('debugPopup', {
  show: showDebugPopup,
});

const bffStatus = ref<'ok' | 'error'>('ok');

interface Culture {
  Id: number;
  Name: string;
  Code: string;
}

const cultures = ref<Culture[]>([]);
// The storefront's own name, straight from GetApplication.
const applicationName = ref<string>('');
const { culture: globalCulture, updateCulture } = useCulture();
const isCultureInitialized = inject('isCultureInitialized') as Ref<boolean>;
const { itemCount, toggleDrawer, initFromStorage } = useBasket();

onMounted(async () => {
  // Register BFF health callback
  setBffHealthCallback((status) => {
    bffStatus.value = status;
  });

  await initFromStorage();

  try {
    const { data } = await api.getApplication();

    applicationName.value = data?.Name ?? '';
    // Images are served per client, so the CDN follows whichever application
    // the BFF is pointed at.
    setMediaClient(data?.ClientId);
    if (applicationName.value) {
      document.title = applicationName.value;
    }

    if (Array.isArray(data?.Cultures)) {
      // Normalise casing - mock fixtures and the live service have differed here
      cultures.value = data.Cultures.map((c: any) => ({
        Id: c.Id ?? c.id,
        Name: c.Name ?? c.name,
        Code: c.Code ?? c.culture ?? c.code
      }));

      // Validate/Init culture
      const current = globalCulture.value;
      const valid = cultures.value.find(c => c.Code === current);
      if (!valid && cultures.value.length > 0) {
        updateCulture(cultures.value[0].Code);
      }
    } else {
      console.error('GetApplication returned no culture list:', data);
      cultures.value = [];
    }
  } catch (error) {
    console.error('Failed to fetch application:', error);
    cultures.value = [];
  } finally {
    isCultureInitialized.value = true;
  }
});
</script>

<template>
  <header>
    <div class="container header-content">
      <!-- The storefront name comes from GetApplication; the translated
           string is only a fallback for before it has loaded. -->
      <a href="/" class="brand">{{ applicationName || $t('header.brand') }}</a>
      <div class="right-content">
        <LanguageSelector :cultures="cultures" v-if="cultures.length > 0" />
        <button class="cart-button" @click="toggleDrawer">
          {{ $t('cart.button') }}
          <span v-if="itemCount" class="cart-badge">{{ itemCount }}</span>
        </button>
      </div>
    </div>
  </header>

  <div v-if="bffStatus === 'error'" class="bff-error-banner">
    {{ $t('bff.errorMessage') }}
  </div>

  <RouterView :key="globalCulture" />
  <CartDrawer />

  <div v-if="visible" class="debug-popup">
    <div class="debug-popup-content">
      <button @click="closeDebugPopup" class="close-button">&times;{{ $t('debugPopup.close') }}</button>
      <h2>{{ $t('debugPopup.title') }}</h2>
      <ul>
        <li v-for="(error, index) in errors" :key="index">
          <strong>{{ $t('debugPopup.context.' + error.context) }}:</strong> {{ error.message }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
@import './App.css';

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  padding-bottom: 1rem;
}

.right-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.bff-error-banner {
  background-color: #ffdddd;
  color: #d8000c;
  padding: 10px;
  text-align: center;
  font-weight: bold;
  border-bottom: 1px solid #d8000c;
}
</style>
