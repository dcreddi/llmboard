'use strict';

class Dashboard {
  constructor() {
    this.state = {
      sessions: [],
      recentEvents: [],
      stats: {},
      domains: [],
      anomalies: [],
      projects: [],
      skillRegistry: [],
      connected: false,
    };

    this.views = {};
    this.activeView = 'sessions';
    this.ws = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.listeners = {};

    this.initNav();
    this.connect();
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      for (const cb of this.listeners[event]) {
        try { cb(data); } catch (e) { console.error('Event handler error:', e); }
      }
    }
  }

  initNav() {
    const items = document.querySelectorAll('.nav-item');
    items.forEach((item) => {
      item.addEventListener('click', () => {
        const viewName = item.dataset.view;
        this.navigate(viewName);
      });
    });
  }

  navigate(viewName) {
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.view === viewName);
    });

    document.querySelectorAll('.view').forEach((el) => {
      el.classList.toggle('active', el.id === `view-${viewName}`);
    });

    const titles = {
      sessions: 'Live Sessions',
      agents: 'Agent Manager',
      tools: 'Tool Activity',
      commands: 'Command Center',
      analytics: 'Token Analytics',
      network: 'Network & Domains',
      alerts: 'Anomaly Alerts',
      projects: 'Project Intelligence',
      extensions: 'Settings',
    };
    document.getElementById('view-title').textContent = titles[viewName] || viewName;

    this.activeView = viewName;
    this.emit('navigate', viewName);
    this.updateEmptyState();

    if (this.views[viewName]) {
      this.views[viewName].update(this.state);
    }
  }

  registerView(name, view) {
    this.views[name] = view;
    if (this.state.sessions.length > 0 || this.state.recentEvents.length > 0) {
      view.update(this.state);
    }
  }

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.state.connected = true;
      this.reconnectDelay = 1000;
      this.updateConnectionStatus('connected', 'Connected');
      this.emit('connected');
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    this.ws.onclose = () => {
      this.state.connected = false;
      this.updateConnectionStatus('disconnected', 'Disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose fires after this
    };
  }

  scheduleReconnect() {
    this.updateConnectionStatus('reconnecting', `Reconnecting in ${Math.round(this.reconnectDelay / 1000)}s...`);
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  updateConnectionStatus(status, text) {
    const el = document.getElementById('connection-status');
    el.className = `status-badge ${status}`;
    el.querySelector('.status-text').textContent = text;
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'init':
        this.state.sessions = msg.sessions || [];
        this.state.recentEvents = msg.recentEvents || [];
        this.state.stats = msg.stats || {};
        this.state.domains = msg.domains || [];
        this.state.anomalies = msg.anomalies || [];
        this.state.projects = msg.projects || [];
        this.state.skillRegistry = msg.skillRegistry || [];
        this.state.commandLog = msg.commandLog || [];
        this.updateAll();
        break;

      case 'events':
        if (msg.events) {
          this.state.recentEvents = [
            ...this.state.recentEvents,
            ...msg.events,
          ].slice(-1000);
        }
        if (msg.sessions) this.state.sessions = msg.sessions;
        if (msg.stats) this.state.stats = msg.stats;
        if (msg.domains) this.state.domains = msg.domains;
        if (msg.anomalies) this.state.anomalies = msg.anomalies;
        if (msg.projects) this.state.projects = msg.projects;
        if (msg.skillRegistry) this.state.skillRegistry = msg.skillRegistry;
        if (msg.commandLog) this.state.commandLog = msg.commandLog;
        this.updateAll();
        this.emit('newEvents', msg.events);
        break;
    }
  }

  updateAll() {
    this.updateGlobalStats();
    this.updateEmptyState();

    if (this.views[this.activeView]) {
      this.views[this.activeView].update(this.state);
    }
  }

  updateGlobalStats() {
    const stats = this.state.stats;
    const sessions = this.state.sessions;

    const activeSessions = sessions.filter(
      (s) => s.status === 'active'
    ).length;

    document.getElementById('active-session-count').textContent =
      activeSessions > 0 ? activeSessions : sessions.length;

    document.getElementById('total-token-count').textContent =
      this.formatTokens(
        (stats.totalTokens?.input || 0) + (stats.totalTokens?.output || 0)
      );

    const externalDomains = (this.state.domains || []).filter(
      (d) => d.category === 'external'
    ).length;
    const domainEl = document.getElementById('external-domain-count');
    if (domainEl) domainEl.textContent = externalDomains;

    const unackedAnomalies = (this.state.anomalies || []).filter((a) => !a.acknowledged).length;
    const alertEl = document.getElementById('alert-count');
    if (alertEl) {
      alertEl.textContent = unackedAnomalies;
      const pill = alertEl.closest('.stat-pill');
      if (pill) pill.classList.toggle('stat-pill-alert', unackedAnomalies > 0);
    }
  }

  updateEmptyState() {
    const empty = document.getElementById('empty-state');
    const hasData =
      this.state.sessions.length > 0 || this.state.recentEvents.length > 0;
    const showEmpty = !hasData && this.activeView === 'sessions';
    empty.classList.toggle('hidden', !showEmpty);
  }

  formatTokens(tokens) {
    if (tokens < 1000) return `${tokens}`;
    if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }

  formatCost(cost) {
    if (cost === 0) return '$0.00';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    if (cost < 1) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(2)}`;
  }

  formatDuration(startIso, endIso) {
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : new Date();
    const ms = end - start;

    if (ms < 1000) return '<1s';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return `${minutes}m ${secs}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  formatTime(isoString) {
    if (!isoString) return '--';
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  formatPath(fullPath) {
    if (!fullPath) return 'unknown';
    const parts = fullPath.split('/').filter(Boolean);
    if (parts.length <= 2) return fullPath;
    return '.../' + parts.slice(-2).join('/');
  }

  getToolClass(toolName) {
    if (!toolName) return 'tool-default';
    const name = toolName.toLowerCase();
    if (name === 'read') return 'tool-read';
    if (name === 'write') return 'tool-write';
    if (name === 'edit' || name === 'multiedit') return 'tool-edit';
    if (name === 'bash') return 'tool-bash';
    if (name === 'grep') return 'tool-grep';
    if (name === 'glob') return 'tool-glob';
    if (name === 'agent') return 'tool-agent';
    if (name === 'skill') return 'tool-skill';
    return 'tool-default';
  }

  getToolLabel(toolName) {
    if (!toolName) return '?';
    const labels = {
      Read: 'R', Write: 'W', Edit: 'E', MultiEdit: 'E',
      Bash: '$', Grep: 'G', Glob: 'F', Agent: 'A',
      Skill: 'S', WebFetch: 'W', WebSearch: 'S',
      TodoWrite: 'T', NotebookEdit: 'N',
    };
    return labels[toolName] || toolName.charAt(0);
  }

  getEventSummary(event) {
    const tool = event.tool_name;
    const input = event.tool_input;
    if (!tool || !input) return '';

    switch (tool) {
      case 'Read': return input.file_path || '';
      case 'Write': return input.file_path || '';
      case 'Edit': return input.file_path || '';
      case 'MultiEdit': return input.file_path || '';
      case 'Bash': return (input.command || '').slice(0, 80);
      case 'Grep': return `/${input.pattern || ''}/ ${input.path || ''}`;
      case 'Glob': return input.pattern || '';
      case 'Agent': return input.description || input.prompt?.slice(0, 60) || '';
      case 'Skill': return input.skill || '';
      default: return '';
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
