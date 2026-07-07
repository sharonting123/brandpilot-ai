# BrandPilot AI

海底捞半年度品牌提案多 Agent 工作流。当前重点是“经营分析 Agent + 多 Agent 协同”，面向 `2026 H1` 半年度 KA 提案：

- 提案 Brief Agent：锁定海底捞、半年度周期、目标和不可编造边界。
- 智能问数 Agent：读取品牌、POI、套餐、搜索、活动和链路事实表。
- 链路归因 Agent：拆解搜索、POI、套餐、下单、支付、核销漏斗。
- 经营分析 Agent：主 Agent，识别半年度经营主矛盾、机会区和风险。
- 策略生成 Agent：把经分结论转成下半年 KA 推进动作。
- 质检评审 Agent：检查证据、半年度口径、数据边界和可交付性。
- 提案包装 Agent：生成最终提案、口播脚本、AR 讲解和资产清单。

部署路线仍支持 `Namecheap + Vercel + Supabase` 或自有服务器：

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

- `/api/config`：读取 Supabase 前端配置和模型配置状态，不返回模型 Key 或服务端密钥。
- `/api/chat`：主入口，意图识别 → 工作流（含 NL2SQL / RAG）→ 事件持久化 → 返回 charts / proposal / scene / liveScript。
- `/api/agent-run`：兼容旧版 7 Agent 顺序管道。
- `/api/events`：查询最近 Agent 事件。
- `/api/health`：生产健康检查，不返回任何密钥。

如需走系统代理，在 Linux/macOS 可用：

```bash
npm run local:proxy
```

需要配置：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` 或 `MODEL_API_KEY`
- 可选：`OPENAI_MODEL` / `MODEL_NAME`、`MODEL_API_BASE_URL`
- 可选：`MODEL_TIMEOUT_MS`、`SUPABASE_TIMEOUT_MS`、`AGENT_RATE_LIMIT_PER_MINUTE`、`SUPABASE_BROWSER_ENABLED`

DeepSeek OpenAI-compatible 示例：

```env
MODEL_API_BASE_URL=https://api.deepseek.com/v1
MODEL_API_KEY=你的 DeepSeek Key
MODEL_NAME=deepseek-v4-pro
MODEL_MAX_TOKENS=65536
MODEL_TIMEOUT_MS=240000
```

## Supabase 设置

1. 创建 Supabase project。
2. 打开 SQL Editor，按顺序执行 `supabase/01_core_tables.sql` 到 `supabase/08_chat_auth.sql`。
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
- `fact_search_keyword_monthly`：搜索词月粒度事实表（`month` 为月末日期）
- `fact_poi_monthly`：POI 门店页月粒度事实表
- `fact_deal_campaign_monthly`：套餐/活动月粒度事实表
- `fact_brand_monthly`：品牌月度经分表，承接 GTV 三因子、take rate、补贴率、广告渗透、UE 视角
- `fact_city_brand_monthly`：城市月度经营分层，承接城市 GMV、ROI、核销和资源分配
- `fact_competitor_benchmark_monthly`：竞对月度基准，承接美团到餐、抖音到店、私域会员的核销/补贴/内容差异
- `fact_meituan_funnel_events`：搜索、POI、套餐、下单的事件明细
- `vw_meituan_funnel_demo`：演示链路视图

## 生产部署

项目现在支持两条生产路径：

- Vercel：适合继续使用 Serverless Functions。
- 自有服务器：适合当前 `/root/meituandemo/brandpilot-ai` 目录，使用 Node + systemd + Nginx，或 Docker Compose。

上线前检查：

```bash
npm ci
npm run check
npm run smoke
```

### 服务器 systemd

1. 把生产环境变量写到 `/etc/brandpilot-ai/brandpilot-ai.env`，格式参考 `.env.example`。
2. 安装服务：

```bash
cp deploy/systemd/brandpilot-ai.service /etc/systemd/system/brandpilot-ai.service
systemctl daemon-reload
systemctl enable --now brandpilot-ai
systemctl status brandpilot-ai
```

3. 配置 Nginx：

```bash
cp deploy/nginx/brdpilot.conf /etc/nginx/conf.d/brdpilot.conf
nginx -t && systemctl reload nginx
```

`scripts/enable-https.sh` 可在域名 DNS 指向服务器后签发 HTTPS 证书并切换到 443。

### Docker Compose

```bash
cp .env.example .env.production
# 填好 .env.production 后：
docker compose up -d --build
docker compose ps
```

容器只监听本机 `127.0.0.1:4173`，建议由 Nginx 对外暴露 HTTPS。

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

## 多 Agent 工作流

`/api/agent-run` 现在不是“一次模型生成”，而是生产式编排：

1. 读取 Supabase 经营上下文；如 Supabase 不可达，显式降级到内置海底捞演示数据，并在 `workflow.warnings` 标注。
2. 使用共享 `state.outputs` 顺序执行确定性 Agent：Brief、问数、链路归因、经营分析、策略、质检。
3. 经营分析 Agent 是主 Agent：它不依赖模型自由发挥，而是基于派生指标做确定性判断。
4. 调用 OpenAI-compatible 模型做提案包装；如果包装失败，保留确定性 Agent 输出作为兜底结果。
4. 返回 `workflow.agents`、`workflow.qualityGates`、`metrics`、`insights`、`actions`、`timeline`、`proposal` 和 `evidence`。

经营分析 Agent 的核心输出：

- 机会分：基于搜索点击率、POI 到套餐承接、支付转化、核销率和数据模式计算。
- 主矛盾：海底捞高意图搜索进入后，POI 到套餐承接、广告变现效率和核销质量需要一起经营。
- 经分视角：GTV 三因子、take rate、广告收入占比、补贴率、城市 ROI、竞对核销率、KPI 预警线。
- 半年度提案边界：当前样例数据不能替代 H1 全量数据，正式版需要补齐日期、城市、门店和复购维度。

## AI / AR / 数字人扩展层

当前版本已接入三层扩展能力，分析完成后可在左侧切换 **分析 / AR 展厅 / 数字人**：

### AI 层

- **NL2SQL**：`api/_lib/nl2sql.js`，自然语言映射到只读查询模板，返回 SQL + 行结果；`data_query` 优先使用，LLM 失败时自动降级。
- **RAG**：`api/_lib/rag.js` + `api/_lib/rag-embeddings.js`
  - 数据源：内置经营框架（`BUILTIN_CHUNKS`）+ Supabase `brand_assets`
  - 检索链路：**关键词召回** + **Embedding 向量召回**（百炼 `text-embedding-v3`）→ **Rerank 精排**（`gte-rerank-v2`）
  - 未配置 `DASHSCOPE_API_KEY` 时自动降级为纯关键词检索
  - 工具名 `retrieveKnowledge`，返回 `citations` 与 `retrievalMode`（如 `hybrid+embedding+rerank`）
- **Agent 事件持久化**：`api/_lib/event-store.js`，每次 `/api/chat` 完成后写入 `brand_proposals` / `agent_events`；Supabase 不可用时降级到内存缓冲。
- **用户登录与对话历史**：`api/auth/*` + `api/sessions`，账号密码注册登录（JWT），会话/消息写入 `app_users` / `chat_sessions` / `chat_messages`（需 `SUPABASE_SERVICE_ROLE_KEY` + `AUTH_SECRET`）。
- **事件查询**：`GET /api/events` 返回最近 Agent 事件。

### AR 层

- 前端 `assets/ar-scene.js`，基于 Three.js 渲染城市 GMV 柱、漏斗塔、门店点与机会分。
- 桌面支持拖拽旋转 / 滚轮缩放；支持浏览器 WebXR `immersive-vr`（设备可用时）。
- 场景数据由 `/api/chat` 响应中的 `scene` 字段驱动。

### 数字人层（百炼 DashScope）

- `api/_lib/live-script.js` 根据提案/回答生成分镜口播脚本。
- `api/_lib/dashscope-client.js` + `POST /api/digital-human`：**Qwen-TTS**（`qwen3-tts-flash`）合成中文长口播，长文本自动分段连续播放。
- 前端 `assets/digital-human.js`：提交口播、音频播放、字幕叠加。
- 环境变量：`DASHSCOPE_API_KEY`（必填）；可选 `DIGITAL_HUMAN_AVATAR_URL` 自定义人像。

```bash
# .env.local / Vercel 环境变量
DASHSCOPE_API_KEY=sk-xxx
DIGITAL_HUMAN_AVATAR_URL=https://your-cdn/avatar.jpg  # 可选
```

未配置 Key 时，数字人面板仍可展示脚本，并可用浏览器 TTS 试听。

### 多语言工具链（Python / C++ / JS）

线上 Vercel 只能跑 **Node.js**，但本地和开发环境已接入 Python、C++ 辅助模块，口播分段按优先级回退：

| 层级 | 路径 | 作用 |
|------|------|------|
| Python | `scripts/text_pipeline.py` | 口播规范化、按标点智能切段（百炼单段 &lt;20s） |
| C++ | `native/s2v_segment.cpp` | 可选本地加速分段，编译见 `native/README.md` |
| Node.js | `api/_lib/text-segment.js` | 统一入口：Python → C++ → JS 三级回退 |
| 前端 | `assets/markdown.js` | 提案/分析 Markdown 结构化渲染（表格、列表、摘要） |

本地编译 C++ 分段器：

```bash
cd native && g++ -O2 -std=c++17 -o s2v_segment.exe s2v_segment.cpp
```

## 生产级能力清单

- API 输入限制：`/api/agent-run` 限制 64KB JSON 请求体并校验品牌上下文。
- 限流：默认每 IP 每分钟 12 次 Agent 调用，可用 `AGENT_RATE_LIMIT_PER_MINUTE` 调整。
- 超时：Supabase 查询默认 5 秒超时，模型调用默认 240 秒超时（`MODEL_TIMEOUT_MS`，Vercel 函数上限 300 秒）。
- 错误契约：API 返回稳定错误码，前端可直接展示 `message`。
- 安全头：本地 Node 服务和 API 均设置基础安全响应头。
- 健康检查：`/api/health` 做配置级探测，`/api/health?deep=1` 会真实访问 Supabase REST。

