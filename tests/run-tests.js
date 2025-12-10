import assert from 'assert';

import {
  validateEmail,
  validatePassword,
  validateInterest
} from '../public/src/utils/validators.js';
import {
  detectContactInfo,
  detectAbusiveContent,
  sanitizeInput
} from '../public/src/utils/sanitizers.js';
import {
  getRandomIcebreaker,
  calculateInterestMatchScore,
  generateConversationStarters,
  detectMood,
  calculateEngagementScore
} from '../public/src/services/ai.js';
import { runStorageTests } from './storage.test.js';

function testValidators() {
  assert.strictEqual(validateEmail('user@example.com').valid, true);
  assert.strictEqual(validateEmail('bad').valid, false);

  assert.strictEqual(validatePassword('abc123').valid, true);
  assert.strictEqual(validatePassword('short').valid, false);
  assert.strictEqual(validatePassword('letters').valid, false);

  assert.strictEqual(validateInterest('music').valid, true);
  assert.strictEqual(validateInterest('!').valid, false);
}

function testSanitizers() {
  assert.strictEqual(detectContactInfo('Call me at 123-456-7890'), true);
  assert.strictEqual(detectContactInfo('normal chat'), false);

  const abuse = detectAbusiveContent('You are an asshole');
  assert.strictEqual(abuse.isAbusive, true);

  const clean = detectAbusiveContent('hello friend');
  assert.strictEqual(clean.isAbusive, false);

  const sanitized = sanitizeInput('<script>alert(1)</script>');
  assert.ok(!sanitized.includes('<script'));
}

function testAiHelpers() {
  const icebreaker = getRandomIcebreaker();
  assert.ok(typeof icebreaker === 'string' && icebreaker.length > 0);

  const score = calculateInterestMatchScore(['music', 'travel'], ['Travel', 'coding']);
  assert.ok(score > 0 && score <= 1);

  const starters = generateConversationStarters(['music'], ['Music']);
  assert.ok(Array.isArray(starters) && starters.length > 0);

  const mood = detectMood(['I am so happy!', 'This is great']);
  assert.strictEqual(mood.mood, 'happy');

  const engagement = calculateEngagementScore(['hey', 'how are you?', 'great!']);
  assert.ok(engagement >= 0 && engagement <= 1);
}

function run() {
  testValidators();
  testSanitizers();
  testAiHelpers();
  runStorageTests();
  console.log('All tests passed');
}

run();
