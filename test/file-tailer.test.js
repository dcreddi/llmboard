'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { FileTailer } = require('../src/server/file-tailer');

function createTmpFile(content) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tailer-test-'));
  const filePath = path.join(tmpDir, 'events.jsonl');
  if (content) fs.writeFileSync(filePath, content, 'utf-8');
  return { filePath, tmpDir };
}

describe('FileTailer', () => {
  test('reads initial lines from file', () => {
    const event1 = JSON.stringify({ id: 1 });
    const event2 = JSON.stringify({ id: 2 });
    const { filePath, tmpDir } = createTmpFile(event1 + '\n' + event2 + '\n');

    const tailer = new FileTailer(filePath);
    const events = tailer.readNewLines();

    assert.equal(events.length, 2);
    assert.equal(events[0].id, 1);
    assert.equal(events[1].id, 2);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('reads only new lines on subsequent calls', () => {
    const event1 = JSON.stringify({ id: 1 });
    const { filePath, tmpDir } = createTmpFile(event1 + '\n');

    const tailer = new FileTailer(filePath);

    // First read
    const first = tailer.readNewLines();
    assert.equal(first.length, 1);

    // Append new event
    const event2 = JSON.stringify({ id: 2 });
    fs.appendFileSync(filePath, event2 + '\n');

    // Second read — only new event
    const second = tailer.readNewLines();
    assert.equal(second.length, 1);
    assert.equal(second[0].id, 2);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('handles file rotation (size shrinks)', () => {
    const { filePath, tmpDir } = createTmpFile(
      JSON.stringify({ id: 1 }) + '\n' +
      JSON.stringify({ id: 2 }) + '\n' +
      JSON.stringify({ id: 3 }) + '\n'
    );

    const tailer = new FileTailer(filePath);
    tailer.readNewLines(); // read all 3

    // Simulate rotation — overwrite with smaller file
    fs.writeFileSync(filePath, JSON.stringify({ id: 4 }) + '\n');

    const events = tailer.readNewLines();
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 4);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('handles missing file gracefully', () => {
    const tailer = new FileTailer('/tmp/nonexistent-file-' + Date.now() + '.jsonl');
    const events = tailer.readNewLines();
    assert.equal(events.length, 0);
  });

  test('skips malformed JSON lines', () => {
    const { filePath, tmpDir } = createTmpFile(
      JSON.stringify({ id: 1 }) + '\n' +
      'not json\n' +
      JSON.stringify({ id: 3 }) + '\n'
    );

    const tailer = new FileTailer(filePath);
    const events = tailer.readNewLines();

    assert.equal(events.length, 2);
    assert.equal(events[0].id, 1);
    assert.equal(events[1].id, 3);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('handles partial lines across reads', () => {
    const { filePath, tmpDir } = createTmpFile('');

    const tailer = new FileTailer(filePath);

    // Write partial line (no newline)
    fs.writeFileSync(filePath, '{"id":');

    let events = tailer.readNewLines();
    assert.equal(events.length, 0); // Partial, not returned

    // Complete the line
    fs.appendFileSync(filePath, '1}\n');

    events = tailer.readNewLines();
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 1);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('reset() starts reading from beginning', () => {
    const { filePath, tmpDir } = createTmpFile(
      JSON.stringify({ id: 1 }) + '\n' +
      JSON.stringify({ id: 2 }) + '\n'
    );

    const tailer = new FileTailer(filePath);
    tailer.readNewLines(); // read all

    tailer.reset();
    const events = tailer.readNewLines();
    assert.equal(events.length, 2);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
