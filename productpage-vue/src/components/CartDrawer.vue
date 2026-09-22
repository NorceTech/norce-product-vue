<template>
  <teleport to="body">
    <div v-if="isDrawerOpen" class="cart-drawer">
      <button class="cart-backdrop" @click="closeDrawer" aria-label="Close cart drawer"></button>
      <aside ref="panel" class="cart-panel" role="dialog" aria-modal="true" :aria-label="$t('cart.title')">
        <header class="cart-header">
          <h2>{{ $t('cart.title') }}</h2>
          <button class="cart-close" @click="closeDrawer" aria-label="Close cart drawer">&times;</button>
        </header>

        <!-- Product rows only. Fee rows (freight etc.) are shown read-only below. -->
        <section v-if="productItems.length" class="cart-items">
          <article v-for="item in productItems" :key="item.LineNo ?? item.Id" class="cart-item">
            <div class="cart-item-main">
              <div class="cart-item-title">{{ item.Name || item.PartNo }}</div>
              <div class="cart-item-meta">{{ item.PartNo }}</div>
            </div>
            <div class="cart-item-controls">
              <input
                class="cart-qty"
                type="number"
                min="1"
                max="9999"
                :value="item.Quantity"
                :disabled="isLoading"
                @change="onQuantityChange(item, $event)"
              />
              <div class="cart-item-price">
                {{ formatCurrency(resolveUnitPrice(item, false)) }}
              </div>
              <button class="cart-remove" :disabled="isLoading" @click="removeItem(item)">
                {{ $t('cart.remove') }}
              </button>
            </div>
          </article>
        </section>

        <section v-else class="cart-empty">
          <p>{{ $t('cart.empty') }}</p>
        </section>

        <footer class="cart-footer">
          <div class="cart-summary">
            <div v-for="fee in feeItems" :key="fee.LineNo ?? fee.Id" class="cart-summary-row">
              <span>{{ fee.Name }}</span>
              <strong>{{ formatCurrency(resolveUnitPrice(fee, false) * (fee.Quantity ?? 1)) }}</strong>
            </div>
            <div class="cart-summary-row">
              <span>{{ $t('cart.subtotal') }}</span>
              <strong>{{ formatCurrency(subtotal) }}</strong>
            </div>
            <div class="cart-summary-row">
              <span>{{ $t('cart.subtotalIncVat') }}</span>
              <strong>{{ formatCurrency(subtotalIncVat) }}</strong>
            </div>
          </div>
          <button class="btn btn-outline cart-clear" :disabled="isLoading" @click="clearBasket">
            {{ $t('cart.clear') }}
          </button>
          <router-link to="/checkout" class="btn primary cart-checkout" @click="closeDrawer">
            {{ $t('cart.checkout') }}
          </router-link>
        </footer>
      </aside>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useBasket } from '@/composables/useBasket'
import { useCulture } from '@/composables/useCulture'
import { formatMoney } from '@/composables/useHelpers'
import type { BasketItem } from '@/types'

const {
  basket,
  productItems,
  feeItems,
  isDrawerOpen,
  isLoading,
  closeDrawer,
  removeItem,
  updateItemQuantity,
  subtotal,
  subtotalIncVat,
  resolveUnitPrice,
  clearBasket,
} = useBasket()
const { culture } = useCulture()

function onQuantityChange(item: BasketItem, event: Event) {
  const target = event.target as HTMLInputElement
  const nextQuantity = Number.parseInt(target.value, 10)
  if (Number.isNaN(nextQuantity)) return
  updateItemQuantity(item, nextQuantity)
}

function formatCurrency(value: number) {
  return formatMoney(value, basket.value?.CurrencyCode || 'SEK', culture.value)
}

/*
 * The panel says role="dialog" aria-modal="true", which is a promise to the
 * screen reader that the rest of the page is out of reach. It was not: focus
 * stayed where it was, Tab walked straight through the obscured page behind the
 * drawer, and Escape did nothing. Either behave like a modal or stop claiming to
 * be one.
 */
const panel = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

function focusable(): HTMLElement[] {
  if (!panel.value) return []
  return Array.from(panel.value.querySelectorAll<HTMLElement>(FOCUSABLE))
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeDrawer()
    return
  }

  if (event.key !== 'Tab') return

  const items = focusable()
  if (!items.length) return

  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement as HTMLElement | null

  // Wrap at both ends, and pull focus back in if it has escaped the panel.
  if (event.shiftKey && (active === first || !panel.value?.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !panel.value?.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

watch(isDrawerOpen, async (open) => {
  if (open) {
    previouslyFocused = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', onKeydown)
    await nextTick()
    focusable()[0]?.focus()
  } else {
    document.removeEventListener('keydown', onKeydown)
    // Back to the button that opened it, so keyboard users do not restart at the
    // top of the document every time they close the cart.
    previouslyFocused?.focus()
    previouslyFocused = null
  }
})

onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>
