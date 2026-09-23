// Basket types as the Norce Shopping Service actually returns them.
// Refreshed from a real GetBasket response - see mockdata/basket.json.

/** Money bucket used throughout Basket.Summary. */
export interface BasketAmount {
  Amount: number
  Vat: number
  AmountIncVat: number
}

export interface BasketSummary {
  Items?: BasketAmount
  /** Norce's own spelling of the freight bucket - not a typo on our side. */
  Freigt?: BasketAmount
  Fees?: BasketAmount
  Total?: BasketAmount
}

export interface BasketItem {
  Id?: number
  LineNo?: number
  ProductId?: number | null
  PartNo: string
  Name?: string
  UniqueName?: string | null
  Quantity: number
  /**
   * Row type. 1 = product row. Other types are fee rows (freight, invoice fee)
   * that Norce maintains itself: they must not get a quantity spinner or a
   * remove button. Never assume Items only holds what the customer picked.
   */
  Type?: number
  /**
   * Careful: the Shopping Service returns Price: 0 on basket rows. The price
   * that is actually charged is PriceDisplay (ex VAT) / PriceDisplayIncVat
   * (inc VAT). PriceOriginal is the price before promotions, i.e. the one you
   * show struck through.
   */
  Price?: number
  PriceDisplay?: number
  PriceDisplayIncVat?: number
  PriceOriginal?: number
  PriceOriginalIncVat?: number
  VatRate?: number
  PriceListId?: number | null
  UOM?: string
  ImageKey?: string | null
}

export interface Basket {
  Id: number
  CurrencyCode?: string
  IsEditable?: boolean
  Items: BasketItem[]
  Summary?: BasketSummary
}
