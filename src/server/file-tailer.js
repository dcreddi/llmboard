'use strict';

const fs = require('fs');

class FileTailer {
  constructor(filePath) {
    this.filePath = filePath;
    this.offset = 0;
    this.partialLine = '';
  }

  readNewLines() {
    let fd;
    try {
      fd = fs.openSync(this.filePath, 'r');
    } catch {
      // File doesn't exist yet — that's fine
      return [];
    }

    try {
      const stat = fs.fstatSync(fd);

      // File was rotated or truncated (size shrunk)
      if (stat.size < this.offset) {
        this.offset = 0;
        this.partialLine = '';
      }

      const bytesToRead = stat.size - this.offset;
      if (bytesToRead <= 0) {
        return [];
      }

      const buf = Buffer.alloc(bytesToRead);
      fs.readSync(fd, buf, 0, bytesToRead, this.offset);
      this.offset = stat.size;

      const text = this.partialLine + buf.toString('utf-8');
      const lines = text.split('\n');

      // Last element may be incomplete if the writer hasn't flushed a newline yet
      this.partialLine = lines.pop() || '';

      const events = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed));
        } catch {
          // Skip malformed lines silently
        }
      }
      return events;
    } finally {
      fs.closeSync(fd);
    }
  }

  reset() {
    this.offset = 0;
    this.partialLine = '';
  }
}

module.exports = { FileTailer };
