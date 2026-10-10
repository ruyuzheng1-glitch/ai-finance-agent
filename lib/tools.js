'use strict';

const db = require('./database');
const { summarize, trend, suggestions } = require('./insights');
const { detectAnomalies } = require('./anomaly');
const { monthLabel, prevMonthOf } = require('./util');

db.init();

function allBills() {
  return db.getAllBills();
}

function billsForMonth(month) {
  return db.getAllBills().filter((b) => b.date.slice(0, 7) === month);
}

function categorySpend(month, categories) {
  const cats = Array.isArray(categories) ? categories : [categories];
  const bills = allBills();
  const inMonth = bills.filter(
    (b) => b.date.slice(0, 7) === month && cats.includes(b.category)
  );
  const total = inMonth.reduce((s, b) => s + Math.abs(Math.min(0, Number(b.amount))), 0);
  const prev = prevMonthOf(month);
  const inPrev = bills.filter(
    (b) => b.date.slice(0, 7) === prev && cats.includes(b.category)
  );
  const prevTotal = inPrev.reduce((s, b) => s + Math.abs(Math.min(0, Number(b.amount))), 0);
  return {
    month,
    monthLabel: monthLabel(month),
    category: cats.join(' / '),
    total,
    count: inMonth.length,
    prevMonth: prev,
    prevMonthLabel: monthLabel(prev),
    prevTotal
  };
}

function totals(month) {
  const s = summarize(allBills(), month);
  return {
    month,
    monthLabel: monthLabel(month),
    income: s.income,
    expense: s.expense,
    balance: s.balance,
    prevIncome: s.prevIncome,
    prevExpense: s.prevExpense,
    incomeChange: s.incomeChange,
    expenseChange: s.expenseChange
  };
}

function topCategories(month) {
  const s = summarize(allBills(), month);
  return {
    month,
    monthLabel: monthLabel(month),
    totalExpense: s.expense,
    breakdown: s.breakdown.slice(0, 5)
  };
}

function trendData(months = 6) {
  return trend(allBills(), months);
}

function anomalies(month) {
  return detectAnomalies(allBills(), month || null);
}

function insights(month) {
  const s = summarize(allBills(), month);
  const anom = detectAnomalies(allBills(), month);
  return {
    ...s,
    anomalies: anom,
    suggestions: suggestions(s, anom)
  };
}

module.exports = {
  allBills,
  billsForMonth,
  categorySpend,
  totals,
  topCategories,
  trendData,
  anomalies,
  insights
};
