'use strict';

function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00');
  const db_ = new Date(b + 'T00:00:00');
  return Math.round((db_ - da) / 86400000);
}

function categoryMonthlyTotals(bills) {
  const map = {};
  for (const b of bills) {
    if (Number(b.amount) >= 0) continue;
    const month = b.date.slice(0, 7);
    map[month] = map[month] || {};
    map[month][b.category] = (map[month][b.category] || 0) + Math.abs(Number(b.amount));
  }
  return map;
}

function detectAnomalies(bills, month) {
  const anomalies = [];

  // 1. 疑似重复扣款：同一商户、相同金额、3 天内出现多次
  const groups = new Map();
  for (const b of bills) {
    if (Number(b.amount) >= 0) continue;
    const key = b.merchant + '|' + Math.abs(Number(b.amount)).toFixed(2);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < arr.length; i++) {
      if (daysBetween(arr[i - 1].date, arr[i].date) <= 3) {
        anomalies.push({
          type: 'duplicate',
          title: '疑似重复扣款',
          description: `${arr[i].merchant} 在 ${arr[i].date} 附近出现两笔相同的 ¥${Math.abs(Number(arr[i].amount)).toFixed(0)} 支出`,
          severity: 'high',
          merchant: arr[i].merchant,
          amount: Number(arr[i].amount),
          date: arr[i].date,
          month: arr[i].date.slice(0, 7),
          billIds: [arr[i - 1].id, arr[i].id]
        });
      }
    }
  }

  // 2. 疑似订阅/自动续费
  const SUB = ['会员', '订阅', '续费', '月卡', '年卡'];
  const seenSubs = new Set();
  const subs = bills.filter(
    (b) => Number(b.amount) < 0 && SUB.some((k) => (b.merchant + b.description).includes(k))
  );
  subs.sort((a, b) => b.date.localeCompare(a.date));
  for (const b of subs) {
    if (seenSubs.has(b.merchant)) continue;
    seenSubs.add(b.merchant);
    anomalies.push({
      type: 'subscription',
      title: '疑似自动续费 / 订阅',
      description: `${b.merchant} 被识别为周期性订阅，建议确认是否继续`,
      severity: 'medium',
      merchant: b.merchant,
      amount: Number(b.amount),
      date: b.date,
      month: b.date.slice(0, 7),
      billIds: [b.id]
    });
  }

  // 3. 分类支出突增
  if (month) {
    const catMonths = categoryMonthlyTotals(bills);
    const current = catMonths[month] || {};
    const prevMonths = Object.keys(catMonths).filter((m) => m < month).sort();
    if (prevMonths.length > 0) {
      for (const cat of Object.keys(current)) {
        const cur = current[cat];
        const prevTotals = prevMonths.map((m) => (catMonths[m] || {})[cat] || 0);
        const avg = prevTotals.reduce((a, b) => a + b, 0) / prevTotals.length;
        if (avg > 0 && cur >= 100 && cur > avg * 1.4) {
          anomalies.push({
            type: 'spike',
            title: `${cat} 支出突增`,
            description: `${cat} 本月支出 ¥${cur.toFixed(0)}，较前几月平均 ¥${avg.toFixed(0)} 明显上涨`,
            severity: 'medium',
            merchant: '',
            amount: -cur,
            date: month + '-01',
            month,
            billIds: []
          });
        }
      }
    }
  }

  const filtered = month ? anomalies.filter((a) => a.month === month) : anomalies;
  const seen = new Set();
  return filtered.filter((a) => {
    const key = a.type + '|' + a.title + '|' + a.merchant + '|' + a.month;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { detectAnomalies, daysBetween };
