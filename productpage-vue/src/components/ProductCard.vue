<template>
  <!--
    A card without an href is a product we cannot route to - see the comment on
    the href prop. router-link throws during setup() when a required route param
    is missing, which unmounts the whole grid, so the link itself has to go.
  -->
  <component
      :is="href ? 'router-link' : 'div'"
      v-bind="href ? { to: href } : {}"
      class="product-card"
      :class="[`variant-${variant}`, { 'is-unlinked': !href }]"
  >
    <div class="image-container">
      <img
          v-if="imageKey"
          :src="cdnImg(imageKey, imageOptions)"
          :alt="name"
      />
      <div v-else class="placeholder" />
    </div>

    <h3 class="product-name">
      {{ name }}
    </h3>

    <p class="product-price">
      {{ formattedPrice }}
    </p>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { cdnImg } from '@/composables/useHelpers';

const props = defineProps({
  id: { type: [String, Number], required: true },
  name: { type: String, required: true },
  imageKey: { type: String, default: '' },
  price: { type: Number, required: true },
  currency: { type: String, default: 'SEK' },
  locale: { type: String, default: 'sv-SE' },
  // Left undefined when the product has no UniqueName. That is the root-level SEO
  // identifier and the only param the ProductPage route takes, so without it
  // there is no product page to link to. Do not substitute VariantUniqueName:
  // it resolves to the same product but is a second URL for it, and it hides a
  // PIM data error (the variant cluster has no name in that culture, and the
  // unique URL is generated from that name).
  href: { type: [String, Object], default: undefined },
  // "list" | "relation"
  variant: { type: String, default: 'list' }
});

const formattedPrice = computed(() => {
  return props.price.toLocaleString(props.locale, {
    style: 'currency',
    currency: props.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
});

const imageOptions = computed(() => {
  // Height parameter for the CDN - only a small variant difference
  return props.variant === 'relation' ? '?h=140' : '?h=250';
});
</script>

<style scoped>
.product-card {
  display: flex;
  flex-direction: column;
  text-decoration: none;
  color: inherit;

  background: #fff;
  border: 1px solid #e4e4e4;
  border-radius: 8px;
  padding: 12px;
  box-sizing: border-box;

  height: auto;               /* let the card grow with its content */
  min-height: 320px;          /* stable height */
  max-height: none;           /* no hard maximum */
}

/* A product we could not build a link for: shown, but visibly not clickable. */
.product-card.is-unlinked {
  cursor: default;
  border-style: dashed;
  color: #777;
}

/* variant-specific height */
.variant-list .image-container {
  height: 180px;
}

.variant-relation .image-container {
  height: 140px;
}

.image-container {
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background-color: #fff;
}

.image-container img {
  width: 100%;
  height: 100%;
  object-fit: contain; /* or cover, depending on preference */
}


/* Placeholder for a missing image */
.placeholder {
  width: 100%;
  height: 100%;
  background-image: url('@/assets/product-placeholder.svg');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.product-name {
  margin-top: 0.5rem;
  font-weight: 600;
  min-height: 2.5rem;   /* two lines of text -> stable height */
  overflow: hidden;
}


.product-price {
  margin-top: auto;     /* tryck ner priset till botten */
  padding-top: 0.5rem;  /* keep visual distance from the text */
  font-weight: 700;
  font-size: 1.1rem;
  text-align: right;
}

/* Small adjustments for relation cards */
.variant-relation .product-name {
  font-size: 0.9rem;
}

.variant-relation .product-price {
  font-size: 1rem;
}

</style>