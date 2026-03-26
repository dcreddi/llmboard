'use strict';

class AnomaliesView {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.container = document.getElementById('view-alerts');
    this.filter = 'all';
    dashboard.registerView('alerts', this);
  }

  update(state) {
    var self = this;
    var anomalies = state.anomalies || [];
    var filtered = this.filter === 'all'
      ? anomalies
      : this.filter === 'unread'
        ? anomalies.filter(function(a) { return !a.acknowledged; })
        : anomalies.filter(function(a) { return a.severity === self.filter; });

    var critical = anomalies.filter(function(a) { return a.severity === 'critical' && !a.acknowledged; });
    var warnings = anomalies.filter(function(a) { return a.severity === 'warning' && !a.acknowledged; });
    var info = anomalies.filter(function(a) { return a.severity === 'info' && !a.acknowledged; });

    this.container.textContent = '';

    // Summary bar
    var summary = document.createElement('div');
    summary.className = 'anomaly-summary';

    var summaryStats = [
      { value: String(anomalies.length), label: 'total alerts' },
      { value: String(critical.length), label: 'critical', highlight: critical.length > 0, cls: 'critical' },
      { value: String(warnings.length), label: 'warnings', highlight: warnings.length > 0, cls: 'warning' },
      { value: String(info.length), label: 'info' },
    ];
    for (var s = 0; s < summaryStats.length; s++) {
      var stat = summaryStats[s];
      var pill = document.createElement('div');
      pill.className = 'network-stat-pill';
      var val = document.createElement('span');
      val.className = 'network-stat-value';
      if (stat.cls === 'critical' && stat.highlight) val.style.color = 'var(--accent-red)';
      else if (stat.cls === 'warning' && stat.highlight) val.style.color = 'var(--accent-amber)';
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
      { key: 'all', label: 'All (' + anomalies.length + ')' },
      { key: 'unread', label: 'Unread (' + anomalies.filter(function(a) { return !a.acknowledged; }).length + ')' },
      { key: 'critical', label: 'Critical (' + anomalies.filter(function(a) { return a.severity === 'critical'; }).length + ')' },
      { key: 'warning', label: 'Warning (' + anomalies.filter(function(a) { return a.severity === 'warning'; }).length + ')' },
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
      emptyIcon.textContent = anomalies.length === 0 ? '✅' : '🔍';
      var emptyText = document.createElement('p');
      emptyText.textContent = anomalies.length === 0
        ? 'No anomalies detected. Claude is behaving normally.'
        : 'No anomalies match this filter.';
      empty.appendChild(emptyIcon);
      empty.appendChild(emptyText);
      this.container.appendChild(empty);
      return;
    }

    // Anomaly cards
    var list = document.createElement('div');
    list.className = 'anomaly-list';
    for (var i = 0; i < filtered.length; i++) {
      list.appendChild(this.buildAnomalyCard(filtered[i], state));
    }
    this.container.appendChild(list);
  }

  getRemediation(type) {
    var REMEDIATION = {
      'dangerous-command': {
        what: 'LLMBoard detected a destructive shell command (rm -rf, sudo, curl|bash, etc.).',
        action: 'Review the session timeline to confirm the command was intentional. If unexpected, check your CLAUDE.md for rules about destructive operations.',
        prevent: 'Add a rule to your CLAUDE.md: "Always ask before running destructive commands."',
      },
      'bash-spike': {
        what: 'LLMBoard detected an unusually high number of Bash calls in a short window — possible runaway loop or scripted attack.',
        action: 'Expand the session and check the tool timeline for repeated identical commands. Stop the session if unexpected.',
        prevent: 'Use acceptEdits permission mode so Claude must confirm before each tool call.',
      },
      'runaway-session': {
        what: 'A single session has exceeded 500 tool calls — likely a loop or very large task.',
        action: 'Inspect the session timeline and interrupt with Ctrl+C in the terminal if needed.',
        prevent: 'Break large tasks into smaller sub-tasks, or set a tool call budget in your prompt.',
      },
      'new-domain': {
        what: 'LLMBoard detected a new external domain being contacted for the first time.',
        action: 'Check the Network tab for the full URL and context. Verify the domain is expected for this task.',
        prevent: 'Add allowed/blocked domains to your CLAUDE.md, or use a network proxy to restrict outbound calls.',
      },
      'injection-risk': {
        what: 'LLMBoard detected text in a tool result that looks like a prompt injection — attempting to hijack the LLM\'s instructions.',
        action: 'Review the flagged tool result in the session timeline. Do not trust content from that source.',
        prevent: 'Avoid reading untrusted content (web pages, user files) alongside sensitive operations in the same session.',
      },
      'sensitive-data': {
        what: 'LLMBoard detected a credential pattern (AWS key, GitHub PAT, private key, etc.) in a tool result.',
        action: 'Rotate the credential immediately. Check if it was logged anywhere. The value is NOT stored by LLMBoard — only the type and location.',
        prevent: 'Use a secrets manager (1Password, AWS Secrets Manager) and avoid storing credentials in plaintext files.',
      },
    };
    return REMEDIATION[type] || null;
  }

  buildAnomalyCard(anomaly, state) {
    var d = this.dashboard;
    var card = document.createElement('div');
    card.className = 'anomaly-card anomaly-' + anomaly.severity + (anomaly.acknowledged ? ' anomaly-acked' : '');

    // Header row
    var header = document.createElement('div');
    header.className = 'anomaly-header';

    var severityBadge = document.createElement('span');
    severityBadge.className = 'anomaly-badge anomaly-badge-' + anomaly.severity;
    severityBadge.textContent = anomaly.severity.toUpperCase();

    var typeSpan = document.createElement('span');
    typeSpan.className = 'anomaly-type';
    typeSpan.textContent = anomaly.type;

    var timeSpan = document.createElement('span');
    timeSpan.className = 'anomaly-time';
    timeSpan.textContent = d.formatTime(anomaly.ts);

    header.appendChild(severityBadge);
    header.appendChild(typeSpan);
    header.appendChild(timeSpan);
    card.appendChild(header);

    // Message
    var msg = document.createElement('p');
    msg.className = 'anomaly-message';
    msg.textContent = anomaly.message;
    card.appendChild(msg);

    // Session link
    if (anomaly.sessionId) {
      var session = (state.sessions || []).find(function(s) { return s.sessionId === anomaly.sessionId; });
      if (session) {
        var sessionRow = document.createElement('div');
        sessionRow.className = 'anomaly-session';
        var sessionLabel = document.createElement('span');
        sessionLabel.className = 'anomaly-session-label';
        sessionLabel.textContent = 'Session:';
        var sessionPath = document.createElement('span');
        sessionPath.className = 'anomaly-session-path';
        sessionPath.textContent = d.formatPath(session.cwd);
        sessionRow.appendChild(sessionLabel);
        sessionRow.appendChild(sessionPath);
        card.appendChild(sessionRow);
      }
    }

    // Remediation guidance (collapsible)
    var remediation = this.getRemediation(anomaly.type);
    if (remediation) {
      var remToggle = document.createElement('button');
      remToggle.className = 'anomaly-ack-btn';
      remToggle.style.cssText = 'background:rgba(88,166,255,0.1);color:var(--accent-blue);border-color:rgba(88,166,255,0.2);margin-bottom:4px';
      remToggle.textContent = '💡 How to action this';

      var remPanel = document.createElement('div');
      remPanel.className = 'anomaly-remediation hidden';

      var sections = [
        { label: 'What happened', text: remediation.what },
        { label: 'Immediate action', text: remediation.action },
        { label: 'How to prevent', text: remediation.prevent },
      ];
      for (var ri = 0; ri < sections.length; ri++) {
        var sec = sections[ri];
        var secEl = document.createElement('div');
        secEl.className = 'anomaly-rem-section';
        var secLabel = document.createElement('strong');
        secLabel.textContent = sec.label;
        var secText = document.createElement('p');
        secText.textContent = sec.text;
        secEl.appendChild(secLabel);
        secEl.appendChild(secText);
        remPanel.appendChild(secEl);
      }

      remToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        var hidden = remPanel.classList.toggle('hidden');
        remToggle.textContent = hidden ? '💡 How to action this' : '💡 Hide guidance';
      });

      card.appendChild(remToggle);
      card.appendChild(remPanel);
    }

    // Acknowledge button
    if (!anomaly.acknowledged) {
      var ackBtn = document.createElement('button');
      ackBtn.className = 'anomaly-ack-btn';
      ackBtn.textContent = 'Dismiss';
      ackBtn.addEventListener('click', function() {
        fetch('/api/anomalies/' + anomaly.id + '/acknowledge', { method: 'POST' })
          .then(function() {
            anomaly.acknowledged = true;
            card.classList.add('anomaly-acked');
            ackBtn.remove();
          })
          .catch(function() {});
      });
      card.appendChild(ackBtn);
    }

    return card;
  }
}

window.addEventListener('DOMContentLoaded', function() {
  var wait = setInterval(function() {
    if (window.dashboard) {
      clearInterval(wait);
      new AnomaliesView(window.dashboard);
    }
  }, 50);
  setTimeout(function() { clearInterval(wait); }, 5000);
});
