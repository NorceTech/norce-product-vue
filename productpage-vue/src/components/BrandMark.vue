<script setup lang="ts">
// Demo-only - the logo from the storefront theme, see composables/useTheme.ts.
// Without a theme logo this is just the storefront name, which is all the
// header needs for the lessons. With one, the logo sits in front of the name.
import { ref, watch } from 'vue'
import { useTheme } from '@/composables/useTheme'

defineProps<{ name: string }>()

const { logoUrl } = useTheme()

// A logo that fails to load falls back to the name rather than leaving a
// broken image in the header.
const logoFailed = ref(false)
watch(logoUrl, () => { logoFailed.value = false })
</script>

<template>
  <span v-if="logoUrl && !logoFailed" class="brand-with-logo">
    <!-- alt is empty: the name next to it already says what the logo says. -->
    <img :src="logoUrl" alt="" class="brand-logo" @error="logoFailed = true" />
    <span class="brand-name">{{ name }}</span>
  </span>
  <template v-else>{{ name }}</template>
</template>

<style scoped>
@import './BrandMark.css';
</style>
