'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const chokidar = require('chokidar');
const { FileTailer } = require('./file-tailer');
const { EventStore } = require('./event-store');
const { registerRoutes } = require('./routes');

const DATA_DIR = path.join(process.env.HOME || require('os').homedir(), '.llmboard');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`Failed to load config: ${e.message}`);
    return { port: 3456, model: 'sonnet-4', theme: 'dark' };
  }
}

function findPort(preferred) {
  return new Promise((resolve, reject) => {
    function tryPort(port) {
      if (port > 65535) { reject(new Error('No available ports found in range 3456–65535')); return; }
      const server = http.createServer();
      server.listen(port, () => { server.close(() => resolve(port)); });
      server.on('error', () => tryPort(port + 1));
    }
    tryPort(preferred);
  });
}

async function startServer(options = {}) {
  const config = loadConfig();
  const preferredPort = options.port || config.port || 3456;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(EVENTS_FILE)) {
    fs.writeFileSync(EVENTS_FILE, '', 'utf-8');
  }

  const eventStore = new EventStore({ model: config.model });

  // Load user-defined command rules if present
  const rulesPath = path.join(DATA_DIR, 'command-rules.json');
  try {
    eventStore.setCommandRules(JSON.parse(fs.readFileSync(rulesPath, 'utf-8')));
  } catch { /* file doesn't exist yet — defaults apply */ }

  const tailer = new FileTailer(EVENTS_FILE);

  const existingEvents = tailer.readNewLines();
  if (existingEvents.length > 0) {
    eventStore.processEvents(existingEvents);
    console.log(`Loaded ${existingEvents.length} existing events`);
  }

  const app = express();

  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self'");
    next();
  });

  // Simple in-memory rate limiter: max 120 requests/min per IP on /api/ routes
  const _rateBuckets = new Map();
  app.use('/api/', (req, res, next) => {
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const bucket = _rateBuckets.get(ip) || { count: 0, start: now };
    if (now - bucket.start > 60000) { bucket.count = 0; bucket.start = now; }
    bucket.count++;
    _rateBuckets.set(ip, bucket);
    if (bucket.count > 120) return res.status(429).json({ error: 'Too many requests' });
    next();
  });

  app.use(express.json({ limit: '64kb' }));
  app.use(express.static(path.join(__dirname, '../public')));

  registerRoutes(app, eventStore, DATA_DIR);

  // Fallback to index.html for client-side routing
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set();

  // Heartbeat: ping every 30s, drop clients that don't pong back
  const heartbeat = setInterval(() => {
    for (const ws of clients) {
      if (!ws._alive) {
        clients.delete(ws);
        ws.terminate();
      } else {
        ws._alive = false;
        try { ws.ping(); } catch { clients.delete(ws); }
      }
    }
  }, 30000);
  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', (ws) => {
    ws._alive = true;
    ws.on('pong', () => { ws._alive = true; });
    clients.add(ws);
    console.log(
      `WebSocket client connected (${clients.size} total)`
    );

    try {
      ws.send(
        JSON.stringify({
          type: 'init',
          sessions: eventStore.getSessions(),
          stats: eventStore.getStats(),
          recentEvents: eventStore.getRecentEvents({ limit: 100 }),
          domains: eventStore.getDomains(),
          anomalies: eventStore.getAnomalies(),
          projects: eventStore.getProjects(),
          skillRegistry: eventStore.getSkillRegistry(),
          commandLog: eventStore.getCommandLog(50),
        })
      );
    } catch (err) {
      console.error(`Failed to send init to new client: ${err.message}`);
      clients.delete(ws);
    }

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error(`WebSocket client error: ${err.message}`);
      clients.delete(ws);
    });
  });

  function broadcast(events) {
    if (clients.size === 0 || events.length === 0) return;

    let message;
    try {
      message = JSON.stringify({
        type: 'events',
        events,
        sessions: eventStore.getSessions(),
        stats: eventStore.getStats(),
        domains: eventStore.getDomains(),
        anomalies: eventStore.getAnomalies(),
        projects: eventStore.getProjects(),
        skillRegistry: eventStore.getSkillRegistry(),
        commandLog: eventStore.getCommandLog(50),
      });
    } catch (err) {
      console.error(`Broadcast serialization failed: ${err.message}`);
      return;
    }

    for (const ws of clients) {
      try {
        if (ws.readyState === ws.OPEN) {
          ws.send(message);
        }
      } catch (err) {
        console.error(`WebSocket send failed, removing client: ${err.message}`);
        clients.delete(ws);
      }
    }
  }

  const watcher = chokidar.watch(EVENTS_FILE, {
    persistent: true,
    usePolling: false,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  watcher.on('change', () => {
    try {
      const newEvents = tailer.readNewLines();
      if (newEvents.length > 0) {
        const processed = eventStore.processEvents(newEvents);
        broadcast(processed);
      }
    } catch (err) {
      console.error(`Error reading new events: ${err.message}`);
    }
  });

  // Reset tailer on file rotation
  watcher.on('add', () => {
    try {
      tailer.reset();
      const newEvents = tailer.readNewLines();
      if (newEvents.length > 0) {
        const processed = eventStore.processEvents(newEvents);
        broadcast(processed);
      }
    } catch (err) {
      console.error(`Error reading events after rotation: ${err.message}`);
    }
  });

  const port = await findPort(preferredPort);

  return new Promise((resolve) => {
    server.listen(port, () => {
      if (port !== preferredPort) {
        console.log(
          `Port ${preferredPort} in use, using ${port} instead`
        );
      }
      console.log(`Claude Dashboard running at http://localhost:${port}`);
      console.log(`Watching: ${EVENTS_FILE}`);
      console.log(`WebSocket: ws://localhost:${port}/ws`);
      console.log('\nPress Ctrl+C to stop\n');
      resolve({ server, port, wss, watcher, eventStore });
    });
  });
}

module.exports = { startServer, loadConfig };

if (require.main === module) {
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err.message);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
  });
  startServer().catch(console.error);
}
