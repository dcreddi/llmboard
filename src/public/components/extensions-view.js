'use strict';

class ExtensionsView {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.container = document.getElementById('view-extensions');
    this.config = {};
    this.loadConfig();
    dashboard.registerView('extensions', this);
  }

  loadConfig() {
    var self = this;
    fetch('/api/config')
      .then(function(res) { return res.json(); })
      .then(function(cfg) { self.config = cfg; })
      .catch(function() { self.config = { port: 3456, model: 'sonnet-4', theme: 'dark' }; });
  }

  update(state) {
    var self = this;
    var d = this.dashboard;
    var theme = document.documentElement.getAttribute('data-theme') || 'dark';

    this.container.textContent = '';

    this.container.appendChild(this.buildSection('Appearance', function(card) {
      // Theme toggle
      var row = self.buildSettingsRow('Theme', 'Switch between dark and light mode');
      var toggle = document.createElement('label');
      toggle.className = 'toggle';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = theme === 'light';
      checkbox.addEventListener('change', function() {
        var newTheme = checkbox.checked ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        self.saveConfig({ theme: newTheme });
      });
      var slider = document.createElement('span');
      slider.className = 'toggle-slider';
      toggle.appendChild(checkbox);
      toggle.appendChild(slider);
      row.appendChild(toggle);
      card.appendChild(row);
    }));

    this.container.appendChild(this.buildSection('Token Estimation', function(card) {
      var row = self.buildSettingsRow('Default Model', 'Used for token estimates when model is unknown');
      var select = document.createElement('select');
      select.id = 'model-select';
      var models = [
        { value: 'opus-4', label: 'Claude Opus 4 ($15/$75)' },
        { value: 'sonnet-4', label: 'Claude Sonnet 4 ($3/$15)' },
        { value: 'haiku-3.5', label: 'Claude Haiku 3.5 ($0.25/$1.25)' }
      ];
      for (var m = 0; m < models.length; m++) {
        var opt = document.createElement('option');
        opt.value = models[m].value;
        opt.textContent = models[m].label;
        if (self.config.model === models[m].value) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', function() {
        self.config.model = select.value;
        self.saveConfig({ model: select.value });
      });
      row.appendChild(select);
      card.appendChild(row);
    }));

    this.container.appendChild(this.buildSection('Data Management', function(card) {
      var exportRow = self.buildSettingsRow('Export Data', 'Download all analytics data');
      var btnGroup = document.createElement('div');
      btnGroup.style.cssText = 'display:flex;gap:8px';
      var jsonBtn = document.createElement('a');
      jsonBtn.href = '/api/export?format=json';
      jsonBtn.className = 'btn';
      jsonBtn.textContent = 'JSON';
      jsonBtn.download = '';
      var csvBtn = document.createElement('a');
      csvBtn.href = '/api/export?format=csv';
      csvBtn.className = 'btn';
      csvBtn.textContent = 'CSV';
      csvBtn.download = '';
      btnGroup.appendChild(jsonBtn);
      btnGroup.appendChild(csvBtn);
      exportRow.appendChild(btnGroup);
      card.appendChild(exportRow);

      var locRow = self.buildSettingsRow('Data Location', '~/.llmboard/');
      var locDesc = locRow.querySelector('.settings-description');
      if (locDesc) {
        locDesc.className = 'settings-description mono';
        locDesc.style.fontSize = '12px';
      }
      card.appendChild(locRow);
    }));

    this.container.appendChild(this.buildSection('Hook Status', function(card) {
      var eventsRow = self.buildSettingsRow('Events Received', (state.stats && state.stats.totalEvents || 0) + ' total events from LLMBoard');
      var evBadge = document.createElement('span');
      evBadge.className = 'badge ' + ((state.stats && state.stats.totalEvents || 0) > 0 ? 'badge-active' : 'badge-inactive');
      evBadge.textContent = (state.stats && state.stats.totalEvents || 0) > 0 ? 'Active' : 'No Events';
      eventsRow.appendChild(evBadge);
      card.appendChild(eventsRow);

      var sessRow = self.buildSettingsRow('Active Sessions', (state.stats && state.stats.activeSessions || 0) + ' LLMBoard sessions detected');
      card.appendChild(sessRow);

      var wsRow = self.buildSettingsRow('WebSocket Connection', 'Real-time event stream from server');
      var wsBadge = document.createElement('span');
      wsBadge.className = 'badge ' + (d.state.connected ? 'badge-active' : 'badge-failed');
      wsBadge.textContent = d.state.connected ? 'Connected' : 'Disconnected';
      wsRow.appendChild(wsBadge);
      card.appendChild(wsRow);
    }));

    this.container.appendChild(this.buildSection('About', function(card) {
      var aboutRow = self.buildSettingsRow('LLMBoard', 'Real-time monitoring for LLM tools');
      var version = document.createElement('span');
      version.style.cssText = 'font-family:var(--font-mono);font-size:13px;color:var(--text-muted)';
      version.textContent = 'v1.0.0';
      aboutRow.appendChild(version);
      card.appendChild(aboutRow);

      var privRow = self.buildSettingsRow('Privacy', 'All data stays on your machine. Zero telemetry. Zero external calls.');
      var privLabel = privRow.querySelector('.settings-label');
      if (privLabel) privLabel.style.color = 'var(--accent-green)';
      card.appendChild(privRow);
    }));

    this.container.appendChild(this.buildSection('Feedback', function(card) {
      var bugRow = self.buildSettingsRow('Report a Bug', 'Something not working? Open a GitHub issue with details.');
      var bugBtn = document.createElement('a');
      bugBtn.href = 'https://github.com/dcreddi/llmboard/issues/new?template=bug_report.md&labels=bug';
      bugBtn.target = '_blank';
      bugBtn.rel = 'noopener noreferrer';
      bugBtn.textContent = 'Open Issue';
      bugBtn.style.cssText = 'padding:6px 14px;border-radius:6px;background:rgba(248,81,73,0.15);border:1px solid rgba(248,81,73,0.4);color:#f85149;font-size:13px;text-decoration:none;white-space:nowrap;transition:background 0.15s';
      bugBtn.onmouseover = function() { this.style.background = 'rgba(248,81,73,0.25)'; };
      bugBtn.onmouseout = function() { this.style.background = 'rgba(248,81,73,0.15)'; };
      bugRow.appendChild(bugBtn);
      card.appendChild(bugRow);

      var featRow = self.buildSettingsRow('Request a Feature', 'Have an idea? We\'d love to hear it.');
      var featBtn = document.createElement('a');
      featBtn.href = 'https://github.com/dcreddi/llmboard/issues/new?template=feature_request.md&labels=enhancement';
      featBtn.target = '_blank';
      featBtn.rel = 'noopener noreferrer';
      featBtn.textContent = 'Suggest Feature';
      featBtn.style.cssText = 'padding:6px 14px;border-radius:6px;background:rgba(88,166,255,0.12);border:1px solid rgba(88,166,255,0.35);color:#58a6ff;font-size:13px;text-decoration:none;white-space:nowrap;transition:background 0.15s';
      featBtn.onmouseover = function() { this.style.background = 'rgba(88,166,255,0.22)'; };
      featBtn.onmouseout = function() { this.style.background = 'rgba(88,166,255,0.12)'; };
      featRow.appendChild(featBtn);
      card.appendChild(featRow);

      var discRow = self.buildSettingsRow('Discussions', 'Questions, tips, and community help.');
      var discBtn = document.createElement('a');
      discBtn.href = 'https://github.com/dcreddi/llmboard/discussions';
      discBtn.target = '_blank';
      discBtn.rel = 'noopener noreferrer';
      discBtn.textContent = 'Open Discussions';
      discBtn.style.cssText = 'padding:6px 14px;border-radius:6px;background:rgba(188,140,255,0.12);border:1px solid rgba(188,140,255,0.35);color:#bc8cff;font-size:13px;text-decoration:none;white-space:nowrap;transition:background 0.15s';
      discBtn.onmouseover = function() { this.style.background = 'rgba(188,140,255,0.22)'; };
      discBtn.onmouseout = function() { this.style.background = 'rgba(188,140,255,0.12)'; };
      discRow.appendChild(discBtn);
      card.appendChild(discRow);
    }));
  }

  buildSection(title, buildCard) {
    var section = document.createElement('div');
    section.className = 'settings-section';
    var titleEl = document.createElement('div');
    titleEl.className = 'settings-section-title';
    titleEl.textContent = title;
    section.appendChild(titleEl);
    var card = document.createElement('div');
    card.className = 'card';
    buildCard(card);
    section.appendChild(card);
    return section;
  }

  buildSettingsRow(label, description) {
    var row = document.createElement('div');
    row.className = 'settings-row';
    var left = document.createElement('div');
    var labelEl = document.createElement('div');
    labelEl.className = 'settings-label';
    labelEl.textContent = label;
    left.appendChild(labelEl);
    if (description) {
      var desc = document.createElement('div');
      desc.className = 'settings-description';
      desc.textContent = description;
      left.appendChild(desc);
    }
    row.appendChild(left);
    return row;
  }

  saveConfig(updates) {
    var self = this;
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })
    .then(function(res) { return res.json(); })
    .then(function(cfg) { self.config = cfg; })
    .catch(function(e) { console.error('Failed to save config:', e); });
  }
}

window.addEventListener('DOMContentLoaded', function() {
  var wait = setInterval(function() {
    if (window.dashboard) {
      clearInterval(wait);
      new ExtensionsView(window.dashboard);
    }
  }, 50);
  setTimeout(function() { clearInterval(wait); }, 5000);
});
