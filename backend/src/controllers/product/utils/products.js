export function enrichProductWithDiscount(product) {
  const now = new Date();
  const hasDiscount = product.discount_percentage > 0;
  const isExpired = product.discount_expires_at && new Date(product.discount_expires_at) < now;
  const discountActive = hasDiscount && !isExpired;

  return {
    ...product,
    discount_active: discountActive,
    discounted_price: product.price,
    time_left:
      discountActive && product.discount_expires_at
        ? new Date(product.discount_expires_at).getTime() - now.getTime()
        : null,
  };
}

export function enrichProducts(products = []) {
  return products.map(enrichProductWithDiscount);
}
