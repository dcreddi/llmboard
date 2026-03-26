'use strict';

// Git branch SVG path (⎇ branch icon)
var GIT_BRANCH_PATH = 'M6 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm12 12a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 9v1a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3';

function renderGitBadge(el, data) {
  if (!data || !data.branch) return;
  el.textContent = '';

  // Branch SVG icon
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '11');
  svg.setAttribute('height', '11');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', '#3fb950');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', GIT_BRANCH_PATH);
  svg.appendChild(p);
  el.appendChild(svg);

  // Repo name (if different from folder name)
  if (data.repoName) {
    var repo = document.createElement('span');
    repo.style.color = 'var(--text-secondary)';
    repo.textContent = data.repoName;
    el.appendChild(repo);

    var sep = document.createElement('span');
    sep.style.opacity = '0.4';
    sep.textContent = '/';
    el.appendChild(sep);
  }

  var branch = document.createElement('span');
  branch.style.color = '#3fb950';
  branch.textContent = data.branch;
  el.appendChild(branch);

  // Dirty indicator
  if (data.dirty > 0) {
    var dot = document.createElement('span');
    dot.style.cssText = 'width:5px;height:5px;border-radius:50%;background:#d29922;display:inline-block;margin-left:2px';
    dot.title = data.dirty + ' uncommitted change' + (data.dirty !== 1 ? 's' : '');
    el.appendChild(dot);
  }

  el.style.display = 'inline-flex';
}

class ProjectsView {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.container = document.getElementById('view-projects');
    this._gitCache = new Map(); // root → { branch, repoName, dirty }
    dashboard.registerView('projects', this);
  }

  update(state) {
    var d = this.dashboard;
    var projects = state.projects || [];

    this.container.textContent = '';

    // Summary bar
    var summary = document.createElement('div');
    summary.className = 'network-summary';
    var summaryStats = [
      { value: String(projects.length), label: 'projects' },
      { value: String(projects.reduce(function(s, p) { return s + p.sessionCount; }, 0)), label: 'sessions' },
      { value: String(projects.reduce(function(s, p) { return s + p.totalToolCalls; }, 0)), label: 'tool calls' },
      { value: String(projects.filter(function(p) { return p.anomalyCount > 0; }).length), label: 'with alerts', highlight: true },
    ];
    for (var s = 0; s < summaryStats.length; s++) {
      var stat = summaryStats[s];
      var pill = document.createElement('div');
      pill.className = 'network-stat-pill';
      var val = document.createElement('span');
      val.className = 'network-stat-value';
      if (stat.highlight && parseInt(stat.value) > 0) val.style.color = 'var(--accent-amber)';
      val.textContent = stat.value;
      var lbl = document.createElement('span');
      lbl.className = 'network-stat-label';
      lbl.textContent = stat.label;
      pill.appendChild(val);
      pill.appendChild(lbl);
      summary.appendChild(pill);
    }
    this.container.appendChild(summary);

    // Empty state
    if (projects.length === 0) {
      var empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:60px 20px;color:var(--text-muted)';
      var emptyIcon = document.createElement('div');
      emptyIcon.style.fontSize = '48px';
      emptyIcon.style.marginBottom = '12px';
      emptyIcon.textContent = '📁';
      var emptyText = document.createElement('p');
      emptyText.textContent = 'No projects detected yet. Start a session in any project directory.';
      empty.appendChild(emptyIcon);
      empty.appendChild(emptyText);
      this.container.appendChild(empty);
      return;
    }

    // Project cards
    var grid = document.createElement('div');
    grid.className = 'project-grid';
    for (var i = 0; i < projects.length; i++) {
      grid.appendChild(this.buildProjectCard(projects[i], state));
    }
    this.container.appendChild(grid);
  }

  buildProjectCard(project, state) {
    var d = this.dashboard;
    var card = document.createElement('div');
    card.className = 'card project-card';

    // Header
    var header = document.createElement('div');
    header.className = 'project-header';

    var nameWrap = document.createElement('div');
    nameWrap.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap';

    // Repo/folder icon (SVG)
    var folderSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    folderSvg.setAttribute('viewBox', '0 0 24 24');
    folderSvg.setAttribute('width', '16');
    folderSvg.setAttribute('height', '16');
    folderSvg.setAttribute('fill', 'none');
    folderSvg.setAttribute('stroke', 'var(--accent-blue)');
    folderSvg.setAttribute('stroke-width', '2');
    folderSvg.setAttribute('stroke-linecap', 'round');
    folderSvg.setAttribute('stroke-linejoin', 'round');
    var folderPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    folderPath.setAttribute('d', 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z');
    folderSvg.appendChild(folderPath);

    var name = document.createElement('span');
    name.className = 'project-name';
    name.textContent = project.displayName;

    nameWrap.appendChild(folderSvg);
    nameWrap.appendChild(name);

    if (project.anomalyCount > 0) {
      var alertBadge = document.createElement('span');
      alertBadge.className = 'badge badge-error';
      alertBadge.style.fontSize = '10px';
      alertBadge.textContent = project.anomalyCount + ' alert' + (project.anomalyCount !== 1 ? 's' : '');
      nameWrap.appendChild(alertBadge);
    }

    // Git branch badge — fetched async, inserted inline
    var gitBadge = document.createElement('span');
    gitBadge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:11px;font-family:var(--font-mono);color:var(--text-muted);background:var(--bg-secondary);border:1px solid var(--border);border-radius:4px;padding:1px 6px;white-space:nowrap';
    gitBadge.style.display = 'none';
    nameWrap.appendChild(gitBadge);

    var self = this;
    var cached = this._gitCache.get(project.root);
    if (cached) {
      renderGitBadge(gitBadge, cached);
    } else {
      fetch('/api/git?cwd=' + encodeURIComponent(project.root))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          self._gitCache.set(project.root, data);
          renderGitBadge(gitBadge, data);
        })
        .catch(function() {});
    }

    header.appendChild(nameWrap);
    card.appendChild(header);

    // Path
    var pathEl = document.createElement('div');
    pathEl.className = 'project-path';
    pathEl.textContent = project.root;
    card.appendChild(pathEl);

    // Stats row
    var stats = document.createElement('div');
    stats.className = 'project-stats';

    var statItems = [
      { label: 'Sessions', value: project.sessionCount },
      { label: 'Tool calls', value: project.totalToolCalls },
      { label: 'Last active', value: d.formatTime(project.lastActive) },
    ];
    for (var s = 0; s < statItems.length; s++) {
      var statItem = document.createElement('div');
      statItem.className = 'project-stat';
      var statVal = document.createElement('span');
      statVal.className = 'project-stat-value';
      statVal.textContent = statItems[s].value;
      var statLbl = document.createElement('span');
      statLbl.className = 'project-stat-label';
      statLbl.textContent = statItems[s].label;
      statItem.appendChild(statVal);
      statItem.appendChild(statLbl);
      stats.appendChild(statItem);
    }
    card.appendChild(stats);

    // Top tools
    if (project.topTools && project.topTools.length > 0) {
      var toolsRow = document.createElement('div');
      toolsRow.className = 'domain-tools';
      var toolsLabel = document.createElement('span');
      toolsLabel.style.cssText = 'font-size:11px;color:var(--text-muted);margin-right:4px';
      toolsLabel.textContent = 'Top tools:';
      toolsRow.appendChild(toolsLabel);
      for (var t = 0; t < project.topTools.length; t++) {
        var toolPill = document.createElement('span');
        toolPill.className = 'tool-pill ' + d.getToolClass(project.topTools[t].name);
        toolPill.textContent = project.topTools[t].name + ' ×' + project.topTools[t].count;
        toolsRow.appendChild(toolPill);
      }
      card.appendChild(toolsRow);
    }

    // Sessions for this project
    var projectSessions = (state.sessions || []).filter(function(s) {
      return s.cwd && s.cwd.startsWith(project.root);
    });
    if (projectSessions.length > 0) {
      var sessToggle = document.createElement('button');
      sessToggle.className = 'domain-url-toggle';
      sessToggle.textContent = 'Show ' + projectSessions.length + ' session' + (projectSessions.length !== 1 ? 's' : '');

      var sessList = document.createElement('div');
      sessList.className = 'domain-url-list hidden';
      for (var i2 = 0; i2 < projectSessions.length; i2++) {
        var sessItem = document.createElement('div');
        sessItem.className = 'domain-url-item';
        var sessStatus = document.createElement('span');
        sessStatus.className = 'badge badge-' + (projectSessions[i2].status === 'active' ? 'active' : 'default');
        sessStatus.textContent = projectSessions[i2].status;
        var sessPath = document.createElement('span');
        sessPath.style.cssText = 'font-size:11px;color:var(--text-muted);margin-left:6px';
        sessPath.textContent = d.formatDuration(projectSessions[i2].startedAt, projectSessions[i2].endedAt);
        sessItem.appendChild(sessStatus);
        sessItem.appendChild(sessPath);
        sessList.appendChild(sessItem);
      }

      sessToggle.addEventListener('click', function() {
        var hidden = sessList.classList.toggle('hidden');
        sessToggle.textContent = hidden
          ? 'Show ' + projectSessions.length + ' session' + (projectSessions.length !== 1 ? 's' : '')
          : 'Hide sessions';
      });

      card.appendChild(sessToggle);
      card.appendChild(sessList);
    }

    return card;
  }
}

window.addEventListener('DOMContentLoaded', function() {
  var wait = setInterval(function() {
    if (window.dashboard) {
      clearInterval(wait);
      new ProjectsView(window.dashboard);
    }
  }, 50);
  setTimeout(function() { clearInterval(wait); }, 5000);
});
