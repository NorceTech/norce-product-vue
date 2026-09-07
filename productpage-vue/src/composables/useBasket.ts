import { ref, computed } from 'vue'
import api from '@/services/api'
import { useCulture } from '@/composables/useCulture'
import type { Basket, BasketItem } from '@/types'

const STORAGE_KEY = 'demo_basket_id'

const basket = ref<Basket | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const isDrawerOpen = ref(false)
let isInitialized = false

function getStoredBasketId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEY)
}

function setStoredBasketId(basketId: string | number | null) {
  if (typeof window === 'undefined') return
  if (basketId) {
    window.localStorage.setItem(STORAGE_KEY, String(basketId))
  } else {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

function setBasket(next: Basket | null) {
  basket.value = next
  if (next?.Id) {
    setStoredBasketId(next.Id)
  }
}

async function loadBasket(basketId?: string | number) {
  const id = basketId ?? getStoredBasketId()
  if (!id) return null

  isLoading.value = true
  error.value = null
  try {
    const response = await api.getBasket(id)
    setBasket(response.data)
    return response.data
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to load basket'
    return null
  } finally {
    isLoading.value = false
  }
}

async function createBasket(initialItems?: BasketItem[]) {
  isLoading.value = true
  error.value = null
  const { culture } = useCulture()
  try {
    const payload: any = {
      culture: culture.value,
    }
    if (initialItems?.length) {
      payload.items = initialItems
    }
    const response = await api.createBasket(payload)
    setBasket(response.data)
    return response.data
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to create basket'
    return null
  } finally {
    isLoading.value = false
  }
}

// Only PartNo and Quantity are sent to the server. The price list decides the
// price, server side - a browser must never be able to state what something
// costs. The BFF enforces the same whitelist in toBasketItem().
function buildItemPayload(item: BasketItem) {
  return {
    PartNo: item.PartNo,
    Quantity: item.Quantity,
  }
}

async function addItem(item: BasketItem) {
  if (!item?.PartNo) return null

  if (!basket.value?.Id) {
    const created = await createBasket([buildItemPayload(item)])
    if (created) isDrawerOpen.value = true
    return created
  }

  isLoading.value = true
  error.value = null
  const { culture } = useCulture()
  try {
    const response = await api.addBasketItem(basket.value.Id, {
      ...buildItemPayload(item),
      culture: culture.value,
    })
    setBasket(response.data)
    isDrawerOpen.value = true
    return response.data
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to add item'
    return null
  } finally {
    isLoading.value = false
  }
}

async function updateItemQuantity(item: BasketItem, quantity: number) {
  if (!basket.value?.Id || !item?.Id) return null

  const nextQuantity = Math.max(1, Math.min(9999, Math.floor(quantity)))
  isLoading.value = true
  error.value = null
  const { culture } = useCulture()

  try {
    const response = await api.updateBasketItem(basket.value.Id, item.Id, {
      ...buildItemPayload({ ...item, Quantity: nextQuantity }),
      culture: culture.value,
    })
    setBasket(response.data)
    return response.data
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to update item'
    return null
  } finally {
    isLoading.value = false
  }
}

async function removeItem(item: BasketItem) {
  if (!basket.value?.Id || item?.LineNo == null) return null

  isLoading.value = true
  error.value = null
  const { culture } = useCulture()

  try {
    const response = await api.deleteBasketItem(basket.value.Id, item.LineNo, {
      culture: culture.value,
    })
    setBasket(response.data)
    return response.data
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to remove item'
    return null
  } finally {
    isLoading.value = false
  }
}

function openDrawer() {
  isDrawerOpen.value = true
}

function closeDrawer() {
  isDrawerOpen.value = false
}

function toggleDrawer() {
  isDrawerOpen.value = !isDrawerOpen.value
}

async function initFromStorage() {
  if (isInitialized) return
  isInitialized = true
  await loadBasket()
}

// Norce basket rows are not all products: Type 1 is a product row, anything
// else is a fee row (freight, invoice fee) that Norce maintains itself. Rows
// without a Type are treated as products so older payloads still work.
const PRODUCT_ROW_TYPE = 1

function isProductRow(item: BasketItem) {
  return item?.Type === undefined || item.Type === PRODUCT_ROW_TYPE
}

/** Editable rows - the things the customer actually put in the basket. */
const productItems = computed(() => basket.value?.Items?.filter(isProductRow) ?? [])

/** Read-only rows: freight and other fees. Shown, but not editable. */
const feeItems = computed(() => basket.value?.Items?.filter((item) => !isProductRow(item)) ?? [])

// Count products only. Counting every row makes the cart badge say 2 when the
// customer added one article and Norce added a freight row.
const itemCount = computed(() =>
  productItems.value.reduce((sum, item) => sum + (item?.Quantity ?? 0), 0)
)

/**
 * Unit price for a basket row.
 *
 * The Shopping Service returns Price: 0 on basket rows - the price actually
 * charged is PriceDisplay (ex VAT) / PriceDisplayIncVat (inc VAT), and
 * PriceOriginal holds the pre-promotion price. Do not go looking for
 * UnitPrice/RowTotal fields; they are not part of this response.
 */
function resolveUnitPrice(item: BasketItem, includeVat = false) {
  if (!item) return 0

  const display = includeVat ? item.PriceDisplayIncVat : item.PriceDisplay
  if (typeof display === 'number') return display

  const original = includeVat ? item.PriceOriginalIncVat : item.PriceOriginal
  return typeof original === 'number' ? original : 0
}

// Fall back to summing rows only if Summary is missing. Norce's own total also
// accounts for fees and order-level promotions, which a client-side sum misses.
function sumRows(includeVat: boolean) {
  return (
    basket.value?.Items?.reduce(
      (sum, item) => sum + resolveUnitPrice(item, includeVat) * (item?.Quantity ?? 0),
      0
    ) ?? 0
  )
}

const subtotal = computed(() => basket.value?.Summary?.Total?.Amount ?? sumRows(false))
const subtotalIncVat = computed(() => basket.value?.Summary?.Total?.AmountIncVat ?? sumRows(true))

/**
 * Empties the basket in Norce, then drops the local reference.
 *
 * Clearing only localStorage would leave a live basket behind in Norce with
 * every row still on it - the customer would come back to a "cleared" cart that
 * is still full on the server.
 */
async function clearBasket() {
  const current = basket.value

  if (!current?.Id || !current.Items?.length) {
    basket.value = null
    setStoredBasketId(null)
    return
  }

  isLoading.value = true
  error.value = null
  const { culture } = useCulture()

  try {
    // Delete product rows from the last line up: removing a row renumbers the
    // ones after it. Fee rows are left to Norce, which removes them itself.
    const lineNos = current.Items
      .filter(isProductRow)
      .map((item) => item.LineNo)
      .filter((lineNo): lineNo is number => typeof lineNo === 'number')
      .sort((a, b) => b - a)

    for (const lineNo of lineNos) {
      await api.deleteBasketItem(current.Id, lineNo, { culture: culture.value })
    }
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to clear basket'
  } finally {
    isLoading.value = false
    basket.value = null
    setStoredBasketId(null)
  }
}

export function useBasket() {
  return {
    basket,
    isLoading,
    error,
    isDrawerOpen,
    itemCount,
    productItems,
    feeItems,
    subtotal,
    subtotalIncVat,
    resolveUnitPrice,
    clearBasket,
    loadBasket,
    createBasket,
    addItem,
    updateItemQuantity,
    removeItem,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    initFromStorage,
  }
}
