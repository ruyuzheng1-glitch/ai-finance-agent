# AI 个人财务管家 Agent

一个零第三方依赖、可本地运行的 AI 财务助手：接入账单流水后，Agent 自动分类收支、识别异常消费、生成月度洞察，并用自然语言回答「我上个月外卖花了多少」这类问题。

## 功能

- 账单流水：CSV 导入、搜索、筛选、分页、手动修正分类
- 自动分类：基于关键字规则 + 长期记忆（手动修正后自动记住商户）
- 异常检测：重复扣款、疑似订阅/自动续费、分类支出突增
- AI 助手：自然语言查账，实时展示「思考 → 工具调用 → 观察结果 → 回答」全过程
- 月度报告：收支概览、分类结构、AI 消费建议、异常清单
- 分类管理：自定义分类、关键字规则、颜色

## 运行

需要 Node.js 24 或更高版本（使用内置 `node:sqlite`，无需任何 `npm install`）。

```bash
node server.js
```

然后浏览器打开 <http://localhost:3000>。

首次启动会自动创建 `data/finance.db` 并写入 4 个月的示例账单。

## 接入大模型（可选，让 Agent 更智能）

不配置时，项目使用内置的规则版 Agent，开箱即用。配置 API Key 后，Agent 会切换为大模型模式：由模型理解自然语言、自主决定调用哪些工具、多步推理后生成回答，能处理更灵活的问法。

```bash
cp .env.example .env   # Windows 可手动复制文件
# 编辑 .env，填入你的 Key
node server.js
```

支持任意 OpenAI 兼容接口，例如：

| 服务商 | AI_BASE_URL | AI_MODEL |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |

如果大模型请求失败，会自动回退到规则版 Agent，不影响使用。

## 技术栈

- 后端：Node.js 内置 `http` + `node:sqlite`（零依赖）
- 前端：原生 HTML / CSS / JavaScript，手写 SVG 图表
- Agent：大模型函数调用（可选）+ 规则意图解析 + 工具调用循环 + 长期记忆

## 目录结构

```text
ai-finance-agent/
├── server.js            # HTTP 服务与 API 路由
├── lib/
│   ├── database.js      # SQLite 建表、示例数据、CRUD
│   ├── classifier.js    # 自动分类规则
│   ├── anomaly.js       # 异常检测
│   ├── insights.js      # 月度洞察与建议
│   ├── tools.js         # Agent 可调用的工具
│   ├── llm.js           # 大模型调用客户端
│   ├── llm-agent.js     # 大模型函数调用循环与工具定义
│   ├── agent.js         # 分发：大模型模式 / 规则模式
│   ├── config.js        # 读取 .env 配置
│   └── util.js          # 日期与金额工具
└── public/
    ├── index.html
    ├── styles.css
    ├── charts.js        # 手写 SVG 图表
    └── app.js           # 前端交互逻辑
```

## CSV 导入格式

逗号分隔的四列，第一行表头可省略：

```text
日期,商户,金额,描述
2026-10-09,美团外卖,-38,晚餐外卖
2026-10-05,某某科技,12000,工资发放
```

金额为负表示支出，为正表示收入。

## 可扩展方向

- 使用 MCP（Model Context Protocol）把查询工具暴露为标准化工具
- 增加预算设置、多账户、图表导出、数据加密
