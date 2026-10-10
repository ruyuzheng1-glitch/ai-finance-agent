'use strict';

const { chatCompletion } = require('./llm');
const tools = require('./tools');
const { currentMonth } = require('./util');

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_totals',
      description: '查询某个月的收入、支出、结余汇总。',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: '月份，格式 YYYY-MM，例如 2026-09' }
        },
        required: ['month']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_category_spend',
      description: '查询某个月某个分类的支出总额和笔数，例如外卖、交通、购物、娱乐等。',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: '月份，格式 YYYY-MM' },
          category: { type: 'string', description: '分类名称，如 餐饮·外卖、交通、购物' }
        },
        required: ['month', 'category']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_top_categories',
      description: '查询某个月支出最多的分类排行。',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: '月份，格式 YYYY-MM' }
        },
        required: ['month']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_trend',
      description: '查询最近 N 个月的收支趋势。',
      parameters: {
        type: 'object',
        properties: {
          months: { type: 'number', description: '月数，默认 6' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_anomalies',
      description: '查询异常消费，包括重复扣款、疑似订阅、分类支出突增。',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: '可选，某个月，格式 YYYY-MM' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_bills',
      description: '查询账单明细列表。',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: '月份，格式 YYYY-MM' },
          category: { type: 'string', description: '可选，分类名称' },
          keyword: { type: 'string', description: '可选，商户或描述关键词' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_report',
      description: '生成某个月的完整财务报告，包含收支、分类结构、异常和建议。',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: '月份，格式 YYYY-MM' }
        },
        required: ['month']
      }
    }
  }
];

function executeTool(name, args) {
  const a = args || {};
  switch (name) {
    case 'query_totals':
      return tools.totals(a.month || currentMonth());
    case 'query_category_spend':
      return tools.categorySpend(a.month || currentMonth(), [a.category || '其他']);
    case 'query_top_categories':
      return tools.topCategories(a.month || currentMonth());
    case 'query_trend':
      return tools.trendData(Number(a.months) || 6);
    case 'query_anomalies':
      return tools.anomalies(a.month || null);
    case 'query_bills': {
      const list = tools.billsForMonth(a.month || currentMonth());
      return list
        .filter((b) => {
          if (a.category && b.category !== a.category) return false;
          if (a.keyword && !(b.merchant.includes(a.keyword) || (b.description || '').includes(a.keyword))) return false;
          return true;
        })
        .slice(0, 20);
    }
    case 'query_report':
      return tools.insights(a.month || currentMonth());
    default:
      throw new Error('未知工具: ' + name);
  }
}

function buildSystemPrompt() {
  const now = new Date();
  const today = now.toLocaleDateString('zh-CN');
  return [
    '你是一个个人财务管家 Agent，帮助用户查询和分析账单数据。',
    `今天是 ${today}，当前月份是 ${currentMonth()}。`,
    '规则：',
    '1. 涉及金额、笔数、分类、趋势、异常、明细、报告等具体数据时，必须调用工具获取真实数据，不要凭空猜测。',
    '2. 月份格式为 YYYY-MM；用户说「上个月」「这个月」等相对时间时，根据今天的日期推算。',
    '3. 用简体中文回答，简洁清晰，金额用 ¥ 表示。',
    '4. 工具返回空或没有数据时，如实告知用户。',
    '5. 先获取数据再回答，必要时可以连续调用多个工具。'
  ].join('\n');
}

async function runLLM(query) {
  const trace = [];
  trace.push({ type: 'think', text: '已连接大模型，开始理解意图并规划工具调用' });

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: query }
  ];

  let finalText = '';
  for (let i = 0; i < 5; i++) {
    const resp = await chatCompletion({ messages, tools: TOOLS });
    const msg = resp.choices && resp.choices[0] && resp.choices[0].message;
    if (!msg) throw new Error('模型返回格式异常');
    messages.push(msg);

    const toolCalls = msg.tool_calls || [];
    if (toolCalls.length === 0) {
      finalText = msg.content || '';
      break;
    }

    for (const tc of toolCalls) {
      let args = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch (e) {
        args = {};
      }
      trace.push({ type: 'tool', text: `调用工具 ${tc.function.name}(${JSON.stringify(args)})` });
      let result;
      try {
        result = executeTool(tc.function.name, args);
      } catch (e) {
        result = { error: e.message };
      }
      trace.push({ type: 'result', text: '工具返回结果', data: result });
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  if (!finalText) {
    finalText = '抱歉，这次分析没有完成，请换个方式再问我一次。';
  }
  trace.push({ type: 'answer', text: '生成最终回答' });
  return { answer: finalText, trace };
}

module.exports = { runLLM, TOOLS, executeTool };
