// Firebase Configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyB6aiWJWd8mn0lTcxVOVdWmLtYeHScANV4",
  authDomain: "hostelhub-v40.firebaseapp.com",
  projectId: "hostelhub-v40",
  storageBucket: "hostelhub-v40.firebasestorage.app",
  messagingSenderId: "624286804590",
  appId: "1:624286804590:web:1b70ac49211d3686f7147f",
  measurementId: "G-BTGMZNZJZC"
};

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

export const APP_CONSTANTS = {
  MAX_INTERESTS: 5,
  MAX_MESSAGE_LENGTH: 500,
  MATCH_TIMEOUT_MS: 60000,
  CONNECTION_TIMEOUT_MS: 15000,
  SKIP_COOLDOWN_MS: 2000,
  MAX_MATCH_RETRIES: 3,
  FIRESTORE_BATCH_SIZE: 500
};

export const COLLEGES = [
  'IIT Delhi', 'IIT Bombay', 'JNTUK', 'KL University',
  'VIT AP', 'Delhi University', 'Harvard', 'MIT',
  'Stanford', 'Other', 'ANY'
];