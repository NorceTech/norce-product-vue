<template>
  <main class="container" v-if="product">
    <nav class="text-sm mb-4">
      <a href="/">{{ $t('productPage.shop') }}</a> /
      <span v-for="(c,i) in product.Categories" :key="c.Id">
        <template v-if="i"> / </template>{{ c.Value }}
      </span>
    </nav>

    <router-link to="/" class="back-to-list-link">
      &lt; {{ $t('productPage.backToList') }}
    </router-link>

    <section id="productCard" class="card product-card product-grid">
      <div class="badge-row">
        <span v-if="currentItem?.Manufacturer?.Name" class="manufacturer-badge">
          {{ currentItem.Manufacturer.Name }}
        </span>

      </div>

      <div class="left-col">
        
        <section class="card product-info" style="min-width:260px">
          <h1>{{ currentItem?.Name }}</h1>
          <p class="subtitle">{{ currentItem?.SubHeader }}</p>
          <p class="text-sm mb-1">{{ $t('productPage.partNumber') }} {{ currentItem?.PartNo }}</p>

          <div class="flag-wrap">
            <span
                v-for="f in flags.filter(fl => showFlag(fl) &&
                  currentItem?.FlagIdSeed?.split(',').includes(String(fl.Id)))"
                :key="f.Id"
                class="flag-badge">
              {{ f.Name }}
            </span>
          </div>

          
          <p class="text-sm mb-1" style="color:#666">
            {{ $t('productPage.from') }} <slot name="fromPrice"></slot>
          </p>

          <p
            v-if="fromPrice"
            class="mb-1"
            style="text-decoration:line-through;color:#888"
          >
            {{ formatMoney(fromPrice, currencyCode, globalCulture) }}
          </p>
          <p class="mb-1" style="font-size:1.75rem;font-weight:700">
            {{ formatMoney(currentItem?.PriceIncVat, currencyCode, globalCulture) }}
          </p>

          <p class="text-sm mb-2" style="color:#999;font-size:.85rem">
            {{ $t('productPage.includingVAT') }}
            {{ formatMoney(vatAmount, currencyCode, globalCulture) }}
            {{ $t('productPage.vatAmountSuffix') }}
          </p>

          <p class="text-sm mb-2">
            {{ $t('productPage.inStock') }}
            <span class="in-stock">{{ currentItem?.OnHand?.Value }} {{ $t('productPage.stockUnit') }}</span>
            &nbsp;·&nbsp;
            {{ $t('productPage.nextDelivery') }} {{ parseNorcedate(currentItem?.OnHand?.NextDeliveryDate, globalCulture) }}
          </p>

          <button class="btn primary mt-2" @click="handleAddToBasket" :disabled="!currentItem?.IsBuyable">
            {{ $t('productPage.addToBasket') }}
          </button>
        </section>
        

        <PromoStrip :promos="promotions" />

        <!-- Variant selector: faceted parametrics let the user pick Color, Size, etc.
             Hidden entirely unless there is a real choice - see hasVariantChoice. -->
        <section v-if="hasVariantChoice" class="vs mt-4">
          <h3 class="vs__title">{{ $t('productPage.chooseVariant') }}</h3>

          <div v-for="f in variantFacets" :key="f.code" class="vs__row">
            <div class="vs__label">{{ f.name }}</div>

            <div class="vs__chips">
              <button
                  v-for="v in f.values" :key="v.key"
                  class="vs__chip"
                  :class="{ 'is-active': (selectedFacet?.[f.code]===v.key) }"
                  :disabled="availableFacetValues && availableFacetValues[f.code] && !availableFacetValues[f.code].has(v.key)"
                  @click="setFacet(f.code, v.key)"
              >{{ v.name }}</button>
            </div>
          </div>
        </section>
        
      </div>

      <!-- Product gallery: hero image + thumbnail strip -->
      <div class="gallery right-col">
        
        <div v-if="safeFiles[heroIndex]?.isVideo" class="hero-box">
          <div class="ratio-box">
            <iframe
                :src="embedUrl"
                :title="currentItem?.Name ?? product?.Name ?? ''"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen>
            </iframe>
          </div>
        </div>
        <div v-else class="hero-box">
          <button
            v-if="safeFiles[heroIndex]?.Key"
            type="button"
            class="hero-zoom"
            :aria-label="$t('productPage.zoomImage')"
            @click="openLightbox"
          >
            <img class="hero-img" :src="cdnImg(safeFiles[heroIndex].Key,'?h=640')" :alt="altHero" />
          </button>
          <div v-else class="hero-placeholder" />
        </div>

        <!-- Full-screen image viewer. Teleported to body so the fixed overlay
             is not clipped by the product grid. -->
        <teleport to="body">
          <div
            v-if="lightboxImage"
            class="lb"
            role="dialog"
            aria-modal="true"
            :aria-label="$t('productPage.imageViewer')"
          >
            <!-- A button, not a div, so dismissing works from the keyboard too -->
            <button
              class="lb__backdrop"
              type="button"
              :aria-label="$t('productPage.closeImage')"
              @click="closeLightbox"
            ></button>

            <figure class="lb__figure">
              <img
                class="lb__img"
                :src="cdnImg(lightboxImage.Key, '?h=1600')"
                :alt="getAlt(lightboxImage, currentItem?.Name ?? product?.Name ?? '')"
              />
              <figcaption v-if="lightboxImages.length > 1" class="lb__counter">
                {{ lightboxPosition }} / {{ lightboxImages.length }}
              </figcaption>
            </figure>

            <button
              ref="lightboxCloseEl"
              class="lb__btn lb__close"
              type="button"
              :aria-label="$t('productPage.closeImage')"
              @click="closeLightbox"
            >&times;</button>

            <template v-if="lightboxImages.length > 1">
              <button
                class="lb__btn lb__prev"
                type="button"
                :aria-label="$t('productPage.previousImage')"
                @click="stepLightbox(-1)"
              >&lsaquo;</button>
              <button
                class="lb__btn lb__next"
                type="button"
                :aria-label="$t('productPage.nextImage')"
                @click="stepLightbox(1)"
              >&rsaquo;</button>
            </template>
          </div>
        </teleport>

        <!-- Thumbnails -->
        <div class="thumbs">
          <img v-for="(f,i) in safeFiles" :key="f.Key"
               :src="f.isVideo ? f.Thumb : cdnImg(f.Key,'?h=80&w=80')"
               :alt="getAlt(f,currentItem?.Name ?? product?.Name ?? '')"
               :class="{active:i===heroIndex}"
               @click="swapGalleryImage(i)"/>
        </div>
      </div>
      
    </section>

    <section class="card" style="margin-top: 20px;">
      <h2>{{ $t('productPage.description') }}</h2>
      <div id="description" v-html="currentItem?.Description ?? product.Description" class="mt-8" />
      <!-- Spec grid: grouped parametrics (technical specifications) -->
      <section v-if="specGridGroups.length" class="mt-8">
        <div v-for="grp in specGridGroups" :key="grp.name" class="mb-4">
          <h2>{{ grp.name }}</h2>
          <table class="spec-table mt-2">
            <tbody>
            <tr v-for="pm in grp.items" :key="pm.Id">
              <td>{{ pm.Name }}</td>
              <td style="padding-left: 5px;"><strong>{{ pm.Value }}</strong></td>
            </tr>
            </tbody>
          </table>
        </div>

        <button
            v-if="specGridFiles.some(f => (f.Code && f.Code.toLowerCase().includes('datasheet')) || (f.Extension && f.Extension.toLowerCase()==='.pdf'))"
            @click="downloadSpecSheet()"
            class="btn btn-outline mt-4"
        >
          {{ $t('productPage.downloadDataSheet') }}
        </button>
      </section>
      

      <!-- Related products grid -->
      <section v-if="flatGroups.length" class="mt-8">
        <h2>{{ $t('productPage.relatedProducts') }}</h2>

        <div class="relations-outer mt-4">
          <div
              v-for="grp in flatGroups"
              :key="grp.Id"
              class="relation-group"
              :style="{
                '--span': Math.min(grp.Products.length || 1, 4),
                '--cols': Math.min(grp.Products.length || 1, 4)
              }"
          >
            <h3 class="mb-2">{{ grp.Name }}</h3>

            <div class="relation-products">
              <ProductCard
                v-for="p in grp.Products"
                :key="p.Id"
                :id="p.Id"
                :name="p.Name"
                :image-key="p.ImageKey"
                :price="p.Price"
                :href="{ name: 'ProductPage', params: { uniqueName: p.UniqueName } }"
                variant="relation"
              />
            </div>
          </div>
        </div>
      </section>
      
    </section>
  </main>

  <p v-else key="loader" class="container">{{ $t('productPage.loading') }}</p>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted, provide, watch, inject } from 'vue'
import type { Ref } from 'vue'
import PromoStrip from '@/components/PromoStrip.vue'
import ProductCard from '@/components/ProductCard.vue'

import {cdnImg, getAlt, parseNorcedate, showFlag, fileUrl, formatMoney} from '@/composables/useHelpers'



import type { Product, Promotion, RelationGroup, Flag } from '@/types'

type DebugPopup = { show: (errors: { context: string; message: string }[]) => void }

const product = ref<Product | null>(null)
const selectedVariant = ref<Product | null>(null)
const promotions = ref<Promotion[]>([])
const relations = ref<RelationGroup[]>([])
const flags = ref<Flag[]>([])
const debugPopup = inject<DebugPopup>('debugPopup');

const props = defineProps({
  uniqueName: {
    type: String,
    required: true,
  },
});

const heroIndex = ref(0)
const currentItem = computed<Product | null>(() => selectedVariant.value ?? product.value)


function swapGalleryImage(i: number) {
  heroIndex.value = i
}

/* --- Full-screen image viewer ------------------------------------------- */

// Images only. A video entry keeps its inline iframe, which has its own
// fullscreen control, and letting it into the pager would make the "3 / 7"
// counter disagree with what you can actually page through.
const lightboxImages = computed(() => safeFiles.value.filter(f => !f.isVideo && f.Key))

const lightboxIndex = ref<number | null>(null)
const lightboxCloseEl = ref<HTMLButtonElement | null>(null)

const lightboxImage = computed(() =>
  lightboxIndex.value === null ? null : lightboxImages.value[lightboxIndex.value] ?? null
)

const lightboxPosition = computed(() => (lightboxIndex.value ?? 0) + 1)

function openLightbox() {
  const current = safeFiles.value[heroIndex.value]
  if (!current?.Key || current.isVideo) return

  // heroIndex counts into safeFiles, which may contain a video; translate it.
  const i = lightboxImages.value.findIndex(f => f.Key === current.Key)
  lightboxIndex.value = i >= 0 ? i : 0

  nextTick(() => lightboxCloseEl.value?.focus())
}

function closeLightbox() {
  // Leave the hero showing whatever image you stopped on.
  const current = lightboxImage.value
  if (current) {
    const i = safeFiles.value.findIndex(f => f.Key === current.Key)
    if (i >= 0) heroIndex.value = i
  }
  lightboxIndex.value = null
}

function stepLightbox(delta: number) {
  const total = lightboxImages.value.length
  if (!total || lightboxIndex.value === null) return
  // Wrap around - with a handful of images, hitting a dead end is just annoying.
  lightboxIndex.value = (lightboxIndex.value + delta + total) % total
}

function onLightboxKey(event: KeyboardEvent) {
  if (event.key === 'Escape') closeLightbox()
  else if (event.key === 'ArrowRight') stepLightbox(1)
  else if (event.key === 'ArrowLeft') stepLightbox(-1)
}

watch(lightboxImage, (image) => {
  if (image) {
    window.addEventListener('keydown', onLightboxKey)
    document.body.style.overflow = 'hidden'
  } else {
    window.removeEventListener('keydown', onLightboxKey)
    document.body.style.overflow = ''
  }
})

// Navigating away with the viewer open would otherwise leave the body unable
// to scroll and the key handler attached.
onUnmounted(() => {
  window.removeEventListener('keydown', onLightboxKey)
  document.body.style.overflow = ''
})

const pfiles = computed(() => {
  const v = selectedVariant.value?.Files?.filter(f => f.Type === 1)
  if (v && v.length) return v
  return product.value?.Files?.filter(f => f.Type === 1) ?? []
})

const video = computed(() =>
    selectedVariant.value?.Files?.find(f => f.Type === 6)
    ?? product.value?.Files?.find(f => f.Type === 6)
    ?? null
)


// Extract YouTube video ID and build privacy-friendly embed URL
const embedUrl = computed(() => {
  const raw = video.value?.Path ?? ''

  let id = ''
  if (raw.includes('youtu.be/'))        id = raw.split('youtu.be/')[1].split(/[?&#]/)[0]
  else if (raw.includes('watch?v='))    id = raw.split('watch?v=')[1].split(/[?&#]/)[0]
  else if (raw.includes('/embed/'))     id = raw.split('/embed/')[1].split(/[?&#]/)[0]

  return id
      ? `https://www.youtube-nocookie.com/embed/${id}?rel=0`
      : ''
})


const safeFiles = computed(() => {
  const list: any[] = []

  /* Main product image always first. A variant without its own ImageKey
     inherits the product's - the same fallback pfiles already does for Files. */
  const mainKey = currentItem.value?.ImageKey ?? product.value?.ImageKey
  if (mainKey) list.push({Key: mainKey, isMain: true})

  /* Remaining images sorted by SortOrder */
  list.push(
      ...(pfiles.value || [])
          .filter(Boolean)
          .map((f: any) => ({...f, Key: f.Key ?? f.ImageKey ?? f.Name}))
          .filter(f => f.Key)
          .sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0))
  )

  if (video.value) {
    
    const rawUrl = video.value.Path ?? ''

    
    let id = ''
    if (rawUrl.includes('youtu.be/')) {
      id = rawUrl.split('youtu.be/')[1].split(/[?&#]/)[0]
    } else if (rawUrl.includes('watch?v=')) {
      id = rawUrl.split('watch?v=')[1].split(/[?&#]/)[0]
    } else if (rawUrl.includes('/embed/')) {
      id = rawUrl.split('/embed/')[1].split(/[?&#]/)[0]
    }

    // Only add if we found a valid YouTube ID
    if (id) {
      list.push({
        Key: 'video',
        isVideo: true,
        Thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, 
        VideoId: id
      })
    }
  }
  /* Norce can return the same file Key twice, and the main image usually also
     appears in Files - both produced a repeated thumbnail and, in the viewer,
     two identical slides with the counter claiming they were different. */
  const seen = new Set<string>()
  return list.filter(f => {
    const key = String(f.Key)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

const altHero = computed(() => getAlt(safeFiles.value[heroIndex.value], currentItem.value?.Name ?? product.value?.Name ?? ''))



const visibleParametrics = computed(() => {
  const root = product.value?.Parametrics ?? []
  const own  = selectedVariant.value?.Parametrics ?? []
  const map = new Map<number, any>()
  ;[...root, ...own].forEach(pm => map.set(pm.Id, pm))
  return [...map.values()]
      .filter(pm => !pm.IsHidden)
      .sort((a, b) => a.GroupId - b.GroupId || a.SortOrder - b.SortOrder)
})


// Flatten relation groups - Norce may nest products under group.Products or group.Relations.Items
const flatGroups = computed(() =>
    relations.value.map(g => ({ // Use relations ref from ProductPage
      ...g,
      Products: (g as any).Products ?? (g as any).Relations?.Items ?? []
    }))
)



const specGridFiles = computed(() => currentItem.value?.Files ?? product.value?.Files ?? [])

const specGridGroups = computed(() => {
  const vis = visibleParametrics.value
  const g: { [key: string]: any[] } = {}
  vis.forEach(pm => {
    const key = pm.GroupName || 'Misc'
    const cleanName = pm.Name?.replace(/^[^–—-]+[–—-]\s*/, '')?.trim();
    g[key] = (g[key] || []).concat({...pm, Name: cleanName})
  })
  return Object.entries(g).map(([name, items]) => ({name, items}))
})

function downloadSpecSheet() {
  const pdf = specGridFiles.value.find(f => f.Code?.toLowerCase().includes('datasheet'))
      || specGridFiles.value.find(f => f.Extension?.toLowerCase() === '.pdf')
  if (pdf) window.open(fileUrl(pdf), '_blank')
}


const currencyCode = computed(() => (currentItem.value as any)?.CurrencyCode || 'SEK')

const fromPrice = computed(() => {
  const hasVariants = !!product.value?.Variants?.length
  return hasVariants && !selectedVariant.value ? product.value?.Price ?? null : null
})

const vatAmount = computed(() => {
  if (!currentItem.value?.PriceIncVat || !currentItem.value?.Price) return null
  return Math.max(0, currentItem.value.PriceIncVat - currentItem.value.Price)
})

type VariantFacet = { code: string; name: string; values: { key: string; name: string }[] }

const variantFacets = computed<VariantFacet[]>(() => {
  const vs = product.value?.Variants ?? []
  const buckets = new Map<string, VariantFacet>()
  vs.forEach(v => {
    (v.VariantParametrics ?? []).forEach((pm: any) => {
      const code = pm.Code || pm.Name
      if (!code) return
      if (!buckets.has(code)) buckets.set(code, { code, name: pm.Name ?? code, values: [] })
      const bucket = buckets.get(code)!
      const key = String(pm.ValueKey ?? pm.Value ?? pm.ValueId ?? pm.ValueCode ?? '')
      const name = String(pm.ValueName ?? pm.Value ?? key)
      if (key && !bucket.values.find(x => x.key === key)) bucket.values.push({ key, name })
    })
  })
  buckets.forEach(b => b.values.sort((a, b) => a.name.localeCompare(b.name, 'sv')))
  return [...buckets.values()]
})

/**
 * Whether the variant selector is worth showing at all.
 *
 * Norce models every product as a variant cluster, so a cluster with a single
 * variant is normal - gating on `Variants.length` alone put a lone "Choose
 * variant" heading on most product pages. There is only something to pick when
 * there are at least two variants AND some facet actually differs between
 * them; two variants with no VariantParametrics render no chips either.
 */
const hasVariantChoice = computed(() => {
  const variants = product.value?.Variants ?? []
  if (variants.length < 2) return false
  return variantFacets.value.some(f => f.values.length > 1)
})

const selectedFacet = ref<Record<string, string>>({})

const availableFacetValues = computed(() => {
  const vs = (product.value?.Variants ?? []).filter(v =>
      v.StatusId === 1 && v.IsBuyable === true && (v.Price ?? 0) > 0
  )
  const rows = vs.map(v => {
    const row: Record<string,string> = {}
    ;(v.VariantParametrics ?? []).forEach((pm: any) => {
      const code = pm.Code || pm.Name
      const key  = String(pm.ValueKey ?? pm.Value ?? pm.ValueId ?? pm.ValueCode ?? '')
      if (code) row[code] = key
    })
    return row
  })
  const result: Record<string, Set<string>> = {}
  const sel = selectedFacet.value
  ;(variantFacets.value ?? []).forEach(f => {
    const set = new Set<string>()
    rows.forEach(r => {
      const ok = Object.keys(sel).every(code => code===f.code ? true : (!sel[code] || r[code]===sel[code]))
      if (ok && r[f.code]) set.add(r[f.code])
    })
    result[f.code] = set
  })
  return result
})

function applyVariantSelection() {
  const vs = product.value?.Variants ?? []
  const keys = Object.keys(selectedFacet.value)
  if (!keys.length) { selectedVariant.value = null; return }
  const found = vs.find(v => {
    const vmap: Record<string, string> = {}
    ;(v.VariantParametrics ?? []).forEach((pm: any) => {
      const code = pm.Code || pm.Name
      const val  = String(pm.ValueKey ?? pm.Value ?? pm.ValueId ?? pm.ValueCode ?? '')
      if (code) vmap[code] = val
    })
    return keys.every(k => vmap[k] === selectedFacet.value[k])
  })
  selectedVariant.value = found ?? null

  if (!selectedVariant.value) {
    const pool = (product.value?.Variants ?? []).filter(v =>
        v.StatusId === 1 && v.IsBuyable === true && (v.Price ?? 0) > 0
    )
    const keys2 = Object.keys(selectedFacet.value)
    selectedVariant.value = pool.find(v => {
      const vmap: Record<string,string> = {}
      ;(v.VariantParametrics ?? []).forEach((pm:any) => {
        const code = pm.Code || pm.Name
        const val  = String(pm.ValueKey ?? pm.Value ?? pm.ValueId ?? pm.ValueCode ?? '')
        if (code) vmap[code] = val
      })
      return keys2.every(k => !selectedFacet.value[k] || vmap[k] === selectedFacet.value[k])
    }) ?? null
  }
}


function setFacet(code: string, key: string) {
  if (availableFacetValues.value && availableFacetValues.value[code] && !availableFacetValues.value[code].has(key)) return
  const next = { ...(selectedFacet.value ?? {}) }
  next[code] = key
  selectedFacet.value = next // Directly update selectedFacet
  applyVariantSelection()
}

import api from '@/services/api';
import { useBasket } from '@/composables/useBasket'
import type { BasketItem } from '@/types'

const globalCulture = inject('culture') as Ref<string>; 
const isCultureInitialized = inject('isCultureInitialized') as Ref<boolean>; 
const { addItem } = useBasket()

function handleAddToBasket() {
  if (!currentItem.value) return
  // PartNo and quantity only. The price list decides the price, server side -
  // see toBasketItem() in bff/index.js.
  addItem({
    PartNo: currentItem.value.PartNo,
    Quantity: 1,
  } as BasketItem)
}


async function fetchProductData() {
  const errors = [];
  try {
    const p = await api.getProduct(props.uniqueName).then(r => r.data);
    product.value = p;

    // Record the failure and fall back to an empty list. Returning
    // errors.push(...) here would assign the array *length* to the ref.
    const onFail = (context: string) => (e: any) => {
      errors.push({ context, message: e.message });
      return [];
    };

    const [pro, rel, fl] = await Promise.all([
      api.getPromos(props.uniqueName).then(r => r.data).catch(onFail('Promos')),
      api.getRelations(p.Id).then(r => r.data).catch(onFail('Relations')),
      api.getFlags().then(r => r.data).catch(onFail('Flags'))
    ]);
    promotions.value = pro ?? [];
    relations.value = rel ?? [];
    flags.value = fl ?? [];

    const firstBuyable = p?.Variants?.find((v:any) => v.StatusId === 1 && v.IsBuyable && (v.Price ?? 0) > 0) ?? null;
    selectedVariant.value = firstBuyable;

  } catch (error: any) {
    errors.push({ context: 'Product', message: error.message });
  }

  if (errors.length > 0) {
    debugPopup?.show(errors);
  }
}

// Data fetching is deferred until culture is initialized (see watch below)
watch(isCultureInitialized, async (isInitialized) => {
  if (isInitialized) {
    await fetchProductData();
  }
}, { immediate: true }); // Use immediate: true to check on mount

watch(selectedVariant, () => { heroIndex.value = 0; lightboxIndex.value = null })

// Refetch when the user switches language
watch(globalCulture, async (newCulture, oldCulture) => {
  if (oldCulture) {
    await fetchProductData();
  }
});

provide('product', currentItem)
</script>

<style scoped>
@import './ProductPage.css';
</style>
