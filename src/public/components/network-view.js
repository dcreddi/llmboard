'use strict';

class NetworkView {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.container = document.getElementById('view-network');
    this.filter = 'all';
    dashboard.registerView('network', this);
  }

  update(state) {
    var self = this;
    var domains = state.domains || [];
    var filtered = this.filter === 'all'
      ? domains
      : domains.filter(function(d) { return d.category === self.filter; });

    var external = domains.filter(function(d) { return d.category === 'external'; });
    var local = domains.filter(function(d) { return d.category === 'local'; });
    var anthropic = domains.filter(function(d) { return d.category === 'anthropic'; });

    this.container.textContent = '';

    // Summary bar
    var summary = document.createElement('div');
    summary.className = 'network-summary';

    var summaryStats = [
      { value: String(domains.length), label: 'unique domains' },
      { value: String(domains.reduce(function(s, d) { return s + d.count; }, 0)), label: 'total calls' },
      { value: String(external.length), label: 'external', highlight: external.length > 0 },
      { value: String(local.length), label: 'local' },
      { value: String(anthropic.length), label: 'anthropic' },
    ];
    for (var s = 0; s < summaryStats.length; s++) {
      var stat = summaryStats[s];
      var pill = document.createElement('div');
      pill.className = 'network-stat-pill';
      var val = document.createElement('span');
      val.className = 'network-stat-value';
      if (stat.highlight) val.style.color = 'var(--accent-amber)';
      val.textContent = stat.value;
      var lbl = document.createElement('span');
      lbl.className = 'network-stat-label';
      lbl.textContent = stat.label;
      pill.appendChild(val);
      pill.appendChild(lbl);
      summary.appendChild(pill);
    }
    this.container.appendChild(summary);

    // Filter bar
    var filterBar = document.createElement('div');
    filterBar.className = 'filter-bar';
    var filters = [
      { key: 'all', label: 'All (' + domains.length + ')' },
      { key: 'external', label: 'External (' + external.length + ')' },
      { key: 'local', label: 'Local (' + local.length + ')' },
      { key: 'anthropic', label: 'Anthropic (' + anthropic.length + ')' },
    ];
    for (var f = 0; f < filters.length; f++) {
      (function(fi) {
        var btn = document.createElement('button');
        btn.className = 'filter-btn' + (self.filter === fi.key ? ' active' : '');
        btn.textContent = fi.label;
        btn.addEventListener('click', function() {
          self.filter = fi.key;
          self.update(state);
        });
        filterBar.appendChild(btn);
      })(filters[f]);
    }
    this.container.appendChild(filterBar);

    // Empty state
    if (filtered.length === 0) {
      var empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:60px 20px;color:var(--text-muted)';
      var emptyIcon = document.createElement('div');
      emptyIcon.style.fontSize = '48px';
      emptyIcon.style.marginBottom = '12px';
      emptyIcon.textContent = '🌐';
      var emptyText = document.createElement('p');
      emptyText.textContent = domains.length === 0
        ? 'No web calls captured yet. WebFetch and browser tool calls will appear here.'
        : 'No domains match this filter.';
      empty.appendChild(emptyIcon);
      empty.appendChild(emptyText);
      this.container.appendChild(empty);
      return;
    }

    // Domain cards
    var grid = document.createElement('div');
    grid.className = 'domain-grid';
    for (var i = 0; i < filtered.length; i++) {
      grid.appendChild(this.buildDomainCard(filtered[i]));
    }
    this.container.appendChild(grid);

    // Privacy note
    var note = document.createElement('p');
    note.style.cssText = 'color:var(--text-muted);font-size:11px;margin-top:16px;text-align:center';
    note.textContent = 'Captures URLs from WebFetch, browser tools, and MCP servers. All data stays local.';
    this.container.appendChild(note);
  }

  buildDomainCard(domain) {
    var d = this.dashboard;
    var card = document.createElement('div');
    card.className = 'card domain-card';

    // Header row
    var header = document.createElement('div');
    header.className = 'domain-header';

    var nameWrap = document.createElement('div');
    nameWrap.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0';

    var categoryDot = document.createElement('span');
    categoryDot.className = 'domain-dot domain-dot-' + domain.category;

    var name = document.createElement('span');
    name.className = 'domain-name';
    name.textContent = domain.hostname;

    var isNew = domain.firstSeen && (Date.now() - new Date(domain.firstSeen).getTime()) < 60 * 60 * 1000;
    if (isNew) {
      var newBadge = document.createElement('span');
      newBadge.className = 'badge badge-active';
      newBadge.style.fontSize = '10px';
      newBadge.textContent = 'NEW';
      nameWrap.appendChild(categoryDot);
      nameWrap.appendChild(name);
      nameWrap.appendChild(newBadge);
    } else {
      nameWrap.appendChild(categoryDot);
      nameWrap.appendChild(name);
    }

    var countBadge = document.createElement('span');
    countBadge.className = 'domain-count';
    countBadge.textContent = domain.count + ' call' + (domain.count !== 1 ? 's' : '');

    header.appendChild(nameWrap);
    header.appendChild(countBadge);
    card.appendChild(header);

    // Category + sessions row
    var meta = document.createElement('div');
    meta.className = 'domain-meta';

    var catBadge = document.createElement('span');
    catBadge.className = 'domain-category-badge domain-cat-' + domain.category;
    catBadge.textContent = domain.category.charAt(0).toUpperCase() + domain.category.slice(1);

    meta.appendChild(catBadge);

    if (domain.owner) {
      var ownerBadge = document.createElement('span');
      ownerBadge.className = 'domain-owner-badge';
      ownerBadge.textContent = domain.owner;
      meta.appendChild(ownerBadge);
    }

    var sessions = document.createElement('span');
    sessions.style.cssText = 'font-size:12px;color:var(--text-muted)';
    sessions.textContent = domain.sessionCount + ' session' + (domain.sessionCount !== 1 ? 's' : '');

    var lastSeen = document.createElement('span');
    lastSeen.style.cssText = 'font-size:12px;color:var(--text-muted);margin-left:auto';
    lastSeen.textContent = 'last ' + d.formatTime(domain.lastSeen);

    meta.appendChild(catBadge);
    meta.appendChild(sessions);
    meta.appendChild(lastSeen);
    card.appendChild(meta);

    // Tools row
    if (domain.tools && domain.tools.length > 0) {
      var toolsRow = document.createElement('div');
      toolsRow.className = 'domain-tools';
      for (var t = 0; t < domain.tools.length; t++) {
        var toolPill = document.createElement('span');
        toolPill.className = 'tool-pill ' + d.getToolClass(domain.tools[t]);
        toolPill.textContent = domain.tools[t];
        toolsRow.appendChild(toolPill);
      }
      card.appendChild(toolsRow);
    }

    // Recent URLs (collapsed by default for long lists)
    if (domain.recentUrls && domain.recentUrls.length > 0) {
      var urlToggle = document.createElement('button');
      urlToggle.className = 'domain-url-toggle';
      urlToggle.textContent = 'Show ' + domain.recentUrls.length + ' recent URL' + (domain.recentUrls.length !== 1 ? 's' : '');

      var urlList = document.createElement('div');
      urlList.className = 'domain-url-list hidden';

      for (var u = 0; u < domain.recentUrls.length; u++) {
        var urlItem = document.createElement('div');
        urlItem.className = 'domain-url-item';
        var urlText = document.createElement('span');
        urlText.textContent = domain.recentUrls[u];
        urlItem.appendChild(urlText);
        urlList.appendChild(urlItem);
      }

      urlToggle.addEventListener('click', function() {
        var hidden = urlList.classList.toggle('hidden');
        urlToggle.textContent = hidden
          ? 'Show ' + domain.recentUrls.length + ' recent URL' + (domain.recentUrls.length !== 1 ? 's' : '')
          : 'Hide URLs';
      });

      card.appendChild(urlToggle);
      card.appendChild(urlList);
    }

    return card;
  }
}

window.addEventListener('DOMContentLoaded', function() {
  var wait = setInterval(function() {
    if (window.dashboard) {
      clearInterval(wait);
      new NetworkView(window.dashboard);
    }
  }, 50);
  setTimeout(function() { clearInterval(wait); }, 5000);
});
