<template>
  <main class="container checkout">
    <h1>{{ $t('checkout.title') }}</h1>

    <p v-if="error" class="checkout-error">{{ error }}</p>

    <section class="card checkout-section" v-if="isComplete">
      <h2>{{ $t('checkout.successTitle') }}</h2>
      <p class="checkout-success-text">{{ $t('checkout.successMessage') }}</p>
      <p v-if="orderId" class="checkout-order-id">
        {{ $t('checkout.orderIdLabel') }} <strong>{{ orderId }}</strong>
      </p>
      <router-link to="/" class="btn primary checkout-submit">
        {{ $t('checkout.backToShop') }}
      </router-link>
    </section>

    <section class="card checkout-section" v-else>
      <h2>{{ $t('checkout.summaryTitle') }}</h2>
      <div v-if="!basket?.Items?.length" class="checkout-empty">
        {{ $t('checkout.empty') }}
      </div>
      <div v-else class="checkout-items">
        <!-- Product rows only; fee rows are listed with the totals below. -->
        <div v-for="item in productItems" :key="item.LineNo ?? item.Id" class="checkout-item">
          <div>
            <div class="checkout-item-name">{{ item.Name || item.PartNo }}</div>
            <div class="checkout-item-meta">{{ item.PartNo }}</div>
          </div>
          <div class="checkout-item-qty">x{{ item.Quantity }}</div>
          <div class="checkout-item-price">{{ formatCurrency(resolveUnitPrice(item, false)) }}</div>
        </div>
        <div class="checkout-totals">
          <div v-for="fee in feeItems" :key="fee.LineNo ?? fee.Id">
            <span>{{ fee.Name }}</span>
            <strong>{{ formatCurrency(resolveUnitPrice(fee, false) * (fee.Quantity ?? 1)) }}</strong>
          </div>
          <div>
            <span>{{ $t('checkout.subtotal') }}</span>
            <strong>{{ formatCurrency(subtotal) }}</strong>
          </div>
          <div>
            <span>{{ $t('checkout.subtotalIncVat') }}</span>
            <strong>{{ formatCurrency(subtotalIncVat) }}</strong>
          </div>
        </div>
      </div>
    </section>

    <section class="card checkout-section" v-if="!isComplete">
      <h2>{{ $t('checkout.billingTitle') }}</h2>
      <button class="btn btn-outline checkout-fill" type="button" @click="fillDummyAddress">
        {{ $t('checkout.fillDummy') }}
      </button>
      <div class="checkout-form">
        <label>
          {{ $t('checkout.firstName') }}
          <input v-model="billing.givenName" type="text" :class="{ 'is-invalid': billingErrors.givenName }" />
          <span v-if="billingErrors.givenName" class="field-error">{{ billingErrors.givenName }}</span>
        </label>
        <label>
          {{ $t('checkout.lastName') }}
          <input v-model="billing.familyName" type="text" :class="{ 'is-invalid': billingErrors.familyName }" />
          <span v-if="billingErrors.familyName" class="field-error">{{ billingErrors.familyName }}</span>
        </label>
        <label>
          {{ $t('checkout.email') }}
          <input v-model="billing.email" type="email" :class="{ 'is-invalid': billingErrors.email }" />
          <span v-if="billingErrors.email" class="field-error">{{ billingErrors.email }}</span>
        </label>
        <label>
          {{ $t('checkout.street') }}
          <input v-model="billing.streetAddress" type="text" :class="{ 'is-invalid': billingErrors.streetAddress }" />
          <span v-if="billingErrors.streetAddress" class="field-error">{{ billingErrors.streetAddress }}</span>
        </label>
        <label>
          {{ $t('checkout.postalCode') }}
          <input v-model="billing.postalCode" type="text" :class="{ 'is-invalid': billingErrors.postalCode }" />
          <span v-if="billingErrors.postalCode" class="field-error">{{ billingErrors.postalCode }}</span>
        </label>
        <label>
          {{ $t('checkout.city') }}
          <input v-model="billing.city" type="text" :class="{ 'is-invalid': billingErrors.city }" />
          <span v-if="billingErrors.city" class="field-error">{{ billingErrors.city }}</span>
        </label>
        <label>
          {{ $t('checkout.country') }}
          <input v-model="billing.country" type="text" :class="{ 'is-invalid': billingErrors.country }" />
          <span v-if="billingErrors.country" class="field-error">{{ billingErrors.country }}</span>
        </label>
        <label>
          {{ $t('checkout.phone') }}
          <input v-model="billing.phone" type="text" :class="{ 'is-invalid': billingErrors.phone }" />
          <span v-if="billingErrors.phone" class="field-error">{{ billingErrors.phone }}</span>
        </label>
      </div>
    </section>

    <section class="card checkout-section" v-if="!isComplete">
      <h2>{{ $t('checkout.shippingTitle') }}</h2>
      <label class="checkout-checkbox">
        <input type="checkbox" v-model="shippingDifferent" />
        <span>{{ $t('checkout.shippingDifferent') }}</span>
      </label>
      <div v-if="shippingDifferent" class="checkout-form">
        <label>
          {{ $t('checkout.firstName') }}
          <input
            v-model="shipping.givenName"
            type="text"
            :class="{ 'is-invalid': shippingErrors.givenName }"
          />
          <span v-if="shippingErrors.givenName" class="field-error">{{ shippingErrors.givenName }}</span>
        </label>
        <label>
          {{ $t('checkout.lastName') }}
          <input
            v-model="shipping.familyName"
            type="text"
            :class="{ 'is-invalid': shippingErrors.familyName }"
          />
          <span v-if="shippingErrors.familyName" class="field-error">{{ shippingErrors.familyName }}</span>
        </label>
        <label>
          {{ $t('checkout.email') }}
          <input
            v-model="shipping.email"
            type="email"
            :class="{ 'is-invalid': shippingErrors.email }"
          />
          <span v-if="shippingErrors.email" class="field-error">{{ shippingErrors.email }}</span>
        </label>
        <label>
          {{ $t('checkout.street') }}
          <input
            v-model="shipping.streetAddress"
            type="text"
            :class="{ 'is-invalid': shippingErrors.streetAddress }"
          />
          <span v-if="shippingErrors.streetAddress" class="field-error">{{ shippingErrors.streetAddress }}</span>
        </label>
        <label>
          {{ $t('checkout.postalCode') }}
          <input
            v-model="shipping.postalCode"
            type="text"
            :class="{ 'is-invalid': shippingErrors.postalCode }"
          />
          <span v-if="shippingErrors.postalCode" class="field-error">{{ shippingErrors.postalCode }}</span>
        </label>
        <label>
          {{ $t('checkout.city') }}
          <input
            v-model="shipping.city"
            type="text"
            :class="{ 'is-invalid': shippingErrors.city }"
          />
          <span v-if="shippingErrors.city" class="field-error">{{ shippingErrors.city }}</span>
        </label>
        <label>
          {{ $t('checkout.country') }}
          <input
            v-model="shipping.country"
            type="text"
            :class="{ 'is-invalid': shippingErrors.country }"
          />
          <span v-if="shippingErrors.country" class="field-error">{{ shippingErrors.country }}</span>
        </label>
        <label>
          {{ $t('checkout.phone') }}
          <input
            v-model="shipping.phone"
            type="text"
            :class="{ 'is-invalid': shippingErrors.phone }"
          />
          <span v-if="shippingErrors.phone" class="field-error">{{ shippingErrors.phone }}</span>
        </label>
      </div>
    </section>

    <section class="card checkout-section" v-if="!isComplete">
      <h2>{{ $t('checkout.paymentTitle') }}</h2>
      <div v-if="loading" class="checkout-loading">{{ $t('checkout.loading') }}</div>
      <div v-else>
        <div v-if="!paymentMethods.length" class="checkout-empty">
          {{ $t('checkout.noPaymentMethods') }}
        </div>
        <div v-else class="checkout-methods">
          <label v-for="method in paymentMethods" :key="method.identifier" class="checkout-method">
            <input
              type="radio"
              name="payment-method"
              :value="method.identifier"
              :checked="method.identifier === selectedMethod"
              @change="selectMethod(method.identifier)"
            />
            <span>{{ formatMethodLabel(method.identifier) }}</span>
          </label>
        </div>
        <button
          class="btn primary checkout-submit"
          :disabled="!selectedMethod || loading"
          @click="completeCheckout"
        >
          <span v-if="loading" class="btn-spinner" aria-hidden="true"></span>
          {{ loading ? $t('checkout.completing') : $t('checkout.complete') }}
        </button>
        <p v-if="completeError" class="checkout-error">{{ completeError }}</p>
        <p v-if="isComplete" class="checkout-success">{{ $t('checkout.completed') }}</p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import { useBasket } from '@/composables/useBasket'
import { useCulture } from '@/composables/useCulture'
import { formatMoney } from '@/composables/useHelpers'

type PaymentMethod = { identifier: string }

const {
  basket,
  productItems,
  feeItems,
  loadBasket,
  subtotal,
  subtotalIncVat,
  resolveUnitPrice,
  clearBasket,
} = useBasket()
const { culture } = useCulture()
const { t } = useI18n()

const orderId = ref<string | null>(null)
const paymentId = ref<string | null>(null)
const paymentMethods = ref<PaymentMethod[]>([])
const selectedMethod = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const isComplete = ref(false)
const completeError = ref<string | null>(null)
const shippingDifferent = ref(false)
const billingErrors = ref<Record<string, string>>({})
const shippingErrors = ref<Record<string, string>>({})
const billing = ref({
  type: 'person',
  givenName: '',
  familyName: '',
  email: '',
  streetAddress: '',
  postalCode: '',
  city: '',
  country: 'SE',
  phone: '',
})
const shipping = ref({
  type: 'person',
  givenName: '',
  familyName: '',
  email: '',
  streetAddress: '',
  postalCode: '',
  city: '',
  country: 'SE',
  phone: '',
})

watch(shippingDifferent, (isDifferent) => {
  if (isDifferent) {
    shipping.value = { ...billing.value }
    shippingErrors.value = {}
  }
})

function fillDummyAddress() {
  const dummy = {
    type: 'person',
    givenName: 'Demo',
    familyName: 'User',
    email: 'demo.user@example.com',
    streetAddress: 'Demo Street 1',
    postalCode: '12345',
    city: 'Stockholm',
    country: 'SE',
    phone: '0701234567',
  }
  billing.value = { ...dummy }
  if (!shippingDifferent.value) {
    shipping.value = { ...dummy }
  }
}

async function initCheckout() {
  loading.value = true
  error.value = null
  isComplete.value = false

  try {
    await loadBasket()
    if (!basket.value?.Id) {
      error.value = t('checkout.empty')
      return
    }

    const orderResponse = await api.initiateCheckout({
      cartReference: basket.value.Id,
      culture: culture.value,
      currency: basket.value.CurrencyCode,
    })
    const newOrderId: string = orderResponse.data.id
    orderId.value = newOrderId

    const paymentResponse = await api.createNonPspPayment(newOrderId)
    const newPaymentId: string = paymentResponse.data.paymentId
    paymentId.value = newPaymentId
    paymentMethods.value = paymentResponse.data.paymentMethods ?? []
    selectedMethod.value = paymentResponse.data.selectedPaymentMethod ?? paymentMethods.value[0]?.identifier ?? null

    if (selectedMethod.value) {
      await api.updateNonPspPayment(newOrderId, newPaymentId, {
        selectedPaymentMethod: selectedMethod.value,
      })
    }
  } catch (err: any) {
    error.value = getErrorMessage(err, t('checkout.initError'))
  } finally {
    loading.value = false
  }
}

async function selectMethod(identifier: string) {
  if (!orderId.value || !paymentId.value) return
  selectedMethod.value = identifier
  try {
    loading.value = true
    await api.updateNonPspPayment(orderId.value, paymentId.value, {
      selectedPaymentMethod: identifier,
    })
  } catch (err: any) {
    error.value = getErrorMessage(err, t('checkout.methodError'))
  } finally {
    loading.value = false
  }
}

async function completeCheckout() {
  if (!orderId.value || !paymentId.value) return
  billingErrors.value = validateAddress(billing.value)
  shippingErrors.value = shippingDifferent.value ? validateAddress(shipping.value) : {}
  if (Object.keys(billingErrors.value).length > 0 || Object.keys(shippingErrors.value).length > 0) {
    error.value = t('checkout.fixErrors')
    return
  }
  try {
    loading.value = true
    await api.updateCheckoutBilling(orderId.value, billing.value)
    const shippingPayload = shippingDifferent.value ? { ...shipping.value } : { ...billing.value }
    await api.updateCheckoutShipping(orderId.value, shippingPayload)
    await api.completeNonPspPayment(orderId.value, paymentId.value)
    isComplete.value = true
    completeError.value = null
    error.value = null // otherwise a previous "fix the errors" message sits next to the confirmation
    await clearBasket()
  } catch (err: any) {
    completeError.value = getErrorMessage(err, t('checkout.completeError'))
  } finally {
    loading.value = false
  }
}

function formatCurrency(value: number) {
  return formatMoney(value, basket.value?.CurrencyCode || 'SEK', culture.value)
}

function formatMethodLabel(identifier: string) {
  return identifier
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => {
      if (part === part.toUpperCase()) return part
      if (/^[a-z0-9]+$/i.test(part) && /\d/.test(part)) return part.toUpperCase()
      if (part.length <= 3) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(' ')
}

function validateAddress(address: any) {
  const errors: Record<string, string> = {}
  if (!address?.givenName) errors.givenName = t('checkout.required')
  if (!address?.familyName) errors.familyName = t('checkout.required')
  if (!address?.email || !/^\S+@\S+\.\S+$/.test(address.email)) errors.email = t('checkout.invalidEmail')
  if (!address?.streetAddress) errors.streetAddress = t('checkout.required')
  if (!address?.postalCode) errors.postalCode = t('checkout.required')
  if (!address?.city) errors.city = t('checkout.required')
  if (!address?.country) errors.country = t('checkout.required')
  if (!address?.phone) errors.phone = t('checkout.required')
  return errors
}

function getErrorMessage(err: any, fallback: string) {
  const data = err?.response?.data
  // `reason` is what the BFF puts the real cause in; `error` is its summary.
  const parts = [data?.error ?? data?.message, data?.reason].filter(Boolean)
  if (parts.length) return parts.join(' - ')
  return err?.message || fallback
}

onMounted(() => {
  initCheckout()
})
</script>

<style scoped>
@import './CheckoutView.css';
</style>
