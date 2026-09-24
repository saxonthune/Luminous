//! Two modules for trying Hemp's dependency disclosure.

/// Pricing rules shared by order calculations.
mod pricing {
    /// Base unit price, before shipping.
    pub const UNIT_PRICE: u32 = 20;
    /// Shipping charged on an ordinary order.
    pub const SHIPPING: u32 = 5;

    /// Multiply the quantity by the shared unit price.
    pub fn subtotal(quantity: u32) -> u32 {
        quantity * UNIT_PRICE
    }
}

/// Order calculations consume pricing rules without owning them.
mod orders {
    /// Ordinary checkout: subtotal plus shipping.
    pub fn checkout(quantity: u32) -> u32 {
        super::pricing::subtotal(quantity) + super::pricing::SHIPPING
    }

    /// A single-item quote reads the same price and shipping constants directly.
    pub fn quote() -> u32 {
        super::pricing::UNIT_PRICE + super::pricing::SHIPPING
    }
}

fn main() {
    assert_eq!(orders::checkout(2), 45);
    assert_eq!(orders::quote(), 25);
}
