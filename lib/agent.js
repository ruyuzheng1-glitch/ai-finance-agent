'use strict';

const tools = require('./tools');
const { currentMonth, monthOffset, monthLabel, prevMonthOf, fmtMoney, fmtSigned, percent } = require('./util');

function parseMonth(text) {
  if (/上上个月|上上月/.test(text)) return monthOffset(-2);
  if (/上个月|上月/.test(text)) return monthOffset(-1);
  if (/这个月|本月|今月/.test(text)) return currentMonth();
  const ym = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
  if (ym) return `${ym[1]}-${String(Number(ym[2])).padStart(2, '0')}`;
  const m = text.match(/(\d{1,2})\s*月/);
  if (m) {
    const now = new Date();
    return `${now.getFullYear()}-${String(Number(m[1])).padStart(2, '0')}`;
  }
  return null;
}

function parseCategory(text) {
  const rules = [
    { words: ['外卖', '美团', '饿了么'], cats: ['餐饮·外卖'] },
    { words: ['餐饮', '吃饭', '伙食', '吃的'], cats: ['餐饮·外卖', '餐饮·堂食'] },
    { words: ['交通', '出行', '打车', '地铁', '公交'], cats: ['交通'] },
    { words: ['购物', '淘宝', '京东', '买东西'], cats: ['购物'] },
    { words: ['娱乐', '电影', '游戏', '视频会员'], cats: ['娱乐'] },
    { words: ['住房', '房租', '房费'], cats: ['住房'] },
    { words: ['通讯', '话费', '流量'], cats: ['通讯'] },
    { words: ['医疗', '看病', '药费'], cats: ['医疗'] },
    { words: ['教育', '学习', '课程'], cats: ['教育'] }
  ];
  for (const r of rules) {
    if (r.words.some((w) => text.includes(w))) return r.cats;
  }
  return null;
}

function parseIntent(text) {
  if (/异常|可疑|重复|自动续费|扣款提醒|消费提醒/.test(text)) return 'anomalies';
  if (/报告|洞察|总结|复盘|月度报告|财务分析/.test(text)) return 'report';
  if (/趋势|对比|环比|走势|变化|涨/.test(text)) return 'trend';
  if (/明细|列出|账单|记录|哪些|有哪些交易|清单/.test(text)) return 'bills';
  if (/最多|最高|大头|占比|什么最花钱|哪个分类|排行|花得最多/.test(text)) return 'top';
  if (/收入|工资|赚|进账|结余/.test(text)) return 'income';
  if (/花了多少|花了|花多少|支出|消费|花销|多少钱|花了多少钱/.test(text)) return 'spend';
  if (/你好|您好|hi|hello|帮助|怎么用|能做什么|介绍一下/.test(text)) return 'help';
  return 'help';
}

function changeWord(cur, prev) {
  if (!prev) return '';
  const d = cur - prev;
  if (d > 0) return `，比上个月多了 ${fmtMoney(d)}（上涨 ${Math.round(percent(d, prev))}%）`;
  if (d < 0) return `，比上个月少了 ${fmtMoney(Math.abs(d))}（下降 ${Math.round(percent(Math.abs(d), prev))}%）`;
  return '，与上个月基本持平';
}

function helpAnswer() {
  return '我是你的 AI 财务管家，可以帮你查账和分析消费。你可以这样问我：\n\n• “我上个月外卖花了多少”\n• “这个月一共花了多少”\n• “有哪些异常消费”\n• “这个月的消费趋势”\n• “哪个分类花得最多”\n• “给我这个月的洞察报告”\n\n我会自动调用查询工具并给出答案。';
}

function runRuleBased(query) {
  const text = String(query || '').trim();
  const trace = [];
  const month = parseMonth(text);
  const cats = parseCategory(text);
  const intent = parseIntent(text);

  trace.push({
    type: 'think',
    text: `理解问题：意图 = ${intent}，月份 = ${month || '未指定（默认最近一个月）'}，分类 = ${cats ? cats.join(' / ') : '未指定'}`
  });

  let answer = '';
  let toolName = '';
  let toolArgs = null;
  let result = null;

  if (intent === 'help') {
    trace.push({ type: 'answer', text: '返回使用帮助' });
    return { answer: helpAnswer(), trace };
  }

  const targetMonth = month || monthOffset(-1);

  if (intent === 'anomalies') {
    toolName = 'getAnomalies';
    toolArgs = { month: month || null };
    result = tools.anomalies(month || null);
    trace.push({ type: 'tool', text: `调用工具 getAnomalies(${JSON.stringify(toolArgs)})` });
    trace.push({ type: 'result', text: `发现 ${result.length} 条异常`, data: result });
    if (result.length === 0) {
      answer = '没有发现明显的异常消费，账单看起来比较健康。';
    } else {
      answer = `共发现 ${result.length} 条需要关注的异常：\n\n` +
        result.map((a) => `• [${a.title}] ${a.description}`).join('\n') +
        '\n\n你可以到「月度报告」页查看更详细的分析。';
    }
  } else if (intent === 'report') {
    toolName = 'getMonthlyInsights';
    toolArgs = { month: targetMonth };
    result = tools.insights(targetMonth);
    trace.push({ type: 'tool', text: `调用工具 getMonthlyInsights(${JSON.stringify(toolArgs)})` });
    trace.push({ type: 'result', text: `已生成 ${result.monthLabel} 报告`, data: result });
    answer = `${result.monthLabel}财务速览：收入 ${fmtMoney(result.income)}，支出 ${fmtMoney(result.expense)}，结余 ${fmtSigned(result.balance)}。\n\n主要支出：\n` +
      result.breakdown.slice(0, 3).map((b) => `• ${b.name} ¥${b.total.toFixed(0)}`).join('\n') +
      '\n\n我的建议：\n' + result.suggestions.slice(0, 3).map((s) => `• ${s.text}`).join('\n');
  } else if (intent === 'trend') {
    toolName = 'getTrend';
    toolArgs = { months: 6 };
    result = tools.trendData(6);
    trace.push({ type: 'tool', text: `调用工具 getTrend(${JSON.stringify(toolArgs)})` });
    trace.push({ type: 'result', text: '获取近 6 个月收支趋势', data: result });
    const last = result[result.length - 1];
    const prev = result[result.length - 2];
    answer = `近 6 个月里，${last.label}支出 ${fmtMoney(last.expense)}${prev ? changeWord(last.expense, prev.expense) : ''}。`;
    if (prev) answer += `收入方面，${last.label}为 ${fmtMoney(last.income)}${changeWord(last.income, prev.income)}。`;
  } else if (intent === 'bills') {
    toolName = 'getBills';
    toolArgs = { month: targetMonth, category: cats };
    const all = tools.billsForMonth(targetMonth);
    let list = all;
    if (cats) list = list.filter((b) => cats.includes(b.category));
    result = list.slice(0, 10);
    trace.push({ type: 'tool', text: `调用工具 getBills(${JSON.stringify(toolArgs)})` });
    trace.push({ type: 'result', text: `找到 ${list.length} 条记录，展示前 ${result.length} 条`, data: result });
    if (list.length === 0) {
      answer = `在 ${monthLabel(targetMonth)}${cats ? '（' + cats.join(' / ') + '）' : ''}没有找到相关账单。`;
    } else {
      answer = `${monthLabel(targetMonth)}${cats ? ' ' + cats.join(' / ') : ''}共 ${list.length} 笔，最近的几笔：\n\n` +
        result.map((b) => `• ${b.date.slice(5)} ${b.merchant} ${fmtSigned(b.amount)}（${b.category}）`).join('\n');
    }
  } else if (intent === 'top') {
    toolName = 'getTopCategories';
    toolArgs = { month: targetMonth };
    result = tools.topCategories(targetMonth);
    trace.push({ type: 'tool', text: `调用工具 getTopCategories(${JSON.stringify(toolArgs)})` });
    trace.push({ type: 'result', text: '按支出金额排序的分类', data: result });
    if (result.breakdown.length === 0) {
      answer = `${monthLabel(targetMonth)}暂时没有支出记录。`;
    } else {
      const top = result.breakdown[0];
      answer = `${monthLabel(targetMonth)}支出最多的分类是「${top.name}」，共 ¥${top.total.toFixed(0)}，占总支出的 ${Math.round((top.total / result.totalExpense) * 100)}%。\n\n完整排行：\n` +
        result.breakdown.map((b, i) => `• ${i + 1}. ${b.name} ¥${b.total.toFixed(0)}`).join('\n');
    }
  } else if (intent === 'income') {
    toolName = 'getTotals';
    toolArgs = { month: targetMonth };
    result = tools.totals(targetMonth);
    trace.push({ type: 'tool', text: `调用工具 getTotals(${JSON.stringify(toolArgs)})` });
    trace.push({ type: 'result', text: '获取收支汇总', data: result });
    answer = `${monthLabel(targetMonth)}收入 ${fmtMoney(result.income)}${changeWord(result.income, result.prevIncome)}，结余 ${fmtSigned(result.balance)}。`;
  } else {
    // spend（默认）
    if (cats) {
      toolName = 'getCategorySpend';
      toolArgs = { month: targetMonth, category: cats };
      result = tools.categorySpend(targetMonth, cats);
      trace.push({ type: 'tool', text: `调用工具 getCategorySpend(${JSON.stringify(toolArgs)})` });
      trace.push({ type: 'result', text: `查询到 ${result.count} 笔，合计 ¥${result.total.toFixed(2)}`, data: result });
      answer = `${result.monthLabel}你在「${result.category}」共支出 ${fmtMoney(result.total)}，共 ${result.count} 笔`;
      if (result.prevTotal > 0) {
        answer += changeWord(result.total, result.prevTotal);
      }
      answer += '。需要我列出明细吗？';
    } else {
      toolName = 'getTotals';
      toolArgs = { month: targetMonth };
      result = tools.totals(targetMonth);
      trace.push({ type: 'tool', text: `调用工具 getTotals(${JSON.stringify(toolArgs)})` });
      trace.push({ type: 'result', text: '获取收支汇总', data: result });
      answer = `${monthLabel(targetMonth)}共支出 ${fmtMoney(result.expense)}${changeWord(result.expense, result.prevExpense)}，收入 ${fmtMoney(result.income)}。`;
    }
  }

  trace.push({ type: 'answer', text: '生成最终回答', data: result });
  return { answer, trace, intent, month: targetMonth };
}

const config = require('./config');
const { runLLM } = require('./llm-agent');

async function run(query) {
  if (config.enabled) {
    try {
      const r = await runLLM(query);
      return { ...r, mode: 'llm', model: config.model };
    } catch (e) {
      const r = runRuleBased(query);
      return { ...r, mode: 'rule', llmError: e.message };
    }
  }
  const r = runRuleBased(query);
  return { ...r, mode: 'rule' };
}

module.exports = { run };
