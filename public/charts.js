(function () {
  'use strict';

  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function fmtShort(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1) + 'w';
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(Math.round(n));
  }

  function donut(container, items, opts) {
    container.innerHTML = '';
    const size = (opts && opts.size) || 180;
    const valid = (items || []).filter((i) => Number(i.value) > 0);
    const total = valid.reduce((s, i) => s + Number(i.value), 0);
    const svg = svgEl('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` }, container);

    if (total <= 0) {
      svgEl('text', { x: size / 2, y: size / 2, 'text-anchor': 'middle', fill: '#9aa1ad', 'font-size': '13' }, svg).textContent = '暂无支出';
      return;
    }

    const r = size / 2 - 14;
    const cx = size / 2;
    const cy = size / 2;
    const gap = valid.length > 1 ? 1.2 : 0;
    let cumulative = 0;

    const group = svgEl('g', {}, svg);
    valid.forEach((item) => {
      const pct = (Number(item.value) / total) * 100;
      const start = cumulative;
      const segPct = Math.max(0, pct - gap);
      const c = svgEl('circle', {
        cx, cy, r,
        fill: 'none',
        stroke: item.color || '#64748b',
        'stroke-width': 22,
        'pathLength': '100',
        'stroke-dasharray': `${segPct} ${100 - segPct}`,
        'stroke-dashoffset': String(25 - start - gap / 2)
      }, group);
      c.style.transition = 'stroke-dasharray 0.4s ease';
      cumulative += pct;
    });

    svgEl('text', {
      x: cx, y: cy - 4, 'text-anchor': 'middle', fill: '#9aa1ad', 'font-size': '11'
    }, svg).textContent = opts && opts.centerLabel ? opts.centerLabel : '总支出';
    svgEl('text', {
      x: cx, y: cy + 17, 'text-anchor': 'middle', fill: '#1a2233', 'font-size': '18', 'font-weight': '700'
    }, svg).textContent = '¥' + Math.round(total).toLocaleString('zh-CN');
  }

  function line(container, data) {
    container.innerHTML = '';
    const labels = data.labels || [];
    const series = data.series || [];
    const w = 600;
    const h = 280;
    const padL = 52;
    const padR = 18;
    const padT = 18;
    const padB = 34;
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: 'auto', preserveAspectRatio: 'xMidYMid meet' }, container);

    const all = [];
    series.forEach((s) => (s.values || []).forEach((v) => all.push(Number(v) || 0)));
    const max = Math.max(1000, ...all) * 1.15;

    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const x = (i) => padL + (labels.length <= 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
    const y = (v) => padT + plotH - (v / max) * plotH;

    // grid + y labels
    for (let g = 0; g <= 4; g++) {
      const gy = padT + (plotH / 4) * g;
      svgEl('line', { x1: padL, y1: gy, x2: w - padR, y2: gy, stroke: '#eef1f4', 'stroke-width': 1 }, svg);
      const val = max - (max / 4) * g;
      svgEl('text', { x: padL - 8, y: gy + 4, 'text-anchor': 'end', fill: '#9aa1ad', 'font-size': '10' }, svg).textContent = fmtShort(val);
    }

    // x labels
    labels.forEach((lb, i) => {
      svgEl('text', { x: x(i), y: h - 12, 'text-anchor': 'middle', fill: '#9aa1ad', 'font-size': '11' }, svg).textContent = lb;
    });

    series.forEach((s) => {
      const vals = s.values || [];
      const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      if (pts) {
        svgEl('polyline', { points: pts, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
        vals.forEach((v, i) => {
          const c = svgEl('circle', { cx: x(i), cy: y(v), r: 3.5, fill: '#fff', stroke: s.color, 'stroke-width': 2 }, svg);
          c.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'title')).textContent = `${labels[i]}: ¥${Math.round(v).toLocaleString('zh-CN')}`;
        });
      }
    });
  }

  window.Charts = { donut, line };
})();
