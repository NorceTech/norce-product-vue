<template>
  <div class="product-list-container">
    <aside class="sidebar">
      <!-- The heading lives inside the panel so the two read as one block and
           the panel lines up with the top of the results. -->
      <div class="filter-panel">
        <h2 class="filter-panel-title">{{ $t('productListView.filters') }}</h2>

        <details
            v-if="priceFilterData"
            class="filter-group"
            :open="isGroupOpen('prcf')"
            @toggle="onGroupToggle('prcf', $event)"
        >
          <summary class="filter-summary">
            <span class="filter-title">{{ priceFilterData.Type }}</span>
            <span v-if="selectedFilters['prcf']?.length" class="filter-badge">1</span>
          </summary>

          <div class="filter-range">
            <RangeSlider
                :min="absolutePriceRange.min"
                :max="absolutePriceRange.max"
                :from="priceSelection.from"
                :to="priceSelection.to"
                :name="priceFilterData.Type"
                logarithmic
                :format="formatPriceLabel"
                @change="onPriceChange"
            />
          </div>
        </details>

        <details
            v-for="filter in simpleFilters"
            :key="filter.Name"
            class="filter-group"
            :open="isGroupOpen(`filter-${filter.Name}`)"
            @toggle="onGroupToggle(`filter-${filter.Name}`, $event)"
        >
          <summary class="filter-summary">
            <span class="filter-title">{{ filter.Type }}</span>
            <span v-if="selectedFilters[filter.Name]?.length" class="filter-badge">
              {{ selectedFilters[filter.Name].length }}
            </span>
          </summary>

          <ul class="filter-values">
            <li v-for="item in filter.Items" :key="item.Value">
              <label>
                <input
                    type="checkbox"
                    @change="toggleFilter(filter.Name, item.Value)"
                />
                <span>
                  {{ filterValueLabel(filter, item) }}
                  <span class="filter-count">({{ item.Count }})</span>
                </span>
              </label>
            </li>
          </ul>
        </details>

        <!-- Parametric filters. A value list gets checkboxes, a numeric
             parametric gets the same slider the price filter uses. -->
        <details
            v-for="parametric in parametricItems"
            :key="`parf-${parametric.Id}`"
            class="filter-group"
            :open="isGroupOpen(`parf-${parametric.Id}`)"
            @toggle="onGroupToggle(`parf-${parametric.Id}`, $event)"
        >
          <summary class="filter-summary">
            <span class="filter-title">
              {{ parametric.Name }}
              <span v-if="parametric.Uom" class="filter-uom">({{ parametric.Uom }})</span>
            </span>
            <span v-if="parfSelectionCount(parametric)" class="filter-badge">
              {{ parfSelectionCount(parametric) }}
            </span>
          </summary>

          <ul v-if="parametric.Items?.length" class="filter-values">
            <li v-for="value in parametric.Items" :key="value.Id">
              <label>
                <input
                    type="checkbox"
                    :checked="isParfValueSelected(parametric, value.Id)"
                    @change="toggleParfValue(parametric, value.Id)"
                />
                <span>
                  {{ value.Name }}
                  <span class="filter-count">({{ value.Count }})</span>
                </span>
              </label>
            </li>
          </ul>

          <div v-else-if="parfBounds(parametric)" class="filter-range">
            <RangeSlider
                :min="parfBounds(parametric)!.min"
                :max="parfBounds(parametric)!.max"
                :from="parfSelectedRange(parametric).from"
                :to="parfSelectedRange(parametric).to"
                :name="parametric.Name"
                :format="(value) => formatParfLabel(parametric, value)"
                @change="(range) => onParfRangeChange(parametric, range)"
            />
          </div>
        </details>
      </div>
    </aside>

    <div class="results">
      <div class="search-row">
        <div class="search-field">
          <input
              v-model="searchString"
              class="search-input"
              type="search"
              :placeholder="$t('productListView.searchPlaceholder')"
              :aria-label="$t('productListView.searchPlaceholder')"
          />
          <button
              v-if="searchString"
              class="search-clear"
              type="button"
              :aria-label="$t('productListView.searchClear')"
              @click="searchString = ''"
          >&times;</button>
        </div>

        <p class="result-count">{{ $t('productListView.resultCount', { count: itemCount }) }}</p>
      </div>

      <p v-if="!products.length" class="results-empty">
        {{ $t('productListView.noResults') }}
      </p>

      <main v-else class="product-grid">
        <ProductCard
            v-for="product in products"
            :key="product.Id"
            :id="product.Id"
            :name="product.Name"
            :image-key="product.ImageKey"
            :price="displayPrice(product)"
            :href="{ name: 'ProductPage', params: { uniqueName: product.UniqueName } }"
            variant="list"
        />
      </main>
    </div>
  </div>
</template><script setup lang="ts">
import { ref, watch, computed, inject, Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import api from '@/services/api';
import ProductCard from '@/components/ProductCard.vue';
import RangeSlider from '@/components/RangeSlider.vue';

const { t } = useI18n();

type Product = any;
type FilterItem = {
  Id?: string;
  Value: string;
  Name: string;
  Count: number;
  FromIncVat?: number;
  ToIncVat?: number;
};
type Filter = { Name: string; Type: string; Items: FilterItem[] };

/**
 * The `parf` filter is shaped differently from the others: its Items are the
 * parametrics themselves, each carrying either a nested list of values or a
 * numeric range - not leaf values like catf/mfrf/flgf do.
 *
 * Verified against live ListFocusParametrics data:
 *   FilterListItem   -> Items: [{ Id, Name, Count }]
 *   FilterRangeItem  -> Type, Uom, From, To
 */
type ParametricFilterItem = {
  $type?: string;
  Id: string;              // the ParametricId
  Name: string;
  Uom?: string | null;
  Type?: string | null;    // 'int' | 'decimal' | ... on range items
  // Careful: the live service sends these as strings ("0", "4200") even though
  // they are numeric bounds. ListFocusParametrics sends null for both.
  From?: number | string | null;
  To?: number | string | null;
  Items?: FilterItem[];    // present for list and multiple-list parametrics
};

const products = ref<Product[]>([]);
const itemCount = ref(0);
const filters = ref<Filter[]>([]);
const selectedFilters = ref<Record<string, string[]>>({});

const priceFilterData = computed(() => filters.value.find(f => f.Name === 'prcf'));

// Everything except price and parametrics, which get their own rendering.
const simpleFilters = computed(() => filters.value.filter(f => f.Name !== 'prcf' && f.Name !== 'parf'));

const globalCulture = inject('culture') as Ref<string>;
const isCultureInitialized = inject('isCultureInitialized') as Ref<boolean>;

let fetchTimeout: number | undefined;

function debouncedFetch() {
  clearTimeout(fetchTimeout);
  fetchTimeout = setTimeout(() => {
    fetchProducts();
    fetchFilters();
  }, 500); // Wait 500ms after the last interaction before fetching
}

/* --- Free-text search ---------------------------------------------------- */

const searchString = ref('');

// ListProducts2 requires at least two characters, so anything shorter counts as
// no search rather than a request Norce will reject.
const activeSearch = computed(() => {
  const trimmed = searchString.value.trim();
  return trimmed.length >= 2 ? trimmed : '';
});

watch(activeSearch, () => debouncedFetch());

/* --- Collapsible groups -------------------------------------------------- */

// Groups start collapsed: with 13 categories, 10 manufacturers and five
// parametrics the panel was taller than the product grid. Collapsed groups show
// a badge with the number of active values, so nothing hides silently.
const expandedGroups = ref<Set<string>>(new Set());
let hasSeededGroups = false;

function isGroupOpen(key: string) {
  return expandedGroups.value.has(key);
}

function onGroupToggle(key: string, event: Event) {
  const isOpen = (event.target as HTMLDetailsElement).open;
  const next = new Set(expandedGroups.value);
  if (isOpen) {
    next.add(key);
  } else {
    next.delete(key);
  }
  expandedGroups.value = next;
}

// Norce sends an empty Name for the OnHand value, which rendered as a bare
// "(80)". Everything else carries its own localised name.
function filterValueLabel(filter: Filter, item: FilterItem) {
  if (item.Name) return item.Name;
  if (filter.Name === 'ohf') return t('productListView.inStock');
  return item.Value;
}

/* --- Price --------------------------------------------------------------- */

// The bounds Norce reports for the current result set.
const absolutePriceRange = computed(() => {
  const item = priceFilterData.value?.Items?.[0];
  return {
    min: Math.max(1, item?.FromIncVat ?? 1),
    max: item?.ToIncVat ?? 10000,
  };
});

const priceSelection = ref<{ from: number | null; to: number | null }>({ from: null, to: null });

function formatPriceLabel(value: number) {
  return formatPrice(value, t('productListView.currencyUnit'));
}

function onPriceChange({ from, to }: { from: number; to: number }) {
  // Dragging back to the full span means "no price filter" - otherwise the
  // group keeps a badge for a filter that excludes nothing.
  if (from <= absolutePriceRange.value.min && to >= absolutePriceRange.value.max) {
    priceSelection.value = { from: null, to: null };
    delete selectedFilters.value['prcf'];
  } else {
    priceSelection.value = { from, to };
    // Norce's price filter behaves like an exclusive upper bound in practice,
    // so nudge the max by one to make the range inclusive.
    selectedFilters.value['prcf'] = [`true_${from}-${to + 1}`];
  }
  debouncedFetch();
}

/* --- Parametric (parf) filters ------------------------------------------ */

const parametricItems = computed<ParametricFilterItem[]>(
    () => (filters.value.find(f => f.Name === 'parf')?.Items as unknown as ParametricFilterItem[]) ?? []
);

/**
 * Token prefix for a parametric's selected values.
 *
 * Norce discriminates the item types by name (`FilterListItem`,
 * `FilterRangeItem`), so the prefix is derived from that name rather than
 * hard-coded per type. `FilterListItem` -> 'L' is verified against live data;
 * the multiple-list variant follows the same naming convention but has not been
 * observed, hence the substring match. An unrecognised type returns null and
 * the caller skips it with a warning - sending the wrong prefix would filter on
 * the wrong parametric instead of failing visibly.
 */
function parfPrefix(parametric: ParametricFilterItem): 'L' | 'M' | null {
  const type = parametric.$type ?? '';
  if (type.includes('Multiple')) return 'M';
  if (type.includes('List')) return 'L';
  return null;
}

function parfTokens(): string[] {
  return selectedFilters.value['parf'] ?? [];
}

function setParfTokens(tokens: string[]) {
  if (tokens.length) {
    selectedFilters.value['parf'] = tokens;
  } else {
    delete selectedFilters.value['parf'];
  }
}

// How many values are active for one parametric - shown as a badge when the
// group is collapsed.
function parfSelectionCount(parametric: ParametricFilterItem) {
  const prefixes = [`L${parametric.Id}_`, `M${parametric.Id}_`, `V${parametric.Id}_`];
  return parfTokens().filter(token => prefixes.some(prefix => token.startsWith(prefix))).length;
}

function isParfValueSelected(parametric: ParametricFilterItem, valueId?: string) {
  const prefix = parfPrefix(parametric);
  if (!prefix || !valueId) return false;
  return parfTokens().includes(`${prefix}${parametric.Id}_${valueId}`);
}

function toggleParfValue(parametric: ParametricFilterItem, valueId?: string) {
  const prefix = parfPrefix(parametric);
  if (!prefix || !valueId) {
    console.warn(`Unsupported parametric filter type "${parametric.$type}" - ignoring.`);
    return;
  }

  const token = `${prefix}${parametric.Id}_${valueId}`;
  const tokens = parfTokens();
  setParfTokens(tokens.includes(token) ? tokens.filter(t => t !== token) : [...tokens, token]);
  debouncedFetch();
}

// From/To arrive as strings from ListProductFilters2 and as null from
// ListFocusParametrics, so normalise before doing arithmetic with them.
function parfBounds(parametric: ParametricFilterItem) {
  const min = Number(parametric.From);
  const max = Number(parametric.To);
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

// Read the active range back out of the V-token so the slider survives a
// refetch. Bounds are non-negative here, so splitting on '-' is safe.
function parfSelectedRange(parametric: ParametricFilterItem) {
  const prefix = `V${parametric.Id}_`;
  const token = parfTokens().find(t => t.startsWith(prefix));
  if (!token) return { from: null, to: null };

  const [from, to] = token.slice(prefix.length).split('-').map(Number);
  return {
    from: Number.isFinite(from) ? from : null,
    to: Number.isFinite(to) ? to : null,
  };
}

function formatParfLabel(parametric: ParametricFilterItem, value: number) {
  const uom = parametric.Uom ? ` ${parametric.Uom}` : '';
  return `${value.toLocaleString(globalCulture.value)}${uom}`;
}

function onParfRangeChange(parametric: ParametricFilterItem, { from, to }: { from: number; to: number }) {
  const others = parfTokens().filter(t => !t.startsWith(`V${parametric.Id}_`));
  const bounds = parfBounds(parametric);

  // The full span filters nothing out, so drop the token instead of sending it.
  if (bounds && from <= bounds.min && to >= bounds.max) {
    setParfTokens(others);
  } else {
    setParfTokens([...others, `V${parametric.Id}_${from}-${to}`]);
  }
  debouncedFetch();
}

/* --- Filter string and fetching ----------------------------------------- */

// Build Norce filter string format: key1|val1,val2;key2|val3
//
// parf is the exception: its values are joined with '*', which means AND
// between different parametrics and OR within the same one. Comma-joining them
// silently produces a filter Norce does not understand.
function buildFilterQuery(): string {
  const entries = Object.entries(selectedFilters.value).filter(([, values]) => values.length);
  if (!entries.length) return '';
  return entries
      .map(([key, values]) => `${key}|${values.join(key === 'parf' ? '*' : ',')}`)
      .join(';');
}

// Axios serialises the params object itself, so pass a plain object. The
// culture is appended by the request interceptor in services/api.ts.
function buildQueryParams(): Record<string, string> {
  const params: Record<string, string> = {};

  const filterString = buildFilterQuery();
  if (filterString) params.filter = filterString;
  if (activeSearch.value) params.searchString = activeSearch.value;

  return params;
}

async function fetchProducts() {
  const response = await api.getProducts(buildQueryParams());
  products.value = response.data.Items ?? [];
  itemCount.value = response.data.ItemCount ?? products.value.length;
}

async function fetchFilters() {
  const response = await api.getProductFilters(buildQueryParams());
  filters.value = response.data;

  // Open the first group once, so the panel does not read as inert on load.
  if (!hasSeededGroups && simpleFilters.value.length) {
    hasSeededGroups = true;
    expandedGroups.value = new Set([`filter-${simpleFilters.value[0].Name}`]);
  }
}

function formatPrice(value: number, currencyUnit: string) {
  return value.toLocaleString(globalCulture.value) + ' ' + currencyUnit;
}

// The Product Service (ListProducts2) returns Price (ex VAT) and PriceIncVat.
// Do not mix inc/ex VAT fields in one fallback chain - the card would silently
// switch between the two. Basket rows are a different contract entirely; see
// resolveUnitPrice() in useBasket.ts.
function displayPrice(product: any) {
  return product?.PriceIncVat ?? 0;
}

function toggleFilter(filterName: string, value: string) {
  if (!selectedFilters.value[filterName]) {
    selectedFilters.value[filterName] = [];
  }

  const list = selectedFilters.value[filterName];
  const index = list.indexOf(value);

  if (index === -1) {
    list.push(value);
  } else {
    list.splice(index, 1);
    if (list.length === 0) {
      delete selectedFilters.value[filterName];
    }
  }

  debouncedFetch();
}

// Data fetching is deferred until culture is initialized (see watch below).
// This avoids a flash of wrong-language content on first load.
watch(isCultureInitialized, (isInitialized) => {
  if (isInitialized) {
    fetchProducts();
    fetchFilters();
  }
}, { immediate: true });

// Refetch when the user switches language
watch(globalCulture, (newCulture, oldCulture) => {
  if (oldCulture) {
    debouncedFetch();
  }
});
</script>

<style scoped>

@import './ProductListView.css';

</style>
