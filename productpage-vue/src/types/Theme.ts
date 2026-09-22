// Storefront theme from GET /api/theme. The BFF has already validated every
// value (hex colours, a whitelisted font), and leaves out anything missing or
// invalid - so each field is optional, and an empty object means the default
// style.
export interface Theme {
    PrimaryColor?: string;
    AccentColor?: string;
    LogoFont?: string;
    // Media Key of the theme product's image, combined with the CDN host like
    // any other image.
    LogoImageKey?: string;
}
