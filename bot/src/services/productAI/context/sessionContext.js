/**
 * Session Context Management for ProductAI
 * Handles tracking of recent products and actions in user session
 */

/**
 * Save product context to session for AI reference
 * @param {Object} ctx - Telegraf context with session
 * @param {Object} product - Product object with id, name, price
 * @param {Object} meta - Additional metadata (action, command, relatedProducts)
 */
export function noteProductContext(ctx, product, meta = {}) {
  if (!ctx?.session || !product) {
    return;
  }

  const snapshot = {
    id: product.id ?? null,
    name: product.name ?? null,
    price: product.price ?? null,
    updatedAt: Date.now(),
  };

  const prev = ctx.session.aiContext || {};
  const recent = [snapshot, ...(prev.recentProducts || [])]
    .filter((item) => item.name)
    .filter((item, index, array) => array.findIndex((other) => other.name === item.name) === index)
    .slice(0, 5);

  ctx.session.aiContext = {
    ...prev,
    lastProductId: snapshot.id ?? prev.lastProductId ?? null,
    lastProductName: snapshot.name ?? prev.lastProductName ?? null,
    lastAction: meta.action || prev.lastAction || null,
    lastCommand: meta.command || prev.lastCommand || null,
    recentProducts: recent,
    updatedAt: Date.now(),
  };

  if (meta.relatedProducts) {
    ctx.session.aiContext.relatedProducts = meta.relatedProducts;
  }
}

/**
 * Update session context from operation result
 * @param {Object} ctx - Telegraf context with session
 * @param {Object} result - Operation result with data and operation
 * @param {string} command - Original user command
 */
export function updateContextFromResult(ctx, result, command) {
  if (!ctx?.session || !result?.data) {
    return;
  }

  const { data, operation } = result;
  const action = data.action || operation || null;

  if (data.product) {
    noteProductContext(ctx, data.product, { action, command });
    return;
  }

  if (Array.isArray(data.products) && data.products.length === 1) {
    noteProductContext(ctx, data.products[0], { action, command });
    return;
  }

  if (Array.isArray(data.products) && data.products.length > 1) {
    const snapshot = data.products[0];
    noteProductContext(ctx, snapshot, {
      action,
      command,
      relatedProducts: data.products.map((item) => ({
        id: item.id ?? null,
        name: item.name ?? null,
        price: item.price ?? null,
      })),
    });
  }
}
