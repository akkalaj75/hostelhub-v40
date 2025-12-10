import { APP_CONSTANTS } from '../config.js';

const STORAGE_KEY = 'hostelhub:v40:prefs';

function getStorage() {
  try {
    return window.localStorage;
  } catch (error) {
    console.warn('LocalStorage unavailable', error);
    return null;
  }
}

function read() {
  const storage = getStorage();
  if (!storage) return {};
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY)) || {};
  } catch (error) {
    console.warn('Failed to parse saved preferences', error);
    return {};
  }
}

export function loadPreferences() {
  const data = read();
  return {
    gender: data.gender || '',
    college: data.college || '',
    commType: data.commType || 'video',
    interests: Array.isArray(data.interests) ? data.interests.slice(0, APP_CONSTANTS.MAX_INTERESTS) : []
  };
}

export function savePreferences(partial) {
  const storage = getStorage();
  if (!storage) return;
  const current = read();
  const next = { ...current, ...partial };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Failed to save preferences', error);
  }
}

export function clearPreferences() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear preferences', error);
  }
}
