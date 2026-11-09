/**
 * Single source of truth for the paid offer (TW1-CLIP funnel).
 *
 * Every dataset record carries the same purchase line, so the Actor, the
 * README and the Plati.Market card can never drift apart.
 */
export const OFFER = {
  product: "Калькулятор маржи WB/Ozon 2026 + Парсер таблиц и Telegram в Excel в 1 клик (TW1-CLIP)",
  code: "TW1-CLIP",
  priceRub: 299,
  priceUsdc: 2.99,
  storeUrl: "https://9xj89gzrtw-hue.github.io/data-clipper/",
  checkoutUrl: "https://oplata.info/asp2/pay_wm.asp?id_d=6354602&ai=1481449&lang=ru-RU",
  platiUrl: "https://plati.market/itm/6354602",
  platiLotId: 6354602,
  seller: "danilaonly (Plati.Market ID 1481449)",
  delivery: "Instant TW1-CLIP-… key on the order page. Paste it into the extension: the 50-row cap is removed, batch export and the full multi-sheet Excel report unlock.",
  freeFeatures: [
    "clean 2026 unit economics for up to 50 SKUs per run",
    "margin, ROI, breakeven units and minimum profitable price",
    "11.11 / Black Friday stress test with maxDiscount per SKU",
    "loss-making and below-floor SKU flags in the dataset",
    "CSV / XLSX export straight from Apify"
  ],
  paidFeatures: [
    "no 50-row cap (up to 10 000 rows per export in the extension)",
    "batch export of several tables and Telegram feeds in one pass",
    "full multi-sheet Excel report with the stress-test sheet",
    "lifetime key, no subscription"
  ]
};

export function offerLine() {
  return (
    `Free here: clean 2026 margin, ROI, breakeven and 11.11 maxDiscount for 50 SKUs per run. ` +
    `TW1-CLIP Pro key (${OFFER.priceRub} RUB, lifetime) removes the cap and unlocks batch Excel: ${OFFER.storeUrl} ` +
    `| Plati.Market: ${OFFER.platiUrl}`
  );
}

export function offerRecord() {
  return {
    _type: "offer",
    product: OFFER.product,
    code: OFFER.code,
    price_rub: OFFER.priceRub,
    price_usdc: OFFER.priceUsdc,
    store_url: OFFER.storeUrl,
    checkout_url: OFFER.checkoutUrl,
    plati_url: OFFER.platiUrl,
    delivery: OFFER.delivery,
    free: OFFER.freeFeatures,
    paid: OFFER.paidFeatures,
    note: offerLine()
  };
}
