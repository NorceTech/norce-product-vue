<template>
  <teleport to="body">
    <div v-if="isDrawerOpen" class="cart-drawer">
      <button class="cart-backdrop" @click="closeDrawer" aria-label="Close cart drawer"></button>
      <aside class="cart-panel" role="dialog" aria-modal="true">
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
                @change="onQuantityChange(item, $event)"
              />
              <div class="cart-item-price">
                {{ formatCurrency(resolveUnitPrice(item, false)) }}
              </div>
              <button class="cart-remove" @click="removeItem(item)">
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
          <button class="btn btn-outline cart-clear" @click="clearBasket">
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
import { useBasket } from '@/composables/useBasket'
import { useCulture } from '@/composables/useCulture'
import { formatMoney } from '@/composables/useHelpers'
import type { BasketItem } from '@/types'

const {
  basket,
  productItems,
  feeItems,
  isDrawerOpen,
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
</script>
