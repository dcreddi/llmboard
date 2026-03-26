'use strict';

class ToolsView {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.container = document.getElementById('view-tools');
    this.paused = false;
    this.filter = null;
    this.activeTab = 'activity'; // 'activity' | 'commands' | 'plugins'
    dashboard.registerView('tools', this);
  }

  update(state) {
    var self = this;
    this.container.textContent = '';

    // Sub-tab navigation
    var tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:16px';

    var tabDefs = [
      { id: 'activity', label: 'Activity Feed' },
      { id: 'plugins', label: 'Skills & Plugins' },
    ];

    for (var ti = 0; ti < tabDefs.length; ti++) {
      (function(tab) {
        var btn = document.createElement('button');
        btn.style.cssText = 'padding:8px 16px;background:none;border:none;border-bottom:2px solid ' +
          (self.activeTab === tab.id ? 'var(--accent-orange)' : 'transparent') +
          ';color:' + (self.activeTab === tab.id ? 'var(--accent-orange)' : 'var(--text-secondary)') +
          ';font-size:13px;font-weight:' + (self.activeTab === tab.id ? '600' : '400') +
          ';cursor:pointer;transition:color 0.15s;margin-bottom:-1px';
        btn.textContent = tab.label;
        btn.addEventListener('click', function() {
          self.activeTab = tab.id;
          self.update(state);
        });
        tabs.appendChild(btn);
      })(tabDefs[ti]);
    }
    this.container.appendChild(tabs);

    if (this.activeTab === 'activity') {
      this.renderActivityTab(state);
    } else {
      this.renderPluginsTab(state);
    }
  }

  renderActivityTab(state) {
    var self = this;
    var events = this.getFilteredEvents(state);
    var toolNames = this.getToolNames(state);

    var controls = document.createElement('div');
    controls.className = 'feed-controls';

    var allBtn = document.createElement('button');
    allBtn.className = 'feed-filter' + (!this.filter ? ' active' : '');
    allBtn.textContent = 'All Tools';
    allBtn.addEventListener('click', function() {
      self.filter = null;
      self.update(state);
    });
    controls.appendChild(allBtn);

    for (var t = 0; t < toolNames.length; t++) {
      (function(toolName) {
        var btn = document.createElement('button');
        btn.className = 'feed-filter' + (self.filter === toolName ? ' active' : '');
        btn.textContent = toolName;
        btn.addEventListener('click', function() {
          self.filter = toolName;
          self.update(state);
        });
        controls.appendChild(btn);
      })(toolNames[t]);
    }

    var pauseBtn = document.createElement('button');
    pauseBtn.className = 'feed-filter';
    pauseBtn.style.marginLeft = 'auto';
    pauseBtn.textContent = this.paused ? '\u25B6 Resume' : '\u23F8 Pause';
    pauseBtn.addEventListener('click', function() {
      self.paused = !self.paused;
      self.update(state);
    });
    controls.appendChild(pauseBtn);
    this.container.appendChild(controls);

    var feed = document.createElement('div');
    feed.className = 'feed-container';

    if (events.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color:var(--text-muted);text-align:center;padding:40px';
      empty.textContent = "No tool calls yet. Tool activity will appear here live.";
      feed.appendChild(empty);
    } else {
      for (var i = 0; i < events.length; i++) {
        feed.appendChild(this.buildFeedItem(events[i]));
      }
    }

    this.container.appendChild(feed);
  }

  renderPluginsTab(state) {
    var skillRegistry = state.skillRegistry || [];
    var plugins = skillRegistry.filter(function(e) { return e.type === 'skill' || e.type === 'mcp' || e.type === 'agent'; });

    if (plugins.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color:var(--text-muted);text-align:center;padding:40px';
      empty.textContent = 'No skills or plugins used yet.';
      this.container.appendChild(empty);
      return;
    }

    var regGrid = document.createElement('div');
    regGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px';
    for (var r = 0; r < plugins.length; r++) {
      regGrid.appendChild(this.buildRegistryCard(plugins[r]));
    }
    this.container.appendChild(regGrid);
  }

  buildRegistryCard(entry) {
    var d = this.dashboard;
    var card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'padding:12px;display:flex;flex-direction:column;gap:4px';

    var nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;align-items:center;gap:6px';

    var typeIcon = { skill: '⚡', mcp: '🔌', agent: '🤖' }[entry.type] || '🔧';
    var iconEl = document.createElement('span');
    iconEl.textContent = typeIcon;

    var nameEl = document.createElement('span');
    nameEl.style.cssText = 'font-weight:600;font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    nameEl.title = entry.displayName;
    nameEl.textContent = entry.displayName;

    var typeBadge = document.createElement('span');
    typeBadge.className = 'domain-category-badge';
    typeBadge.textContent = entry.type;

    nameRow.appendChild(iconEl);
    nameRow.appendChild(nameEl);
    nameRow.appendChild(typeBadge);
    card.appendChild(nameRow);

    var statsRow = document.createElement('div');
    statsRow.style.cssText = 'display:flex;gap:12px;font-size:12px;color:var(--text-muted)';

    var callsStat = document.createElement('span');
    callsStat.textContent = entry.callCount + ' calls';
    statsRow.appendChild(callsStat);

    if (entry.errorRate > 0) {
      var errStat = document.createElement('span');
      errStat.style.color = entry.errorRate > 20 ? 'var(--accent-red)' : 'var(--accent-amber)';
      errStat.textContent = entry.errorRate + '% errors';
      statsRow.appendChild(errStat);
    }

    var sessStat = document.createElement('span');
    sessStat.textContent = entry.sessionCount + ' sessions';
    statsRow.appendChild(sessStat);

    card.appendChild(statsRow);

    var lastRow = document.createElement('div');
    lastRow.style.cssText = 'font-size:11px;color:var(--text-muted)';
    lastRow.textContent = 'last ' + d.formatTime(entry.lastUsed);
    card.appendChild(lastRow);

    return card;
  }

  getFilteredEvents(state) {
    var events = (state.recentEvents || []).filter(function(e) {
      return e.hook_event_name === 'PreToolUse';
    });

    if (this.filter) {
      var f = this.filter;
      events = events.filter(function(e) { return e.tool_name === f; });
    }

    return events.slice(-200).reverse();
  }

  getToolNames(state) {
    var tools = {};
    var list = state.recentEvents || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].tool_name) tools[list[i].tool_name] = true;
    }
    return Object.keys(tools).sort();
  }

  buildFeedItem(event) {
    var d = this.dashboard;
    var tool = event.tool_name || 'Unknown';

    var item = document.createElement('div');
    item.className = 'feed-item';

    var time = document.createElement('span');
    time.className = 'feed-time';
    time.textContent = d.formatTime(event.dashboard_ts || (event._processed && event._processed.ts));
    item.appendChild(time);

    var icon = document.createElement('div');
    icon.className = 'feed-tool-icon ' + d.getToolClass(tool);
    icon.textContent = d.getToolLabel(tool);
    item.appendChild(icon);

    var content = document.createElement('div');
    content.className = 'feed-content';

    var nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;align-items:center;gap:8px';

    var toolName = document.createElement('span');
    toolName.className = 'feed-tool-name';
    toolName.textContent = tool;
    nameRow.appendChild(toolName);

    var sessionBadge = document.createElement('span');
    sessionBadge.className = 'feed-session-badge';
    sessionBadge.textContent = (event.session_id || '').slice(0, 8);
    nameRow.appendChild(sessionBadge);

    content.appendChild(nameRow);

    var summary = d.getEventSummary(event);
    if (summary) {
      var sumEl = document.createElement('div');
      sumEl.className = 'feed-summary';
      sumEl.textContent = summary;
      content.appendChild(sumEl);
    }

    item.appendChild(content);
    return item;
  }
}

window.addEventListener('DOMContentLoaded', function() {
  var wait = setInterval(function() {
    if (window.dashboard) {
      clearInterval(wait);
      new ToolsView(window.dashboard);
    }
  }, 50);
  setTimeout(function() { clearInterval(wait); }, 5000);
});
