import { firebaseConfig } from '../config.js';

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

export const auth = firebase.auth();
export const db = firebase.firestore();
export const firebase = window.firebase;

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true })
  .catch(err => {
    if (err.code === 'failed-precondition') {
      console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Persistence not available in this browser');
    }
  });

/**
 * Batch operations helper
 */
export async function batchDelete(collectionRef, batchSize = 500) {
  const snapshot = await collectionRef.limit(batchSize).get();
  
  if (snapshot.size === 0) return 0;
  
  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  
  await batch.commit();
  
  // Recursively delete if there are more
  if (snapshot.size === batchSize) {
    return batchSize + await batchDelete(collectionRef, batchSize);
  }
  
  return snapshot.size;
}

/**
 * Live user count tracker
 */
export function trackLiveUsers(callback) {
  return db.collection('status')
    .where('online', '==', true)
    .onSnapshot(snapshot => {
      callback(snapshot.size);
    });
}