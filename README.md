# BrandPilot AI

连锁餐饮品牌提案智能体 MVP。第一版按 `Namecheap + Vercel + Supabase` 路线设计：

- Vercel：托管前端页面和 `/api/config` Serverless Function
- Supabase：保存品牌提案、Agent 事件、品牌资产，以及搜索-POI-套餐-下单归因底表
- Namecheap：购买域名，DNS 指向 Vercel 项目

## 本地预览

在项目目录运行：

```powershell
npm run local
```

然后打开：

```text
http://localhost:4173
```

`npm run local` 会启动本地 API：

- `/api/config`：读取 Supabase 和模型配置状态，不返回密钥。
- `/api/agent-run`：服务端读取 Supabase 上下文，调用 OpenAI-compatible 模型生成结构化提案。

本地脚本会设置 `NODE_USE_ENV_PROXY=1`，让 Node 使用系统里的 `HTTP_PROXY` / `HTTPS_PROXY`，适合国内网络下通过代理访问模型 API。

需要配置：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` 或 `MODEL_API_KEY`
- 可选：`OPENAI_MODEL` / `MODEL_NAME`、`MODEL_API_BASE_URL`

DeepSeek OpenAI-compatible 示例：

```env
MODEL_API_BASE_URL=https://api.deepseek.com/v1
MODEL_API_KEY=你的 DeepSeek Key
MODEL_NAME=deepseek-v4-pro
MODEL_MAX_TOKENS=4096
```

## Supabase 设置

1. 创建 Supabase project。
2. 打开 SQL Editor，按顺序执行 `supabase/01_core_tables.sql` 到 `supabase/05_seed_funnel_events_assets.sql`。
3. 执行 `supabase/06_verify.sql`，确认表行数和海底捞链路事件能查出来。
4. 在 Project Settings 里拿到：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. 在 Vercel 项目环境变量里填入这两个值。

当前 SQL 的 RLS 策略是 demo 级别，允许匿名读写。真实项目要改成基于登录用户、品牌项目和团队权限的策略。
新增的美团到餐链路表：

- `dim_brand`：品牌维表
- `dim_poi`：门店/POI 维表
- `dim_deal`：套餐/券维表
- `fact_search_keyword_daily`：搜索词日粒度事实表
- `fact_poi_daily`：POI 门店页日粒度事实表
- `fact_deal_campaign_daily`：套餐/活动日粒度事实表
- `fact_meituan_funnel_events`：搜索、POI、套餐、下单的事件明细
- `vw_meituan_funnel_demo`：演示链路视图

## Vercel 部署

1. 把 `brandpilot-ai` 推到 GitHub。
2. 在 Vercel 导入这个目录作为项目。
3. Build Command 留空或使用默认静态部署。
4. Environment Variables 添加：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY` 或 `MODEL_API_KEY`
   - 可选：`OPENAI_MODEL` / `MODEL_NAME`、`MODEL_API_BASE_URL`
5. 部署后访问 Vercel 分配的域名。

## Namecheap 绑定域名

在 Vercel 项目的 Domains 页面添加你的域名，然后回到 Namecheap 的 DNS 管理页，按 Vercel 给出的记录填写。

常见做法：

- 根域名：配置 Vercel 给出的 A 记录或 ALIAS/ANAME
- `www` 子域名：配置 Vercel 给出的 CNAME
- DNS 生效后，Vercel 会自动签发 HTTPS 证书

以 Vercel Domains 页面实时显示的记录为准。

## 后续升级路线

第一版先把“经营分析提案闭环”跑通。后面可以分三层升级：

- AI 层：接入 NL2SQL、RAG、Multi-Agent 编排和提案评估。
- AR 层：把当前 CSS 展厅升级为 WebXR、Three.js 或 Unity AR Foundation。
- 数字人层：接入 TTS、字幕、形象生成、虚拟直播脚本和视频导出。

