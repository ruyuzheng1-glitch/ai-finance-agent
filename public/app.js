(function () {
  'use strict';

  const state = {
    categories: [],
    months: [],
    billPage: 1,
    billTotal: 0,
    modalAction: null,
    modalTarget: null
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function fmtMoney(n) {
    n = Number(n) || 0;
    const sign = n < 0 ? '-' : '';
    return sign + '¥' + Math.abs(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }

  function fmtSigned(n) {
    n = Number(n) || 0;
    const sign = n > 0 ? '+' : n < 0 ? '-' : '';
    return sign + '¥' + Math.abs(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }

  async function api(path, opts) {
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function categoryColor(name) {
    const c = state.categories.find((x) => x.name === name);
    return c ? c.color : '#64748b';
  }

  function switchPage(page) {
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + page));
    const titles = {
      dashboard: ['仪表盘', '你的财务全景概览'],
      bills: ['账单流水', '查看、筛选与分类你的每一笔交易'],
      chat: ['AI 助手', '用自然语言查询和分析你的财务'],
      report: ['月度报告', 'AI 生成的月度洞察与消费建议'],
      categories: ['分类管理', '维护自动分类规则']
    };
    $('#pageTitle').textContent = titles[page][0];
    $('#pageSub').textContent = titles[page][1];
  }

  // ---------- Dashboard ----------
  async function loadDashboard() {
    const summary = await api('/api/summary');
    const trend = await api('/api/trend?months=6');
    renderDashboard(summary, trend);
  }

  function renderDashboard(s, t) {
    $('#statExpense').textContent = fmtMoney(-s.stats.expense);
    $('#statIncome').textContent = fmtMoney(s.stats.income);
    $('#statBalance').textContent = fmtSigned(s.stats.balance);
    $('#statAnomaly').textContent = s.stats.anomalyCount;

    renderDelta($('#statExpenseDelta'), s, 'expense');
    renderDelta($('#statIncomeDelta'), s, 'income');

    $('#breakdownHint').textContent = s.month.replace('-', '年') + '月';

    const items = s.breakdown.map((b) => ({ label: b.name, value: b.total, color: categoryColor(b.name) }));
    Charts.donut($('#donutChart'), items, { size: 180, centerLabel: '总支出' });
    renderDonutLegend($('#donutLegend'), items, s.stats.expense);

    Charts.line($('#lineChart'), {
      labels: t.map((x) => x.label),
      series: [
        { name: '支出', color: '#e11d48', values: t.map((x) => x.expense) },
        { name: '收入', color: '#16a34a', values: t.map((x) => x.income) }
      ]
    });

    $('#insightList').innerHTML = '';
    s.insights.forEach((i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="ico">${i.icon}</span><span>${i.text}</span>`;
      $('#insightList').appendChild(li);
    });

    $('#recentList').innerHTML = '';
    s.recentBills.forEach((b) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="r-date">${b.date.slice(5)}</span>
        <span class="r-cat" style="background:${categoryColor(b.category)}"></span>
        <span class="r-merchant">${b.merchant}</span>
        <span class="r-amount ${b.amount < 0 ? 'neg' : 'pos'}">${fmtSigned(b.amount)}</span>`;
      $('#recentList').appendChild(li);
    });
  }

  function renderDelta(el, s, kind) {
    const key = kind === 'expense' ? 'expenseChange' : 'incomeChange';
    const change = s.stats[key] || 0;
    if (!change) {
      el.textContent = '与上月持平';
      el.className = 'stat-delta muted';
      return;
    }
    const up = change > 0;
    el.textContent = `${up ? '较上月 +' : '较上月 '}${Math.round(change)}%`;
    el.className = 'stat-delta ' + (up ? 'up' : 'down');
  }

  function renderDonutLegend(container, items, total) {
    container.innerHTML = '';
    const sorted = items.slice().sort((a, b) => b.value - a.value).slice(0, 6);
    sorted.forEach((i) => {
      const li = document.createElement('li');
      const pct = total ? Math.round((i.value / total) * 100) : 0;
      li.innerHTML = `
        <span class="dot" style="background:${i.color}"></span>
        <span class="name">${i.label}</span>
        <span class="val">¥${Math.round(i.value).toLocaleString('zh-CN')} · ${pct}%</span>`;
      container.appendChild(li);
    });
  }

  // ---------- Bills ----------
  async function loadBills() {
    const q = $('#billSearch').value.trim();
    const category = $('#billCategoryFilter').value;
    const month = $('#billMonthFilter').value;
    const params = new URLSearchParams({ limit: '30', offset: String((state.billPage - 1) * 30) });
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (month) params.set('month', month);
    const data = await api('/api/bills?' + params.toString());
    state.billTotal = data.total;
    renderBills(data.list);
  }

  function renderBills(list) {
    const body = $('#billTableBody');
    body.innerHTML = '';
    $('#billEmpty').hidden = list.length > 0;
    list.forEach((b) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${b.date}</td>
        <td>${b.merchant}</td>
        <td class="muted-cell">${b.description || '-'}</td>
        <td><span class="cat-pill"><span class="dot" style="background:${categoryColor(b.category)}"></span>${b.category}</span></td>
        <td class="num"><span class="amount ${b.amount < 0 ? 'neg' : 'pos'}">${fmtSigned(b.amount)}</span></td>
        <td class="actions">
          <button class="icon-btn" data-edit="${b.id}" title="修改分类">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </button>
          <button class="icon-btn" data-del="${b.id}" title="删除">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </td>`;
      body.appendChild(tr);
    });
    renderPager();
  }

  function renderPager() {
    const totalPages = Math.max(1, Math.ceil(state.billTotal / 30));
    $('#billPager').innerHTML = `
      <button id="prevPage" ${state.billPage <= 1 ? 'disabled' : ''}>上一页</button>
      <span>第 ${state.billPage} / ${totalPages} 页 · 共 ${state.billTotal} 笔</span>
      <button id="nextPage" ${state.billPage >= totalPages ? 'disabled' : ''}>下一页</button>`;
    $('#prevPage').onclick = () => { if (state.billPage > 1) { state.billPage--; loadBills(); } };
    $('#nextPage').onclick = () => { if (state.billPage < totalPages) { state.billPage++; loadBills(); } };
  }

  // ---------- Chat ----------
  function renderQuickChips() {
    const qs = [
      '我上个月外卖花了多少',
      '这个月一共花了多少',
      '有哪些异常消费',
      '这个月的消费趋势',
      '哪个分类花得最多',
      '给我这个月的洞察报告'
    ];
    $('#quickChips').innerHTML = '';
    qs.forEach((q) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = q;
      b.onclick = () => { $('#chatInput').value = q; sendChat(); };
      $('#quickChips').appendChild(b);
    });
  }

  function addMessage(role, text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    const avatar = role === 'user' ? '我' : 'AI';
    wrap.innerHTML = `<div class="avatar">${avatar}</div><div class="bubble"></div>`;
    wrap.querySelector('.bubble').textContent = text;
    $('#chatMessages').appendChild(wrap);
    $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
    return wrap;
  }

  const TRACE_LABEL = { think: '思考', tool: '工具调用', result: '观察结果', answer: '回答' };

  function renderTrace(trace) {
    const list = $('#traceList');
    list.innerHTML = '';
    trace.forEach((step) => {
      const div = document.createElement('div');
      div.className = 'trace-step ' + step.type;
      div.innerHTML = `
        <span class="t-dot"></span>
        <div class="t-type">${TRACE_LABEL[step.type] || step.type}</div>
        <div class="t-text">${step.text}</div>`;
      if (step.data && step.type !== 'answer') {
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(step.data, null, 2).slice(0, 600);
        div.appendChild(pre);
      }
      list.appendChild(div);
    });
    list.scrollTop = list.scrollHeight;
  }

  async function sendChat() {
    const input = $('#chatInput');
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    addMessage('user', q);
    const pending = addMessage('ai', '正在分析...');
    try {
      const res = await api('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });
      pending.querySelector('.bubble').textContent = res.answer;
      renderTrace(res.trace || []);
    } catch (e) {
      pending.querySelector('.bubble').textContent = '出错了：' + e.message;
      renderTrace([]);
    }
  }

  // ---------- Report ----------
  async function loadReport() {
    const month = $('#reportMonth').value;
    const r = await api('/api/report?month=' + month);
    $('#reportIncome').textContent = fmtMoney(r.income);
    $('#reportExpense').textContent = fmtMoney(-r.expense);
    $('#reportBalance').textContent = fmtSigned(r.balance);

    const items = r.breakdown.map((b) => ({ label: b.name, value: b.total, color: categoryColor(b.name) }));
    Charts.donut($('#reportDonut'), items, { size: 150, centerLabel: '支出' });
    renderDonutLegend($('#reportLegend'), items, r.expense);

    $('#reportSuggestions').innerHTML = '';
    r.suggestions.forEach((s) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="ico">${s.icon}</span><span>${s.text}</span>`;
      $('#reportSuggestions').appendChild(li);
    });

    $('#reportAnomalies').innerHTML = '';
    if (r.anomalies.length === 0) {
      $('#reportAnomalies').innerHTML = '<li>本月没有发现异常消费。</li>';
    } else {
      r.anomalies.forEach((a) => {
        const li = document.createElement('li');
        li.className = a.severity === 'high' ? 'severity-high' : '';
        li.innerHTML = `<div class="a-title">${a.title}</div><div class="a-desc">${a.description}</div>`;
        $('#reportAnomalies').appendChild(li);
      });
    }
  }

  // ---------- Categories ----------
  function renderCategories() {
    const body = $('#categoryTableBody');
    body.innerHTML = '';
    state.categories.forEach((c) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="cat-pill"><span class="dot" style="background:${c.color}"></span>${c.name}</span></td>
        <td>${c.type === 'income' ? '收入' : '支出'}</td>
        <td class="muted-cell">${(c.keywords || []).join('、') || '-'}</td>
        <td><span class="color-swatch" style="background:${c.color}"></span></td>
        <td class="actions">
          <button class="icon-btn" data-cat-edit="${c.id}" title="编辑">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </button>
          <button class="icon-btn" data-cat-del="${c.id}" title="删除">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </td>`;
      body.appendChild(tr);
    });
  }

  // ---------- Modal ----------
  function openModal(title, bodyHtml, onConfirm) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHtml;
    $('#modalBackdrop').hidden = false;
    state.modalAction = onConfirm;
  }

  function closeModal() {
    $('#modalBackdrop').hidden = true;
    state.modalAction = null;
  }

  function openEditBill(id) {
    api('/api/bills?limit=500').then((data) => {
      const bill = data.list.find((b) => String(b.id) === String(id));
      if (!bill) return;
      const cats = state.categories.filter((c) => c.type === (bill.amount < 0 ? 'expense' : 'income'));
      const options = cats.map((c) => `<option value="${c.name}" ${c.name === bill.category ? 'selected' : ''}>${c.name}</option>`).join('');
      openModal('修改分类', `
        <div class="field">
          <label>商户：${bill.merchant}（${fmtSigned(bill.amount)}）</label>
          <select id="modalCategory">${options}</select>
        </div>
        <div class="field"><label>备注</label><input id="modalNote" value="${bill.note || ''}" placeholder="可选" /></div>`,
        async () => {
          const category = $('#modalCategory').value;
          const note = $('#modalNote').value;
          await api('/api/bills/' + id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, note })
          });
          toast('已更新分类，Agent 已记住该商户');
          closeModal();
          loadBills();
          loadDashboard();
        });
    });
  }

  function openCategoryModal(cat) {
    const editing = !!cat;
    openModal(editing ? '编辑分类' : '新增分类', `
      <div class="field"><label>分类名称</label><input id="catName" value="${cat ? cat.name : ''}" placeholder="例如：宠物" /></div>
      <div class="field">
        <label>类型</label>
        <select id="catType">
          <option value="expense" ${!editing || cat.type === 'expense' ? 'selected' : ''}>支出</option>
          <option value="income" ${editing && cat.type === 'income' ? 'selected' : ''}>收入</option>
        </select>
      </div>
      <div class="field"><label>关键字（逗号分隔，用于自动分类）</label><input id="catKeywords" value="${cat ? (cat.keywords || []).join(',') : ''}" placeholder="猫,狗,宠物" /></div>
      <div class="field"><label>颜色</label><input id="catColor" type="color" value="${cat ? cat.color : '#64748b'}" style="height:40px;padding:2px" /></div>`,
      async () => {
        const payload = {
          name: $('#catName').value.trim(),
          type: $('#catType').value,
          keywords: $('#catKeywords').value.split(',').map((s) => s.trim()).filter(Boolean),
          color: $('#catColor').value
        };
        if (!payload.name) return toast('请填写分类名称');
        if (editing) {
          await api('/api/categories/' + cat.id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } else {
          await api('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
        toast('分类已保存');
        closeModal();
        await loadCategories();
        renderCategories();
        loadDashboard();
      });
  }

  // ---------- Loaders ----------
  async function loadCategories() {
    state.categories = await api('/api/categories');
    const filter = $('#billCategoryFilter');
    const cur = filter.value;
    filter.innerHTML = '<option value="">全部分类</option>' +
      state.categories.map((c) => `<option value="${c.name}">${c.name}</option>`).join('');
    filter.value = cur;
  }

  async function loadMonths() {
    const trend = await api('/api/trend?months=6');
    state.months = trend.map((t) => t.month).reverse();
    const billSel = $('#billMonthFilter');
    billSel.innerHTML = '<option value="">全部月份</option>' +
      state.months.map((m) => `<option value="${m}">${m.replace('-', '年')}月</option>`).join('');
    const reportSel = $('#reportMonth');
    reportSel.innerHTML = state.months.map((m) => `<option value="${m}">${m.replace('-', '年')}月</option>`).join('');
    if (state.months.length) reportSel.value = state.months[0];
  }

  async function loadMeta() {
    try {
      const m = await api('/api/meta');
      const badge = $('#modeBadge');
      if (m.llmEnabled) {
        badge.textContent = '大模型 · ' + m.model;
        badge.classList.add('llm');
      } else {
        badge.textContent = '规则模式 · 配置 Key 可启用大模型';
        badge.classList.remove('llm');
      }
    } catch (e) {
      // 忽略，保持默认文案
    }
  }

  // ---------- Events ----------
  function bindEvents() {
    $$('.nav-item').forEach((b) => b.onclick = () => switchPage(b.dataset.page));
    $$('[data-goto]').forEach((b) => b.onclick = () => switchPage(b.dataset.goto));

    let searchTimer;
    $('#billSearch').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.billPage = 1; loadBills(); }, 250);
    });
    $('#billCategoryFilter').onchange = () => { state.billPage = 1; loadBills(); };
    $('#billMonthFilter').onchange = () => { state.billPage = 1; loadBills(); };
    $('#reportMonth').onchange = loadReport;

    $('#billTableBody').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-edit]');
      const del = e.target.closest('[data-del]');
      if (edit) openEditBill(edit.dataset.edit);
      if (del && confirm('确定删除这条账单吗？')) {
        api('/api/bills/' + del.dataset.del, { method: 'DELETE' })
          .then(() => { toast('已删除'); loadBills(); loadDashboard(); });
      }
    });

    $('#categoryTableBody').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-cat-edit]');
      const del = e.target.closest('[data-cat-del]');
      if (edit) {
        const cat = state.categories.find((c) => String(c.id) === edit.dataset.catEdit);
        openCategoryModal(cat);
      }
      if (del && confirm('删除后，该分类下的账单会归入「其他」，确定删除吗？')) {
        api('/api/categories/' + del.dataset.catDel, { method: 'DELETE' })
          .then(() => { toast('已删除'); loadCategories().then(renderCategories); loadDashboard(); })
          .catch((err) => toast(err.message));
      }
    });

    $('#addCategoryBtn').onclick = () => openCategoryModal(null);

    $('#importBtn').onclick = () => $('#importFile').click();
    $('#importFile').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const res = await api('/api/bills/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv: text })
        });
        toast('成功导入 ' + res.inserted + ' 笔账单');
        state.billPage = 1;
        await loadBills();
        await loadDashboard();
      } catch (err) {
        toast(err.message);
      }
      e.target.value = '';
    };

    $('#chatSend').onclick = sendChat;
    $('#chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });
    $('#chatInput').addEventListener('input', () => {
      const el = $('#chatInput');
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    });

    $('#modalClose').onclick = closeModal;
    $('#modalCancel').onclick = closeModal;
    $('#modalConfirm').onclick = async () => {
      if (state.modalAction) {
        try { await state.modalAction(); } catch (e) { toast(e.message); }
      }
    };
    $('#modalBackdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
  }

  async function init() {
    renderQuickChips();
    bindEvents();
    await Promise.all([loadCategories(), loadMonths()]);
    loadMeta();
    renderCategories();
    await Promise.all([loadDashboard(), loadBills(), loadReport()]);
    switchPage('dashboard');
  }

  init().catch((e) => {
    console.error(e);
    toast('初始化失败：' + e.message);
  });
})();
