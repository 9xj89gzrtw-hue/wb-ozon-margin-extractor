import test from "node:test";
import assert from "node:assert/strict";
import {
  parseNum,
  mapColumns,
  parseTable,
  resolveParams,
  computeSku,
  summarize,
  PRESETS
} from "../src/margin.js";

const RU_COLS = {
  name: "Товар", sku: "Артикул", price: "Цена", cost: "Закуп",
  commission: "Комиссия", logistics: "Логистика", competitor: "Конкурент"
};

const RU_ROW = {
  "Товар": "Термокружка 450 мл", "Артикул": "TM-450", "Цена": 1590,
  "Закуп": 540, "Комиссия": 25, "Логистика": 55, "Конкурент": 1490
};

test("parseNum handles RU and EN number formats", () => {
  assert.equal(parseNum("1 234,56 ₽"), 1234.56);
  assert.equal(parseNum("1,234.56$"), 1234.56);
  assert.equal(parseNum("1590"), 1590);
  assert.equal(parseNum(42), 42);
  assert.ok(Number.isNaN(parseNum("")));
  assert.ok(Number.isNaN(parseNum("—")));
});

test("mapColumns resolves RU and EN headers", () => {
  const ru = mapColumns(Object.keys(RU_ROW));
  assert.equal(ru.name, "Товар");
  assert.equal(ru.sku, "Артикул");
  assert.equal(ru.price, "Цена");
  assert.equal(ru.cost, "Закуп");
  assert.equal(ru.commission, "Комиссия");
  assert.equal(ru.logistics, "Логистика");
  assert.equal(ru.competitor, "Конкурент");

  const en = mapColumns(["name", "sku", "price", "cost", "commission", "logistics", "competitor"]);
  assert.equal(en.price, "price");
  assert.equal(en.cost, "cost");
});

test("parseTable reads a semicolon CSV with RU headers", () => {
  const text = "Товар;Цена;Закуп\nКружка;1590;540\nКоврик;2450;1120";
  const p = parseTable(text);
  assert.equal(p.format, "csv");
  assert.deepEqual(p.headers, ["Товар", "Цена", "Закуп"]);
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0]["Товар"], "Кружка");
  assert.equal(p.rows[1]["Закуп"], "1120");
});

test("parseTable reads a JSON list and a one-key wrapper", () => {
  const list = parseTable('[{"name":"A","price":100},{"name":"B","price":200}]');
  assert.equal(list.format, "json");
  assert.equal(list.rows.length, 2);
  const wrapped = parseTable('{"items":[{"name":"A","price":100}]}');
  assert.equal(wrapped.rows.length, 1);
});

test("WB preset matches the public 2026 calculator", () => {
  const p = resolveParams({ marketplace: "wb" });
  assert.equal(p.commission, PRESETS.wb.commission);
  assert.equal(p.logistics, PRESETS.wb.logistics);
  assert.equal(p.tax, 6);
  assert.equal(p.promoDiscount, 30);
  const off = resolveParams({ marketplace: "wb", stressTest1111: false });
  assert.equal(off.promoDiscount, 0);
  const custom = resolveParams({ marketplace: "ozon", commissionPct: 30, logisticsRub: 70 });
  assert.equal(custom.commission, 30);
  assert.equal(custom.logistics, 70);
  assert.equal(custom.returns, PRESETS.ozon.returns);
});

test("computeSku: clean 2026 unit economics for a WB SKU", () => {
  const p = resolveParams({ marketplace: "wb" });
  const r = computeSku(RU_ROW, RU_COLS, p);
  assert.equal(r.ok, true);
  const row = r.row;
  assert.equal(row.commission, 397.5);
  assert.equal(row.tax, 95.4);
  assert.equal(row.ads, 159);
  assert.equal(row.logistics, 55);
  assert.equal(row.returnCost, 3);
  assert.equal(row.pack, 15);
  assert.equal(row.profit, 325.1);
  assert.equal(row.margin, 20.45);
  assert.equal(row.roi, 60.2);
  assert.equal(row.minPrice, 1038.98);
  assert.equal(row.verdict, "green");
  assert.equal(row.lossMaking, false);
});

test("computeSku: 11.11 stress test and maxDiscount", () => {
  const p = resolveParams({ marketplace: "wb" });
  const row = computeSku(RU_ROW, RU_COLS, p).row;
  assert.equal(row.promo.sellPrice, 1113);
  assert.equal(row.promo.commission, 267.12);
  assert.equal(row.promo.tax, 66.78);
  assert.equal(row.promo.ads, 222.6);
  assert.equal(row.promo.returnCost, 10);
  assert.equal(row.promo.profit, -63.5);
  assert.equal(row.promo.margin, -5.71);
  assert.equal(row.promo.maxDiscountPct, 2.5);
  assert.equal(row.promoVerdict, "red");
  assert.equal(row.promoLossMaking, true);
});

test("computeSku: flags loss-making SKUs", () => {
  const p = resolveParams({ marketplace: "wb" });
  const row = computeSku(
    { "Товар": "Убыточный", "Цена": 500, "Закуп": 450 },
    { name: "Товар", sku: null, price: "Цена", cost: "Закуп", commission: null, logistics: null, competitor: null },
    p
  ).row;
  assert.ok(row.profit < 0);
  assert.equal(row.lossMaking, true);
  assert.equal(row.verdict, "red");
});

test("computeSku: competitor gap and error row", () => {
  const p = resolveParams({ marketplace: "wb" });
  const row = computeSku(RU_ROW, RU_COLS, p).row;
  assert.equal(row.competitor.price, 1490);
  assert.equal(row.competitor.undercutsByPct, 6.29);
  const bad = computeSku({ "Товар": "Без цены" }, { name: "Товар", sku: null, price: "Цена", cost: null, commission: null, logistics: null, competitor: null }, p);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /price/);
});

test("summarize counts losses, promo red rows and worst SKUs", () => {
  const p = resolveParams({ marketplace: "wb" });
  const good = computeSku(RU_ROW, RU_COLS, p).row;
  const bad = computeSku(
    { "Товар": "Убыточный", "Цена": 500, "Закуп": 450 },
    { name: "Товар", sku: null, price: "Цена", cost: "Закуп", commission: null, logistics: null, competitor: null },
    p
  ).row;
  const s = summarize([good, bad], p, { errorCount: 1 });
  assert.equal(s.skuCount, 2);
  assert.equal(s.errorCount, 1);
  assert.equal(s.lossMakingCount, 1);
  assert.equal(s.promoRedCount, 2);
  assert.ok(s.promoLossTotalRub > 0);
  assert.equal(s.worstSkus[0].name, "Убыточный");
  assert.equal(s.marketplace, "wb");
});
