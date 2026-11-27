/**
 * Which variant the product page's chips select. Pure functions over the
 * product's `Variants`: no Vue, no API, so every rule below has a unit test in
 * variantSelection.test.ts.
 *
 * The state is the chips that are on (`choices`, facet code to value key) and
 * the variant they name (`variant`). The page shows and adds `variant`, and it
 * is never a combination other than the chips show: when the choices name no
 * buyable variant yet, it is null and the basket button is off.
 *
 * The rules:
 * 1. A click on a value the selected variant already has does nothing, when
 *    that variant can be bought.
 * 2. Every buyable variant can be reached from any state: clear the choices,
 *    then click its values, in any order. A click never moves another chip, so
 *    on a sparse catalog two variants can differ in two facets with no buyable
 *    step between them, and clearing is the way from one to the other.
 * 3. A chip can be clicked only when a buyable variant has its value together
 *    with every other chip that is on. A click therefore never changes another
 *    chip, and the page never switches to a combination the shopper cannot see.
 * 4. A linked variant starts selected, with its chips on. Changing the color
 *    keeps the size, because a color that lacks the size cannot be clicked.
 * 5. A linked variant that cannot be bought is left at the first click, which
 *    can only be on a chip a buyable variant has with the other chips. Its own
 *    chips can be clicked only if another buyable variant has the same values.
 * 6. A variant without a facet is chosen with no chip on in that facet's row:
 *    it never matches a chip there, and choices that name a facet never select
 *    it. Its rows are compared like any other, not ranked.
 *
 * Whether the selected variant can be added to the basket is `isBuyable` too,
 * so the chips and the basket button cannot disagree about it.
 */

/** A parametric as `VariantParametrics` carries it. */
export interface ParametricLike {
  Code?: string | null
  Name?: string | null
  ValueKey?: string | number | null
  Value?: string | number | null
  ValueId?: string | number | null
  ValueCode?: string | number | null
}

/** The fields of a variant the selection reads. */
export interface VariantLike {
  UniqueName?: string | null
  StatusId?: number | null
  IsBuyable?: boolean | null
  Price?: number | null
  VariantParametrics?: ParametricLike[] | null
}

/** Facet code to value key. */
export type Facets = Record<string, string>

export interface Selection<V> {
  /** The chips that are on. */
  choices: Facets
  /** The variant the chips name, or null when they name no buyable one yet. */
  variant: V | null
}

/** The facet a parametric belongs to: its code, or its name when it has none. */
export function facetCode(pm: ParametricLike): string {
  return pm.Code || pm.Name || ''
}

/** The value a parametric carries, as the chips key it. */
export function valueKey(pm: ParametricLike): string {
  return String(pm.ValueKey ?? pm.Value ?? pm.ValueId ?? pm.ValueCode ?? '')
}

/** A variant in the chips' terms. A facet without a code or a value is absent. */
export function facetsOf(variant: VariantLike | null | undefined): Facets {
  const facets: Facets = {}
  for (const pm of variant?.VariantParametrics ?? []) {
    const code = facetCode(pm)
    const key = valueKey(pm)
    if (code && key) facets[code] = key
  }
  return facets
}

/** Active (StatusId 1), buyable and priced. Only such a variant can be chosen. */
export function isBuyable(variant: VariantLike | null | undefined): boolean {
  return !!variant && variant.StatusId === 1 && variant.IsBuyable === true && (variant.Price ?? 0) > 0
}

/**
 * The variant whose own unique name the address is, or null when it is the
 * product's shared name. Norce compares unique names case-insensitively.
 *
 * Not the root's PartNo or Id. GetProductByUniqueName also finds a name by the
 * product's default name, the one without a culture, and answers in the
 * requested culture. For such a name the root's PartNo is set even when it is
 * the shared name (Open Demo, sv-SE: the English jacket name gives PartNo
 * 100001), and for a variant's default name the root is the cheapest variant,
 * not the one named. So the answer cannot say which variant such a link meant,
 * and the page starts it like a shared name. The page's own links and the
 * language switch always use the name in the address's culture, which this
 * matches.
 */
export function variantNamedBy<V extends VariantLike>(variants: readonly V[], uniqueName: string): V | null {
  const name = uniqueName.toLowerCase()
  return variants.find(v => v.UniqueName?.toLowerCase() === name) ?? null
}

/**
 * Nothing that can be bought is selected, and some variant can be bought: the
 * selected variant cannot be, or none is selected. The page then shows the
 * selector even when no facet differs. Two variants with the same values, one
 * of them unbuyable, would otherwise leave the shopper on the one that cannot
 * be bought, or after Clear selection with no chips to choose the other (rule 2).
 */
export function needsWayOut<V extends VariantLike>(variants: readonly V[], selection: Selection<V>): boolean {
  return !isBuyable(selection.variant) && variants.some(isBuyable)
}

/**
 * The cheapest buyable variant incl. VAT that has every chip that is on: the
 * "From" price while the chips name no variant yet.
 */
export function cheapestBuyable<V extends VariantLike & { PriceIncVat?: number | null }>(
  variants: readonly V[], choices: Facets = {},
): V | null {
  const matching = variants.filter(v => {
    const facets = facetsOf(v)
    return isBuyable(v) && Object.entries(choices).every(([c, k]) => facets[c] === k)
  })
  return matching.reduce<V | null>(
    (cheapest, v) => cheapest === null || (v.PriceIncVat ?? 0) < (cheapest.PriceIncVat ?? 0) ? v : cheapest, null)
}

/**
 * Where a page starts: on the variant the address names, buyable or not, and
 * on the first buyable variant when the address is the shared name. The chips
 * show the variant's values.
 */
export function startSelection<V extends VariantLike>(variants: readonly V[], uniqueName: string): Selection<V> {
  const variant = variantNamedBy(variants, uniqueName) ?? variants.find(isBuyable) ?? null
  return { choices: facetsOf(variant), variant }
}

/** No chips on. Selects a variant only if a buyable one has no facets at all. */
export function clearSelection<V extends VariantLike>(variants: readonly V[]): Selection<V> {
  return { choices: {}, variant: buyableWithExactly(variants, {}) }
}

/**
 * Whether a chip can be clicked: some buyable variant has this value and every
 * other chip that is on (rules 3 and 6).
 */
export function canChoose<V extends VariantLike>(
  variants: readonly V[], selection: Selection<V>, code: string, key: string,
): boolean {
  return variants.some(v => {
    if (!isBuyable(v)) return false
    const facets = facetsOf(v)
    return facets[code] === key
      && Object.entries(selection.choices).every(([c, k]) => c === code || facets[c] === k)
  })
}

/**
 * A click on a chip. Turns that chip on and changes nothing else, then selects
 * the buyable variant with exactly the chips that are on, or none while the
 * chips still leave a facet open.
 */
export function choose<V extends VariantLike>(
  variants: readonly V[], selection: Selection<V>, code: string, key: string,
): Selection<V> {
  // Rule 1. Also keeps a variant the address named when another variant has
  // the same values and comes first.
  if (selection.choices[code] === key && isBuyable(selection.variant)) return selection
  // Rule 3: the template disables such a chip, so this is only a guard.
  if (!canChoose(variants, selection, code, key)) return selection
  const choices = { ...selection.choices, [code]: key }
  return { choices, variant: buyableWithExactly(variants, choices) }
}

/**
 * The first buyable variant whose facets are exactly these: the same facets,
 * with the same values. Two buyable variants with the same values cannot be told
 * apart by chips; the first one in the list is the one chosen.
 */
function buyableWithExactly<V extends VariantLike>(variants: readonly V[], choices: Facets): V | null {
  const codes = Object.keys(choices)
  return variants.find(v => {
    if (!isBuyable(v)) return false
    const facets = facetsOf(v)
    return Object.keys(facets).length === codes.length && codes.every(c => facets[c] === choices[c])
  }) ?? null
}
