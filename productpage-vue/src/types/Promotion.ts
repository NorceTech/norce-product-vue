export interface Promotion {
    Id: number;
    Name: string;
    Header: string;
    ShortDescription: string;
    Description1: string;
    Description2: string;
    StartDate: string | null;
    EndDate: string | null;
    ImageKey: string | null;
    RequirementSeed: string;
    DiscountCode: string | null;
    IsExcludedFromPriceCalculation: boolean;
    AllowProductListing: boolean;
    Images: any[];
    ProductFilters: ProductFilter[];
    AppliedAmount: number | null;
    EffectSeed: string;
    FreightDiscountPct: number | null;
    IsStackable: boolean;
    AppliedAmountIncVat: number | null;
    ExclusivityType: number;
    ExternalCode: string;
}

export interface ProductFilter {
    ManufacturerId: number | null;
    CategorySeed: string | null;
    TypeId: number | null;
    ProductId: number | null;
    VariantProductId: number | null;
    PartNo: string | null;
    PricelistId: number | null;
    FlagId: number;
}
