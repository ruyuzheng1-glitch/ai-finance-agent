'use strict';

const CATEGORY_RULES = [
  { name: '餐饮·外卖', keywords: ['美团', '饿了么', '外卖', '麦当劳', '肯德基', '必胜客', '奶茶', '喜茶', '奈雪', '瑞幸', '咖啡', '汉堡', '披萨', '夜宵'], color: '#ef4444', type: 'expense' },
  { name: '餐饮·堂食', keywords: ['餐厅', '饭店', '火锅', '烧烤', '面馆', '食堂', '酒店', '星巴克', '早餐', '午餐', '晚餐', '小吃', '串串'], color: '#f97316', type: 'expense' },
  { name: '交通', keywords: ['滴滴', '出行', '地铁', '公交', '加油', '停车', '高铁', '火车', '12306', '机票', '航空', '打车', '出租车', '共享单车', '交通卡'], color: '#f59e0b', type: 'expense' },
  { name: '购物', keywords: ['淘宝', '京东', '拼多多', '天猫', '唯品会', '苏宁', '超市', '便利店', '商城', '旗舰店', '下单', '日用', '生活用品'], color: '#8b5cf6', type: 'expense' },
  { name: '娱乐', keywords: ['电影', '游戏', '会员', '视频', '音乐', '直播', 'ktv', '网吧', 'steam', '腾讯视频', '爱奇艺', '优酷', '哔哩哔哩', '影城', '订阅', '续费'], color: '#ec4899', type: 'expense' },
  { name: '住房', keywords: ['房租', '水费', '电费', '燃气', '物业', '宽带', '房'], color: '#3b82f6', type: 'expense' },
  { name: '通讯', keywords: ['话费', '流量', '手机充值', '中国移动', '中国联通', '中国电信'], color: '#06b6d4', type: 'expense' },
  { name: '医疗', keywords: ['医院', '药房', '药店', '体检', '挂号', '诊所', '药', '门诊'], color: '#f43f5e', type: 'expense' },
  { name: '教育', keywords: ['课程', '培训', '书', '学费', '考试', '学习', '网课'], color: '#10b981', type: 'expense' },
  { name: '其他', keywords: [], color: '#64748b', type: 'expense' }
];

const INCOME_RULES = [
  { name: '收入·工资', keywords: ['工资', '薪资', '奖金', '报销', '薪资发放'], color: '#22c55e', type: 'income' },
  { name: '收入·其他', keywords: ['红包', '转账', '退款', '利息', '兼职', '稿费'], color: '#14b8a6', type: 'income' }
];

function matchScore(keywords, text) {
  let score = 0;
  for (const k of keywords) {
    if (text.includes(k.toLowerCase())) score += k.length;
  }
  return score;
}

function classify(merchant = '', description = '', amount = 0, memoryCategory = null) {
  const norm = String(merchant).trim();
  if (memoryCategory && memoryCategory !== '其他') return memoryCategory;
  const text = (String(merchant) + ' ' + String(description)).toLowerCase();

  if (Number(amount) > 0) {
    for (const r of INCOME_RULES) {
      if (matchScore(r.keywords, text) > 0) return r.name;
    }
    return '收入·其他';
  }

  let best = null;
  let bestScore = 0;
  for (const r of CATEGORY_RULES) {
    const s = matchScore(r.keywords, text);
    if (s > bestScore) {
      bestScore = s;
      best = r.name;
    }
  }
  return bestScore > 0 ? best : '其他';
}

module.exports = { CATEGORY_RULES, INCOME_RULES, classify };
