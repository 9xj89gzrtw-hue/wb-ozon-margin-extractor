# Wildberries & Ozon Competitor and Margin Extractor 2026

**Paste a WB/Ozon price list — get clean 2026 unit economics back:** net margin, ROI, breakeven units, minimum profitable price, competitor price gap, an **11.11 / Black Friday stress test** with the exact **maxDiscount** per SKU, and explicit **loss-making flags**. One row per SKU, ready for CSV or Excel.

> **Need the full batch calculator + table parser?**
> **Калькулятор маржи WB/Ozon 2026 + Парсер таблиц и Telegram в Excel в 1 клик** — the same economics engine in a Chrome extension, plus 1-click table / Telegram-feed export to XLSX, no 50-row cap and a multi-sheet Excel report.
> Pro key `TW1-CLIP` — **299 ₽**, lifetime. Instant key on the order page.
> [Plati.Market lot 6354602](https://plati.market/itm/6354602) · [oplata.info checkout](https://oplata.info/asp2/pay_wm.asp?id_d=6354602&ai=1481449&lang=ru-RU) · [product page](https://9xj89gzrtw-hue.github.io/data-clipper/)

---

## What it does

| Input | What you get |
|---|---|
| `products[]` — JSON list of SKUs | one row per SKU with full economics |
| `tableText` — CSV / TSV / JSON pasted from WB/Ozon analytics | same, headers auto-mapped (RU or EN) |
| `tableUrl` — public CSV/TSV/JSON export | same, fetched once |

For every SKU the Actor returns:

- `commission`, `tax`, `ads`, `logistics` (after SSP), `returnCost`, `pack` — every ruble of marketplace fees, itemised
- `profit`, `margin`, `roi` — clean 2026 unit economics
- `breakevenUnits` — units per month to cover `fixedMonthlyRub`
- `minPrice` — the lowest price that still breaks even
- `verdict` — `green` (margin ≥ 10%), `yellow` (profitable but thin), `red` (loss)
- `lossMaking` — explicit `true` / `false` flag
- `competitor` — competitor price, its profit/margin and how much you undercut it
- `promo` — 11.11 / Black Friday block: promo price, promo profit/margin/ROI, **`maxDiscountPct`** (deepest discount that still clears the minimum promo margin)
- `promoVerdict`, `promoLossMaking` — the same flags for the promo scenario

No login, no browser, no proxy. Deterministic maths, no invented numbers.

## Quick start

1. Choose a **marketplace** preset (`wb`, `ozon`, `telegram`, `custom`).
2. Paste SKUs into **products** — or paste the raw table into **tableText**.
3. Keep **stressTest1111 = true** to get the promo block and `maxDiscount` for every SKU.
4. Run. Export the dataset as **CSV** or **XLSX** from the Apify Console.

Example input:

```json
{
  "marketplace": "wb",
  "stressTest1111": true,
  "promoDiscountPct": 30,
  "promoCommissionPct": 24,
  "promoAdsPct": 20,
  "promoReturnsPct": 10,
  "promoMinMarginPct": 10,
  "maxRows": 50,
  "products": [
    { "name": "Термокружка 450 мл", "sku": "TM-450", "price": 1590, "cost": 540, "commission": 25, "logistics": 55, "competitor": 1490 }
  ]
}
```

The same table can be pasted as text — comma, semicolon and tab delimiters are auto-detected:

```text
Товар;Артикул;Цена;Закуп;Комиссия;Логистика;Конкурент
Термокружка 450 мл;TM-450;1590;540;25;55;1490
```

Example output row (WB preset, 11.11 stress test on):

```json
{
  "_type": "sku",
  "name": "Термокружка 450 мл",
  "sku": "TM-450",
  "price": 1590,
  "cost": 540,
  "commissionPct": 25,
  "commission": 397.5,
  "logistics": 55,
  "returnCost": 3,
  "tax": 95.4,
  "ads": 159,
  "pack": 15,
  "profit": 325.1,
  "margin": 20.45,
  "roi": 60.2,
  "breakevenUnits": 370,
  "minPrice": 1038.98,
  "verdict": "green",
  "lossMaking": false,
  "competitor": { "price": 1490, "profit": 266.1, "margin": 17.86, "undercutsByPct": 6.29, "verdict": "green" },
  "promo": {
    "discountPct": 30, "sellPrice": 1113, "commission": 267.12, "tax": 66.78,
    "ads": 222.6, "returnCost": 10, "profit": -63.5, "margin": -5.71,
    "roi": -11.76, "maxDiscountPct": 2.5, "minMarginPct": 10
  },
  "promoVerdict": "red",
  "promoLossMaking": true
}
```

That row is the whole point: the SKU looks healthy at 20.45% margin, but under the 11.11 profile (30% discount, 24% promo commission, 20% ads, 10% returns) it loses **63.5 ₽ per unit**. The seller can discount at most **2.5%** and still keep the 10% promo margin floor.

## The 2026 model (every knob exposed)

Base economics per SKU:

```
commission = price × commissionPct / 100
tax        = price × taxPct / 100
ads        = price × adsPct / 100
logistics  = logisticsRub × (1 − sspPct / 100)
returnCost = returnsPct / 100 × (logistics + returnLogisticsRub)
profit     = price − commission − tax − ads − logistics − returnCost − cost − packRub
margin     = profit / price × 100
roi        = profit / cost × 100
minPrice   = (cost + logistics + returnCost + packRub) / (1 − commissionPct/100 − taxPct/100 − adsPct/100)
```

Presets (all overridable from input):

| Preset | Commission | Logistics | Returns | Return cost | Ads | Pack | Tax |
|---|---|---|---|---|---|---|---|
| `wb` | 22% | 60 ₽ | 3% | 45 ₽ | 10% | 15 ₽ | 6% |
| `ozon` | 25% | 55 ₽ | 5% | 40 ₽ | 12% | 18 ₽ | 6% |
| `telegram` | 0% | 90 ₽ | 1% | 20 ₽ | 5% | 10 ₽ | 6% |
| `custom` | input | input | input | input | input | input | 6% |

11.11 / Black Friday stress test (default profile: **discount 30%, commission 24%, ads 20%, returns 10%, min margin 10%**):

```
sellPrice  = price × (1 − promoDiscount / 100)
pProfit    = sellPrice − sellPrice×promoCommission/100 − sellPrice×tax/100
             − sellPrice×promoAds/100 − logistics − promoReturnCost − cost − packRub
maxDiscount = deepest d such that pProfit(sellPrice×(1−d)) / sellPrice×(1−d) ≥ minMargin
```

`maxDiscountPct` is rounded down to 0.5% — a discount you can actually set in the WB/Ozon promo calendar without crossing the margin floor.

## Output record types

- `sku` — one computed SKU
- `summary` — SKU count, error count, loss-making count, promo-red count, total lost profit in the promo, average margins, 5 worst SKUs, all params used
- `error` — a row without a valid price, a fetch failure or an empty input
- `offer` — the TW1-CLIP Pro key, price, checkout and Plati.Market links

Export straight from the Console or the dataset API:

```
GET /v2/datasets/{id}/items?format=csv
GET /v2/datasets/{id}/items?format=xlsx
```

## Free vs Pro

| | This Actor (free tier) | TW1-CLIP extension (Pro) |
|---|---|---|
| SKUs per run | 50 (max 5000) | up to 10 000 rows per export |
| Margin / ROI / breakeven / minPrice | ✅ | ✅ |
| 11.11 stress test + maxDiscount | ✅ | ✅ |
| Loss-making flags | ✅ | ✅ |
| Batch export of several tables / Telegram feeds | — | ✅ |
| Multi-sheet Excel report | — | ✅ |
| Price | free tier | **299 ₽, lifetime key** |

The Pro key is ECDSA P-256 signed and verified offline. It is delivered automatically on the order page after SBP / RU card payment and never expires.

## Pay-per-event (synthetic events)

This Actor is ready for Apify's synthetic PPE events out of the box: every `Actor.pushData()` row automatically counts as `apify-default-dataset-item` and every run start counts as `apify-actor-start`. No extra `charge()` call is required — and none must be added for the synthetic events (Apify charges them itself). Once `pricingInfos` is set in the Apify Console (requires payout billing info at `console.apify.com/actors/{id}/publication`), the events start billing automatically.

## Local development

```bash
npm install
npm test                                   # 10 offline tests, no network
node src/main.js --input examples/input.json --out /tmp/out.json
node src/main.js --table "Товар;Цена;Закуп
Кружка;1590;540" --marketplace wb --max-rows 5
```

The same `src/run.js` powers the Actor and the CLI; `src/main.js` switches on `APIFY_IS_AT_HOME` / `ACTOR_ID`.

## Files

```
.actor/actor.json          Actor spec, categories, dataset + output schema
.actor/INPUT_SCHEMA.json   products / tableText / tableUrl, presets, stress-test knobs
src/margin.js              pure 2026 economics engine + table parsers
src/run.js                 input collection and dataset records
src/offer.js               single source of truth for the TW1-CLIP offer
tests/                     offline tests (no network)
```

## License

MIT. The Actor is free to run within the tier above; the full batch calculator and parser are a separate product sold on Plati.Market.
