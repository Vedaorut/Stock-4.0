export function generatePaymentUri(currency, address, amount) {
  switch (currency) {
    case 'BTC':
      return `bitcoin:${address}?amount=${amount}`;
    case 'LTC':
      return `litecoin:${address}?amount=${amount}`;
    case 'ETH': {
      const weiAmount = BigInt(Math.floor(parseFloat(amount) * 1e18));
      return `ethereum:${address}?value=${weiAmount}`;
    }
    case 'USDT_TRC20':
      return address;
    default:
      return address;
  }
}

export function buildWalletMap(orderData) {
  return {
    BTC: orderData.wallet_btc,
    ETH: orderData.wallet_eth,
    LTC: orderData.wallet_ltc,
    USDT_TRC20: orderData.wallet_usdt,
  };
}
