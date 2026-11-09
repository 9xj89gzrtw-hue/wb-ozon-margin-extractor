/**
 * Orchestration: collect SKU rows from products[], tableText or tableUrl,
 * compute clean 2026 unit economics, push sku + summary + offer records.
 * No login, no browser — plain HTTPS GET for the optional public CSV/JSON URL.
 */
import {
  parseTable,
  mapColumns,
  resolveParams,
  computeSku,
  summarize
} from "./margin.js";
import { offerRecord } from "./offer.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchText(url, timeoutSecs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutSecs * 1000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "text/csv,text/plain,application/json,*/*" }
    });
    const text = await res.text();
    return { status: res.status, finalUrl: res.url, text: text.slice(0, 5_000_000) };
  } finally {
    clearTimeout(timer);
  }
}

function inferHeaders(rows) {
  const keys = [];
  const seen = new Set();
  for (const o of rows) {
    for (const k of Object.keys(o || {})) {
      if (!seen.has(k)) { seen.add(k); keys.push(k); }
    }
  }
  return keys;
}

export async function run(input = {}, push) {
  const maxRows = Math.min(Math.max(Number(input.maxRows) || 50, 1), 5000);
  const timeoutSecs = Math.min(Math.max(Number(input.requestTimeoutSecs) || 20, 5), 120);
  const includeOffer = input.includeOffer !== false;
  const params = resolveParams(input);

  const sources = [];
  if (Array.isArray(input.products) && input.products.length) {
    sources.push({ headers: inferHeaders(input.products), rows: input.products, source: "products" });
  }
  if (input.tableText && String(input.tableText).trim()) {
    const parsed = parseTable(input.tableText);
    if (parsed.rows.length) sources.push({ ...parsed, source: "tableText" });
  }
  if (input.tableUrl && String(input.tableUrl).trim()) {
    const url = String(input.tableUrl).trim();
    try {
      const fetched = await fetchText(url, timeoutSecs);
      if (fetched.status >= 200 && fetched.status < 300) {
        const parsed = parseTable(fetched.text);
        if (parsed.rows.length) sources.push({ ...parsed, source: fetched.finalUrl || url });
        else await push({ _type: "error", source: url, error: "table parsed to 0 rows" });
      } else {
        await push({ _type: "error", source: url, error: `HTTP ${fetched.status}` });
      }
    } catch (err) {
      const reason = err && err.name === "AbortError" ? "timeout" : (err && err.message) || String(err);
      await push({ _type: "error", source: url, error: `fetch failed: ${reason}` });
    }
  }

  if (!sources.length) {
    await push({ _type: "error", source: null, error: "No input: pass products[], tableText or tableUrl." });
    if (includeOffer) await push(offerRecord());
    return { skuCount: 0, errorCount: 1, message: "no input" };
  }

  const skuRows = [];
  let errorCount = 0;
  let truncated = false;

  for (const src of sources) {
    const cols = mapColumns(src.headers && src.headers.length ? src.headers : inferHeaders(src.rows));
    for (const raw of src.rows) {
      if (skuRows.length >= maxRows) { truncated = true; break; }
      const r = computeSku(raw, cols, params);
      if (r.ok) {
        skuRows.push(r.row);
      } else {
        errorCount += 1;
        await push({ _type: "error", source: src.source, name: r.name, sku: r.sku, error: r.error });
      }
    }
    if (truncated) break;
  }

  for (const row of skuRows) await push(row);
  const summary = summarize(skuRows, params, { errorCount });
  summary.truncatedAtMaxRows = truncated;
  summary.maxRows = maxRows;
  await push(summary);
  if (includeOffer) await push(offerRecord());

  return {
    skuCount: skuRows.length,
    errorCount,
    truncated,
    lossMakingCount: summary.lossMakingCount,
    promoRedCount: summary.promoRedCount,
    avgMarginPct: summary.avgMarginPct,
    avgPromoMarginPct: summary.avgPromoMarginPct
  };
}
