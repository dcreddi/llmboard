'use strict';

class AnalyticsView {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.container = document.getElementById('view-analytics');
    dashboard.registerView('analytics', this);
  }

  update(state) {
    var stats = state.stats || {};
    var d = this.dashboard;
    var totalTokens = (stats.totalTokens && stats.totalTokens.input || 0) + (stats.totalTokens && stats.totalTokens.output || 0);

    var toolCounts = stats.toolCounts || {};
    var toolEntries = Object.keys(toolCounts).map(function(k){ return [k, toolCounts[k]]; });
    toolEntries.sort(function(a, b){ return b[1] - a[1]; });
    toolEntries = toolEntries.slice(0, 10);

    var toolColors = {
      Read: 'var(--accent-blue)', Write: 'var(--accent-green)',
      Edit: 'var(--accent-green)', Bash: 'var(--accent-amber)',
      Grep: 'var(--accent-purple)', Glob: 'var(--accent-purple)',
      Agent: 'var(--accent-amber)', Skill: 'var(--accent-cyan)'
    };

    this.container.textContent = '';

    var countersGrid = document.createElement('div');
    countersGrid.className = 'analytics-grid';

    var counterData = [
      { value: d.formatTokens(totalTokens), label: 'Total Tokens (est.)' },
      { value: d.formatTokens(stats.totalTokens && stats.totalTokens.input || 0), label: 'Input Tokens' },
      { value: d.formatTokens(stats.totalTokens && stats.totalTokens.output || 0), label: 'Output Tokens' },
      { value: String(stats.totalSessions || 0), label: 'Total Sessions' },
      { value: String(stats.totalEvents || 0), label: 'Total Events' }
    ];

    for (var c = 0; c < counterData.length; c++) {
      var card = document.createElement('div');
      card.className = 'card analytics-counter';
      var cv = document.createElement('div');
      cv.className = 'counter-value';
      cv.textContent = counterData[c].value;
      var cl = document.createElement('div');
      cl.className = 'counter-label';
      cl.textContent = counterData[c].label;
      card.appendChild(cv);
      card.appendChild(cl);
      countersGrid.appendChild(card);
    }
    this.container.appendChild(countersGrid);

    var chartsRow = document.createElement('div');
    chartsRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px';

    var tokensChartWrap = document.createElement('div');
    tokensChartWrap.className = 'chart-container';
    var tokensCard = document.createElement('div');
    tokensCard.className = 'card';
    var tokensTitle = document.createElement('div');
    tokensTitle.className = 'chart-title';
    tokensTitle.textContent = 'Tokens Over Time';
    var tokensTarget = document.createElement('div');
    tokensCard.appendChild(tokensTitle);
    tokensCard.appendChild(tokensTarget);
    tokensChartWrap.appendChild(tokensCard);
    chartsRow.appendChild(tokensChartWrap);

    var donutWrap = document.createElement('div');
    donutWrap.className = 'chart-container';
    var donutCard = document.createElement('div');
    donutCard.className = 'card';
    var donutTitle = document.createElement('div');
    donutTitle.className = 'chart-title';
    donutTitle.textContent = 'Tool Usage Distribution';
    var donutTarget = document.createElement('div');
    donutTarget.style.cssText = 'display:flex;justify-content:center';
    donutCard.appendChild(donutTitle);
    donutCard.appendChild(donutTarget);
    donutWrap.appendChild(donutCard);
    chartsRow.appendChild(donutWrap);

    this.container.appendChild(chartsRow);

    var barWrap = document.createElement('div');
    barWrap.className = 'chart-container';
    var barCard = document.createElement('div');
    barCard.className = 'card';
    var barTitle = document.createElement('div');
    barTitle.className = 'chart-title';
    barTitle.textContent = 'Tool Calls by Type';
    var barTarget = document.createElement('div');
    barCard.appendChild(barTitle);
    barCard.appendChild(barTarget);
    barWrap.appendChild(barCard);
    this.container.appendChild(barWrap);

    var tableCard = document.createElement('div');
    tableCard.className = 'card';
    tableCard.style.marginTop = '16px';
    var tableTitle = document.createElement('div');
    tableTitle.className = 'chart-title';
    tableTitle.textContent = 'Daily Breakdown';
    tableCard.appendChild(tableTitle);

    var table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px';

    var thead = document.createElement('thead');
    var headerRow = document.createElement('tr');
    headerRow.style.borderBottom = '1px solid var(--border)';
    var headers = ['Date', 'Events', 'Sessions', 'Tokens'];
    for (var h = 0; h < headers.length; h++) {
      var th = document.createElement('th');
      th.style.cssText = 'padding:8px;color:var(--text-secondary);font-weight:500';
      th.style.textAlign = h === 0 ? 'left' : 'right';
      th.textContent = headers[h];
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    var daily = (stats.daily || []).slice(0, 14);

    if (daily.length === 0) {
      var emptyRow = document.createElement('tr');
      var emptyCell = document.createElement('td');
      emptyCell.colSpan = 5;
      emptyCell.style.cssText = 'padding:16px;text-align:center;color:var(--text-muted)';
      emptyCell.textContent = 'No daily data yet';
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    } else {
      for (var r = 0; r < daily.length; r++) {
        var day = daily[r];
        var row = document.createElement('tr');
        row.style.borderBottom = '1px solid var(--border-light)';
        var dayTokens = (day.tokens && day.tokens.input || 0) + (day.tokens && day.tokens.output || 0);

        var cells = [
          { text: day.date, align: 'left' },
          { text: String(day.events), align: 'right' },
          { text: String(day.sessions), align: 'right' },
          { text: d.formatTokens(dayTokens), align: 'right' }
        ];
        for (var ci = 0; ci < cells.length; ci++) {
          var td = document.createElement('td');
          td.style.cssText = 'padding:8px;font-family:var(--font-mono);text-align:' + cells[ci].align;
          if (cells[ci].color) td.style.color = cells[ci].color;
          td.textContent = cells[ci].text;
          row.appendChild(td);
        }
        tbody.appendChild(row);
      }
    }
    table.appendChild(tbody);
    tableCard.appendChild(table);
    this.container.appendChild(tableCard);

    var note = document.createElement('p');
    note.style.cssText = 'color:var(--text-muted);font-size:11px;margin-top:16px;text-align:center';
    note.textContent = 'Token counts are estimates based on character length (~4 chars/token). Actual usage may vary.';
    this.container.appendChild(note);

    this.renderCharts(stats, toolEntries, toolColors, tokensTarget, donutTarget, barTarget);
  }

  renderCharts(stats, toolEntries, toolColors, tokensTarget, donutTarget, barTarget) {
    var daily = (stats.daily || []).slice(0, 14).reverse();
    var lineData = daily.map(function(day) {
      return {
        label: day.date.slice(5),
        value: (day.tokens && day.tokens.input || 0) + (day.tokens && day.tokens.output || 0)
      };
    });
    new LineChart(tokensTarget, { width: 500, height: 220 }).render(lineData);

    var donutData = toolEntries.map(function(entry) {
      return {
        label: entry[0],
        value: entry[1],
        color: toolColors[entry[0]] || 'var(--text-muted)'
      };
    });
    new DonutChart(donutTarget, { size: 180, thickness: 20 }).render(donutData);

    var barData = toolEntries.map(function(entry) {
      return {
        label: entry[0],
        value: entry[1],
        color: toolColors[entry[0]] || 'var(--accent-blue)'
      };
    });
    new BarChart(barTarget, { height: 220 }).render(barData);
  }
}

window.addEventListener('DOMContentLoaded', function() {
  var wait = setInterval(function() {
    if (window.dashboard) {
      clearInterval(wait);
      new AnalyticsView(window.dashboard);
    }
  }, 50);
  setTimeout(function() { clearInterval(wait); }, 5000);
});
