import type { Product } from './Product'
import type { Promotion } from './Promotion'
import type { RelationGroup } from './Relations'
import type { Flag } from './Flag'

// What GET /api/productpage/:uniqueName returns: the four Norce answers the
// product page is built from, side by side and unmapped. `errors` lists the
// extras the BFF left out because their call failed - the page still renders.
export interface ProductPageData {
    product: Product;
    promotions: Promotion[];
    relations: RelationGroup[];
    flags: Flag[];
    errors: { context: string; message: string }[];
}
