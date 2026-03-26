'use strict';

class SessionsView {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.container = document.getElementById('view-sessions');
    this.expandedSession = null;
    this.timers = new Map();
    this._fetchControllers = new Map(); // cancel in-flight fetches on re-render
    dashboard.registerView('sessions', this);
  }

  update(state) {
    var sessions = state.sessions || [];

    this.timers.forEach(function(t) { clearInterval(t); });
    this.timers.clear();
    this._fetchControllers.forEach(function(c) { c.abort(); });
    this._fetchControllers.clear();

    if (sessions.length === 0) {
      this.container.textContent = '';
      return;
    }

    this.container.textContent = '';
    var list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px';

    for (var i = 0; i < sessions.length; i++) {
      list.appendChild(this.buildSessionCard(sessions[i], state));
    }

    this.container.appendChild(list);
  }

  buildSessionCard(session, state) {
    var d = this.dashboard;
    var self = this;
    var isExpanded = this.expandedSession === session.sessionId;
    var totalTokens = (session.tokens && session.tokens.input || 0) + (session.tokens && session.tokens.output || 0);
    var activeAgents = session.agents ? session.agents.filter(function(a){ return a.status === 'running'; }).length : 0;

    var card = document.createElement('div');
    card.className = 'card session-card' + (isExpanded ? ' expanded' : '');
    card.dataset.sessionId = session.sessionId;
    card.style.cursor = 'pointer';
    card.addEventListener('click', function() {
      self.expandedSession = self.expandedSession === session.sessionId ? null : session.sessionId;
      self.update(state);
    });

    // Row: [chevron] [badges col] [path col] [metrics col]
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 16px;min-width:0';

    // Chevron — signals clickability
    var chevron = document.createElement('span');
    chevron.style.cssText = 'color:var(--text-muted);font-size:11px;transition:transform 0.15s;display:inline-block;user-select:none';
    chevron.textContent = '›';
    chevron.style.transform = isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
    row.appendChild(chevron);

    // Badges column
    var badges = document.createElement('div');
    badges.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0';

    var badge = document.createElement('span');
    badge.className = 'badge badge-' + session.status;
    badge.textContent = session.status.charAt(0).toUpperCase() + session.status.slice(1);
    badges.appendChild(badge);

    if (session.model) {
      var modelNames = { 'opus-4': 'Opus', 'sonnet-4': 'Sonnet', 'haiku-3.5': 'Haiku' };
      var mlBadge = document.createElement('span');
      mlBadge.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:4px;background:var(--bg-tertiary);color:var(--accent-purple);font-family:var(--font-mono);white-space:nowrap;flex-shrink:0';
      mlBadge.textContent = modelNames[session.model] || session.model;
      badges.appendChild(mlBadge);
    }
    if (session.permissionMode && session.permissionMode !== 'default') {
      var permBadge = document.createElement('span');
      permBadge.className = session.permissionMode === 'bypassPermissions' ? 'badge badge-error' : 'badge badge-warning';
      permBadge.style.cssText = 'font-size:10px;flex-shrink:0';
      permBadge.title = 'Permission mode: ' + session.permissionMode;
      permBadge.textContent = session.permissionMode === 'bypassPermissions' ? '⚠ BYPASS' : session.permissionMode;
      badges.appendChild(permBadge);
    }
    if (session.injectionRisk > 0) {
      var injBadge = document.createElement('span');
      injBadge.className = session.injectionRisk >= 2 ? 'badge badge-error' : 'badge badge-warning';
      injBadge.style.cssText = 'font-size:10px;flex-shrink:0';
      injBadge.title = 'Possible prompt injection detected';
      injBadge.textContent = '🔍';
      badges.appendChild(injBadge);
    }
    if (session.hasSensitiveData) {
      var sensBadge = document.createElement('span');
      sensBadge.className = 'badge badge-error';
      sensBadge.style.cssText = 'font-size:10px;flex-shrink:0';
      sensBadge.title = 'Sensitive data detected';
      sensBadge.textContent = '🔑';
      badges.appendChild(sensBadge);
    }
    row.appendChild(badges);

    // Path column — always visible, full path on hover
    var pathEl = document.createElement('div');
    pathEl.className = 'session-path';
    pathEl.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:80px';
    pathEl.title = session.cwd || '';
    pathEl.textContent = d.formatPath(session.cwd) || 'unknown';
    row.appendChild(pathEl);

    // Metrics column — evenly distributed
    var metrics = document.createElement('div');
    metrics.style.cssText = 'display:flex;align-items:center;gap:16px;justify-content:flex-end';

    if (activeAgents > 0) {
      var agentChip = document.createElement('span');
      agentChip.style.cssText = 'font-size:12px;color:var(--accent-amber);white-space:nowrap';
      agentChip.textContent = '⚡ ' + activeAgents + ' agent' + (activeAgents > 1 ? 's' : '');
      metrics.appendChild(agentChip);
    }

    var toolChip = document.createElement('span');
    toolChip.style.cssText = 'font-size:12px;color:var(--text-secondary);font-family:var(--font-mono);white-space:nowrap';
    toolChip.textContent = (session.toolCallCount || 0) + ' tools';
    metrics.appendChild(toolChip);

    var tokChip = document.createElement('span');
    tokChip.style.cssText = 'font-size:12px;color:var(--text-secondary);font-family:var(--font-mono);white-space:nowrap';
    tokChip.textContent = d.formatTokens(totalTokens) + ' tok';
    metrics.appendChild(tokChip);

    var dur = document.createElement('span');
    dur.style.cssText = 'font-size:12px;color:var(--text-muted);font-family:var(--font-mono);white-space:nowrap;min-width:52px;text-align:right';
    dur.textContent = d.formatDuration(session.startedAt, session.endedAt);
    metrics.appendChild(dur);

    row.appendChild(metrics);

    if (session.status === 'active') {
      var timerId = setInterval(function() {
        dur.textContent = d.formatDuration(session.startedAt, null);
      }, 1000);
      this.timers.set(session.sessionId, timerId);
    }

    card.appendChild(row);

    if (isExpanded) {
      var detail = document.createElement('div');
      detail.className = 'session-detail';
      detail.style.display = 'block';
      this.buildSessionDetail(detail, session, state);
      this.buildSecuritySection(detail, session);
      this.buildGitSection(detail, session);
      this.buildClaudeMdSection(detail, session);
      card.appendChild(detail);
    }

    return card;
  }

  buildSessionDetail(container, session, state) {
    var d = this.dashboard;
    var events = (state.recentEvents || []).filter(function(e) {
      return e.session_id === session.sessionId && e.hook_event_name;
    }).slice(-20);

    if (events.length === 0) {
      var p = document.createElement('p');
      p.style.cssText = 'color:var(--text-muted);font-size:13px;margin-top:8px';
      p.textContent = 'No recent tool activity';
      container.appendChild(p);
      return;
    }

    var timeline = document.createElement('div');
    timeline.className = 'timeline';

    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var isAgent = e.tool_name === 'Agent';
      var isStop = e.hook_event_name === 'Stop' || e.hook_event_name === 'SubagentStop';
      var cls = isAgent ? 'agent-spawn' : isStop ? 'agent-complete' : 'tool-call';

      var item = document.createElement('div');
      item.className = 'timeline-item ' + cls;

      var toolSpan = document.createElement('span');
      toolSpan.style.cssText = 'font-weight:600;color:var(--text-primary)';
      toolSpan.textContent = e.tool_name || e.hook_event_name;
      item.appendChild(toolSpan);

      var summary = d.getEventSummary(e);
      if (summary) {
        var sumSpan = document.createElement('span');
        sumSpan.style.cssText = 'color:var(--text-secondary);margin-left:8px;font-family:var(--font-mono);font-size:12px';
        sumSpan.textContent = summary.slice(0, 60);
        item.appendChild(sumSpan);
      }

      var timeSpan = document.createElement('span');
      timeSpan.style.cssText = 'float:right;color:var(--text-muted);font-size:11px;font-family:var(--font-mono)';
      timeSpan.textContent = d.formatTime(e.dashboard_ts || (e._processed && e._processed.ts));
      item.appendChild(timeSpan);

      timeline.appendChild(item);
    }

    container.appendChild(timeline);

    if (session.agents && session.agents.length > 0) {
      var agentSection = document.createElement('div');
      agentSection.style.marginTop = '16px';

      var title = document.createElement('strong');
      title.style.cssText = 'font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px';
      title.textContent = 'Agents';
      agentSection.appendChild(title);

      var agents = session.agents.slice(-5).reverse();
      for (var j = 0; j < agents.length; j++) {
        var agent = agents[j];
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px';

        var typeBadge = document.createElement('span');
        var typeClass = agent.agentType === 'Explore' ? 'explore' : agent.agentType === 'Plan' ? 'plan' : 'general';
        typeBadge.className = 'agent-type-badge agent-type-' + typeClass;
        typeBadge.textContent = agent.agentType;
        row.appendChild(typeBadge);

        var statusBadge = document.createElement('span');
        var sClass = agent.status === 'running' ? 'badge-running' : agent.status === 'failed' ? 'badge-failed' : 'badge-completed';
        statusBadge.className = 'badge ' + sClass;
        statusBadge.textContent = agent.status;
        row.appendChild(statusBadge);

        var taskSpan = document.createElement('span');
        taskSpan.style.cssText = 'color:var(--text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        taskSpan.textContent = agent.task;
        row.appendChild(taskSpan);

        if (agent.endedAt) {
          var durSpan = document.createElement('span');
          durSpan.style.cssText = 'color:var(--text-muted);font-family:var(--font-mono);font-size:11px';
          durSpan.textContent = d.formatDuration(agent.startedAt, agent.endedAt);
          row.appendChild(durSpan);
        }

        agentSection.appendChild(row);
      }

      container.appendChild(agentSection);
    }
  }

  buildSecuritySection(container, session) {
    var hasInjection = session.injectionRisk > 0 && session.injectionFlags && session.injectionFlags.length > 0;
    var hasSensitive = session.hasSensitiveData && session.sensitiveDataFlags && session.sensitiveDataFlags.length > 0;
    var hasDangerous = session.dangerousCommands && session.dangerousCommands.length > 0;
    if (!hasInjection && !hasSensitive && !hasDangerous) return;

    var section = document.createElement('div');
    section.style.marginTop = '16px';

    var title = document.createElement('strong');
    title.style.cssText = 'font-size:12px;color:var(--accent-red);text-transform:uppercase;letter-spacing:0.5px';
    title.textContent = 'Security Flags';
    section.appendChild(title);

    var list = document.createElement('div');
    list.style.cssText = 'margin-top:8px;display:flex;flex-direction:column;gap:4px';

    if (hasInjection) {
      for (var i = 0; i < session.injectionFlags.length; i++) {
        var f = session.injectionFlags[i];
        var row = document.createElement('div');
        row.style.cssText = 'font-size:12px;color:var(--accent-amber);padding:4px 8px;background:rgba(210,153,34,0.1);border-radius:4px';
        row.textContent = '🔍 Injection in ' + f.toolName + ' (' + f.field + '): "' + f.snippet + '"';
        list.appendChild(row);
      }
    }

    if (hasSensitive) {
      for (var j = 0; j < session.sensitiveDataFlags.length; j++) {
        var sf = session.sensitiveDataFlags[j];
        var srow = document.createElement('div');
        srow.style.cssText = 'font-size:12px;color:var(--accent-red);padding:4px 8px;background:rgba(248,81,73,0.1);border-radius:4px';
        srow.textContent = '🔑 ' + sf.type + ' pattern detected in ' + sf.toolName + ' (' + sf.field + ')';
        list.appendChild(srow);
      }
    }

    if (hasDangerous) {
      for (var k = 0; k < session.dangerousCommands.length; k++) {
        var dc = session.dangerousCommands[k];
        var drow = document.createElement('div');
        drow.style.cssText = 'font-size:12px;color:var(--accent-amber);padding:4px 8px;background:rgba(210,153,34,0.1);border-radius:4px';
        drow.textContent = '⚠ Dangerous command (' + dc.label + '): ' + (dc.snippet || '').slice(0, 60);
        list.appendChild(drow);
      }
    }

    section.appendChild(list);
    container.appendChild(section);
  }

  buildGitSection(container, session) {
    var d = this.dashboard;
    if (!session.cwd || session.cwd === 'unknown') return;

    var section = document.createElement('div');
    section.style.marginTop = '16px';

    var title = document.createElement('strong');
    title.style.cssText = 'font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px';
    title.textContent = 'Git Status';
    section.appendChild(title);

    var content = document.createElement('div');
    content.style.cssText = 'margin-top:6px;font-size:12px;font-family:var(--font-mono);color:var(--text-muted)';
    content.textContent = 'Loading…';
    section.appendChild(content);

    var gitCtrl = new AbortController();
    this._fetchControllers.set('git-' + session.sessionId, gitCtrl);
    fetch('/api/sessions/' + session.sessionId + '/git', { signal: gitCtrl.signal })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        content.textContent = '';
        if (!data.branch && !data.status) {
          content.textContent = 'Not a git repository';
          return;
        }
        if (data.branch) {
          var branchEl = document.createElement('div');
          branchEl.style.color = 'var(--accent-blue)';
          branchEl.textContent = '⎇ ' + data.branch;
          content.appendChild(branchEl);
        }
        if (data.status) {
          var pre = document.createElement('pre');
          pre.style.cssText = 'margin:4px 0;white-space:pre-wrap;word-break:break-all;color:var(--text-secondary)';
          pre.textContent = data.status.slice(0, 400);
          content.appendChild(pre);
        }
        if (data.diff) {
          var diffEl = document.createElement('div');
          diffEl.style.cssText = 'color:var(--text-muted);margin-top:2px';
          diffEl.textContent = data.diff.slice(0, 200);
          content.appendChild(diffEl);
        }
      })
      .catch(function(err) { if (err.name !== 'AbortError') content.textContent = 'Could not load git info'; });

    container.appendChild(section);
  }

  buildClaudeMdSection(container, session) {
    if (!session.cwd || session.cwd === 'unknown') return;

    var section = document.createElement('div');
    section.style.marginTop = '16px';

    var title = document.createElement('strong');
    title.style.cssText = 'font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px';
    title.textContent = 'CLAUDE.md';
    section.appendChild(title);

    var content = document.createElement('div');
    content.style.cssText = 'margin-top:6px;font-size:12px;color:var(--text-muted)';
    content.textContent = 'Loading…';
    section.appendChild(content);

    var mdCtrl = new AbortController();
    this._fetchControllers.set('md-' + session.sessionId, mdCtrl);
    fetch('/api/sessions/' + session.sessionId + '/claudemd', { signal: mdCtrl.signal })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        content.textContent = '';
        if (!data.files || data.files.length === 0) {
          content.textContent = 'No CLAUDE.md found';
          return;
        }
        for (var i = 0; i < data.files.length; i++) {
          var f = data.files[i];
          var fileRow = document.createElement('div');
          fileRow.style.cssText = 'margin-bottom:8px';

          var pathEl = document.createElement('div');
          pathEl.style.cssText = 'color:var(--accent-blue);font-family:var(--font-mono);font-size:11px;margin-bottom:2px';
          pathEl.textContent = f.path + ' (' + f.lineCount + ' lines)';
          fileRow.appendChild(pathEl);

          var preview = document.createElement('pre');
          preview.style.cssText = 'white-space:pre-wrap;word-break:break-all;color:var(--text-secondary);font-size:11px;margin:0;padding:4px 8px;background:var(--bg-secondary);border-radius:4px';
          preview.textContent = f.preview;
          fileRow.appendChild(preview);

          content.appendChild(fileRow);
        }
      })
      .catch(function(err) { if (err.name !== 'AbortError') content.textContent = 'Could not load CLAUDE.md info'; });

    container.appendChild(section);
  }
}

window.addEventListener('DOMContentLoaded', function() {
  var wait = setInterval(function() {
    if (window.dashboard) {
      clearInterval(wait);
      new SessionsView(window.dashboard);
    }
  }, 50);
  setTimeout(function() { clearInterval(wait); }, 5000);
});
