export const formatInvoiceResponse = (invoice) => ({
  invoiceId: invoice.id,
  address: invoice.address,
  expectedAmount: parseFloat(invoice.expected_amount),
  currency: invoice.currency,
  expiresAt: invoice.expires_at,
  cryptoAmount: parseFloat(invoice.crypto_amount ?? invoice.expected_amount),
  chain: invoice.chain,
});
