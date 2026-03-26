'use strict';

const fs = require('fs');
const path = require('path');
// spawnSync with array args — no shell invocation, no injection risk
const { spawnSync } = require('child_process');

// Sanitize CSV cell: prevent formula injection and quote fields with commas/newlines
function csvCell(value) {
  const s = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[,"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const CONFIG_ALLOWLIST = new Set(['port', 'model', 'theme', 'billingMode']);

function registerRoutes(app, eventStore, dataDir) {
  // GET /api/sessions — list of sessions with stats
  app.get('/api/sessions', (req, res) => {
    res.json(eventStore.getSessions());
  });

  // GET /api/events — recent events with optional filters
  app.get('/api/events', (req, res) => {
    const filters = {};
    if (req.query.session) filters.sessionId = req.query.session;
    if (req.query.tool) filters.toolName = req.query.tool;
    if (req.query.event) filters.hookEvent = req.query.event;
    const limit = parseInt(req.query.limit, 10);
    if (Number.isFinite(limit) && limit > 0) filters.limit = limit;

    res.json(eventStore.getRecentEvents(filters));
  });

  // GET /api/stats — aggregated analytics
  app.get('/api/stats', (req, res) => {
    res.json(eventStore.getStats());
  });

  // GET /api/export — export data as CSV or JSON
  app.get('/api/export', (req, res) => {
    const format = req.query.format || 'json';
    const events = eventStore.getRecentEvents({});

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=llmboard-export.csv'
      );

      const header =
        'timestamp,session_id,hook_event,tool_name,cwd,est_input_tokens,est_output_tokens,est_cost\n';
      res.write(header);

      for (const e of events) {
        const p = e._processed || {};
        const row = [
          csvCell(p.ts),
          csvCell(e.session_id),
          csvCell(e.hook_event_name),
          csvCell(e.tool_name),
          `"${(e.cwd || '').replace(/"/g, '""')}"`,
          p.costInfo?.inputTokens || 0,
          p.costInfo?.outputTokens || 0,
          p.costInfo?.cost?.toFixed(6) || '0',
        ].join(',');
        res.write(row + '\n');
      }

      res.end();
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=llmboard-export.json'
      );
      res.json(events);
    }
  });

  // GET /api/config — current dashboard configuration
  app.get('/api/config', (req, res) => {
    const configPath = path.join(dataDir, 'config.json');
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      res.json(config);
    } catch {
      res.json({
        port: 3456,
        model: 'sonnet-4',
        theme: 'dark',
      });
    }
  });

  // POST /api/config — update configuration
  app.post('/api/config', (req, res) => {
    const configPath = path.join(dataDir, 'config.json');
    let config = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // start fresh if file is missing or corrupt
    }

    for (const [k, v] of Object.entries(req.body)) {
      if (!CONFIG_ALLOWLIST.has(k)) continue;
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
      config[k] = v;
    }
    fs.writeFileSync(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );

    if (req.body.model) {
      eventStore.setModel(req.body.model);
    }

    res.json(config);
  });

  // GET /api/network — outbound domain tracking
  app.get('/api/network', (req, res) => {
    res.json(eventStore.getDomains());
  });

  // GET /api/anomalies — detected anomalies list
  app.get('/api/anomalies', (req, res) => {
    res.json(eventStore.getAnomalies());
  });

  // POST /api/anomalies/:id/acknowledge — mark anomaly seen
  app.post('/api/anomalies/:id/acknowledge', (req, res) => {
    const anomalies = eventStore.getAnomalies();
    const anomaly = anomalies.find((a) => a.id === req.params.id);
    if (!anomaly) return res.status(404).json({ error: 'Not found' });
    anomaly.acknowledged = true;
    res.json({ ok: true });
  });

  // GET /api/projects — project intelligence
  app.get('/api/projects', (req, res) => {
    res.json(eventStore.getProjects());
  });

  // GET /api/skills — skill/plugin registry
  app.get('/api/skills', (req, res) => {
    res.json(eventStore.getSkillRegistry());
  });

  // GET /api/digest — daily digest summary
  app.get('/api/digest', (req, res) => {
    const stats = eventStore.getStats();
    const sessions = eventStore.getSessions();
    const today = new Date().toISOString().slice(0, 10);
    const dailyStats = stats.daily.find((d) => d.date === today) || { tokens: { input: 0, output: 0 }, cost: 0, events: 0, sessions: 0 };
    const todaySessions = sessions.filter((s) => s.startedAt && s.startedAt.startsWith(today));
    const anomalies = eventStore.getAnomalies().filter((a) => a.ts && a.ts.startsWith(today));
    const skillRegistry = eventStore.getSkillRegistry();
    const topSkills = skillRegistry.slice(0, 5);
    res.json({
      date: today,
      sessions: todaySessions.length,
      events: dailyStats.events,
      tokens: dailyStats.tokens,
      cost: dailyStats.cost,
      anomalies: anomalies.length,
      criticalAnomalies: anomalies.filter((a) => a.severity === 'critical').length,
      topSkills,
      projects: eventStore.getProjects().slice(0, 5),
    });
  });

  // GET /api/git?cwd=<path> — git info for any project root directory
  app.get('/api/git', (req, res) => {
    const cwd = req.query.cwd;
    if (!cwd) return res.status(400).json({ error: 'cwd required' });
    const home = process.env.HOME || '/';
    const resolved = path.resolve(cwd);
    if (!resolved.startsWith(home)) return res.status(403).json({ error: 'Forbidden' });

    const ok = (r) => r.error == null && r.status === 0;
    const str = (r) => ok(r) ? (r.stdout.trim() || null) : null;

    const branch     = spawnSync('git', ['-C', resolved, 'branch', '--show-current'],                     { encoding: 'utf-8', timeout: 3000 });
    const repoName   = spawnSync('git', ['-C', resolved, 'rev-parse', '--show-toplevel'],                 { encoding: 'utf-8', timeout: 3000 });
    const dirty      = spawnSync('git', ['-C', resolved, 'status', '--porcelain', '--short'],             { encoding: 'utf-8', timeout: 3000 });
    const userName   = spawnSync('git', ['-C', resolved, 'config', 'user.name'],                         { encoding: 'utf-8', timeout: 3000 });
    const userEmail  = spawnSync('git', ['-C', resolved, 'config', 'user.email'],                        { encoding: 'utf-8', timeout: 3000 });
    const remoteUrl  = spawnSync('git', ['-C', resolved, 'remote', 'get-url', 'origin'],                 { encoding: 'utf-8', timeout: 3000 });
    const lastCommit = spawnSync('git', ['-C', resolved, 'log', '-1', '--format=%H\x1f%s\x1f%an\x1f%ar'], { encoding: 'utf-8', timeout: 3000 });

    let commit = null;
    if (ok(lastCommit) && lastCommit.stdout.trim()) {
      const [hash, subject, author, relDate] = lastCommit.stdout.trim().split('\x1f');
      commit = { hash: hash.slice(0, 7), subject, author, relDate };
    }

    res.json({
      branch:     str(branch)   || null,
      repoName:   ok(repoName)  ? path.basename(repoName.stdout.trim()) : null,
      dirty:      ok(dirty)     ? dirty.stdout.trim().split('\n').filter(Boolean).length : 0,
      userName:   str(userName),
      userEmail:  str(userEmail),
      remoteUrl:  str(remoteUrl),
      commit,
    });
  });

  // GET /api/sessions/:id/git — git diff for session's working directory
  app.get('/api/sessions/:id/git', (req, res) => {
    const sessions = eventStore.getSessions();
    const session = sessions.find((s) => s.sessionId === req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const cwd = session.cwd;
    if (!cwd || cwd === 'unknown') return res.json({ diff: null, branch: null, status: null });

    // cwd comes from session data written by the hook, not user input — array args to spawnSync, no shell
    const branch = spawnSync('git', ['-C', cwd, 'branch', '--show-current'], { encoding: 'utf-8', timeout: 3000 });
    const status = spawnSync('git', ['-C', cwd, 'status', '--short'], { encoding: 'utf-8', timeout: 3000 });
    const diff = spawnSync('git', ['-C', cwd, 'diff', '--stat', 'HEAD'], { encoding: 'utf-8', timeout: 3000 });

    const ok = (r) => r.error == null && r.status === 0;
    res.json({
      branch: ok(branch) ? (branch.stdout.trim() || null) : null,
      status: ok(status) ? status.stdout.trim() : null,
      diff: ok(diff) ? diff.stdout.trim() : null,
      timedOut: [branch, status, diff].some((r) => r.error && r.error.code === 'ETIMEDOUT'),
    });
  });

  // GET /api/sessions/:id/claudemd — CLAUDE.md rules for session's directory
  app.get('/api/sessions/:id/claudemd', (req, res) => {
    const sessions = eventStore.getSessions();
    const session = sessions.find((s) => s.sessionId === req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const cwd = session.cwd;
    if (!cwd || cwd === 'unknown') return res.json({ files: [] });

    const home = process.env.HOME || '/';
    const resolvedCwd = path.resolve(cwd);
    if (!resolvedCwd.startsWith(home)) return res.json({ files: [] });

    const candidates = [
      path.join(resolvedCwd, 'CLAUDE.md'),
      path.join(home, '.claude', 'CLAUDE.md'),
    ];

    const files = [];
    for (const f of candidates) {
      try {
        const content = fs.readFileSync(f, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim());
        files.push({ path: f, lineCount: lines.length, preview: lines.slice(0, 5).join('\n') });
      } catch {
        // file doesn't exist or not readable
      }
    }
    res.json({ files });
  });

  // GET /api/commands — executed bash command log with permission classifications
  app.get('/api/commands', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    res.json(eventStore.getCommandLog(limit));
  });

  // GET /api/command-rules — user-defined classification rules
  app.get('/api/command-rules', (req, res) => {
    const rulesPath = path.join(dataDir, 'command-rules.json');
    try {
      res.json(JSON.parse(fs.readFileSync(rulesPath, 'utf-8')));
    } catch {
      res.json({ safe: [], needsPermission: [] });
    }
  });

  // POST /api/command-rules — save and apply user-defined classification rules
  app.post('/api/command-rules', (req, res) => {
    const { safe, needsPermission } = req.body || {};
    if (!Array.isArray(safe) || !Array.isArray(needsPermission)) {
      return res.status(400).json({ error: 'safe and needsPermission must be arrays' });
    }
    // Only allow string values (prefix matches)
    const safeClean = safe.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim());
    const needsPerm = needsPermission.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim());
    const rules = { safe: safeClean, needsPermission: needsPerm };
    const rulesPath = path.join(dataDir, 'command-rules.json');
    fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2) + '\n', 'utf-8');
    eventStore.setCommandRules(rules);
    res.json(rules);
  });

  // GET /api/health — simple health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      events: eventStore.eventCount,
      sessions: eventStore.sessions.size,
    });
  });
}

module.exports = { registerRoutes };
