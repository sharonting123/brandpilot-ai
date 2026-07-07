#!/usr/bin/env node
/**
 * 一键执行：迁移 14 + 推送 drill/traffic 种子到 Supabase
 * 需要 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) return;
      const i = t.indexOf("=");
      let k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (v) env[k] = v;
    });
  return env;
}

async function runSqlViaPool(sql, env) {
  let pg;
  try {
    pg = require("pg");
  } catch {
    spawnSync("npm", ["install", "pg", "--no-save"], { cwd: ROOT, stdio: "inherit" });
    pg = require("pg");
  }

  const dbUrl =
    env.DATABASE_URL ||
    env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL;

  if (!dbUrl) {
    throw new Error("缺少 DATABASE_URL / SUPABASE_DB_URL，无法执行 DDL migration");
  }

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function runSqlViaDashboardApi(sql, env) {
  const url = env.SUPABASE_URL.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${url}/pg/query`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: sql })
  });
  if (response.ok) return;
  throw new Error(`pg/query HTTP ${response.status}`);
}

async function runMigration14(env) {
  const sql = fs.readFileSync(path.join(ROOT, "supabase/14_add_traffic_split_columns.sql"), "utf8");
  console.log("1/3 执行 migration 14 …");
  try {
    await runSqlViaPool(sql, env);
    console.log("   migration 14 完成 (DATABASE_URL)");
    return;
  } catch (err1) {
    console.log("   DATABASE_URL 不可用:", err1.message);
  }
  try {
    await runSqlViaDashboardApi(sql, env);
    console.log("   migration 14 完成 (pg/query)");
    return;
  } catch (err2) {
    console.log("   pg/query 不可用:", err2.message);
  }
  throw new Error("无法执行 migration 14，请配置 DATABASE_URL 或在 SQL Editor 手动执行");
}

function runNodeScript(scriptName, env) {
  const result = spawnSync("node", [path.join(__dirname, scriptName)], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`${scriptName} 失败 exit ${result.status}`);
  }
}

async function verifyJune(env) {
  const url = env.SUPABASE_URL.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const brandRes = await fetch(
    `${url}/rest/v1/fact_brand_monthly?brand_id=eq.haidilao&month=eq.2026-06-30&select=paid_orders,verified_orders`,
    { headers }
  );
  const brand = (await brandRes.json())[0];

  const kwRes = await fetch(
    `${url}/rest/v1/fact_search_keyword_monthly?brand_id=eq.haidilao&month=eq.2026-06-30&select=source,paid_orders,verified_orders`,
    { headers }
  );
  const kw = await kwRes.json();
  const paidSum = kw.reduce((s, r) => s + r.paid_orders, 0);
  const verifiedSum = kw.reduce((s, r) => s + r.verified_orders, 0);

  console.log("\n校验 2026-06:");
  console.log("  brand paid/verified:", brand?.paid_orders, brand?.verified_orders);
  console.log("  keyword rows:", kw.length, "sources:", kw.map((r) => r.source).join(", "));
  console.log("  keyword sum paid/verified:", paidSum, verifiedSum);
  console.log("  对齐:", paidSum === brand?.paid_orders && verifiedSum === brand?.verified_orders ? "OK" : "MISMATCH");
}

async function main() {
  const env = {
    ...loadEnvFile(path.join(ROOT, ".env.local")),
    ...loadEnvFile(path.join(ROOT, ".env.secrets")),
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_DB_URL: process.env.SUPABASE_DB_URL
  };

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("需要 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY");
  }

  await runMigration14(env);
  console.log("2/3 推送 drill 种子 …");
  runNodeScript("push-drill-seed.js", env);
  console.log("3/3 推送 traffic 种子 …");
  runNodeScript("push-traffic-seed.js", env);
  await verifyJune(env);
  console.log("\n全部完成。");
}

main().catch((err) => {
  console.error("执行失败:", err.message || err);
  process.exit(1);
});
