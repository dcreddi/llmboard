'use strict';

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatChartVal(v) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return Math.round(v).toString();
}

class BarChart {
  constructor(container, options) {
    this.container = container;
    this.width = (options && options.width) || 600;
    this.height = (options && options.height) || 250;
    this.pad = { top: 20, right: 20, bottom: 40, left: 60 };
  }

  render(data) {
    if (!data || data.length === 0) {
      this.container.textContent = 'No data yet';
      this.container.style.cssText = 'color:var(--text-muted);text-align:center;padding:40px';
      return;
    }

    var w = this.width, h = this.height, p = this.pad;
    var plotW = w - p.left - p.right;
    var plotH = h - p.top - p.bottom;
    var maxVal = Math.max.apply(null, data.map(function(d){ return d.value; }).concat([1]));
    var barW = Math.min(plotW / data.length * 0.7, 40);
    var gap = plotW / data.length;

    var parts = [];
    parts.push('<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">');

    for (var i = 0; i <= 4; i++) {
      var y = p.top + (plotH / 4) * i;
      var val = maxVal - (maxVal / 4) * i;
      parts.push('<line x1="' + p.left + '" y1="' + y + '" x2="' + (w - p.right) + '" y2="' + y + '" stroke="var(--border-light)" stroke-width="1"/>');
      parts.push('<text x="' + (p.left - 8) + '" y="' + (y + 4) + '" text-anchor="end" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">' + formatChartVal(val) + '</text>');
    }

    for (var j = 0; j < data.length; j++) {
      var d = data[j];
      var x = p.left + j * gap + (gap - barW) / 2;
      var barH = (d.value / maxVal) * plotH;
      var by = p.top + plotH - barH;
      var color = d.color || 'var(--accent-blue)';
      parts.push('<rect x="' + x + '" y="' + by + '" width="' + barW + '" height="' + barH + '" rx="3" fill="' + color + '" opacity="0.85"/>');
      parts.push('<text x="' + (x + barW / 2) + '" y="' + (h - p.bottom + 16) + '" text-anchor="middle" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">' + escapeXml(d.label) + '</text>');
    }

    parts.push('</svg>');
    this.container.innerHTML = parts.join('');
  }
}

class LineChart {
  constructor(container, options) {
    this.container = container;
    this.width = (options && options.width) || 600;
    this.height = (options && options.height) || 250;
    this.pad = { top: 20, right: 20, bottom: 40, left: 60 };
  }

  render(data) {
    if (!data || data.length === 0) {
      this.container.textContent = 'No data yet';
      this.container.style.cssText = 'color:var(--text-muted);text-align:center;padding:40px';
      return;
    }

    var w = this.width, h = this.height, p = this.pad;
    var plotW = w - p.left - p.right;
    var plotH = h - p.top - p.bottom;
    var maxVal = Math.max.apply(null, data.map(function(d){ return d.value; }).concat([1]));

    var parts = [];
    parts.push('<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">');

    for (var i = 0; i <= 4; i++) {
      var gy = p.top + (plotH / 4) * i;
      var gval = maxVal - (maxVal / 4) * i;
      parts.push('<line x1="' + p.left + '" y1="' + gy + '" x2="' + (w - p.right) + '" y2="' + gy + '" stroke="var(--border-light)" stroke-width="1"/>');
      parts.push('<text x="' + (p.left - 8) + '" y="' + (gy + 4) + '" text-anchor="end" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">' + formatChartVal(gval) + '</text>');
    }

    var points = [];
    var divisor = Math.max(data.length - 1, 1);
    for (var j = 0; j < data.length; j++) {
      points.push({
        x: p.left + (j / divisor) * plotW,
        y: p.top + plotH - (data[j].value / maxVal) * plotH
      });
    }

    parts.push('<defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">');
    parts.push('<stop offset="0%" stop-color="var(--accent-blue)" stop-opacity="0.3"/>');
    parts.push('<stop offset="100%" stop-color="var(--accent-blue)" stop-opacity="0.02"/>');
    parts.push('</linearGradient></defs>');

    var pathD = points.map(function(pt, idx){ return (idx === 0 ? 'M' : 'L') + pt.x + ',' + pt.y; }).join(' ');
    var areaD = pathD + ' L' + points[points.length-1].x + ',' + (p.top + plotH) + ' L' + points[0].x + ',' + (p.top + plotH) + ' Z';
    parts.push('<path d="' + areaD + '" fill="url(#areaGrad)"/>');
    parts.push('<path d="' + pathD + '" fill="none" stroke="var(--accent-blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');

    for (var k = 0; k < points.length; k++) {
      parts.push('<circle cx="' + points[k].x + '" cy="' + points[k].y + '" r="3" fill="var(--accent-blue)"/>');
    }

    var step = Math.ceil(data.length / 8);
    for (var m = 0; m < data.length; m++) {
      if (m % step !== 0 && m !== data.length - 1) continue;
      var lx = p.left + (m / divisor) * plotW;
      parts.push('<text x="' + lx + '" y="' + (h - p.bottom + 16) + '" text-anchor="middle" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">' + escapeXml(data[m].label) + '</text>');
    }

    parts.push('</svg>');
    this.container.innerHTML = parts.join('');
  }
}

class DonutChart {
  constructor(container, options) {
    this.container = container;
    this.size = (options && options.size) || 200;
    this.thickness = (options && options.thickness) || 24;
  }

  render(data) {
    if (!data || data.length === 0) {
      this.container.textContent = 'No data yet';
      this.container.style.cssText = 'color:var(--text-muted);text-align:center;padding:40px';
      return;
    }

    var s = this.size;
    var cx = s / 2, cy = s / 2;
    var r = (s - this.thickness) / 2 - 4;
    var total = 0;
    for (var i = 0; i < data.length; i++) total += data[i].value;
    if (total === 0) return;

    var parts = [];
    parts.push('<svg viewBox="0 0 ' + s + ' ' + s + '" xmlns="http://www.w3.org/2000/svg">');

    var angle = -90;
    for (var j = 0; j < data.length; j++) {
      var d = data[j];
      var pct = d.value / total;
      var sweep = pct * 360;
      // Avoid rendering a full 360 arc (SVG can't draw it as a single arc)
      if (sweep >= 359.99) sweep = 359.99;
      var startRad = (angle * Math.PI) / 180;
      var endRad = ((angle + sweep) * Math.PI) / 180;
      var x1 = cx + r * Math.cos(startRad);
      var y1 = cy + r * Math.sin(startRad);
      var x2 = cx + r * Math.cos(endRad);
      var y2 = cy + r * Math.sin(endRad);
      var largeArc = sweep > 180 ? 1 : 0;
      parts.push('<path d="M' + x1 + ',' + y1 + ' A' + r + ',' + r + ' 0 ' + largeArc + ',1 ' + x2 + ',' + y2 + '" fill="none" stroke="' + d.color + '" stroke-width="' + this.thickness + '" stroke-linecap="round" opacity="0.85"/>');
      angle += sweep;
    }

    parts.push('<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" fill="var(--text-primary)" font-size="18" font-weight="700" font-family="var(--font-mono)">' + formatChartVal(total) + '</text>');
    parts.push('<text x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle" fill="var(--text-muted)" font-size="10">total</text>');
    parts.push('</svg>');

    var wrapper = document.createElement('div');
    var svgDiv = document.createElement('div');
    svgDiv.innerHTML = parts.join('');
    wrapper.appendChild(svgDiv);

    var legend = document.createElement('div');
    legend.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;justify-content:center';
    for (var k = 0; k < data.length; k++) {
      var item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:12px';
      var dot = document.createElement('span');
      dot.style.cssText = 'width:10px;height:10px;border-radius:50%;display:inline-block;background:' + data[k].color;
      var label = document.createElement('span');
      label.style.color = 'var(--text-secondary)';
      label.textContent = data[k].label;
      var pctSpan = document.createElement('span');
      pctSpan.style.cssText = 'color:var(--text-muted);font-family:var(--font-mono)';
      pctSpan.textContent = ((data[k].value / total) * 100).toFixed(1) + '%';
      item.appendChild(dot);
      item.appendChild(label);
      item.appendChild(pctSpan);
      legend.appendChild(item);
    }
    wrapper.appendChild(legend);

    this.container.textContent = '';
    this.container.appendChild(wrapper);
  }
}

window.BarChart = BarChart;
window.LineChart = LineChart;
window.DonutChart = DonutChart;
