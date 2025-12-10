import assert from 'assert';

import { loadPreferences, savePreferences, clearPreferences } from '../public/src/core/storage.js';
import { APP_CONSTANTS } from '../public/src/config.js';

const STORAGE_KEY = 'hostelhub:v40:prefs';

function createMockLocalStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    }
  };
}

function withWindowStorage(storage) {
  global.window = { localStorage: storage };
}

function teardownWindow() {
  delete global.window;
}

function testPersistenceAndLimits() {
  withWindowStorage(createMockLocalStorage());

  const defaults = loadPreferences();
  assert.deepStrictEqual(defaults, {
    gender: '',
    college: '',
    commType: 'video',
    interests: []
  });

  const interests = ['music', 'coding', 'travel', 'art', 'gaming', 'extra'];
  savePreferences({ gender: 'male', college: 'VIT AP', commType: 'audio', interests });

  const loaded = loadPreferences();
  assert.strictEqual(loaded.gender, 'male');
  assert.strictEqual(loaded.college, 'VIT AP');
  assert.strictEqual(loaded.commType, 'audio');
  assert.ok(loaded.interests.length <= APP_CONSTANTS.MAX_INTERESTS);
  assert.deepStrictEqual(loaded.interests, interests.slice(0, APP_CONSTANTS.MAX_INTERESTS));

  teardownWindow();
}

function testInvalidJsonFallsBack() {
  const storage = createMockLocalStorage({ [STORAGE_KEY]: '{bad' });
  withWindowStorage(storage);

  const prefs = loadPreferences();
  assert.deepStrictEqual(prefs, {
    gender: '',
    college: '',
    commType: 'video',
    interests: []
  });

  teardownWindow();
}

function testClearPreferences() {
  const storage = createMockLocalStorage();
  withWindowStorage(storage);

  savePreferences({ gender: 'female', college: 'MIT' });
  assert.ok(storage.getItem(STORAGE_KEY));

  clearPreferences();
  const afterClear = loadPreferences();
  assert.strictEqual(storage.getItem(STORAGE_KEY), null);
  assert.strictEqual(afterClear.gender, '');

  teardownWindow();
}

function testUnavailableStorageDoesNotThrow() {
  Object.defineProperty(global, 'window', {
    configurable: true,
    get() {
      throw new Error('blocked');
    }
  });

  // Should be no-ops when storage is unavailable
  savePreferences({ gender: 'male' });
  const prefs = loadPreferences();
  assert.deepStrictEqual(prefs, {
    gender: '',
    college: '',
    commType: 'video',
    interests: []
  });

  delete global.window;
}

export function runStorageTests() {
  const originalWarn = console.warn;
  console.warn = () => {};

  testPersistenceAndLimits();
  testInvalidJsonFallsBack();
  testClearPreferences();
  testUnavailableStorageDoesNotThrow();

  console.warn = originalWarn;
}
