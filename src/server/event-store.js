'use strict';

const fs = require('fs');
const path = require('path');
// spawnSync with array args (not exec/execSync) — no shell invocation, no injection risk
const { spawnSync } = require('child_process');
const { CostEstimator } = require('./cost-estimator');

const MAX_RECENT_EVENTS = 1000;
const MAX_COMMAND_LOG = 500;

// Built-in command classification patterns
const SAFE_PATTERNS = [
  /^(ls|ll|la|pwd|echo|cat|head|tail|wc|which|type|whoami|id|date|uname|uptime|df|du|ps|top|htop|env|printenv|history)\b/,
  /^git\s+(status|log|diff|show|branch|remote\s+(-v|show)|fetch|stash\s+list|tag|describe)\b/i,
  /^npm\s+(test|run\s+test|list|ls|outdated|audit|help|version|info|view)\b/i,
  /^node\s+(--version|-v|--help)\b/i,
  /^(python|python3)\s+(--version|-V)\b/i,
  /^(grep|rg|find|awk|sed|sort|uniq|xargs|tr|cut|jq|yq)\b/,
  /^(curl|wget)\s+.*(--head|-I)\b/i,
  /^(ping|nslookup|dig|host)\b/,
];

const NEEDS_PERMISSION_PATTERNS = [
  /^(rm|rmdir)\b/,
  /^(mv|cp)\b.*\//,
  /^git\s+(push|reset|rebase|merge|checkout\s+-[bBf]|force|clean)\b/i,
  /^npm\s+(install|i\b|uninstall|publish|link|update)\b/i,
  /^(yarn|pnpm)\s+(install|add|remove|publish)\b/i,
  /^(chmod|chown|chgrp)\b/,
  /^(kill|killall|pkill)\b/,
  /^(systemctl|launchctl|service)\b/,
  /^(brew|apt|apt-get|yum|dnf|pip|pip3)\s+(install|uninstall|upgrade|remove)\b/i,
  /^(docker|kubectl)\s+(run|exec|rm|delete|apply|create)\b/i,
  /^(ssh|scp|rsync)\b/,
  /^(crontab|at)\b/,
];

function classifyCommand(cmd, userRules = { safe: [], needsPermission: [] }) {
  if (!cmd) return 'unknown';
  const trimmed = cmd.trim();

  // User-defined rules take priority
  for (const pattern of userRules.safe) {
    if (typeof pattern === 'string' ? trimmed.startsWith(pattern) : pattern.test(trimmed)) return 'safe';
  }
  for (const pattern of userRules.needsPermission) {
    if (typeof pattern === 'string' ? trimmed.startsWith(pattern) : pattern.test(trimmed)) return 'needs-permission';
  }

  // Already classified as dangerous by DANGEROUS_BASH
  for (const { re } of DANGEROUS_BASH) {
    if (re.test(trimmed)) return 'dangerous';
  }

  // Built-in safe patterns
  for (const re of SAFE_PATTERNS) {
    if (re.test(trimmed)) return 'safe';
  }

  // Built-in needs-permission patterns
  for (const re of NEEDS_PERMISSION_PATTERNS) {
    if (re.test(trimmed)) return 'needs-permission';
  }

  return 'needs-info';
}
const SESSION_INACTIVE_MS = 30 * 60 * 1000;
const BASH_SPIKE_WINDOW_MS = 5 * 60 * 1000;
const BASH_SPIKE_THRESHOLD = 20;
const TOOL_CALL_ALARM = 500;

const DANGEROUS_BASH = [
  { re: /rm\s+-rf?\s/,                label: 'rm -rf' },
  { re: /git\s+push.*--force/,        label: 'git push --force' },
  { re: /curl[^|]*\|[^|]*(bash|sh)/,  label: 'curl|bash' },
  { re: /wget[^|]*\|[^|]*(bash|sh)/,  label: 'wget|sh' },
  { re: /:\s*>\s*\/dev\/sda/,         label: 'disk wipe' },
  { re: /dd\s+if=.*of=\/dev\//,       label: 'dd disk write' },
  { re: /chmod\s+.*-R.*777/,          label: 'chmod -R 777' },
  { re: /chmod\s+777\s+-R/,           label: 'chmod -R 777' },
  { re: /chown\s+.*-R/,              label: 'chown -R' },
  { re: /ngrok\s+(tcp|http|tls)\s/,   label: 'ngrok tunnel' },
];

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?previous\s+instructions?/i,
  /disregard\s+(?:all\s+)?previous/i,
  /you\s+are\s+now\s+a?n?\s+/i,
  /new\s+(?:system\s+)?instructions?:/i,
  /act\s+as\s+(?:a|an)\s+/i,
  /pretend\s+you(?:'re|\s+are)/i,
  /\[SYSTEM\]/,
  /\[INST\]/,
];

const SENSITIVE_PATTERNS = [
  { re: /AKIA[0-9A-Z]{16}/,                               type: 'aws-key' },
  { re: /ghp_[A-Za-z0-9]{36}/,                            type: 'github-pat' },
  { re: /ghs_[A-Za-z0-9]{36}/,                            type: 'github-app-token' },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,   type: 'private-key' },
  { re: /sk-[A-Za-z0-9]{48}/,                             type: 'openai-key' },
  { re: /\bapi[_-]?key\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}(?![_\-](?:length|count|size|name|type)\b)/i, type: 'api-key' },
  { re: /\bpassword\s*[:=]\s*["'][^\s"']{8,}["']/i,       type: 'password' },
  { re: /\bsecret\s*[:=]\s*["'][A-Za-z0-9_\-]{12,}["']/i, type: 'secret' },
];

// Extract registrable root domain from a hostname using the URL itself — no static map.
// e.g. api.github.com → github.com, s3.us-east-1.amazonaws.com → amazonaws.com
// Handles compound TLDs like co.uk, com.au, org.uk by checking the second-to-last label.
const COMPOUND_SECOND_LABELS = new Set([
  'co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'ne', 'or', 'gr', 'sch',
]);

function extractRootDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;

  const secondToLast = parts[parts.length - 2];
  if (COMPOUND_SECOND_LABELS.has(secondToLast)) {
    return parts.slice(-3).join('.');
  }

  return parts.slice(-2).join('.');
}

class EventStore {
  constructor(config = {}) {
    this.sessions = new Map();
    this.toolCounts = new Map();
    this.domains = new Map();
    this.anomalies = [];
    this.skillRegistry = new Map();
    this.projects = new Map();
    this.projectRootCache = new Map();
    this.seenEventKeys = new Set();
    this.recentEvents = [];
    this.eventCount = 0;
    this.bashWindow = [];
    this._pendingCalls = new Map();
    this.commandLog = [];
    this.commandRules = { safe: [], needsPermission: [] };
    this.costEstimator = new CostEstimator(config.model || 'sonnet-4');
    this.stats = {
      totalTokens: { input: 0, output: 0 },
      totalCost: 0,
      dailyStats: new Map(),
    };
  }

  setCommandRules(rules) {
    this.commandRules = {
      safe: Array.isArray(rules.safe) ? rules.safe : [],
      needsPermission: Array.isArray(rules.needsPermission) ? rules.needsPermission : [],
    };
  }

  processEvents(events) {
    const processed = [];

    for (const event of events) {
      if (event._test) continue;

      const key = `${event.session_id}|${event.dashboard_ts}|${event.hook_event_name}|${event.tool_name}`;
      if (this.seenEventKeys.has(key)) continue;
      this.seenEventKeys.add(key);
      // Prevent unbounded growth — evict oldest entries when cap is reached
      if (this.seenEventKeys.size > 5000) {
        this.seenEventKeys.delete(this.seenEventKeys.values().next().value);
      }

      this.eventCount++;
      const enriched = this.processEvent(event);
      if (enriched) {
        processed.push(enriched);
        this.recentEvents.push(enriched);
        if (this.recentEvents.length > MAX_RECENT_EVENTS) this.recentEvents.shift();
      }
    }

    return processed;
  }

  processEvent(event) {
    const sessionId = event.session_id;
    if (!sessionId) return null;

    const hookEvent = event.hook_event_name;
    const ts = event.dashboard_ts || new Date().toISOString();

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, this.createSession(sessionId, event, ts));
    }

    const session = this.sessions.get(sessionId);
    session.lastActivity = ts;

    if (event.transcript_path) {
      const detected = this.detectModelFromTranscript(event.transcript_path);
      if (detected) session.model = detected;
    }

    let costInfo = { inputTokens: 0, outputTokens: 0, cost: 0 };

    switch (hookEvent) {
      case 'SessionStart':
        session.status = 'active';
        session.startedAt = ts;
        if (event.cwd) { session.cwd = event.cwd; this.trackProject(sessionId, event.cwd, ts); }
        if (event.permission_mode) session.permissionMode = event.permission_mode;
        break;

      case 'SessionEnd':
        session.status = 'ended';
        session.endedAt = ts;
        break;

      case 'PreToolUse':
        session.status = 'active';
        session.toolCallCount++;
        if (event.cwd) { session.cwd = event.cwd; this.trackProject(sessionId, event.cwd, ts); }

        if (event.tool_name) {
          this.toolCounts.set(event.tool_name, (this.toolCounts.get(event.tool_name) || 0) + 1);
          this.updateSkillRegistry(event.tool_name, event.tool_input, sessionId, ts);

          if (event.tool_name === 'Agent') {
            session.agents.push({
              id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              startedAt: ts,
              task: event.tool_input?.description || event.tool_input?.prompt?.slice(0, 100) || 'unknown',
              agentType: event.tool_input?.subagent_type || 'general-purpose',
              status: 'running',
              toolCalls: 0,
              endedAt: null,
            });
          }

          for (const url of this.extractUrls(event.tool_name, event.tool_input)) {
            const hostname = this.extractHostname(url);
            if (hostname) this.trackDomain(hostname, url, event.tool_name, sessionId, ts);
          }

          if (event.tool_name === 'Bash') this.trackBashAnomaly(event, session, sessionId, ts);

          if (session.toolCallCount === TOOL_CALL_ALARM) {
            this.addAnomaly('runaway-session', 'warning', sessionId,
              `Session has made ${TOOL_CALL_ALARM}+ tool calls — possible infinite loop`, ts);
          }

          this.scanForSensitiveData(event.tool_input, 'input', event.tool_name, session, ts);
        }

        costInfo = this.costEstimator.estimateEventCost(event, session.model);
        break;

      case 'PostToolUse':
        costInfo = this.costEstimator.estimateEventCost(event, session.model);
        this.scanForInjection(event, session, ts);
        this.scanForSensitiveData(event.tool_result, 'result', event.tool_name, session, ts);
        this.resolveSkillRegistryResult(event.tool_name, event.tool_result);
        break;

      case 'Stop':
        session.status = 'stopped';
        session.stoppedReason = event.reason;
        break;

      case 'SubagentStop': {
        const runningAgent = [...session.agents].reverse().find((a) => a.status === 'running');
        if (runningAgent) {
          runningAgent.status = event.reason === 'error' ? 'failed' : 'completed';
          runningAgent.endedAt = ts;
        }
        break;
      }

      case 'Notification':
        break;
    }

    if (costInfo.inputTokens > 0 || costInfo.outputTokens > 0) {
      session.tokens.input += costInfo.inputTokens;
      session.tokens.output += costInfo.outputTokens;
      session.cost += costInfo.cost;
      this.stats.totalTokens.input += costInfo.inputTokens;
      this.stats.totalTokens.output += costInfo.outputTokens;
      this.stats.totalCost += costInfo.cost;

      const day = ts.slice(0, 10);
      if (!this.stats.dailyStats.has(day)) {
        this.stats.dailyStats.set(day, { tokens: { input: 0, output: 0 }, cost: 0, events: 0, sessions: new Set() });
      }
      const daily = this.stats.dailyStats.get(day);
      daily.tokens.input += costInfo.inputTokens;
      daily.tokens.output += costInfo.outputTokens;
      daily.cost += costInfo.cost;
      daily.events++;
      daily.sessions.add(sessionId);
    }

    return {
      ...event,
      _processed: { sessionId, hookEvent, ts, costInfo, sessionStatus: session.status },
    };
  }

  createSession(sessionId, event, ts) {
    return {
      sessionId,
      startedAt: ts,
      endedAt: null,
      cwd: event.cwd || 'unknown',
      permissionMode: event.permission_mode || 'unknown',
      status: 'active',
      toolCallCount: 0,
      agents: [],
      tokens: { input: 0, output: 0 },
      cost: 0,
      lastActivity: ts,
      stoppedReason: null,
      model: null,
      injectionRisk: 0,
      injectionFlags: [],
      hasSensitiveData: false,
      sensitiveDataFlags: [],
      dangerousCommands: [],
    };
  }

  trackBashAnomaly(event, session, sessionId, ts) {
    const now = new Date(ts).getTime();
    this.bashWindow = this.bashWindow.filter(
      (e) => now - new Date(e.ts).getTime() < BASH_SPIKE_WINDOW_MS
    );
    this.bashWindow.push({ ts, sessionId });

    const sessionCount = this.bashWindow.filter((e) => e.sessionId === sessionId).length;
    // Fire at threshold and every 10 calls after — avoids both boundary misses and alert spam
    if (sessionCount >= BASH_SPIKE_THRESHOLD && (sessionCount - BASH_SPIKE_THRESHOLD) % 10 === 0) {
      this.addAnomaly('bash-spike', 'warning', sessionId,
        `${sessionCount} Bash calls in 5 minutes — possible runaway loop`, ts);
    }

    const cmd = typeof event.tool_input === 'object'
      ? (event.tool_input?.command || JSON.stringify(event.tool_input))
      : String(event.tool_input || '');

    const classification = classifyCommand(cmd, this.commandRules);
    if (this.commandLog.length >= MAX_COMMAND_LOG) this.commandLog.shift();
    this.commandLog.push({
      ts,
      sessionId,
      cwd: event.cwd || session.cwd || 'unknown',
      cmd: cmd.slice(0, 500),
      classification,
    });

    for (const { re, label } of DANGEROUS_BASH) {
      if (re.test(cmd)) {
        session.dangerousCommands.push({ label, ts, snippet: cmd.slice(0, 80) });
        const severity = session.permissionMode === 'bypassPermissions' ? 'critical' : 'warning';
        this.addAnomaly('dangerous-command', severity, sessionId,
          `Dangerous command: ${label}${session.permissionMode === 'bypassPermissions' ? ' (bypass mode!)' : ''}`, ts);
        break;
      }
    }
  }

  addAnomaly(type, severity, sessionId, message, ts) {
    if (this.anomalies.length >= 200) this.anomalies.shift();
    this.anomalies.push({
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      severity,
      sessionId,
      message,
      ts,
      acknowledged: false,
    });
  }

  scanForInjection(event, session, ts) {
    if (!event.tool_result) return;
    const raw = typeof event.tool_result === 'string' ? event.tool_result : JSON.stringify(event.tool_result);
    // Truncate before regex scan to prevent ReDoS on large tool results
    const text = raw.slice(0, 10000);

    for (const re of INJECTION_PATTERNS) {
      const m = re.exec(text);
      if (m) {
        if (session.injectionFlags.length < 20) {
          session.injectionFlags.push({
            pattern: re.source.slice(0, 40),
            snippet: m[0].slice(0, 60),
            toolName: event.tool_name,
            ts,
          });
        }
        session.injectionRisk = Math.min(session.injectionFlags.length, 10);
        if (session.injectionRisk === 3) {
          this.addAnomaly('injection-risk', 'critical', session.sessionId,
            `Prompt injection detected in ${event.tool_name}: "${m[0].slice(0, 50)}"`, ts);
        }
        break;
      }
    }
  }

  scanForSensitiveData(data, field, toolName, session, ts) {
    if (!data) return;
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    // Truncate before regex scan to prevent ReDoS on large payloads
    const text = raw.slice(0, 10000);
    for (const { re, type } of SENSITIVE_PATTERNS) {
      if (re.test(text)) {
        if (session.sensitiveDataFlags.length < 50) {
          session.sensitiveDataFlags.push({ type, field, toolName, ts });
        }
        session.hasSensitiveData = true;
        if (session.sensitiveDataFlags.length === 1) {
          this.addAnomaly('sensitive-data', 'critical', session.sessionId,
            `Sensitive data (${type}) detected in ${field} of ${toolName}`, ts);
        }
        break;
      }
    }
  }

  updateSkillRegistry(toolName, toolInput, sessionId, ts) {
    let key = toolName;
    let type = 'builtin';

    if (toolName.startsWith('mcp__')) {
      type = 'mcp';
    } else if (toolName === 'Skill' && toolInput?.skill) {
      key = `skill:${toolInput.skill}`;
      type = 'skill';
    } else if (toolName === 'Agent') {
      key = `agent:${toolInput?.subagent_type || 'general-purpose'}`;
      type = 'agent';
    }

    if (!this.skillRegistry.has(key)) {
      this.skillRegistry.set(key, {
        key,
        displayName: key.startsWith('skill:') ? key.slice(6) : key.startsWith('agent:') ? key.slice(6) : toolName,
        type,
        callCount: 0,
        errorCount: 0,
        sessions: new Set(),
        lastUsed: ts,
      });
    }
    const entry = this.skillRegistry.get(key);
    entry.callCount++;
    entry.sessions.add(sessionId);
    entry.lastUsed = ts;
    this._pendingCalls.set(`${sessionId}:${toolName}`, key);
  }

  resolveSkillRegistryResult(toolName, toolResult) {
    for (const [k, registryKey] of this._pendingCalls.entries()) {
      if (k.endsWith(`:${toolName}`)) {
        const isError = toolResult && (
          (typeof toolResult === 'string' && /error/i.test(toolResult)) ||
          (typeof toolResult === 'object' && toolResult?.error)
        );
        if (isError && this.skillRegistry.has(registryKey)) {
          this.skillRegistry.get(registryKey).errorCount++;
        }
        this._pendingCalls.delete(k);
        break;
      }
    }
  }

  resolveProjectRoot(cwd) {
    if (!cwd || cwd === 'unknown') return null;
    if (this.projectRootCache.has(cwd)) return this.projectRootCache.get(cwd);

    // spawnSync with array args — no shell, no injection risk
    const result = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      timeout: 2000,
    });

    if (result.status === 0 && result.stdout && result.stdout.trim()) {
      const root = result.stdout.trim();
      this.projectRootCache.set(cwd, root);
      return root;
    }

    const fallback = cwd.split(path.sep).filter(Boolean).slice(-2).join(path.sep);
    this.projectRootCache.set(cwd, fallback);
    return fallback;
  }

  trackProject(sessionId, cwd, ts) {
    const root = this.resolveProjectRoot(cwd);
    if (!root) return;

    if (!this.projects.has(root)) {
      this.projects.set(root, {
        root,
        displayName: root.split(path.sep).pop() || root,
        sessions: new Set(),
        toolCounts: new Map(),
        totalToolCalls: 0,
        lastActive: ts,
      });
    }
    const proj = this.projects.get(root);
    proj.sessions.add(sessionId);
    proj.lastActive = ts;
  }

  getSessions() {
    const sessions = Array.from(this.sessions.values());
    const now = Date.now();
    for (const s of sessions) {
      if (s.status === 'active' && now - new Date(s.lastActivity).getTime() > SESSION_INACTIVE_MS) {
        s.status = 'inactive';
      }
    }
    return sessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  }

  getRecentEvents(filters = {}) {
    let events = [...this.recentEvents];
    if (filters.sessionId) events = events.filter((e) => e.session_id === filters.sessionId);
    if (filters.toolName) events = events.filter((e) => e.tool_name === filters.toolName);
    if (filters.hookEvent) events = events.filter((e) => e.hook_event_name === filters.hookEvent);
    if (filters.limit) events = events.slice(-filters.limit);
    return events;
  }

  getStats() {
    const dailyArray = [];
    for (const [day, data] of this.stats.dailyStats) {
      dailyArray.push({ date: day, tokens: data.tokens, cost: data.cost, events: data.events, sessions: data.sessions.size });
    }
    dailyArray.sort((a, b) => b.date.localeCompare(a.date));

    const permissionModes = { default: 0, acceptEdits: 0, bypassPermissions: 0, unknown: 0 };
    for (const s of this.sessions.values()) {
      const mode = s.permissionMode || 'unknown';
      permissionModes[mode] = (permissionModes[mode] || 0) + 1;
    }

    return {
      totalEvents: this.eventCount,
      totalSessions: this.sessions.size,
      activeSessions: this.getSessions().filter((s) => s.status === 'active').length,
      totalTokens: this.stats.totalTokens,
      totalCost: this.stats.totalCost,
      toolCounts: Object.fromEntries(this.toolCounts),
      daily: dailyArray,
      permissionModes,
      anomalyCount: this.anomalies.filter((a) => !a.acknowledged).length,
      criticalAnomalyCount: this.anomalies.filter((a) => !a.acknowledged && a.severity === 'critical').length,
    };
  }

  getAnomalies() {
    return [...this.anomalies].reverse();
  }

  getCommandLog(limit = 200) {
    return this.commandLog.slice(-limit).reverse();
  }

  getSkillRegistry() {
    return Array.from(this.skillRegistry.values())
      .map((e) => ({
        key: e.key,
        displayName: e.displayName,
        type: e.type,
        callCount: e.callCount,
        errorCount: e.errorCount,
        errorRate: e.callCount > 0 ? Math.round((e.errorCount / e.callCount) * 100) : 0,
        sessionCount: e.sessions.size,
        lastUsed: e.lastUsed,
      }))
      .sort((a, b) => b.callCount - a.callCount);
  }

  getProjects() {
    return Array.from(this.projects.values())
      .map((p) => ({
        root: p.root,
        displayName: p.displayName,
        sessionCount: p.sessions.size,
        totalToolCalls: p.totalToolCalls,
        topTools: Array.from(p.toolCounts.entries())
          .sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([name, count]) => ({ name, count })),
        lastActive: p.lastActive,
        anomalyCount: this.anomalies.filter((a) => {
          const s = this.sessions.get(a.sessionId);
          return s && this.resolveProjectRoot(s.cwd) === p.root;
        }).length,
      }))
      .sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));
  }

  setModel(model) {
    this.costEstimator.setModel(model);
  }

  detectModelFromTranscript(transcriptPath) {
    try {
      if (!transcriptPath || typeof transcriptPath !== 'string') return null;
      const home = process.env.HOME || process.env.USERPROFILE || '/';
      const resolved = path.resolve(transcriptPath);
      if (!resolved.startsWith(home + path.sep)) return null;
      const stat = fs.statSync(resolved);
      // Read last 8KB — enough to cover recent entries without loading the full transcript
      const readSize = Math.min(8192, stat.size);
      const buf = Buffer.alloc(readSize);
      const fd = fs.openSync(resolved, 'r');
      fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
      fs.closeSync(fd);
      const lines = buf.toString('utf-8').split('\n').reverse();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          const model = entry.message && entry.message.model;
          if (model && typeof model === 'string') {
            const mapped = this.mapModelId(model);
            if (mapped) return mapped;
          }
        } catch { /* skip partial/unparseable lines */ }
      }
    } catch { /* transcript unreadable */ }
    return null;
  }

  mapModelId(modelId) {
    const id = modelId.toLowerCase();
    if (id.includes('opus')) return 'opus-4';
    if (id.includes('haiku')) return 'haiku-3.5';
    if (id.includes('sonnet')) return 'sonnet-4';
    return null;
  }

  extractUrls(toolName, toolInput) {
    if (!toolInput) return [];
    const urls = new Set();
    if (typeof toolInput.url === 'string' && /^https?:\/\//.test(toolInput.url)) {
      urls.add(toolInput.url);
    }
    const str = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput);
    for (const m of str.match(/https?:\/\/[^\s"'\\,}\]>]+/g) || []) {
      urls.add(m.replace(/[.,;)]+$/, ''));
    }
    return Array.from(urls);
  }

  extractHostname(url) {
    try { return new URL(url).hostname; } catch { return null; }
  }

  categorizeDomain(hostname) {
    const local = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
    if (local.includes(hostname) || hostname.endsWith('.local')) return 'local';
    if (hostname.endsWith('anthropic.com') || hostname.endsWith('claude.ai')) return 'anthropic';
    return 'external';
  }

  // Derive owner from the URL itself: show root domain when it differs from hostname.
  // e.g. api.github.com → "github.com", img.shields.io → "shields.io"
  // Returns null when hostname IS the root (no badge needed — it's obvious).
  resolveOwner(hostname) {
    const root = extractRootDomain(hostname);
    return root !== hostname ? root : null;
  }

  trackDomain(hostname, url, toolName, sessionId, ts) {
    const isNew = !this.domains.has(hostname);
    if (isNew) {
      this.domains.set(hostname, {
        hostname, count: 0, tools: new Set(), sessions: new Set(),
        recentUrls: [], firstSeen: ts, lastSeen: ts,
        category: this.categorizeDomain(hostname),
      });
      if (this.categorizeDomain(hostname) === 'external') {
        this.addAnomaly('new-domain', 'warning', sessionId,
          `New external domain: ${hostname} (via ${toolName})`, ts);
      }
    }
    const entry = this.domains.get(hostname);
    entry.count++;
    entry.tools.add(toolName);
    entry.sessions.add(sessionId);
    entry.lastSeen = ts;
    if (entry.recentUrls.length >= 20) entry.recentUrls.shift();
    if (!entry.recentUrls.includes(url)) entry.recentUrls.push(url);
  }

  getDomains() {
    return Array.from(this.domains.values())
      .map((d) => ({
        hostname: d.hostname,
        owner: this.resolveOwner(d.hostname),
        count: d.count,
        tools: Array.from(d.tools),
        sessionCount: d.sessions.size,
        recentUrls: d.recentUrls.slice(-5),
        firstSeen: d.firstSeen,
        lastSeen: d.lastSeen,
        category: d.category,
      }))
      .sort((a, b) => b.count - a.count);
  }
}

module.exports = { EventStore };
