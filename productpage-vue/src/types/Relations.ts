export interface RelationGroup {
    Id: number;
    Code: string;
    Name: string;
    Description: string;
    RelationsMetadata: RelationMetadata[];
    Relations: {
        ItemCount: number;
        Items: RelatedProduct[];
    };
    VariantRelations: any[];
}

export interface RelationMetadata {
    Id: number;
    PartNo: string | null;
    IsVariantSpecific: boolean;
}

export interface RelatedProduct {
    Id: number;
    Name: string;
    SubHeader: string;
    Manufacturer: {
        Id: number;
        Name: string;
        PartNo: string | null;
        LogoPath: string;
        LogoKey: string | null;
        UniqueName: string;
    };
    Image: string | null;
    CampaignImage: string | null;
    LargeImage: string | null;
    ThumbnailImage: string | null;
    FlagIdSeed: string;
    Price: number;
    PriceRecommended: number | null;
    PriceCatalog: number | null;
    VatRate: number;
    RecommendedQuantity: number;
    OnHand: Inventory;
    OnHandStore: Inventory;
    OnHandSupplier: Inventory;
    Key: string;
    Updated: string | null;
    ImageKey: string;
    PopularityRank: number;
    StatusId: number;
    VariantName: string | null;
    VariantImageKey: string | null;
    AdditionalImageKeySeed: string;
    GroupByKey: string;
    VariantFlagIdSeed: string | null;
    PartNo: string | null;
    PriceListId: number | null;
    SortOrder: number;
    CategoryId: number;
    ParametricListSeed: string;
    ParametricMultipleSeed: string;
    ParametricValueSeed: string;
    ParametricTextField: any[];
    VariantParametricSeed: string;
    UniqueName: string;
    StockDisplayBreakPoint: number | null;
    IsBuyable: boolean;
    SubDescription: string;
    Quantity: number | null;
    Type: number;
    CategoryIdSeed: string;
    IsRecommendedQuantityFixed: boolean;
    Synonyms: string | null;
    VariantUniqueName: string | null;
    IsSubscribable: boolean;
    UnitOfMeasurement: string;
    UnitOfMeasurementCount: number;
    EanCode: string | null;
    PriceStandard: number;
    IsDangerousGoods: boolean;
    PriceIncVat: number;
    ImageAltText: string | null;
    VariantImageAltText: string | null;
}

export interface Inventory {
    Value: number;
    IncomingValue: number;
    NextDeliveryDate: string | null;
    LeadtimeDayCount: number | null;
    LastChecked: string | null;
    IsActive: boolean;
    IsReturnable: boolean;
    Info: string | null;
}
