'use strict';

class CommandCenterView {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.container = document.getElementById('view-commands');
    this.activeTab = 'log'; // 'log' | 'rules'
    dashboard.registerView('commands', this);
  }

  update(state) {
    var self = this;
    this.container.textContent = '';

    // Sub-tab nav
    var tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:20px';
    var tabDefs = [
      { id: 'log',   label: 'Command Log' },
      { id: 'rules', label: 'Classification Rules' },
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

    if (this.activeTab === 'log') {
      this.renderCommandLog(state);
    } else {
      this.renderRulesEditor();
    }
  }

  renderCommandLog(state) {
    var d = this.dashboard;
    var cmds = state.commandLog || [];

    // Stats summary bar
    var counts = { safe: 0, 'needs-info': 0, 'needs-permission': 0, dangerous: 0, unknown: 0 };
    for (var ci = 0; ci < cmds.length; ci++) {
      counts[cmds[ci].classification] = (counts[cmds[ci].classification] || 0) + 1;
    }

    var summary = document.createElement('div');
    summary.className = 'network-summary';
    summary.style.marginBottom = '16px';

    var summaryItems = [
      { value: String(cmds.length),                    label: 'total' },
      { value: String(counts.safe),                    label: 'safe',             color: 'var(--accent-green)' },
      { value: String(counts['needs-info']),            label: 'needs info' },
      { value: String(counts['needs-permission']),      label: 'needs permission', color: counts['needs-permission'] > 0 ? 'var(--accent-amber)' : null },
      { value: String(counts.dangerous),               label: 'dangerous',        color: counts.dangerous > 0 ? 'var(--accent-red)' : null },
    ];
    for (var si = 0; si < summaryItems.length; si++) {
      var item = summaryItems[si];
      var pill = document.createElement('div');
      pill.className = 'network-stat-pill';
      var val = document.createElement('span');
      val.className = 'network-stat-value';
      if (item.color) val.style.color = item.color;
      val.textContent = item.value;
      var lbl = document.createElement('span');
      lbl.className = 'network-stat-label';
      lbl.textContent = item.label;
      pill.appendChild(val);
      pill.appendChild(lbl);
      summary.appendChild(pill);
    }
    this.container.appendChild(summary);

    if (cmds.length === 0) {
      var empty = document.createElement('p');
      empty.style.cssText = 'color:var(--text-muted);text-align:center;padding:60px 20px';
      empty.textContent = 'No commands recorded yet. Commands will appear here in real-time.';
      this.container.appendChild(empty);
      return;
    }

    var badgeCls = {
      safe: 'badge-active',
      'needs-info': 'badge-default',
      'needs-permission': 'badge-warning',
      dangerous: 'badge-error',
      unknown: 'badge-default',
    };

    var list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:4px';

    for (var i = 0; i < cmds.length; i++) {
      var cmd = cmds[i];
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:7px 10px;background:var(--bg-secondary);border-radius:6px;border:1px solid var(--border)';

      var ts = document.createElement('span');
      ts.style.cssText = 'font-size:11px;color:var(--text-muted);white-space:nowrap;padding-top:2px;min-width:52px';
      ts.textContent = d.formatTime(cmd.ts);
      row.appendChild(ts);

      var badge = document.createElement('span');
      badge.className = 'badge ' + (badgeCls[cmd.classification] || 'badge-default');
      badge.style.cssText = 'font-size:10px;white-space:nowrap;flex-shrink:0';
      badge.textContent = cmd.classification || 'unknown';
      row.appendChild(badge);

      var cmdText = document.createElement('code');
      cmdText.style.cssText = 'font-family:var(--font-mono);font-size:12px;color:var(--text-primary);word-break:break-all;flex:1;line-height:1.6';
      cmdText.textContent = cmd.cmd;
      row.appendChild(cmdText);

      list.appendChild(row);
    }

    this.container.appendChild(list);
  }

  renderRulesEditor() {
    var self = this;

    var desc = document.createElement('p');
    desc.style.cssText = 'font-size:13px;color:var(--text-secondary);margin:0 0 20px;max-width:600px;line-height:1.6';
    desc.textContent = 'Add command prefixes to override built-in classification. One prefix per line. User rules take priority over built-in patterns.';
    this.container.appendChild(desc);

    // Legend card
    var legendCard = document.createElement('div');
    legendCard.className = 'card';
    legendCard.style.cssText = 'padding:16px;margin-bottom:20px';

    var legendTitle = document.createElement('div');
    legendTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px';
    legendTitle.textContent = 'Classification Levels';
    legendCard.appendChild(legendTitle);

    var levels = [
      { cls: 'badge-active',  label: 'safe',             desc: 'Read-only, info commands — ls, git status, grep…' },
      { cls: 'badge-default', label: 'needs-info',       desc: 'Unknown pattern — review before trusting' },
      { cls: 'badge-warning', label: 'needs-permission', desc: 'Writes, installs, git push — requires intent' },
      { cls: 'badge-error',   label: 'dangerous',        desc: 'rm -rf, force push, curl|bash — always flag' },
    ];

    var grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    for (var li = 0; li < levels.length; li++) {
      var lvl = levels[li];
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px';
      var badge = document.createElement('span');
      badge.className = 'badge ' + lvl.cls;
      badge.style.cssText = 'font-size:11px;min-width:120px;text-align:center';
      badge.textContent = lvl.label;
      var txt = document.createElement('span');
      txt.style.cssText = 'font-size:12px;color:var(--text-muted)';
      txt.textContent = lvl.desc;
      row.appendChild(badge);
      row.appendChild(txt);
      grid.appendChild(row);
    }
    legendCard.appendChild(grid);
    this.container.appendChild(legendCard);

    // Rules editor card
    var editorCard = document.createElement('div');
    editorCard.className = 'card';
    editorCard.style.cssText = 'padding:16px';

    var editorTitle = document.createElement('div');
    editorTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:16px';
    editorTitle.textContent = 'Custom Rules';
    editorCard.appendChild(editorTitle);

    var editorGrid = document.createElement('div');
    editorGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px';

    var safeArea = this.buildRulesTextarea('Always Safe', 'e.g. make build');
    var permArea = this.buildRulesTextarea('Needs Permission', 'e.g. terraform apply');
    editorGrid.appendChild(safeArea.wrap);
    editorGrid.appendChild(permArea.wrap);
    editorCard.appendChild(editorGrid);

    var footer = document.createElement('div');
    footer.style.cssText = 'display:flex;align-items:center;gap:12px;margin-top:16px';

    var saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Save Rules';

    var status = document.createElement('span');
    status.style.cssText = 'font-size:12px;color:var(--accent-green);opacity:0;transition:opacity 0.3s';
    status.textContent = 'Saved!';

    saveBtn.addEventListener('click', function() {
      var safe = safeArea.textarea.value.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
      var needsPermission = permArea.textarea.value.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
      fetch('/api/command-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safe: safe, needsPermission: needsPermission }),
      })
      .then(function(r) { return r.json(); })
      .then(function() {
        status.style.opacity = '1';
        setTimeout(function() { status.style.opacity = '0'; }, 2000);
      })
      .catch(function(e) { console.error('Failed to save rules:', e); });
    });

    footer.appendChild(saveBtn);
    footer.appendChild(status);
    editorCard.appendChild(footer);
    this.container.appendChild(editorCard);

    // Load existing rules
    fetch('/api/command-rules')
      .then(function(r) { return r.json(); })
      .then(function(rules) {
        if (rules.safe) safeArea.textarea.value = rules.safe.join('\n');
        if (rules.needsPermission) permArea.textarea.value = rules.needsPermission.join('\n');
      })
      .catch(function() {});
  }

  buildRulesTextarea(label, placeholder) {
    var wrap = document.createElement('div');
    var lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px';
    lbl.textContent = label;
    wrap.appendChild(lbl);
    var textarea = document.createElement('textarea');
    textarea.placeholder = placeholder;
    textarea.rows = 6;
    textarea.style.cssText = 'width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:8px;font-family:var(--font-mono);font-size:12px;color:var(--text-primary);resize:vertical;box-sizing:border-box';
    wrap.appendChild(textarea);
    return { wrap: wrap, textarea: textarea };
  }
}

window.addEventListener('DOMContentLoaded', function() {
  var wait = setInterval(function() {
    if (window.dashboard) {
      clearInterval(wait);
      new CommandCenterView(window.dashboard);
    }
  }, 50);
  setTimeout(function() { clearInterval(wait); }, 5000);
});
