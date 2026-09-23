<script setup lang="ts">
// Demo-only - the logo from the storefront theme, see composables/useTheme.ts.
// Without a theme logo this is just the storefront name, which is all the
// header needs for the lessons.
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
  <img v-if="logoUrl && !logoFailed" :src="logoUrl" :alt="name" class="brand-logo"
       @error="logoFailed = true" />
  <template v-else>{{ name }}</template>
</template>

<style scoped>
@import './BrandMark.css';
</style>
