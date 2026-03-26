'use strict';

// Icon paths per agent type — SVG path data only
var AGENT_ICONS = {
  Explore: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  Plan:    'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  general: 'M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 12c-6 0-9 2.7-9 4v1h18v-1c0-1.3-3-4-9-4z',
};

var TYPE_COLORS = {
  Explore: '#58a6ff',
  Plan:    '#bc8cff',
  general: '#d29922',
};

class AgentsView {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.container = document.getElementById('view-agents');
    dashboard.registerView('agents', this);
  }

  update(state) {
    var sessions = state.sessions || [];
    var allAgents = [];

    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      if (s.agents && s.agents.length > 0) {
        for (var j = 0; j < s.agents.length; j++) {
          allAgents.push(Object.assign({}, s.agents[j], { session: s }));
        }
      }
    }

    allAgents.sort(function(a, b) {
      if (a.status === 'running' && b.status !== 'running') return -1;
      if (b.status === 'running' && a.status !== 'running') return 1;
      return new Date(b.startedAt) - new Date(a.startedAt);
    });

    this.container.textContent = '';

    if (allAgents.length === 0) {
      var empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:60px;color:var(--text-muted)';
      var emptyIcon = document.createElement('div');
      emptyIcon.style.cssText = 'font-size:40px;margin-bottom:12px';
      emptyIcon.textContent = '🤖';
      var emptyTitle = document.createElement('p');
      emptyTitle.style.cssText = 'font-size:16px;font-weight:600;color:var(--text-primary)';
      emptyTitle.textContent = 'No agents detected yet';
      var emptyDesc = document.createElement('p');
      emptyDesc.style.cssText = 'margin-top:8px;font-size:13px';
      emptyDesc.textContent = 'Subagent activity appears here when LLMBoard detects spawned agents.';
      empty.appendChild(emptyIcon);
      empty.appendChild(emptyTitle);
      empty.appendChild(emptyDesc);
      this.container.appendChild(empty);
      return;
    }

    var running   = allAgents.filter(function(a){ return a.status === 'running'; });
    var completed = allAgents.filter(function(a){ return a.status === 'completed'; });
    var failed    = allAgents.filter(function(a){ return a.status === 'failed'; });

    // Summary pills
    var summary = document.createElement('div');
    summary.className = 'network-summary';
    summary.style.marginBottom = '20px';
    [
      { value: String(allAgents.length), label: 'total agents' },
      { value: String(running.length),   label: 'running',   color: running.length > 0 ? 'var(--accent-amber)' : null },
      { value: String(completed.length), label: 'completed', color: 'var(--accent-green)' },
      { value: String(failed.length),    label: 'failed',    color: failed.length > 0 ? 'var(--accent-red)' : null },
    ].forEach(function(stat) {
      var pill = document.createElement('div');
      pill.className = 'network-stat-pill';
      var val = document.createElement('span');
      val.className = 'network-stat-value';
      if (stat.color) val.style.color = stat.color;
      val.textContent = stat.value;
      var lbl = document.createElement('span');
      lbl.className = 'network-stat-label';
      lbl.textContent = stat.label;
      pill.appendChild(val);
      pill.appendChild(lbl);
      summary.appendChild(pill);
    });
    this.container.appendChild(summary);

    // Parallel timeline (running agents only)
    if (running.length > 1) {
      this.container.appendChild(this.buildTimeline(running));
    }

    // Agent cards
    var grid = document.createElement('div');
    grid.className = 'card-grid';
    for (var k = 0; k < allAgents.length; k++) {
      grid.appendChild(this.buildAgentCard(allAgents[k]));
    }
    this.container.appendChild(grid);
  }

  buildTimeline(running) {
    var d = this.dashboard;
    var now = Date.now();
    var earliest = running.reduce(function(min, a) {
      return Math.min(min, new Date(a.startedAt).getTime());
    }, now);
    var span = now - earliest || 1;

    var section = document.createElement('div');
    section.style.cssText = 'margin-bottom:20px';

    var title = document.createElement('div');
    title.style.cssText = 'font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:8px';
    title.textContent = 'Parallel Execution';
    section.appendChild(title);

    for (var i = 0; i < running.length; i++) {
      var agent = running[i];
      var start = new Date(agent.startedAt).getTime();
      var left = ((start - earliest) / span * 100).toFixed(1);
      var width = ((now - start) / span * 100).toFixed(1);
      var color = TYPE_COLORS[agent.agentType] || TYPE_COLORS.general;

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';

      var label = document.createElement('span');
      label.style.cssText = 'font-size:11px;color:var(--text-muted);width:52px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      label.textContent = agent.agentType || 'Agent';

      var track = document.createElement('div');
      track.style.cssText = 'flex:1;height:6px;background:var(--bg-secondary);border-radius:3px;position:relative;overflow:hidden';

      var bar = document.createElement('div');
      bar.style.cssText = 'position:absolute;top:0;left:' + left + '%;width:' + width + '%;height:100%;background:' + color + ';border-radius:3px;opacity:0.8';

      track.appendChild(bar);
      row.appendChild(label);
      row.appendChild(track);

      var dur = document.createElement('span');
      dur.style.cssText = 'font-size:11px;font-family:var(--font-mono);color:var(--text-muted);width:40px;text-align:right;flex-shrink:0';
      dur.textContent = d.formatDuration(agent.startedAt, null);
      row.appendChild(dur);

      section.appendChild(row);
    }

    return section;
  }

  buildAgentCard(agent) {
    var d = this.dashboard;
    var isRunning = agent.status === 'running';
    var color = TYPE_COLORS[agent.agentType] || TYPE_COLORS.general;
    var iconPath = AGENT_ICONS[agent.agentType] || AGENT_ICONS.general;

    var card = document.createElement('div');
    card.className = 'card agent-card' + (isRunning ? ' running' : '');
    card.style.cssText = 'border-left:3px solid ' + color + ';padding-left:14px';

    // Header
    var header = document.createElement('div');
    header.className = 'card-header';

    var leftDiv = document.createElement('div');
    leftDiv.style.cssText = 'display:flex;align-items:center;gap:8px';

    // Type icon
    var typeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    typeIcon.setAttribute('viewBox', '0 0 24 24');
    typeIcon.setAttribute('width', '14');
    typeIcon.setAttribute('height', '14');
    typeIcon.setAttribute('fill', 'none');
    typeIcon.setAttribute('stroke', color);
    typeIcon.setAttribute('stroke-width', '2');
    typeIcon.setAttribute('stroke-linecap', 'round');
    typeIcon.setAttribute('stroke-linejoin', 'round');
    // Render paths for the icon
    iconPath.split(' M').forEach(function(seg, idx) {
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', (idx === 0 ? seg : 'M' + seg));
      typeIcon.appendChild(p);
    });
    leftDiv.appendChild(typeIcon);

    var typeLabel = document.createElement('span');
    typeLabel.style.cssText = 'font-size:12px;font-weight:600;color:' + color;
    typeLabel.textContent = agent.agentType || 'Agent';
    leftDiv.appendChild(typeLabel);

    // Status pill
    var statusColors = { running: '#d29922', completed: '#3fb950', failed: '#f85149' };
    var statusDot = document.createElement('span');
    statusDot.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:11px;color:' + (statusColors[agent.status] || 'var(--text-muted)');
    if (isRunning) {
      var dot = document.createElement('span');
      dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:' + statusColors.running + ';animation:pulse-dot 1.2s ease-in-out infinite';
      statusDot.appendChild(dot);
    }
    statusDot.appendChild(document.createTextNode(agent.status));
    leftDiv.appendChild(statusDot);

    header.appendChild(leftDiv);

    var dur = document.createElement('span');
    dur.style.cssText = 'font-family:var(--font-mono);font-size:12px;color:var(--text-muted)';
    dur.textContent = d.formatDuration(agent.startedAt, agent.endedAt || null);
    header.appendChild(dur);

    card.appendChild(header);

    // Task description
    var task = document.createElement('div');
    task.style.cssText = 'margin-top:10px;font-size:13px;color:var(--text-secondary);line-height:1.4';
    task.textContent = agent.task || 'No task description';
    card.appendChild(task);

    // Meta row: session path + tool count
    var meta = document.createElement('div');
    meta.style.cssText = 'margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:8px';

    var path = document.createElement('span');
    path.style.cssText = 'font-size:11px;color:var(--text-muted);font-family:var(--font-mono);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    path.textContent = d.formatPath(agent.session && agent.session.cwd);
    meta.appendChild(path);

    if (agent.toolCallCount > 0) {
      var toolCount = document.createElement('span');
      toolCount.style.cssText = 'font-size:11px;color:var(--text-muted);white-space:nowrap;flex-shrink:0';
      toolCount.textContent = agent.toolCallCount + ' tool call' + (agent.toolCallCount !== 1 ? 's' : '');
      meta.appendChild(toolCount);
    }

    card.appendChild(meta);

    return card;
  }
}

window.addEventListener('DOMContentLoaded', function() {
  var wait = setInterval(function() {
    if (window.dashboard) {
      clearInterval(wait);
      new AgentsView(window.dashboard);
    }
  }, 50);
  setTimeout(function() { clearInterval(wait); }, 5000);
});
