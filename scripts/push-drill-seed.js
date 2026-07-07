/**
 * 将 drill-data fixture 推送到 Supabase（等价于执行 09_drill_granular_seed.sql）
 * 用法: node scripts/push-drill-seed.js
 */
const fs = require("fs");
const path = require("path");
const { generateHaidilaoDrillFixture, DATE_RANGE } = require("../api/_lib/drill-data");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) throw new Error("缺少 .env.local");
  const env = {};
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return;
      const i = t.indexOf("=");
      if (i < 0) return;
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    });
  return env;
}

function headers(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function request(baseUrl, key, table, { method = "GET", query = "", body, prefer } = {}) {
  const url = `${baseUrl.replace(/\/$/, "")}/rest/v1/${table}${query}`;
  const response = await fetch(url, {
    method,
    headers: headers(key, prefer ? { Prefer: prefer } : {}),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120000)
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }
  if (!response.ok) {
    throw new Error(`${method} ${table}: ${payload?.message || payload?.error || response.status}`);
  }
  return payload;
}

async function deleteRange(baseUrl, key, table, filters) {
  await request(baseUrl, key, table, {
    method: "DELETE",
    query: "?" + filters,
    prefer: "return=minimal"
  });
}

async function upsertBatch(baseUrl, key, table, rows, onConflict) {
  if (!rows.length) return;
  const chunkSize = 80;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await request(baseUrl, key, table, {
      method: "POST",
      query: onConflict ? `?on_conflict=${onConflict}` : "",
      body: chunk,
      prefer: "resolution=merge-duplicates,return=minimal"
    });
    process.stdout.write(`  ${table}: ${Math.min(i + chunk.length, rows.length)}/${rows.length}\r`);
  }
  process.stdout.write("\n");
}

async function countRows(baseUrl, key, table, filter) {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/rest/v1/${table}?select=${encodeURIComponent(filter)}`,
    {
      headers: headers(key, { Prefer: "count=exact", Range: "0-0" }),
      signal: AbortSignal.timeout(30000)
    }
  );
  const range = response.headers.get("content-range") || "";
  const match = range.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function main() {
  const env = loadEnv();
  const baseUrl = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置");

  const fixture = generateHaidilaoDrillFixture();
  console.log("推送沙盘种子 →", baseUrl);
  console.log("周期:", DATE_RANGE.range);

  console.log("1/6 更新 dim_brand …");
  await upsertBatch(baseUrl, key, "dim_brand", [fixture.brandProfile], "brand_id");

  console.log("2/6 更新 dim_poi (30 店) …");
  await upsertBatch(baseUrl, key, "dim_poi", fixture.pois, "poi_id");

  console.log("3/6 清理旧月报 …");
  await deleteRange(
    baseUrl,
    key,
    "fact_city_brand_monthly",
    `brand_id=eq.haidilao&month=gte.${DATE_RANGE.from}&month=lte.${DATE_RANGE.to}`
  );
  await deleteRange(
    baseUrl,
    key,
    "fact_brand_monthly",
    `brand_id=eq.haidilao&month=gte.${DATE_RANGE.from}&month=lte.${DATE_RANGE.to}`
  );

  console.log("4/6 清理旧 POI 月事实 …");
  await deleteRange(
    baseUrl,
    key,
    "fact_poi_monthly",
    `month=gte.${DATE_RANGE.from}&month=lte.${DATE_RANGE.to}&poi_id=like.hdl-*`
  );

  console.log("5/6 写入城市月报 + 品牌月报 …");
  await upsertBatch(baseUrl, key, "fact_city_brand_monthly", fixture.cityMonthlyFacts, "month,brand_id,city");
  await upsertBatch(baseUrl, key, "fact_brand_monthly", fixture.monthlyFacts, "month,brand_id");

  console.log("6/6 写入 POI 月快照 …");
  const poiRows = fixture.dailyFacts.poiFacts.map((row) => ({
    month: row.month,
    poi_id: row.poi_id,
    exposure: row.exposure,
    visits: row.visits,
    search_visits: row.search_visits,
    deal_clicks: row.deal_clicks,
    favorite_count: row.favorite_count,
    navigate_clicks: row.navigate_clicks,
    phone_clicks: row.phone_clicks,
    avg_stay_seconds: row.avg_stay_seconds
  }));
  await upsertBatch(baseUrl, key, "fact_poi_monthly", poiRows, "month,poi_id");

  console.log("\n校验行数:");
  const brandCount = await countRows(baseUrl, key, "fact_brand_monthly", "month&brand_id=eq.haidilao");
  const cityCount = await countRows(baseUrl, key, "fact_city_brand_monthly", "month&brand_id=eq.haidilao");
  const poiCount = await countRows(baseUrl, key, "fact_poi_monthly", "month&poi_id=like.hdl-*");
  const dimPoiCount = await countRows(baseUrl, key, "dim_poi", "poi_id&brand_id=eq.haidilao");
  console.log("  fact_brand_monthly (haidilao):", brandCount, "(期望 30)");
  console.log("  fact_city_brand_monthly (haidilao):", cityCount, "(期望 300)");
  console.log("  fact_poi_monthly (hdl-*):", poiCount, "(期望 900)");
  console.log("  dim_poi (haidilao):", dimPoiCount, "(期望 ≥30)");
  console.log("完成。");
}

main().catch((err) => {
  console.error("推送失败:", err.message || err);
  process.exit(1);
});
