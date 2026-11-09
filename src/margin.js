/**
 * Pure 2026 unit-economics engine for WB/Ozon price lists.
 *
 * Mirrors the public calculator at /data-clipper/ (unitcalc.js) exactly:
 * same fee presets, same profit/margin/ROI formulas, same maxDiscount
 * derivation. No network, no browser — deterministic and unit-testable.
 */

export const PRESETS = {
  wb: {
    label: "WB · typical FBO 2026",
    commission: 22, logistics: 60, ssp: 0, returns: 3,
    returnLogistics: 45, ads: 10, pack: 15, tax: 6
  },
  ozon: {
    label: "Ozon · typical FBO 2026",
    commission: 25, logistics: 55, ssp: 0, returns: 5,
    returnLogistics: 40, ads: 12, pack: 18, tax: 6
  },
  telegram: {
    label: "TG / direct price list · no commission",
    commission: 0, logistics: 90, ssp: 0, returns: 1,
    returnLogistics: 20, ads: 5, pack: 10, tax: 6
  },
  custom: {
    label: "Custom · all fees from input",
    commission: 0, logistics: 0, ssp: 0, returns: 0,
    returnLogistics: 0, ads: 0, pack: 0, tax: 6
  }
};

/* ---------- column synonyms (lower-case, RU first) ---------- */
const SYN = {
  name: ["товар", "название", "наименование", "title", "name", "card", "карточка"],
  sku: ["sku", "артикул", "код", "артикулwb", "артикулozon", "nmid", "id"],
  price: ["цена", "продажа", "розница", "прайс", "ценапродажи", "price", "saleprice", "salepriceu", "retail"],
  cost: ["закуп", "закупка", "себест", "себестоимость", "cost", "buy", "purchase"],
  commission: ["комиссия", "комиссияwb", "комиссияozon", "commission", "категория", "category"],
  logistics: ["логистика", "логист", "доставка", "logistics", "logisticscost", "fbo", "fbs"],
  competitor: ["конкурент", "конкуренты", "конкурентцена", "competitor", "comp", "minprice", "минцена", "цена конкурента"]
};

export function round2(v) {
  if (v == null || !isFinite(v)) return null;
  return Math.round(v * 100) / 100;
}

/** RU "1 234,56 ₽" and EN "1,234.56$" both map correctly. */
export function parseNum(v) {
  if (v == null) return NaN;
  if (typeof v === "number") return isFinite(v) ? v : NaN;
  let s = String(v);
  s = s.replace(/[^\d,.\-+]/g, "").replace(/\u00A0/g, "");
  if (s.indexOf(",") !== -1 && s.indexOf(".") !== -1) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) {
    const m = s.match(/[-+]?\d*\.?\d+/);
    return m ? parseFloat(m[0]) : NaN;
  }
  return parseFloat(s);
}

export function normKey(k) {
  return String(k || "").toLowerCase().replace(/[\s_%:]/g, "").replace(/ё/g, "е");
}

export function mapColumns(headers) {
  const out = { name: null, sku: null, price: null, cost: null, commission: null, logistics: null, competitor: null };
  const seen = {};
  for (const h of headers) {
    const n = normKey(h);
    for (const field of Object.keys(SYN)) {
      if (out[field] !== null) continue;
      for (const syn of SYN[field]) {
        if (n === syn || n.indexOf(syn) === 0) { out[field] = h; seen[field] = true; break; }
      }
    }
  }
  return out;
}

/* ---------- input parsers (CSV / TSV / JSON / simple HTML tables) ---------- */
function detectDelimiter(line) {
  if (line.indexOf("\t") !== -1) return "\t";
  if (line.indexOf(";") !== -1) return ";";
  return ",";
}

export function splitCsvLine(line, delim) {
  const cells = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function objFromRow(headers, cells) {
  const o = {};
  headers.forEach((h, i) => { o[h] = cells[i] !== undefined ? String(cells[i]).trim() : ""; });
  return o;
}

function unwrapList(o) {
  const K = ["items", "data", "rows", "list", "results", "cards", "products"];
  for (const k of K) {
    if (Array.isArray(o[k]) && o[k].length && typeof o[k][0] === "object") return o[k];
  }
  return [o];
}

export function rowsFromObjects(list) {
  const keys = [];
  const seen = new Set();
  for (const o of list) {
    for (const k of Object.keys(o || {})) {
      if (!seen.has(k)) { seen.add(k); keys.push(k); }
    }
  }
  return {
    headers: keys,
    rows: list.map((o) => {
      const r = {};
      for (const k of keys) r[k] = o[k] !== undefined && o[k] !== null ? o[k] : "";
      return r;
    })
  };
}

function stripTags(s) {
  return String(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function parseTable(text) {
  const t = String(text == null ? "" : text).trim();
  if (!t) return { headers: [], rows: [], format: "empty" };

  if (t.startsWith("[") || t.startsWith("{")) {
    try {
      const j = JSON.parse(t);
      const list = Array.isArray(j) ? j : unwrapList(j);
      if (Array.isArray(list) && list.length && typeof list[0] === "object") {
        return { ...rowsFromObjects(list), format: "json" };
      }
    } catch { /* fall through to CSV */ }
  }

  if (/<t[dr]\b|<table\b/i.test(t)) {
    const grid = [];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = rowRe.exec(t))) {
      const cells = [];
      const cellRe = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi;
      let c;
      while ((c = cellRe.exec(m[1]))) cells.push(stripTags(c[1]).trim());
      if (cells.length) grid.push(cells);
    }
    if (grid.length >= 1) {
      let headers = grid[0];
      let data = grid.slice(1);
      if (data.length === 0) { data = [grid[0]]; headers = headers.map((_, i) => "col" + (i + 1)); }
      return { headers, rows: data.map((r) => objFromRow(headers, r)), format: "html" };
    }
  }

  const lines = t.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return { headers: [], rows: [], format: "empty" };
  const delim = detectDelimiter(lines[0]);
  const grid = lines.map((l) => splitCsvLine(l, delim));
  let headers = grid[0].map((h, i) => h.trim() || "col" + (i + 1));
  let data = grid.slice(1);
  if (data.length === 0) { data = [grid[0]]; headers = headers.map((_, i) => "col" + (i + 1)); }
  return { headers, rows: data.map((r) => objFromRow(headers, r)), format: delim === "\t" ? "tsv" : "csv" };
}

/* ---------- parameters ---------- */
function numOr(v, fallback) {
  const n = parseNum(v);
  return isFinite(n) ? n : fallback;
}

export function resolveParams(input = {}) {
  const marketplace = ["wb", "ozon", "telegram", "custom"].includes(input.marketplace) ? input.marketplace : "wb";
  const base = PRESETS[marketplace];
  return {
    marketplace,
    commission: numOr(input.commissionPct, base.commission),
    logistics: numOr(input.logisticsRub, base.logistics),
    ssp: numOr(input.sspPct, base.ssp),
    returns: numOr(input.returnsPct, base.returns),
    returnLogistics: numOr(input.returnLogisticsRub, base.returnLogistics),
    ads: numOr(input.adsPct, base.ads),
    pack: numOr(input.packRub, base.pack),
    tax: numOr(input.taxPct, base.tax),
    fixedMonthly: numOr(input.fixedMonthlyRub, 120000),
    promoDiscount: input.stressTest1111 !== false ? numOr(input.promoDiscountPct, 30) : 0,
    promoCommission: numOr(input.promoCommissionPct, 24),
    promoAds: numOr(input.promoAdsPct, 20),
    promoReturns: numOr(input.promoReturnsPct, 10),
    promoMinMargin: numOr(input.promoMinMarginPct, 10)
  };
}

/* ---------- the economics model ---------- */
export function computeSku(row, cols, p) {
  const name = cols.name != null ? String(row[cols.name] ?? "").trim() : "";
  const sku = cols.sku != null ? String(row[cols.sku] ?? "").trim() : "";
  const price = parseNum(cols.price != null ? row[cols.price] : NaN);
  if (!isFinite(price) || price <= 0) return { ok: false, name, sku, error: "missing or invalid price" };

  let cost = parseNum(cols.cost != null ? row[cols.cost] : 0);
  if (!isFinite(cost)) cost = 0;
  let commPct = parseNum(cols.commission != null ? row[cols.commission] : NaN);
  if (!isFinite(commPct)) commPct = p.commission;
  let logi = parseNum(cols.logistics != null ? row[cols.logistics] : NaN);
  if (!isFinite(logi)) logi = p.logistics;

  const commission = price * (commPct / 100);
  const tax = price * (p.tax / 100);
  const ads = price * (p.ads / 100);
  const logEff = logi * (1 - (p.ssp || 0) / 100);
  const retShare = (p.returns || 0) / 100;
  const returnCost = retShare * (logEff + (p.returnLogistics || 0));
  const pack = p.pack || 0;

  const profit = price - commission - tax - ads - logEff - returnCost - cost - pack;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const roi = cost > 0 ? (profit / cost) * 100 : 0;
  const breakeven = profit > 0 ? Math.ceil((p.fixedMonthly || 120000) / profit) : null;

  const vf = 1 - (commPct / 100) - (p.tax / 100) - (p.ads / 100);
  const fixedS = cost + logEff + retShare * (logEff + (p.returnLogistics || 0)) + pack;
  const minPrice = vf > 0.05 ? fixedS / vf : 0;

  const comp = parseNum(cols.competitor != null ? row[cols.competitor] : NaN);
  let competitor = null;
  if (isFinite(comp) && comp > 0) {
    const compProfit = comp - comp * (commPct / 100) - comp * (p.tax / 100) -
      comp * (p.ads / 100) - logEff - returnCost - cost - pack;
    const compMargin = comp > 0 ? (compProfit / comp) * 100 : 0;
    competitor = {
      price: round2(comp),
      profit: round2(compProfit),
      margin: round2(compMargin),
      undercutsByPct: round2(((price - comp) / price) * 100),
      verdict: compProfit >= 0 && compMargin >= 10 ? "green" : (compProfit > 0 ? "yellow" : "red")
    };
  }

  let promo = null;
  let promoVerdict = null;
  if (p.promoDiscount > 0) {
    const sellPrice = price * (1 - p.promoDiscount / 100);
    const effComm = p.promoCommission != null ? p.promoCommission : commPct;
    const effAds = p.promoAds != null ? p.promoAds : p.ads;
    const effReturns = p.promoReturns != null ? p.promoReturns : (p.returns || 0);
    const minMargin = p.promoMinMargin != null ? p.promoMinMargin : 10;
    const pComm = sellPrice * (effComm / 100);
    const pTax = sellPrice * (p.tax / 100);
    const pAds = sellPrice * (effAds / 100);
    const pRetCost = (effReturns / 100) * (logEff + (p.returnLogistics || 0));
    const pProfit = sellPrice - pComm - pTax - pAds - logEff - pRetCost - cost - pack;
    const pMargin = sellPrice > 0 ? (pProfit / sellPrice) * 100 : 0;
    const pRoi = cost > 0 ? (pProfit / cost) * 100 : 0;
    const vfP = 1 - (effComm / 100) - (p.tax / 100) - (effAds / 100);
    const fixedP = cost + logEff + pRetCost + pack;
    let maxD = 0;
    if (vfP - minMargin / 100 > 0.05) {
      const needSell = fixedP / (vfP - minMargin / 100);
      maxD = needSell < price ? Math.floor((1 - needSell / price) * 100 * 2) / 2 : 0;
      if (maxD < 0) maxD = 0;
    }
    promo = {
      discountPct: p.promoDiscount,
      sellPrice: round2(sellPrice),
      commission: round2(pComm),
      tax: round2(pTax),
      ads: round2(pAds),
      returnCost: round2(pRetCost),
      profit: round2(pProfit),
      margin: round2(pMargin),
      roi: round2(pRoi),
      maxDiscountPct: maxD,
      minMarginPct: minMargin
    };
    promoVerdict = pProfit >= 0 && pMargin >= minMargin ? "green" : (pProfit > 0 ? "yellow" : "red");
  }

  const verdict = profit >= 0 && margin >= 10 ? "green" : (profit > 0 ? "yellow" : "red");

  return {
    ok: true,
    row: {
      _type: "sku",
      name, sku,
      price: round2(price),
      cost: round2(cost),
      commissionPct: round2(commPct),
      commission: round2(commission),
      logistics: round2(logEff),
      returnCost: round2(returnCost),
      tax: round2(tax),
      ads: round2(ads),
      pack: round2(pack),
      profit: round2(profit),
      margin: round2(margin),
      roi: round2(roi),
      breakevenUnits: breakeven,
      minPrice: round2(minPrice),
      verdict,
      lossMaking: profit < 0,
      competitor,
      promo,
      promoVerdict,
      promoLossMaking: promo ? promo.profit < 0 : null
    }
  };
}

/* ---------- run summary ---------- */
export function summarize(skuRows, params, meta = {}) {
  const sum = (arr, f) => arr.reduce((s, r) => {
    const v = f(r);
    return s + (isFinite(v) ? v : 0);
  }, 0);
  const avg = (arr, f) => (arr.length ? sum(arr, f) / arr.length : null);

  const loss = skuRows.filter((r) => r.lossMaking);
  const promoRows = skuRows.filter((r) => r.promo);
  const promoRed = promoRows.filter((r) => r.promoVerdict === "red");
  const promoLossTotal = promoRed.reduce((s, r) => s + Math.max(0, -(r.promo.profit || 0)), 0);
  const worst = [...skuRows]
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 5)
    .map((r) => ({ name: r.name, sku: r.sku, price: r.price, margin: r.margin, profit: r.profit }));

  return {
    _type: "summary",
    marketplace: params.marketplace,
    skuCount: skuRows.length,
    errorCount: meta.errorCount || 0,
    lossMakingCount: loss.length,
    lossMakingProfitRub: round2(sum(loss, (r) => r.profit)),
    promoRedCount: promoRed.length,
    promoLossTotalRub: Math.round(promoLossTotal),
    avgMarginPct: round2(avg(skuRows, (r) => r.margin)),
    avgPromoMarginPct: round2(avg(promoRows, (r) => r.promo.margin)),
    totalProfitRub: round2(sum(skuRows, (r) => r.profit)),
    totalPromoProfitRub: round2(sum(promoRows, (r) => r.promo.profit)),
    worstSkus: worst,
    params: {
      commissionPct: params.commission,
      logisticsRub: params.logistics,
      sspPct: params.ssp,
      returnsPct: params.returns,
      returnLogisticsRub: params.returnLogistics,
      adsPct: params.ads,
      packRub: params.pack,
      taxPct: params.tax,
      fixedMonthlyRub: params.fixedMonthly,
      stressTest1111: params.promoDiscount > 0,
      promoDiscountPct: params.promoDiscount,
      promoCommissionPct: params.promoCommission,
      promoAdsPct: params.promoAds,
      promoReturnsPct: params.promoReturns,
      promoMinMarginPct: params.promoMinMargin
    },
    note: "Margins are net of marketplace commission, tax, ads, forward logistics (after SSP), expected returns, packaging and unit cost. maxDiscountPct is the deepest promo discount that still clears the minimum promo margin."
  };
}
