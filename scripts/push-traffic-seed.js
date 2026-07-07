/**
 * 推送搜索+推荐双路径流量种子到 Supabase（等价于 04_seed_daily_facts.sql）
 * 用法: node scripts/push-traffic-seed.js
 */
const fs = require("fs");
const path = require("path");
const { generateHaidilaoDrillFixture } = require("../api/_lib/drill-data");
const {
  SOURCE_SEARCH,
  SOURCE_RECOMMEND,
  RECOMMEND_WORD,
  buildSearchKeywordFactsFromBrandRows,
  buildCampaignFactsFromBrandRows
} = require("../api/_lib/traffic-split");

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

async function upsertBatch(baseUrl, key, table, rows, onConflict) {
  if (!rows.length) return;
  const chunkSize = 40;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await request(baseUrl, key, table, {
      method: "POST",
      query: onConflict ? `?on_conflict=${onConflict}` : "",
      body: chunk,
      prefer: "resolution=merge-duplicates,return=minimal"
    });
  }
}

async function main() {
  const env = loadEnv();
  const baseUrl = process.env.SUPABASE_URL || env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!baseUrl || !key) throw new Error("SUPABASE_URL / API key 未配置");

  const fixture = generateHaidilaoDrillFixture();
  const h1 = fixture.monthlyFacts.filter((row) => row.month >= "2026-01-31" && row.month <= "2026-06-30");
  const searchRows = buildSearchKeywordFactsFromBrandRows(h1);
  const campaignRows = buildCampaignFactsFromBrandRows(h1, { fromMonth: "2026-05-31" });

  console.log("推送流量双路径种子 →", baseUrl);
  console.log("搜索+推荐 keyword 行:", searchRows.length, "campaign 行:", campaignRows.length);

  await upsertBatch(
    baseUrl,
    key,
    "fact_search_keyword_monthly",
    searchRows,
    "month,brand_id,search_word,source"
  );
  await upsertBatch(
    baseUrl,
    key,
    "fact_deal_campaign_monthly",
    campaignRows,
    "month,deal_id,campaign_id,source"
  );

  const june = h1.find((r) => r.month === "2026-06-30");
  const juneSearch = searchRows.filter((r) => r.month === "2026-06-30");
  const paidSum = juneSearch.reduce((s, r) => s + r.paid_orders, 0);
  const verifiedSum = juneSearch.reduce((s, r) => s + r.verified_orders, 0);
  console.log("6月校验: brand paid", june.paid_orders, "keyword sum", paidSum);
  console.log("6月校验: brand verified", june.verified_orders, "keyword sum", verifiedSum);
  console.log("完成。");
}

main().catch((err) => {
  console.error("推送失败:", err.message || err);
  process.exit(1);
});
