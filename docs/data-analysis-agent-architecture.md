# 数据分析类 Agent 架构设计

## 1. 核心判断

数据分析类 Agent 不建议按“SQL Agent、图表 Agent、归因 Agent、文案 Agent”这种能力类型做顶层拆分。

更合理的方式是：

```text
场景 Agent / Workflow 面向业务问题
底层 Tool / Operator 面向能力类型
```

也就是说：

- 顶层按业务场景分：经营复盘、漏斗诊断、同环比分析、竞对分析、提案生成。
- 底层按能力复用：NL2SQL、指标查询、漏斗计算、同环比计算、图表生成、RAG、引用索引、质检。

原因是用户真实想解决的是一个经营问题，而不是调用某一种技术能力。

## 2. 总体架构

推荐完整链路如下：

```text
用户问题
  ↓
Intent Router 意图识别
  ├─ 识别场景
  ├─ 识别时间范围 / 目标粒度
  └─ 识别指标 / 维度
  ↓
Scenario Workflow 场景工作流
  └─ Analysis Planner 决定分析步骤
  ↓
Data Query Engine 统一查询引擎
  └─ 指标 + 粒度 + 维度 → 选表 / 字段 / SQL
  ↓
Metric Operators 分析算子
  └─ 按场景做环比 / 漏斗 / 贡献度等计算
  ↓
Evidence & Citation 证据引用
  ↓
Quality Gates 质检
  ↓
Answer / Chart / Proposal 输出
```

这套架构的边界是：

```text
Agent / Workflow：决定分析路径
Query Engine：负责拿到正确数据
Metric Operator：负责正确计算
Citation Registry：负责证据可追溯
Quality Gate：负责拦截不可靠输出
Composer：负责表达和包装
```

## 3. 为什么不能把所有东西都塞进 NL2SQL

同环比计算、漏斗计算确实依赖 SQL 底表查询，但它们本质不只是查询。

例如同环比：

```text
用户问：6 月 GMV 环比怎么样？
```

底层需要查：

```text
当前期 GMV
上一期 GMV
去年同期 GMV
```

但分析层还需要：

```text
环比 = (当前期 - 上一期) / 上一期
同比 = (当前期 - 去年同期) / 去年同期
异常阈值判断
口径说明
证据引用
```

漏斗也类似。SQL 可以查出各阶段数据，但还要做：

```text
阶段对齐
阶段转化率
阶段损耗率
最大断点识别
样本量不足判断
图表结构生成
归因解释
```

因此推荐：

```text
查询层合并
语义层不要合并
```

也就是 NL2SQL、固定 SQL 模板、Query Builder 都进入统一的 Data Query Engine；但同环比、漏斗、贡献度、异常检测仍然是独立的确定性分析算子。

## 4. 分层设计

### 4.1 Intent Router

职责：识别用户问题的**分析槽位**，为下游 Workflow / Query Engine 提供结构化输入。

链路：

```text
Intent Router
  -> 识别场景（workflow）
  -> 识别时间范围（6月 / 上半年 / 近3个月…）
  -> 识别目标粒度（日 / 周 / 月 / 区间…）
  -> 识别指标 / 维度（GMV、曝光、城市、平台…）
```

实现：`api/_lib/intent-router.js` + `api/_lib/intent-slots.js`

典型场景：

```text
data_query              单指标问数
period_compare          同比 / 环比 / 趋势
funnel_diagnosis        漏斗诊断
contribution_analysis   贡献度 / 结构拆解
root_cause_analysis     异常归因
competitor_benchmark    竞对对比
business_review         经营复盘
proposal_generation     提案生成
```

示例输出：

```json
{
  "workflow": "period_compare",
  "brandId": "haidilao",
  "params": {
    "metric": "gmv",
    "dimension": "business_area",
    "grain": "month",
    "periodLabel": "2026年6月",
    "month": "2026-06-30",
    "city": "上海"
  },
  "analysisSlots": {
    "time": { "periodLabel": "2026年6月", "monthEnd": "2026-06-30" },
    "grain": { "requested": "month", "target": "month" },
    "metric": "gmv",
    "dimension": "business_area",
    "drillScope": { "scopeLevel": "city", "city": "上海", "breadcrumb": "海底捞 → 上海" }
  },
  "confidence": 0.86
}
```

Intent Router **不负责选表、不负责计算**；只输出语义槽位与下钻层级（`drillScope`）。

#### 4.1.1 下钻知识图谱

```text
品牌(海底捞)
  └─ 城市(上海 / 北京 / …)
       └─ 商圈(business_area：静安大悦城 / 陆家嘴 / …)
            └─ 门店(poi：海底捞上海静安大悦城店 / …)
```

实现：`api/_lib/drill-knowledge-graph.js`（节点来自 `drill-data.js` 的 `DRILL_CATALOG`）

YAML 语义源：`semantic-graph/*.yaml`，运行时由 `semantic-graph/loader.js` 加载，经 `api/_lib/semantic-graph.js` 供 Intent Router / Time Router 消费。

规则：

| 当前 scope | 用户问「哪里拖累」 | 拆解维度 |
|-----------|------------------|---------|
| 品牌 | 哪个城市拖累 | `city` |
| 城市（如上海） | 哪个商圈/哪里拖累 | `business_area` |
| 商圈 | 哪家门店拖累 | `poi` |

### 4.2 Scenario Workflow

职责：根据场景决定**分析步骤**，编排 Query Engine 与 Metric Operators。

```text
Scenario Workflow
  -> 根据场景决定分析步骤（Analysis Planner）
  -> 调用 Data Query Engine 取数
  -> 调用 Metric Operators 做确定性计算
  -> 交给 Composer / Quality Gates 输出
```

漏斗诊断工作流：

```text
识别漏斗类型
  -> 确认阶段口径
  -> 查询各阶段数据
  -> 计算阶段转化率 / 损耗率
  -> 找最大断点
  -> 下钻城市 / 门店 / 活动
  -> 生成图表
  -> 输出诊断和建议
```

同环比分析工作流：

```text
识别指标和周期
  -> 查询当前期
  -> 查询上一期
  -> 查询去年同期
  -> 计算环比 / 同比
  -> 判断波动显著性
  -> 下钻贡献维度
  -> 输出结论
```

### 4.3 Analysis Planner

职责：把用户问题拆成可执行计划。

示例：

```text
用户问：海底捞 6 月 GMV 环比下降了吗？主要是哪个城市拖累？
```

品牌级问题 → 按**城市**拆解。

已锁定城市时：

```text
用户问：6 月上海 GMV 环比怎么样？主要是哪个商圈拖累？
```

城市级问题 → 按**商圈**下钻，再问门店。

下钻知识图谱（`api/_lib/drill-knowledge-graph.js`）：

```text
品牌 → 城市 → 商圈(business_area) → 门店(poi)
```

Intent Router 识别 `drillScope`（当前停在哪个层级），贡献度拆解自动选**下一级**维度，避免「上海 + 哪个城市拖累」这类层级错误。

Planner 输出：

```json
{
  "steps": [
    {
      "id": "q1",
      "type": "query",
      "tool": "queryMetric",
      "params": {
        "metric": "gmv",
        "period": "2026-06",
        "level": "brand"
      }
    },
    {
      "id": "q2",
      "type": "query",
      "tool": "queryMetric",
      "params": {
        "metric": "gmv",
        "period": "2026-05",
        "level": "brand"
      }
    },
    {
      "id": "c1",
      "type": "calculate",
      "operator": "computePeriodCompare",
      "inputs": ["q1", "q2"]
    },
    {
      "id": "q3",
      "type": "query",
      "tool": "queryBreakdown",
      "params": {
        "metric": "gmv",
        "periods": ["2026-06", "2026-05"],
        "dimension": "city"
      }
    },
    {
      "id": "c2",
      "type": "calculate",
      "operator": "computeContribution",
      "inputs": ["q3"]
    }
  ]
}
```

### 4.4 Data Query Engine

职责：根据 Intent Router 给出的**指标 + 时间粒度 + 维度**，选择物理表和字段，生成/执行 SQL。

```text
Data Query Engine
  -> 指标支持粒度校验（validateMetricGrain）
  -> 根据指标 + 粒度 + 维度选表（selectTableRoute）
  -> 生成 SQL 时间条件（buildTimeWhereClause）
  -> 固定模板 SQL > SQL Agent > 无法回答
```

实现：`api/_lib/data-query-engine.js` + `api/_lib/time-router.js`（`resolveQueryRoute`）

**不再重复解析**用户时间表达；优先消费 `intent.params.analysisSlots`。

典型接口：

```text
queryMetric(params)
queryTrend(params)
queryFunnelBase(params)
queryBreakdown(params)
queryCompetitor(params)
```

统一返回结构：

```json
{
  "queryId": "S1",
  "table": "fact_brand_monthly",
  "sql": "select ...",
  "filters": {
    "brandId": "haidilao",
    "period": "2026-06"
  },
  "timeRoute": {
    "targetGrain": "month",
    "effectiveGrain": "month",
    "tableKind": "月表",
    "sqlTimeClause": " AND month = '2026-06-30'"
  },
  "rows": [],
  "rowCount": 6,
  "dataMode": "supabase",
  "citationRef": "S1"
}
```

#### 4.4.1 Time Router（Query Engine 子模块）

时间语义解析、目标粒度判断已上移到 **Intent Router**；Query Engine 内的时间路由只负责：

```text
指标支持粒度校验 → 选日表 / 周表 / 月表 / 聚合日表 → 生成 SQL 时间条件
```

实现：`api/_lib/time-router.js`

关键注册表：

```text
TABLE_REGISTRY        物理表 → 存储粒度 / 域 / 指标
METRIC_GRAIN_REGISTRY 指标 → 支持粒度 / 首选域
GRAIN_TABLE_PRIORITY  逻辑粒度 → 优先匹配的表类型
```

当前 Demo 库以月表为主；用户请求日/周粒度时，路由会选「聚合日表」或月表并在 trace 中标注「粒度降级」。

Agent trace 会输出四步：

```text
时间语义解析 → 目标粒度判断 → 指标支持粒度校验 → 选表路由
```

接入点：

```text
data-query-engine.js   routeTimeQuery() 在查数前执行
nl2sql.js              extractFilters() 复用时间路由
nl2sql-pipeline.js     将 timeRoute.steps 写入执行轨迹
sql-generation-agent.js 将路由结论注入 SQL Agent system prompt
funnel-metrics.js      buildTimeWhereClause() 统一漏斗时间过滤
```

### 4.5 Metric Operators

职责：根据**场景**做确定性计算，避免 LLM 手算关键数字。

```text
Metric Operators
  -> 根据场景选择算子（环比 / 漏斗 / 贡献度…）
  -> 消费 Query Engine 返回的 rows / facts
  -> 输出带公式与引用的 calculations
```

典型算子：

```text
computePeriodCompare(current, previous, samePeriodLastYear)
computeFunnel(stages)
computeContribution(rows, dimension, metric)
computeRanking(rows, metric)
computeAnomalyScore(series)
computeOpportunityScore(metrics)
```

漏斗算子输出示例：

```json
{
  "operator": "computeFunnel",
  "stages": [
    {
      "name": "搜索曝光",
      "value": 100000,
      "conversionFromPrevious": null
    },
    {
      "name": "搜索点击",
      "value": 12000,
      "conversionFromPrevious": 0.12
    }
  ],
  "largestLeakage": {
    "from": "POI 访问",
    "to": "套餐详情",
    "rate": 0.31
  },
  "refs": ["S1", "D2"]
}
```

同环比算子输出示例：

```json
{
  "operator": "computePeriodCompare",
  "metric": "gmv",
  "current": {
    "period": "2026-06",
    "value": 1200000
  },
  "previous": {
    "period": "2026-05",
    "value": 1000000
  },
  "mom": 0.2,
  "refs": ["S1", "S2"]
}
```

### 4.6 Evidence & Citation

职责：每一个结论都能追溯到数据、SQL、知识库或计算过程。

建议引用类型：

```text
D* 数据表引用
S* SQL 查询引用
K* 知识库引用
A* Agent 步骤引用
C* 计算算子引用
```

计算引用示例：

```json
{
  "id": "C1",
  "type": "calculation",
  "title": "环比计算 · GMV",
  "formula": "(current - previous) / previous",
  "inputs": ["S1", "S2"],
  "result": {
    "current": 1200000,
    "previous": 1000000,
    "mom": 0.2
  }
}
```

这样排查问题时可以快速判断：

```text
错在取数？
错在筛选条件？
错在计算公式？
错在模型表达？
错在图表映射？
```

### 4.7 Quality Gates

职责：拦截不可靠输出。

建议规则：

```text
关键结论必须带引用
数字必须来自 query 或 calculation
同比 / 环比分母为 0 时必须显式提示
样本量不足时不能给强结论
数据源为空时不能编造
图表数据必须和引用结果一致
SQL 只能只读
```

质量检查输出：

```json
{
  "passed": false,
  "issues": [
    {
      "level": "error",
      "code": "MISSING_REFERENCE",
      "message": "结论缺少引用"
    },
    {
      "level": "warning",
      "code": "LOW_SAMPLE_SIZE",
      "message": "样本量不足，建议降低结论强度"
    }
  ]
}
```

### 4.8 Answer Composer

职责：最后才让 LLM 做表达。

LLM 不应该自己决定核心数字。给它的输入应该是结构化事实：

```json
{
  "scenario": "period_compare",
  "facts": [],
  "calculations": [],
  "charts": [],
  "references": [],
  "warnings": []
}
```

要求：

```text
只能引用 facts / calculations 里的数字
每个关键结论必须带 refs
不能补外部事实
必须保留不确定性和数据边界
```

## 5. 推荐代码结构

```text
api/_lib/
  intent-router.js

  data-query-engine.js
  query-templates/
    brand-monthly.js
    city-monthly.js
    funnel.js
    competitor.js

  metric-operators.js
  operators/
    period-compare.js
    funnel.js
    contribution.js
    anomaly.js

  citation-registry.js
  calculation-registry.js

  workflows/
    data_query.js
    period_compare.js
    funnel_diagnosis.js
    competitor_benchmark.js
    business_review.js
    proposal_generation.js

  answer-composer.js
  chart-builder.js
  quality-gates.js
```

## 6. 完整执行链路示例

用户问：

```text
海底捞 6 月 GMV 环比下降了吗？主要是哪个城市拖累？
```

执行链路：

```text
Intent Router
  -> scenario = period_compare + contribution_analysis

Workflow
  -> 计划：查 6 月 GMV、5 月 GMV、按城市拆解

Query Engine
  -> S1 查询 6 月品牌 GMV
  -> S2 查询 5 月品牌 GMV
  -> S3 查询 6 月城市 GMV
  -> S4 查询 5 月城市 GMV

Metric Operators
  -> C1 计算整体环比
  -> C2 计算城市贡献度
  -> C3 找最大拖累城市

Citation
  -> 绑定 S1 / S2 / S3 / S4 / C1 / C2 / C3

Quality Gate
  -> 检查数字是否都有引用
  -> 检查环比分母是否有效
  -> 检查是否存在样本量不足

Composer
  -> 输出结论 + 图表 + 引用索引
```

最终回答结构：

```json
{
  "answer": "6 月 GMV 环比下降 8.4%，主要拖累来自上海和成都两个城市。",
  "charts": [],
  "references": [],
  "calculations": [],
  "warnings": []
}
```

## 7. 落地到 BrandPilot 的建议

当前 BrandPilot 已经有一个接近正确的方向：

```text
annual_proposal
funnel_diagnosis
competitor_benchmark
data_query
```

这些是场景层。

已有工具层：

```text
NL2SQL
RAG
computeFunnel
aggregateMonthly
getCompetitorBenchmark
```

建议下一步升级：

```text
1. 新增 data-query-engine.js，统一接管所有查数。
2. 新增 metric-operators.js，把同环比、漏斗、贡献度都变成确定性算子。
3. citation-registry.js 增加 calculation 类型引用。
4. workflow 不直接拼计算逻辑，只调用 Query Engine + Operators。
5. 前端引用索引展示 SQL、结果明细、计算公式、计算输入和输出。
```

目标状态：

```text
场景清楚
取数统一
计算确定
引用完整
表达可控
排查容易
```

## 8. 一句话原则

```text
SQL 是取数层。
漏斗、同环比、贡献度是分析层。
Agent 负责组织分析路径。
LLM 负责表达，不负责关键数字。
```

