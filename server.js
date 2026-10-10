'use strict';

const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { URL } = require('node:url');

const db = require('./lib/database');
const tools = require('./lib/tools');
const agent = require('./lib/agent');
const config = require('./lib/config');
const { currentMonth } = require('./lib/util');

db.init();

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;

function lanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name] || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 10 * 1024 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, pathname) {
  let file = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.join(PUBLIC_DIR, file);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length < 3) continue;
    const isHeader =
      /日期|date/i.test(cols[0]) || /商户|merchant/i.test(cols[1]) || /金额|amount/i.test(cols[2]);
    if (isHeader && i === 0) continue;
    const amount = Number(cols[2]);
    if (!cols[0] || !cols[1] || Number.isNaN(amount)) continue;
    rows.push({
      date: cols[0],
      merchant: cols[1],
      amount,
      description: cols[3] || ''
    });
  }
  return rows;
}

async function handleApi(req, res, pathname, searchParams) {
  const segments = pathname.split('/').filter(Boolean); // ['api', ...]
  const route = segments.slice(1).join('/');

  if (req.method === 'GET' && route === 'meta') {
    return json(res, 200, {
      llmEnabled: config.enabled,
      model: config.model,
      mode: config.enabled ? 'llm' : 'rule'
    });
  }

  if (req.method === 'GET' && route === 'summary') {
    const month = searchParams.get('month') || currentMonth();
    const s = tools.insights(month);
    return json(res, 200, {
      month,
      stats: {
        income: s.income,
        expense: s.expense,
        balance: s.balance,
        anomalyCount: s.anomalies.length,
        expenseChange: s.expenseChange,
        incomeChange: s.incomeChange
      },
      breakdown: s.breakdown,
      insights: s.suggestions,
      recentAnomalies: s.anomalies.slice(0, 5),
      recentBills: db.getBills({ month, limit: 6 }).list
    });
  }

  if (req.method === 'GET' && route === 'trend') {
    const months = Math.max(3, Math.min(Number(searchParams.get('months')) || 6, 12));
    return json(res, 200, tools.trendData(months));
  }

  if (req.method === 'GET' && route === 'bills') {
    const category = searchParams.get('category') || null;
    const month = searchParams.get('month') || null;
    const q = searchParams.get('q') || null;
    const limit = Number(searchParams.get('limit')) || 200;
    const offset = Number(searchParams.get('offset')) || 0;
    return json(res, 200, db.getBills({ category, month, q, limit, offset }));
  }

  if (req.method === 'GET' && route === 'categories') {
    return json(res, 200, db.getCategories());
  }

  if (req.method === 'POST' && route === 'categories') {
    const body = await readBody(req);
    if (!body.name) return json(res, 400, { error: '分类名称不能为空' });
    try {
      return json(res, 200, db.addCategory(body));
    } catch (e) {
      return json(res, 400, { error: '分类已存在或数据无效' });
    }
  }

  if (req.method === 'GET' && route === 'report') {
    const month = searchParams.get('month') || currentMonth();
    return json(res, 200, tools.insights(month));
  }

  if (req.method === 'GET' && route === 'anomalies') {
    const month = searchParams.get('month') || null;
    return json(res, 200, tools.anomalies(month));
  }

  if (req.method === 'POST' && route === 'bills/import') {
    const body = await readBody(req);
    const rows = parseCSV(body.csv || body.text || '');
    if (rows.length === 0) {
      return json(res, 400, { error: '未识别到有效数据，请检查 CSV 格式（日期,商户,金额,描述）' });
    }
    const inserted = rows.map((r) => db.addBill({ ...r, source: 'CSV导入' }));
    return json(res, 200, { inserted: inserted.length, bills: inserted });
  }

  if (req.method === 'POST' && route === 'agent') {
    const body = await readBody(req);
    if (!body.query) return json(res, 400, { error: '缺少 query' });
    return json(res, 200, await agent.run(body.query));
  }

  // /api/bills/:id
  const billMatch = route.match(/^bills\/(\d+)$/);
  if (billMatch) {
    const id = Number(billMatch[1]);
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const updated = db.updateBill(id, body);
      if (!updated) return json(res, 404, { error: '账单不存在' });
      return json(res, 200, updated);
    }
    if (req.method === 'DELETE') {
      return json(res, 200, { deleted: db.deleteBill(id) });
    }
  }

  const catMatch = route.match(/^categories\/(\d+)$/);
  if (catMatch) {
    const id = Number(catMatch[1]);
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const updated = db.updateCategory(id, body);
      if (!updated) return json(res, 404, { error: '分类不存在' });
      return json(res, 200, updated);
    }
    if (req.method === 'DELETE') {
      return json(res, 200, { deleted: db.deleteCategory(id) });
    }
  }

  return json(res, 404, { error: '接口不存在' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname, url.searchParams);
    } else {
      serveStatic(res, url.pathname);
    }
  } catch (e) {
    if (!res.headersSent) {
      json(res, 500, { error: e.message || '服务器内部错误' });
    } else {
      res.end();
    }
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 被占用，请设置 PORT 环境变量后重试，例如：PORT=3001 node server.js`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('==============================================');
  console.log('  AI 个人财务管家 Agent 已启动');
  console.log(`  本地地址: http://localhost:${PORT}`);
  for (const addr of lanAddresses()) {
    console.log(`  局域网:   http://${addr}:${PORT}`);
  }
  console.log('  按 Ctrl+C 停止服务');
  console.log('==============================================');
});
