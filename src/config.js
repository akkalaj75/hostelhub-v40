const env = (typeof import !== 'undefined' && typeof import.meta !== 'undefined')
  ? import.meta.env
  : {};

export const firebaseConfig = {
  apiKey: env?.VITE_FIREBASE_API_KEY || 'AIzaSyB6aiWJWd8mn0lTcxVOVdWmLtYeHScANV4',
  authDomain: env?.VITE_FIREBASE_AUTH_DOMAIN || 'hostelhub-v40.firebaseapp.com',
  projectId: env?.VITE_FIREBASE_PROJECT_ID || 'hostelhub-v40',
  storageBucket: env?.VITE_FIREBASE_STORAGE_BUCKET || 'hostelhub-v40.firebasestorage.app',
  messagingSenderId: env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '624286804590',
  appId: env?.VITE_FIREBASE_APP_ID || '1:624286804590:web:1b70ac49211d3686f7147f',
  measurementId: env?.VITE_FIREBASE_MEASUREMENT_ID || 'G-BTGMZNZJZC'
};
