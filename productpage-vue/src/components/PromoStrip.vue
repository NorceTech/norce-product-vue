<script setup lang="ts">
import { ref, computed } from 'vue'
import type { CSSProperties } from 'vue'

import { cdnImg } from '@/composables/useHelpers' // Import cdnImg for PromoCard's logic

import type { Promotion } from '@/types'

const props = defineProps<{
  promos: Promotion[]
}>()

// --- Start Inlined PromoCard logic ---
// These refs and functions will be inside the v-for loop context, but declared once here.
// Each iteration of v-for will create new instances of these for each promo.
// For now, let's declare them as if they are part of a single PromoCard and adapt later if needed.
const isOpen = ref(false)
const activePromoId = ref<number | null>(null)
const rect = ref<DOMRect | null>(null)
const anchor = ref<HTMLElement | null>(null)
const popover = ref<any>(null) // This refers to PromoPopover component instance
let closeTimer: ReturnType<typeof setTimeout> | null = null

function open(event?: MouseEvent | FocusEvent, promoId?: number){
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  if (isOpen.value && activePromoId.value === promoId) return

  const target = event?.currentTarget as HTMLElement | null
  if (target) {
    anchor.value = target
    rect.value = target.getBoundingClientRect()
  } else {
    rect.value = anchor.value?.getBoundingClientRect() || null
  }
  activePromoId.value = promoId ?? null
  isOpen.value = true
  window.addEventListener('click', onDoc, true)
}
function close(){
  closeTimer = setTimeout(() => {
    isOpen.value = false
    activePromoId.value = null
    window.removeEventListener('click', onDoc, true)
  }, 100)
}
function onDoc(e: MouseEvent){
  if (anchor.value?.contains(e.target as Node)) return
  if (popover.value?.popover?.contains(e.target as Node)) return
  close()
}
// --- End Inlined PromoCard logic ---

// --- Start Inlined PromoPopover logic ---
const style = computed<CSSProperties>(() => {
  // Use rect from PromoCard logic
  if (!rect.value) return {}
  const pad = 8
  const top = window.scrollY + rect.value.top - 0   // above/side tweak later if needed
  const left = window.scrollX + rect.value.left + rect.value.width + pad
  return { position:'absolute', top: `${top}px`, left: `${left}px`, zIndex: 9999 }
})
// --- End Inlined PromoPopover logic ---
</script>

<template>
  <div v-if="promos && promos.length > 0" class="promo-strip">
    <!-- Start Inlined PromoCard template -->
    <div v-for="promo in promos" :key="promo.Id"
         class="promo-card"
         @mouseenter="open($event, promo.Id)" @mouseleave="close()"
         @focusin="open($event, promo.Id)" @focusout="close()"
         @keydown.esc="close()" tabindex="0" :aria-label="promo?.Name || $t('promoStrip.defaultPromotionName')"
         >
      <div class="promo-img">
        <img v-if="promo?.ImageKey"
             :src="cdnImg(promo.ImageKey, '?h=120&w=120')" :alt="promo?.Name || $t('promoStrip.defaultPromotionName')">
        <div v-else class="promo-pill">{{ promo?.Name || $t('promoStrip.defaultPromotionName') }}</div>
      </div>
      <teleport to="body">
        <div
          ref="popover"
          v-if="isOpen && activePromoId === promo.Id"
          class="promo-pop"
          :style="style"
          role="dialog"
          aria-modal="false"
          @mouseenter="open($event, promo.Id)"
          @mouseleave="close()"
          @focusin="open($event, promo.Id)"
          @focusout="close()"
        >
          <button class="pop-close" @click="close()" :aria-label="$t('promoStrip.close')">×</button>
          <h4 v-if="promo?.Name">{{ promo.Name }}</h4>
          <p v-if="promo?.Header" class="muted">{{ promo.Header }}</p>
          <p v-if="promo?.ShortDescription">{{ promo.ShortDescription }}</p>
        </div>
      </teleport>
    </div>
    <!-- End Inlined PromoCard template -->
  </div>
</template>

<style scoped>
@import './PromoStrip.css';
</style>
