import { describe, expect, it } from 'vitest'
import {
  canChoose, cheapestBuyable, choose, clearSelection, facetsOf, isBuyable, needsWayOut, startSelection,
  type Facets, type Selection, type VariantLike,
} from './variantSelection'

type V = VariantLike & { PartNo: string }

// A variant with these facet values. Buyable unless told otherwise.
function variant(partNo: string, facets: Facets, extra: Partial<V> = {}): V {
  return {
    PartNo: partNo,
    UniqueName: partNo.toLowerCase(),
    StatusId: 1,
    IsBuyable: true,
    Price: 100,
    VariantParametrics: Object.entries(facets).map(([Code, ValueKey]) => ({ Code, Name: Code, ValueKey })),
    ...extra,
  }
}

// Clicks in order, as the page does: a disabled chip cannot be clicked, so a
// click on one fails the test instead of being ignored.
function click(variants: V[], selection: Selection<V>, ...chips: [string, string][]) {
  return chips.reduce((s, [code, key]) => {
    expect(canChoose(variants, s, code, key), `${code}=${key} can be clicked`).toBe(true)
    return choose(variants, s, code, key)
  }, selection)
}

// The same without an expect per click, for the exhaustive loops.
function walk(variants: V[], selection: Selection<V>, chips: [string, string][]) {
  return chips.reduce((s, [code, key]) => {
    if (!canChoose(variants, s, code, key)) throw new Error(`${code}=${key} cannot be clicked`)
    return choose(variants, s, code, key)
  }, selection)
}

const partNo = (s: Selection<V>) => s.variant?.PartNo ?? null

// Devin's sparse catalog on the PR: every pair differs in two facets.
const sparse = [
  variant('BSM', { Color: 'black', Size: 'S', Finish: 'matte' }),
  variant('BLG', { Color: 'black', Size: 'L', Finish: 'gloss' }),
  variant('WSG', { Color: 'white', Size: 'S', Finish: 'gloss' }),
  variant('WLM', { Color: 'white', Size: 'L', Finish: 'matte' }),
]

describe('start', () => {
  const variants = [
    variant('SINGLE', { Pack: '1' }, { UniqueName: 'hoof-oil-450-ml' }),
    variant('FOUR', { Pack: '4' }, { UniqueName: 'hoof-oil-450-ml-4-pack' }),
  ]

  it('selects the variant the address names, with its chips on', () => {
    const s = startSelection(variants, 'hoof-oil-450-ml-4-pack')
    expect(partNo(s)).toBe('FOUR')
    expect(s.choices).toEqual({ Pack: '4' })
  })

  it('matches the name case-insensitively, as Norce does', () => {
    expect(partNo(startSelection(variants, 'Hoof-Oil-450-ML-4-Pack'))).toBe('FOUR')
  })

  it('starts on the first buyable variant for the shared name', () => {
    const withUnbuyableFirst = [variant('GONE', { Pack: '2' }, { StatusId: 3 }), ...variants]
    expect(partNo(startSelection(withUnbuyableFirst, 'hoof-oil-leovet-450-ml'))).toBe('SINGLE')
  })

  // Devin, "Wrong variant on default-name links": a variant's default name in
  // another culture matches no UniqueName in Variants, and Norce's answer does
  // not say which variant it meant, so it opens like the shared name.
  it('opens a default name from another culture like the shared name', () => {
    const swedish = variants.map(v => ({ ...v, UniqueName: `hovolja-${v.UniqueName}` }))
    expect(partNo(startSelection(swedish, 'hoof-oil-450-ml-4-pack'))).toBe('SINGLE')
  })

  it('starts with nothing selected when nothing can be bought', () => {
    const s = startSelection([variant('GONE', { Pack: '2' }, { IsBuyable: false })], 'shared')
    expect(s).toEqual({ choices: {}, variant: null })
  })
})

describe('rule 1: a click on a value the buyable selected variant has does nothing', () => {
  it('keeps the selection as it is', () => {
    const s = startSelection(sparse, 'wlm')
    expect(choose(sparse, s, 'Size', 'L')).toBe(s)
  })

  // Devin on 4e63917: an active chip could hand the selection to another
  // variant that tied with it.
  it('keeps a linked variant when another one with the same values comes first', () => {
    const twins = [variant('FIRST', { Color: 'red' }), variant('LINKED', { Color: 'red' }), variant('BLUE', { Color: 'blue' })]
    const s = startSelection(twins, 'linked')
    expect(partNo(choose(twins, s, 'Color', 'red'))).toBe('LINKED')
  })
})

describe('rule 2: every buyable variant can be reached from any state', () => {
  // Devin on dd54c27, "Unreachable buyable variants in picker": from
  // black/S/matte, white/L/matte could not be reached.
  it("reaches every variant of Devin's sparse catalog: clear, then its values", () => {
    for (const target of sparse) {
      const end = click(sparse, clearSelection(sparse), ...(Object.entries(facetsOf(target)) as [string, string][]))
      expect(partNo(end)).toBe(target.PartNo)
    }
  })

  it('clears every chip whatever the state', () => {
    expect(clearSelection(sparse)).toEqual({ choices: {}, variant: null })
  })

  // Every subset of two catalogs, every target and every click order. The
  // second catalog has variants without a finish (rule 6).
  const catalogs: [string, Facets[]][] = [
    ['3 colors × 2 sizes × 2 finishes', product3(['black', 'white', 'red'], ['S', 'L'], ['matte', 'gloss'])],
    ['2 colors × 2 sizes × finish or none', product3(['black', 'white'], ['S', 'L'], ['matte', 'gloss', undefined])],
  ]
  for (const [name, combos] of catalogs) {
    it(`reaches every variant in every sparse ${name} catalog, in any click order`, () => {
      let paths = 0
      for (let mask = 1; mask < 1 << combos.length; mask++) {
        const variants = combos
          .filter((_, i) => mask & (1 << i))
          .map(f => variant(Object.values(f).join('/'), f))
        for (const target of variants) {
          for (const order of permutations(Object.entries(facetsOf(target)) as [string, string][])) {
            if (walk(variants, clearSelection(variants), order).variant !== target) {
              throw new Error(`${order.map(c => c.join('=')).join(', ')} missed ${target.PartNo}`)
            }
            paths++
          }
        }
      }
      expect(paths).toBeGreaterThan(10_000)
    }, 60_000)
  }
})

describe('rule 3: a chip without a buyable combination cannot be clicked', () => {
  it('disables every other chip when no buyable variant differs in one facet', () => {
    const s = startSelection(sparse, 'bsm')
    const enabled = [['Color', 'white'], ['Size', 'L'], ['Finish', 'gloss']].filter(([c, k]) => canChoose(sparse, s, c, k))
    expect(enabled).toEqual([])
    expect(['Color', 'Size', 'Finish'].every(c => canChoose(sparse, s, c, s.choices[c]))).toBe(true)
  })

  // Copilot on 0cd8cb2: chips of a facet no buyable variant has were enabled.
  it('disables every chip when nothing can be bought', () => {
    const variants = [variant('A', { Color: 'red' }, { IsBuyable: false }), variant('B', { Color: 'blue' }, { Price: 0 })]
    const s = startSelection(variants, 'a')
    expect(canChoose(variants, s, 'Color', 'red')).toBe(false)
    expect(canChoose(variants, s, 'Color', 'blue')).toBe(false)
    expect(choose(variants, s, 'Color', 'blue')).toBe(s)
  })

  it('disables a size whose variant in this color is not active', () => {
    const variants = [
      variant('S', { Size: 'S' }), variant('M', { Size: 'M' }, { StatusId: 3 }), variant('L', { Size: 'L' }),
    ]
    const s = startSelection(variants, 'l')
    expect(canChoose(variants, s, 'Size', 'M')).toBe(false)
    expect(partNo(click(variants, s, ['Size', 'S']))).toBe('S')
  })

  // From every state a shopper can reach, a click changes the clicked chip
  // and nothing else, and the selected variant has exactly the chips' values.
  it('never changes a chip the shopper did not click', () => {
    const combos = product3(['black', 'white', 'red'], ['S', 'L'], ['matte', 'gloss', undefined])
    const variants = combos.filter((_, i) => i % 3 !== 1).map(f => variant(Object.values(f).join('/'), f))
    const chips = combos.flatMap(f => Object.entries(f)).filter(([, k]) => k !== undefined) as [string, string][]
    const seen = new Set<string>()
    const queue: Selection<V>[] = [clearSelection(variants), ...variants.map(v => startSelection(variants, v.UniqueName!))]
    while (queue.length) {
      const s = queue.pop()!
      const id = JSON.stringify([s.choices, partNo(s)])
      if (seen.has(id)) continue
      seen.add(id)
      for (const [code, key] of chips) {
        if (!canChoose(variants, s, code, key)) continue
        const next = choose(variants, s, code, key)
        if (next === s) continue
        expect(next.choices).toEqual({ ...s.choices, [code]: key })
        if (next.variant) expect(facetsOf(next.variant)).toEqual(next.choices)
        queue.push(next)
      }
    }
    expect(seen.size).toBeGreaterThan(20)
  })
})

describe('rule 4: a linked variant starts selected, and a color change keeps the size', () => {
  // Devin on 6d27103, "Color changes discard the linked size", and Copilot on
  // 6d27103: green/L, then XL, gave black/XL.
  const jackets = [
    variant('RED-S', { Color: 'red', Size: 'S' }),
    variant('BLUE-L', { Color: 'blue', Size: 'L' }),
    variant('BLACK-XL', { Color: 'black', Size: 'XL' }),
    variant('RED-L', { Color: 'red', Size: 'L' }),
    variant('BLUE-XL', { Color: 'blue', Size: 'XL' }),
  ]

  it('shows the linked variant\'s values', () => {
    expect(startSelection(jackets, 'blue-l').choices).toEqual({ Color: 'blue', Size: 'L' })
  })

  it('keeps the size when the color changes', () => {
    expect(partNo(click(jackets, startSelection(jackets, 'blue-l'), ['Color', 'red']))).toBe('RED-L')
  })

  it('keeps the color when the size changes', () => {
    expect(partNo(click(jackets, startSelection(jackets, 'blue-l'), ['Size', 'XL']))).toBe('BLUE-XL')
  })

  it('disables a color that lacks the size instead of changing the size', () => {
    expect(canChoose(jackets, startSelection(jackets, 'blue-l'), 'Color', 'black')).toBe(false)
  })
})

describe('rule 5: a linked variant that cannot be bought is left at the first click', () => {
  // Devin on 1bc466a, "Enabled chips leave unavailable variants selected".
  const variants = [
    variant('RED-M', { Color: 'red', Size: 'M' }, { IsBuyable: false }),
    variant('BLUE-M', { Color: 'blue', Size: 'M' }),
    variant('RED-L', { Color: 'red', Size: 'L' }),
  ]
  const linked = startSelection(variants, 'red-m')

  it('starts on it, with its chips on', () => {
    expect(partNo(linked)).toBe('RED-M')
    expect(linked.choices).toEqual({ Color: 'red', Size: 'M' })
  })

  it('moves to the buyable variant with the clicked value', () => {
    expect(partNo(click(variants, linked, ['Color', 'blue']))).toBe('BLUE-M')
    expect(partNo(click(variants, linked, ['Size', 'L']))).toBe('RED-L')
  })

  // Devin expected M to give blue/M. That would change the color the shopper
  // sees without a click on it, which rule 3 rules out, so M is disabled: no
  // buyable variant is red/M.
  it('disables its own chips when no buyable variant has the same values', () => {
    expect(canChoose(variants, linked, 'Size', 'M')).toBe(false)
    expect(canChoose(variants, linked, 'Color', 'red')).toBe(false)
  })

  it('moves to a buyable twin when its own chip is clicked', () => {
    const twins = [...variants, variant('RED-M-2', { Color: 'red', Size: 'M' })]
    expect(partNo(click(twins, startSelection(twins, 'red-m'), ['Size', 'M']))).toBe('RED-M-2')
  })
})

describe('rule 6: a variant without a facet', () => {
  // Devin on 0cd8cb2, "Missing options override selected chips": with Finish
  // before Color, black/S without a finish, then L, gave white/L.
  const variants = [
    variant('B-S', { Color: 'black', Size: 'S' }),
    variant('B-L-GLOSS', { Finish: 'gloss', Color: 'black', Size: 'L' }),
    variant('W-L', { Color: 'white', Size: 'L' }),
  ]
  const start = startSelection(variants, 'b-s')

  it('has no chip on in the row it lacks', () => {
    expect(start.choices).toEqual({ Color: 'black', Size: 'S' })
  })

  it('keeps the color, and leaves the finish to the shopper', () => {
    const s = click(variants, start, ['Size', 'L'])
    expect(s.choices).toEqual({ Color: 'black', Size: 'L' })
    expect(s.variant).toBeNull()
    expect(partNo(click(variants, s, ['Finish', 'gloss']))).toBe('B-L-GLOSS')
  })

  it('is selected when the chips match it with its row empty', () => {
    expect(partNo(click(variants, start, ['Size', 'L'], ['Color', 'white']))).toBe('W-L')
  })

  it('never matches a chip in the row it lacks', () => {
    const glossy = click(variants, clearSelection(variants), ['Finish', 'gloss'])
    expect(canChoose(variants, glossy, 'Color', 'white')).toBe(false)
  })
})

// Copilot on a5cb324: a linked variant that cannot be bought, with a buyable
// twin with the same values, hid the selector, since no facet differs.
describe('a way out of a linked variant that cannot be bought', () => {
  it('is offered when nothing differs but the twin can be bought, and leads to it', () => {
    const twins = [variant('RED-M', { Color: 'red', Size: 'M' }, { IsBuyable: false }), variant('RED-M-2', { Color: 'red', Size: 'M' })]
    const linked = startSelection(twins, 'red-m')
    expect(needsWayOut(twins, linked)).toBe(true)
    expect(partNo(click(twins, linked, ['Color', 'red']))).toBe('RED-M-2')
    expect(partNo(click(twins, clearSelection(twins), ['Size', 'M'], ['Color', 'red']))).toBe('RED-M-2')
  })

  it('leads to the buyable one when no variant has facets at all', () => {
    const plain = [variant('FOUR', {}, { StatusId: 3 }), variant('SINGLE', {})]
    const linked = startSelection(plain, 'four')
    expect(needsWayOut(plain, linked)).toBe(true)
    expect(partNo(clearSelection(plain))).toBe('SINGLE')
  })

  it('is not offered on a buyable variant, or when nothing can be bought', () => {
    const twins = [variant('A', { Color: 'red' }), variant('B', { Color: 'red' }, { IsBuyable: false })]
    expect(needsWayOut(twins, startSelection(twins, 'a'))).toBe(false)
    const none = [variant('A', { Color: 'red' }, { Price: 0 })]
    expect(needsWayOut(none, startSelection(none, 'a'))).toBe(false)
  })
})

// Copilot on a5cb324: the basket button read only IsBuyable. It uses
// isBuyable, the chips' own test.
describe('isBuyable, for the chips and the basket button alike', () => {
  it('needs status 1, IsBuyable and a price above 0', () => {
    expect(isBuyable(variant('OK', {}))).toBe(true)
    expect(isBuyable(variant('EXPIRING', {}, { StatusId: 3 }))).toBe(false)
    expect(isBuyable(variant('FREE', {}, { Price: 0 }))).toBe(false)
    expect(isBuyable(variant('BLOCKED', {}, { IsBuyable: false }))).toBe(false)
    expect(isBuyable(null)).toBe(false)
  })
})

// Devin on a5cb324: with no variant selected the page struck through the
// root's price ex VAT. It shows the cheapest buyable variant's price instead.
describe('cheapestBuyable', () => {
  it('is the buyable variant with the lowest price incl. VAT', () => {
    const variants = [
      variant('DEAR', {}, { PriceIncVat: 300 } as any),
      variant('GONE', {}, { PriceIncVat: 50, StatusId: 3 } as any),
      variant('CHEAP', {}, { PriceIncVat: 125 } as any),
    ]
    expect(cheapestBuyable(variants)?.PartNo).toBe('CHEAP')
    expect(cheapestBuyable([variants[1]])).toBeNull()
  })
})

// Every combination of the given values, one variant each. An undefined
// finish is a variant without one.
function product3(colors: string[], sizes: string[], finishes: (string | undefined)[]): Facets[] {
  return colors.flatMap(Color => sizes.flatMap(Size => finishes.map((Finish): Facets =>
    Finish === undefined ? { Color, Size } : { Color, Size, Finish })))
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest]))
}
