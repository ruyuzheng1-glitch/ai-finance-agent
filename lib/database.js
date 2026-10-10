'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { dateForMonthOffset } = require('./util');
const { CATEGORY_RULES, INCOME_RULES, classify } = require('./classifier');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'finance.db');

let db = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function buildSeedRows() {
  const recurring = (off) => [
    [off, 1, '自如房租', -3000, '房租', '导入'],
    [off, 3, '中国移动话费充值', -100, '话费', '导入'],
    [off, 5, '某某科技 工资', 12000, '工资发放', '导入'],
    [off, 8, '美团外卖', -35, '午餐外卖', '导入'],
    [off, 10, '滴滴出行', -28, '打车', '导入'],
    [off, 12, '淘宝', -199, '日用品', '导入'],
    [off, 15, '美团外卖', -42, '晚餐外卖', '导入'],
    [off, 16, '腾讯视频会员', -25, '自动续费', '导入'],
    [off, 18, '星巴克', -36, '咖啡', '导入'],
    [off, 20, '京东商城', -299, '生活用品', '导入'],
    [off, 22, '地铁充值', -50, '交通卡', '导入'],
    [off, 25, '美团外卖', -38, '晚餐外卖', '导入'],
    [off, 27, '万达影城', -60, '电影票', '导入'],
    [off, 28, '海王星辰药店', -45, '感冒药', '导入']
  ];

  const rows = [];
  for (const off of [-3, -2, -1]) {
    rows.push(...recurring(off));
  }

  rows.push(
    [-1, 3, '美团外卖', -38, '午餐外卖', '导入'],
    [-1, 4, '美团外卖', -38, '午餐外卖', '导入'],
    [-1, 9, '美团外卖', -45, '晚餐外卖', '导入'],
    [-1, 14, '某某App自动续费', -88, '订阅服务', '导入'],
    [-1, 21, '饿了么', -52, '晚餐外卖', '导入'],
    [-1, 26, '美团外卖', -47, '夜宵', '导入'],
    [-1, 30, '朋友转账 红包', 200, '转账', '导入'],
    [0, 1, '自如房租', -3000, '房租', '导入'],
    [0, 3, '中国移动话费充值', -100, '话费', '导入'],
    [0, 5, '某某科技 工资', 12000, '工资发放', '导入'],
    [0, 6, '美团外卖', -32, '午餐外卖', '导入'],
    [0, 7, '滴滴出行', -22, '打车', '导入'],
    [0, 7, '美团外卖', -32, '午餐外卖', '导入'],
    [0, 8, '美团外卖', -41, '晚餐外卖', '导入'],
    [0, 9, '淘宝', -158, '日用品', '导入'],
    [0, 9, '哔哩哔哩大会员', -25, '自动续费', '导入']
  );

  return rows.map(([off, day, merchant, amount, description, source]) => ({
    date: dateForMonthOffset(off, day),
    merchant,
    amount,
    description,
    source,
    category: classify(merchant, description, amount)
  }));
}

function init() {
  if (db) return db;
  ensureDataDir();
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      keywords TEXT DEFAULT '',
      color TEXT DEFAULT '#64748b',
      type TEXT DEFAULT 'expense'
    );
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      merchant TEXT NOT NULL,
      description TEXT DEFAULT '',
      amount REAL NOT NULL,
      category TEXT DEFAULT '其他',
      source TEXT DEFAULT '导入',
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS memory (
      merchant TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS budgets (
      category TEXT PRIMARY KEY,
      monthly_limit REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date);
  `);

  seedCategories();
  seedBills();
  return db;
}

function seedCategories() {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO categories (name, keywords, color, type) VALUES (?, ?, ?, ?)'
  );
  for (const c of [...CATEGORY_RULES, ...INCOME_RULES]) {
    stmt.run(c.name, c.keywords.join(','), c.color, c.type);
  }
}

function seedBills() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM bills').get().n;
  if (count > 0) return;
  const rows = buildSeedRows();
  const stmt = db.prepare(
    'INSERT INTO bills (date, merchant, description, amount, category, source) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const r of rows) {
    stmt.run(r.date, r.merchant, r.description, r.amount, r.category, r.source);
  }
}

function getAllBills() {
  return db.prepare('SELECT * FROM bills ORDER BY date DESC, id DESC').all();
}

function getBills(filters = {}) {
  const clauses = [];
  const params = [];
  if (filters.month) {
    clauses.push('date LIKE ?');
    params.push(filters.month + '%');
  }
  if (filters.category) {
    const cats = Array.isArray(filters.category) ? filters.category : [filters.category];
    clauses.push('category IN (' + cats.map(() => '?').join(',') + ')');
    params.push(...cats);
  }
  if (filters.q) {
    clauses.push('(merchant LIKE ? OR description LIKE ?)');
    params.push('%' + filters.q + '%', '%' + filters.q + '%');
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const limit = Math.max(1, Math.min(Number(filters.limit) || 500, 1000));
  const offset = Math.max(0, Number(filters.offset) || 0);
  const list = db
    .prepare(`SELECT * FROM bills ${where} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM bills ${where}`)
    .get(...params).n;
  return { list, total };
}

function addBill(bill) {
  const category = classify(
    bill.merchant,
    bill.description || '',
    bill.amount,
    getMemory(bill.merchant)
  );
  const res = db
    .prepare(
      'INSERT INTO bills (date, merchant, description, amount, category, source, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      bill.date,
      bill.merchant,
      bill.description || '',
      bill.amount,
      category,
      bill.source || '导入',
      bill.note || ''
    );
  return getBillById(Number(res.lastInsertRowid));
}

function updateBill(id, patch) {
  const existing = getBillById(id);
  if (!existing) return null;
  const merchant = patch.merchant != null ? patch.merchant : existing.merchant;
  const description = patch.description != null ? patch.description : existing.description;
  const amount = patch.amount != null ? patch.amount : existing.amount;
  let category = patch.category != null ? patch.category : existing.category;

  if (patch.category != null && merchant) {
    setMemory(merchant, patch.category);
  } else if (patch.merchant != null || patch.description != null || patch.amount != null) {
    category = classify(merchant, description, amount, getMemory(merchant));
  }

  db.prepare(
    'UPDATE bills SET date = ?, merchant = ?, description = ?, amount = ?, category = ?, note = ? WHERE id = ?'
  ).run(
    patch.date != null ? patch.date : existing.date,
    merchant,
    description,
    amount,
    category,
    patch.note != null ? patch.note : existing.note,
    id
  );
  return getBillById(id);
}

function deleteBill(id) {
  const res = db.prepare('DELETE FROM bills WHERE id = ?').run(id);
  return res.changes > 0;
}

function getBillById(id) {
  return db.prepare('SELECT * FROM bills WHERE id = ?').get(id) || null;
}

function getCategories() {
  const rows = db.prepare('SELECT * FROM categories ORDER BY id ASC').all();
  return rows.map((r) => ({ ...r, keywords: r.keywords ? r.keywords.split(',') : [] }));
}

function addCategory(c) {
  const res = db
    .prepare('INSERT INTO categories (name, keywords, color, type) VALUES (?, ?, ?, ?)')
    .run(c.name, (c.keywords || []).join(','), c.color || '#64748b', c.type || 'expense');
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(res.lastInsertRowid));
}

function updateCategory(id, patch) {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) return null;
  const name = patch.name != null ? patch.name : existing.name;
  const keywords = patch.keywords != null ? patch.keywords : (existing.keywords ? existing.keywords.split(',') : []);
  const color = patch.color != null ? patch.color : existing.color;
  const type = patch.type != null ? patch.type : existing.type;
  db.prepare('UPDATE categories SET name = ?, keywords = ?, color = ?, type = ? WHERE id = ?').run(
    name,
    keywords.join(','),
    color,
    type,
    id
  );
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

function deleteCategory(id) {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) return false;
  if (existing.type === 'expense' && existing.name === '其他') return false;
  db.prepare('UPDATE bills SET category = ? WHERE category = ?').run('其他', existing.name);
  const res = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return res.changes > 0;
}

function getMemory(merchant) {
  if (!merchant) return null;
  const row = db.prepare('SELECT category FROM memory WHERE merchant = ?').get(String(merchant).trim());
  return row ? row.category : null;
}

function setMemory(merchant, category) {
  const key = String(merchant).trim();
  if (!key || !category) return;
  db.prepare(
    'INSERT INTO memory (merchant, category, updated_at) VALUES (?, ?, datetime(\'now\',\'localtime\')) ON CONFLICT(merchant) DO UPDATE SET category = excluded.category, updated_at = excluded.updated_at'
  ).run(key, category);
}

function getBudgets() {
  const rows = db.prepare('SELECT * FROM budgets').all();
  const map = {};
  for (const r of rows) map[r.category] = r.monthly_limit;
  return map;
}

function setBudget(category, monthlyLimit) {
  db.prepare(
    'INSERT INTO budgets (category, monthly_limit) VALUES (?, ?) ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit'
  ).run(category, monthlyLimit);
}

module.exports = {
  init,
  DB_PATH,
  getAllBills,
  getBills,
  addBill,
  updateBill,
  deleteBill,
  getBillById,
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getMemory,
  setMemory,
  getBudgets,
  setBudget
};
