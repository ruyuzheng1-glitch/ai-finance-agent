'use strict';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthOf(dateStr) {
  return String(dateStr).slice(0, 7);
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function monthOffset(offset) {
  const d = new Date();
  return monthOf(toDateStr(new Date(d.getFullYear(), d.getMonth() + offset, 1)));
}

function prevMonthOf(month) {
  const [y, m] = String(month).split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function dateForMonthOffset(offsetMonth, day) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offsetMonth, 1);
  const max = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, max));
  return toDateStr(d);
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? '-' : '';
  return sign + '¥' + Math.abs(v).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function fmtSigned(n) {
  const v = Number(n) || 0;
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  return sign + '¥' + Math.abs(v).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function monthLabel(month) {
  const [y, m] = String(month).split('-').map(Number);
  return `${y}年${m}月`;
}

function percent(a, b) {
  if (!b) return 0;
  return (a / b) * 100;
}

module.exports = {
  pad,
  toDateStr,
  monthOf,
  currentMonth,
  monthOffset,
  prevMonthOf,
  dateForMonthOffset,
  fmtMoney,
  fmtSigned,
  monthLabel,
  percent
};
