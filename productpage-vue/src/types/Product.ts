export interface Product {
    Id: number;
    Name: string;
    Description: string;
    PartNo: string;
    SubHeader: string;
    Manufacturer: Manufacturer;
    Files: FileItem[];
    FlagIdSeed: string;
    Price: number;
    PriceCatalog: number | null;
    PriceRecommended: number | null;
    VatRate: number;
    RecommendedQuantity: number;
    OnHand: Inventory;
    OnHandStore: Inventory;
    OnHandSupplier: Inventory;
    Variants: any[];
    PriceListId: number;
    Key: string;
    Updated: string;
    NavigationNodeKey: string | null;
    CategoryId: number;
    CategoryName: string;
    ImageKey: string;
    VariantParametrics: Parametric[];
    Parametrics: Parametric[];
    StatusId: number;
    MetaTags: string;
    MetaDescription: string;
    VariantName: string | null;
    DescriptionHeader: string;
    UniqueName: string;
    StockDisplayBreakPoint: number | null;
    Families: any[];
    IsBuyable: boolean;
    SubDescription: string;
    Uom: string;
    UomCount: number;
    EanCode: string | null;
    Type: number;
    Categories: Category[];
    IsRecommendedQuantityFixed: boolean;
    PopularityRank: number;
    CostPurchase: number;
    CostUnit: number;
    Title: string | null;
    ActualWeight: number;
    CommodityCode: string | null;
    IsDropShipOnly: boolean;
    Synonyms: string | null;
    IsSubscribable: boolean;
    UnspscCode: string | null;
    PriceStandard: number;
    Width: number | null;
    Height: number | null;
    Depth: number | null;
    IsDangerousGoods: boolean;
    HasQuantityBreaks: boolean;
    GroupByKey: string;
    PriceIncVat: number;
    ImageAltText: string;
}

export interface Manufacturer {
    Id: number;
    Name: string;
    PartNo: string;
    LogoPath: string;
    LogoKey: string | null;
    UniqueName: string;
}

export interface FileItem {
    Id: number;
    Type: number;
    Path: string | null;
    Name: string;
    Description: string;
    Key: string;
    Extension: string;
    Code: string;
    SortOrder: number;
    ImageAltText: string;
}

export interface Parametric {
    Name: string;
    Value: string;
    Id: number;
    ValueId: number | null;
    Description: string;
    ValueDescription: string | null;
    IsPrimary: boolean;
    ValueIdSeed: string;
    Value2: string;
    Uom: string;
    GroupId: number;
    GroupName: string | null;
    SortOrder: number;
    Code: string;
    IsHidden: boolean;
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

export interface Category {
    Id: number;
    Value: string;
    Code: string;
}
