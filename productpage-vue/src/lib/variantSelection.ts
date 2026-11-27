/**
 * Which variant the product page's chips select. Pure functions over the
 * product's `Variants`: no Vue, no API, so every rule below has a unit test in
 * variantSelection.test.ts.
 *
 * The chips come in rows, one per facet any variant has. A variant without a
 * facet has the value NONE in that row, with a chip of its own ("None"), so
 * every variant has exactly one value in every row and is chosen by its chips
 * like any other (rule 6).
 *
 * The state is the chips that are on (`choices`, facet code to value key) and
 * the variant they name (`variant`). The page shows and adds `variant`, and it
 * is never a combination other than the chips show: while the choices leave a
 * row open, it is null and the basket button is off.
 *
 * The rules:
 * 1. A click on a value the selected variant already has does nothing, when
 *    that variant can be bought.
 * 2. Every buyable variant can be reached from any state. The page shows the
 *    selector whenever it is not on a buyable variant, or another buyable
 *    variant has other values (`showsSelector`), and the way there is to clear
 *    the choices and click the variant's values, in any order. A click never
 *    moves another chip, so on a sparse catalog two variants can differ in two
 *    facets with no buyable step between them; clearing connects them. Two
 *    buyable variants with the same values cannot be told apart by chips, and
 *    the first one in the list is the one chosen.
 * 3. A chip can be clicked only when a buyable variant has its value together
 *    with every other chip that is on. A click therefore never changes another
 *    chip, and the page never switches to a combination the shopper cannot see.
 * 4. A linked variant starts selected, with its chips on. Changing the color
 *    keeps the size, because a color that lacks the size cannot be clicked.
 * 5. A linked variant that cannot be bought is left at the first click, which
 *    can only be on a chip a buyable variant has with the other chips. Its own
 *    chips can be clicked only if another buyable variant has the same values.
 * 6. A variant without a facet has NONE in that row: its "None" chip is on, and
 *    a chip with a value never matches it there.
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
  /** The variant the chips name, or null while they leave a row open. */
  variant: V | null
}

/** The value of a row the variant has no facet for. No real value key is this. */
export const NONE = '\u0000none'

/** The facet a parametric belongs to: its code, or its name when it has none. */
export function facetCode(pm: ParametricLike): string {
  return pm.Code || pm.Name || ''
}

/** The value a parametric carries, as the chips key it. */
export function valueKey(pm: ParametricLike): string {
  return String(pm.ValueKey ?? pm.Value ?? pm.ValueId ?? pm.ValueCode ?? '')
}

/** The facets a variant has. A facet without a code or a value is absent. */
export function facetsOf(variant: VariantLike | null | undefined): Facets {
  const facets: Facets = {}
  for (const pm of variant?.VariantParametrics ?? []) {
    const code = facetCode(pm)
    const key = valueKey(pm)
    if (code && key) facets[code] = key
  }
  return facets
}

/** The rows: every facet some variant has, in the order they first appear. */
export function facetCodes(variants: readonly VariantLike[]): string[] {
  return [...new Set(variants.flatMap(v => Object.keys(facetsOf(v))))]
}

/** A variant's value in every row, NONE where it has no facet. */
function valuesOf(variant: VariantLike, codes: readonly string[]): Facets {
  const facets = facetsOf(variant)
  return Object.fromEntries(codes.map(c => [c, facets[c] ?? NONE]))
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
 * Whether the page shows the selector (rule 2): some buyable variant is one the
 * page is not on and the chips can reach. That is any buyable variant while the
 * page is on none, or on one that cannot be bought, and otherwise one with
 * other values than the selected variant.
 */
export function showsSelector<V extends VariantLike>(variants: readonly V[], selection: Selection<V>): boolean {
  const selected = selection.variant
  if (!isBuyable(selected)) return variants.some(isBuyable)
  const codes = facetCodes(variants)
  const own = valuesOf(selected!, codes)
  return variants.some(v => isBuyable(v) && codes.some(c => valuesOf(v, codes)[c] !== own[c]))
}

/** Whether Clear selection would change anything: a chip is on, or a variant selected. */
export function canClear<V>(selection: Selection<V>): boolean {
  return Object.keys(selection.choices).length > 0 || selection.variant !== null
}

/**
 * The cheapest buyable variant incl. VAT that has every chip that is on: the
 * "From" price while the chips name no variant yet.
 */
export function cheapestBuyable<V extends VariantLike & { PriceIncVat?: number | null }>(
  variants: readonly V[], choices: Facets = {},
): V | null {
  const codes = facetCodes(variants)
  return variants
    .filter(v => isBuyable(v) && agrees(valuesOf(v, codes), choices))
    .reduce<V | null>(
      (cheapest, v) => cheapest === null || (v.PriceIncVat ?? 0) < (cheapest.PriceIncVat ?? 0) ? v : cheapest, null)
}

/**
 * Where a page starts: on the variant the address names, buyable or not, and
 * on the first buyable variant when the address is the shared name. The chips
 * show the variant's values.
 */
export function startSelection<V extends VariantLike>(variants: readonly V[], uniqueName: string): Selection<V> {
  const variant = variantNamedBy(variants, uniqueName) ?? variants.find(isBuyable) ?? null
  return { choices: variant ? valuesOf(variant, facetCodes(variants)) : {}, variant }
}

/** No chips on. Selects a variant only when there are no rows at all. */
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
  const codes = facetCodes(variants)
  return variants.some(v => {
    if (!isBuyable(v)) return false
    const values = valuesOf(v, codes)
    return values[code] === key && agrees(values, selection.choices, code)
  })
}

/**
 * A click on a chip. Turns that chip on and changes nothing else, then selects
 * the buyable variant with exactly the chips that are on, or none while the
 * chips still leave a row open.
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

/** The values agree with every chip that is on, the row `except` aside. */
function agrees(values: Facets, choices: Facets, except?: string): boolean {
  return Object.entries(choices).every(([c, k]) => c === except || values[c] === k)
}

/**
 * The first buyable variant with these values in every row, or null while a row
 * has no chip on. Two buyable variants with the same values cannot be told
 * apart by chips; the first one in the list is the one chosen.
 */
function buyableWithExactly<V extends VariantLike>(variants: readonly V[], choices: Facets): V | null {
  const codes = facetCodes(variants)
  if (codes.some(c => choices[c] === undefined)) return null
  return variants.find(v => isBuyable(v) && agrees(valuesOf(v, codes), choices)) ?? null
}
