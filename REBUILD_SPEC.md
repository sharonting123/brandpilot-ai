# BrandPilot AI — 重建规格说明（真 Agent 编排版）

## 背景
现有代码是"纯手写的顺序函数管道"，7 个所谓 agent 里只有 1 个真调 LLM，其余是写死的 JS 函数。
前端是 5 个 demo tab（workbench/funnel/ar/live/infra），杂乱，没有意图识别，参数写死 haidilao。
本次要重建成**真正的多 agent 编排系统**：用户自然语言输入 → 意图识别路由 → 选工作流 → agent 用 tool calling 执行 → 结构化结果 → 对话+可视化面板渲染 → PDF 下载。

## 技术栈（必须遵守）
- **后端**：Vercel Node Serverless Functions（`/api/*.js`，CommonJS 或 ESM 视现状，保持与现有一致用 CommonJS）
- **Agent 框架**：Vercel AI SDK
  - `npm i ai @ai-sdk/openai zod`
  - 用 `generateObject`（配 Zod schema）做意图识别和结构化提案输出 —— 解决模型是否支持 json_object 的不确定性
  - 用 `generateText` + `tools`（`tool()` + Zod）做真 function calling，让 LLM 自主决定调哪个工具
  - 模型走 OpenAI-compatible provider：用 `createOpenAI({ baseURL: process.env.MODEL_API_BASE_URL, apiKey: process.env.MODEL_API_KEY })`，模型名 `process.env.MODEL_NAME`（线上是 deepseek 类）
- **前端**：保持无构建、纯静态（index.html + assets/*.js + assets/*.css），依赖走 CDN
  - 图表：Chart.js（CDN）
  - PDF 下载：真 PDF 文件。用 CDN 的 `html2pdf.js`（内部是 jsPDF + html2canvas）把提案面板导出为 .pdf。注意中文字体渲染（html2canvas 截图方式天然支持中文，优先用这种）
- **部署**：Vercel。保留 vercel.json，但需支持 serverless functions（现在是纯静态路由）。API 函数用 Node runtime。

## 环境变量（已存在，勿改名）
- `MODEL_API_BASE_URL`, `MODEL_API_KEY`, `MODEL_NAME`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- 可选：`MODEL_TIMEOUT_MS`, `SUPABASE_TIMEOUT_MS`, `AGENT_RATE_LIMIT_PER_MINUTE`

## 数据层（已就绪，复用现有 supabase-context.js 的查询逻辑）
Supabase 底表（当前只有 haidilao 品牌数据）：
- dim_brand, dim_poi, dim_deal
- fact_search_keyword_daily, fact_poi_daily, fact_deal_campaign_daily
- fact_brand_monthly, fact_city_brand_monthly, fact_competitor_benchmark_monthly
- fact_meituan_funnel_events (view: vw_meituan_funnel_demo)
- brand_assets
现阶段品牌固定 haidilao（问题3答复：先只做海底捞，其他品牌后面再加）。品牌参数化要预留接口，但数据查不到时提示"该品牌暂无数据"。

## 四个工作流（Workflow Registry）
1. **annual_proposal（品牌年度提案）**：完整链路——查数→漏斗归因→经营分析→策略→质检→提案包装。产出可下载提案。
2. **funnel_diagnosis（链路诊断）**：查数→漏斗归因→找最大损耗点→给诊断结论。轻量，不生成完整提案。
3. **competitor_benchmark（竞对对比）**：查竞对基准表→对比分析（美团到餐 vs 抖音到店 vs 私域）→给差异化建议。
4. **data_query（纯数据问答）**：用户问具体数字（如"6月GMV多少""上海ROI"）→查对应表→直接answer + 可选小图表。

## 核心架构
```
POST /api/chat  { message: string, brandHint?: string, history?: [] }
  │
  ├─ 1. 意图识别 (generateObject + Zod)
  │     输入: 用户 message + 工作流清单描述
  │     输出: { workflow, brandId, params:{period, competitors...}, confidence, reasoning }
  │     兜底: 模型失败时用关键词规则匹配（"提案"→annual_proposal, "漏斗/转化/损耗"→funnel_diagnosis,
  │           "竞对/对比/抖音"→competitor_benchmark, 否则 data_query）
  │
  ├─ 2. Workflow Registry 按 workflow 选执行器
  │
  ├─ 3. Agent 执行（真 tool calling）
  │     工具层（确定性，保留手写，用 tool()包装给LLM）:
  │       - queryBrandData(brandId): 查 supabase（复用 supabase-context.js）
  │       - computeFunnel(context): 算搜索→核销漏斗转化率、找损耗点
  │       - aggregateMonthly(context): GTV三因子、take_rate等聚合
  │       - getCompetitorBenchmark(context): 竞对数据
  │     推理层（LLM agent）:
  │       - 根据 workflow 用不同 system prompt 做洞察/策略/诊断
  │       - annual_proposal 最后用 generateObject 产出结构化提案
  │
  └─ 4. 统一返回 schema:
        {
          workflow, intent:{confidence,reasoning},
          agentTrace: [{name, tool?, summary, durationMs}],  // 每步执行轨迹，前端显示
          answer: string,           // 对话式回答
          charts?: [{type, title, data}],  // 可视化数据(喂给Chart.js)
          proposal?: {...},         // 仅 annual_proposal 有，结构化提案供渲染+PDF
          dataMode, warnings
        }
```

## 前端 UI（重做 index.html + app.js + styles.css）
布局：**左右分栏**
- **左侧（对话区，~40%）**：
  - 顶部品牌选择（目前只有海底捞）+ 标题
  - 中间对话流：用户气泡 + AI 回答气泡
  - AI 回答里内嵌显示：识别到的意图（走了哪个工作流 + 置信度）+ agent 执行轨迹（每个 agent/工具的步骤，带状态）
  - 底部输入框 + 发送按钮，支持回车发送
- **右侧（可视化面板，~60%）**：
  - 根据返回的 charts 渲染 Chart.js 图表（漏斗图/折线/柱状/对比）
  - 若是 annual_proposal，渲染完整提案（指标卡、洞察、策略、时间线、资产清单）
  - 提案区顶部有【下载 PDF】按钮 → html2pdf 导出右侧提案为真 .pdf
- 视觉：干净专业，深色侧栏可保留，但去掉原来乱七八糟的 5 tab。响应式，移动端上下堆叠。

## 示例交互（必须都能跑通）
1. "帮海底捞做一份 2026 上半年的年度提案" → annual_proposal → 右侧完整提案 + 可下载 PDF
2. "海底捞从搜索到核销的转化链路哪里损耗最大？" → funnel_diagnosis → 右侧漏斗图 + 损耗点分析
3. "海底捞在美团和抖音的表现对比一下" → competitor_benchmark → 右侧对比柱状图 + 差异化建议
4. "海底捞 6 月的 GMV 和核销率是多少？" → data_query → 直接回答 + 小图表

## 保留/清理
- 保留：api/_lib/http.js, env.js, rate-limit.js, model-client.js（可改造）, supabase-context.js（数据查询复用）
- 保留：api/health.js, api/config.js
- 重写：api/agent-run.js（或新增 api/chat.js 作为主入口）, api/_lib/agent-workflow.js
- 新增：api/_lib/intent-router.js, api/_lib/workflows/*.js, api/_lib/agent-tools.js
- 重写前端：index.html, assets/app.js, assets/styles.css
- 删除：原 5-tab 相关的 AR/live/infra 无关 demo 代码

## 验收标准
- `node scripts/check-js.js`（若存在）或 `node -c` 语法检查所有 JS 通过
- package.json 正确声明 ai/@ai-sdk/openai/zod 依赖
- vercel.json 配置正确，API 走 serverless functions，静态资源正常路由
- 前端 4 个示例交互的调用链完整（意图识别→工作流→工具→渲染）
- 意图识别有关键词兜底，模型不可用时不崩
- 中文 PDF 下载可用
- 不破坏现有环境变量约定

## 重要约束
- 不要提交 .env / .env.local（保持在 .gitignore）
- 代码注释和 UI 文案用中文
- 提交信息用中文，清晰说明改动
- 完成后不要自己 push（我来 review 后推）
