'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../electron/store');

test('store persists values and survives corrupt files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'island-store-'));
  const file = path.join(dir, 'state.json');

  const a = new Store(file, 5);
  assert.equal(a.get('missing', 'fallback'), 'fallback');
  a.set('inbox', [{ id: '1' }]);
  a.flush();

  const b = new Store(file);
  assert.deepEqual(b.get('inbox'), [{ id: '1' }]);

  fs.writeFileSync(file, '{not json');
  const c = new Store(file);
  assert.equal(c.get('inbox', null), null);

  fs.rmSync(dir, { recursive: true, force: true });
});
