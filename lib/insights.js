'use strict';

const { monthLabel, prevMonthOf, percent } = require('./util');

function sumBy(bills, month, sign) {
  let total = 0;
  for (const b of bills) {
    if (b.date.slice(0, 7) !== month) continue;
    const a = Number(b.amount);
    if (sign === 'income' && a > 0) total += a;
    if (sign === 'expense' && a < 0) total += Math.abs(a);
  }
  return total;
}

function categoryBreakdown(bills, month) {
  const map = {};
  for (const b of bills) {
    if (b.date.slice(0, 7) !== month) continue;
    const a = Number(b.amount);
    if (a >= 0) continue;
    map[b.category] = map[b.category] || { total: 0, count: 0 };
    map[b.category].total += Math.abs(a);
    map[b.category].count += 1;
  }
  return Object.entries(map)
    .map(([name, v]) => ({ name, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total);
}

function summarize(bills, month) {
  const income = sumBy(bills, month, 'income');
  const expense = sumBy(bills, month, 'expense');
  const prevMonth = prevMonthOf(month);
  const prevIncome = sumBy(bills, prevMonth, 'income');
  const prevExpense = sumBy(bills, prevMonth, 'expense');
  const breakdown = categoryBreakdown(bills, month);
  return {
    month,
    monthLabel: monthLabel(month),
    income,
    expense,
    balance: income - expense,
    prevMonth,
    prevIncome,
    prevExpense,
    incomeChange: prevIncome ? percent(income - prevIncome, prevIncome) : 0,
    expenseChange: prevExpense ? percent(expense - prevExpense, prevExpense) : 0,
    breakdown
  };
}

function trend(bills, months = 6) {
  const now = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({
      month,
      label: `${d.getMonth() + 1}月`,
      income: sumBy(bills, month, 'income'),
      expense: sumBy(bills, month, 'expense')
    });
  }
  return out;
}

function suggestions(summary, anomalies) {
  const list = [];
  const expense = summary.expense || 0;
  const income = summary.income || 0;

  const food = summary.breakdown.find((b) => b.name === '餐饮·外卖');
  if (food && food.total >= 200 && food.total / expense > 0.15) {
    list.push({
      icon: '🍜',
      text: `外卖支出 ${food.count} 笔，合计 ¥${food.total.toFixed(0)}，占总支出的 ${Math.round((food.total / expense) * 100)}%，建议设置每月预算。`
    });
  }

  const shop = summary.breakdown.find((b) => b.name === '购物');
  if (shop && shop.total / expense > 0.3) {
    list.push({
      icon: '🛒',
      text: `购物支出 ¥${shop.total.toFixed(0)}，占比较高，建议控制非必要消费。`
    });
  }

  const subs = anomalies.filter((a) => a.type === 'subscription');
  if (subs.length > 0) {
    list.push({
      icon: '🔁',
      text: `发现 ${subs.length} 项疑似自动续费 / 订阅，建议核对是否仍需要。`
    });
  }

  const dups = anomalies.filter((a) => a.type === 'duplicate');
  if (dups.length > 0) {
    list.push({
      icon: '⚠️',
      text: `检测到 ${dups.length} 笔疑似重复扣款，建议核对账单明细。`
    });
  }

  if (income > 0 && expense > income) {
    list.push({ icon: '📉', text: '本月支出高于收入，注意控制开销。' });
  } else if (income > 0 && summary.balance > income * 0.25) {
    list.push({ icon: '📈', text: '本月结余充足，可考虑储蓄或理财。' });
  }

  if (list.length === 0) {
    list.push({ icon: '✅', text: '本月消费结构正常，继续保持。' });
  }
  return list;
}

module.exports = { summarize, trend, suggestions, categoryBreakdown };
