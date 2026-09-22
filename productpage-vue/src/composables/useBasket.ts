import { ref, computed, watch } from 'vue'
import api from '@/services/api'
import { useCulture } from '@/composables/useCulture'
import type { Basket, BasketItem } from '@/types'

const STORAGE_KEY = 'demo_basket_id'

const basket = ref<Basket | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const isDrawerOpen = ref(false)
let isInitialized = false

/**
 * Basket calls run one at a time.
 *
 * Norce renumbers LineNo when a row is removed, so two removes in flight at once
 * delete the wrong product: the first response turns line 2 into line 1, and the
 * second request - addressed to the line 1 that used to be line 2 - lands on it.
 * Two quick adds on an empty basket are the same problem one step earlier, where
 * they create two baskets and one of them is forgotten.
 *
 * isLoading is still exported, and the drawer disables its controls on it. That
 * is the visible half; this is the half that holds even when a click slips
 * through.
 */
let pending: Promise<unknown> = Promise.resolve()

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation, operation)
  // Never leave a rejected promise as the tail, or every later call inherits it.
  pending = result.catch(() => undefined)
  return result
}

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

// Basket rows carry names and amounts the server rendered in the culture they
// were fetched in. Nothing refetched them when the culture changed, so the drawer
// kept the old language until some unrelated mutation happened to refresh it -
// and a culture that was invalid at startup was never retried after App.vue
// corrected it. Registered once, at module level, the same way useCulture does.
watch(useCulture().culture, () => {
  serialize(() => {
    // Resolved inside the queued call, not when the watch fires. Capturing it
    // early meant holding an id that could be obsolete by the time the queue got
    // here — a failed restore followed by an add creates a different basket, and
    // reloading the captured one would put the old basket back and lose the row
    // that was just added. Falling back to the stored id covers the other case,
    // where a restore is still pending and basket.value is null.
    const id = basket.value?.Id ?? getStoredBasketId()
    return id ? loadBasket(id) : Promise.resolve(null)
  })
})

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

// Fall back to summing rows only if Summary is missing. Product rows only, to
// match Summary.Items - the drawer lists each fee on its own line, so counting
// fees here would show them twice.
function sumProductRows(includeVat: boolean) {
  return productItems.value.reduce(
    (sum, item) => sum + resolveUnitPrice(item, includeVat) * (item?.Quantity ?? 0),
    0
  )
}

// Summary.Items, not Summary.Total. Total includes freight and fees, so labelling
// it "Subtotal" made the drawer show the order total under the wrong word as soon
// as there was any freight - and the fees were already listed separately above it.
const subtotal = computed(() => basket.value?.Summary?.Items?.Amount ?? sumProductRows(false))
const subtotalIncVat = computed(
  () => basket.value?.Summary?.Items?.AmountIncVat ?? sumProductRows(true)
)

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
    // Only once every row is gone. Dropping the reference in `finally` meant a
    // failed delete left a full basket on the server that nothing could reach
    // again - the customer saw an empty cart and Norce still had the order.
    basket.value = null
    setStoredBasketId(null)
  } catch (err: any) {
    const failure = err?.message ?? 'Failed to clear basket'
    // Reload first, then record the failure: loadBasket clears `error` on entry,
    // so setting it before the reload would wipe the reason the reload happened.
    await loadBasket(current.Id)
    error.value = failure
  } finally {
    isLoading.value = false
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
    // Serialized at the boundary, not inside: addItem calls createBasket when the
    // basket does not exist yet, and wrapping both would deadlock on itself.
    clearBasket: () => serialize(clearBasket),
    loadBasket: (basketId?: string | number) => serialize(() => loadBasket(basketId)),
    createBasket: (initialItems?: BasketItem[]) => serialize(() => createBasket(initialItems)),
    addItem: (item: BasketItem) => serialize(() => addItem(item)),
    updateItemQuantity: (item: BasketItem, quantity: number) =>
      serialize(() => updateItemQuantity(item, quantity)),
    removeItem: (item: BasketItem) => serialize(() => removeItem(item)),
    openDrawer,
    closeDrawer,
    toggleDrawer,
    // Queued like the mutations. Un-awaiting it in App.vue let an add start
    // while the restore was still in flight: the add saw no basket, created a
    // second one, and whichever response landed last overwrote the other.
    initFromStorage: () => serialize(initFromStorage),
  }
}
