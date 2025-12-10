import { db, firebase, batchDelete } from '../services/firestore.js';
import { state } from '../core/state.js';
import { showStatus, showStrangerInfo } from '../ui/screens.js';
import { startVideoCall, resetRtcState } from './rtc.js';
import { startTextChat } from './chat.js';
import { APP_CONSTANTS } from '../config.js';

const MATCH_TIMEOUT = APP_CONSTANTS.MATCH_TIMEOUT_MS;
let matchStartTime = null;
let retryCount = 0;

/**
 * Start matchmaking with atomic transaction-based matching
 */
export async function findMatch(gender, college, commType, interests) {
  if (!state.user) {
    throw new Error('User not authenticated');
  }

  const userId = state.user.uid;
  matchStartTime = Date.now();
  retryCount = 0;
  state.match.state = 'searching';

  showStatus('Finding match...', 'info');

  try {
    await addToQueue(userId, { gender, college, commType, interests });
    await matchLoop(userId, { gender, college, commType, interests });
  } catch (error) {
    console.error('Matchmaking error:', error);
    await cleanupQueue(userId);
    state.match.state = 'idle';
    throw error;
  }
}

/**
 * Add user to waiting queue atomically
 */
async function addToQueue(userId, profile) {
  const queueRef = db.collection('waiting').doc(userId);
  
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(queueRef);
    
    if (doc.exists) {
      console.warn('User already in queue, removing old entry');
      transaction.delete(queueRef);
    }
    
    transaction.set(queueRef, {
      userId,
      gender: profile.gender,
      college: profile.college,
      commType: profile.commType,
      interests: profile.interests || [],
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      searching: true,
      version: Date.now() // For optimistic locking
    });
  });
}

/**
 * Optimized matching loop with exponential backoff
 */
async function matchLoop(userId, profile) {
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts && state.match.state === 'searching') {
    if (Date.now() - matchStartTime > MATCH_TIMEOUT) {
      await cleanupQueue(userId);
      state.match.state = 'idle';
      showStatus('No match found. Please try again.', 'error');
      return;
    }

    const match = await attemptMatch(userId, profile);
    
    if (match) {
      await handleMatchSuccess(match);
      return;
    }

    const waitingCount = await getWaitingCount(profile.commType);
    showStatus(`Finding match... (${waitingCount} others waiting)`, 'info');

    const delay = Math.min(1000 * Math.ceil((attempts + 1) / 2), 3000);
    await sleep(delay);
    
    attempts++;
  }

  await cleanupQueue(userId);
  state.match.state = 'idle';
  showStatus('No match found. Please try again.', 'error');
}

/**
 * Attempt to match with another user using transaction
 */
async function attemptMatch(userId, profile) {
  try {
    const snapshot = await db.collection('waiting')
      .where('commType', '==', profile.commType)
      .where('searching', '==', true)
      .orderBy('timestamp', 'asc')
      .limit(10)
      .get();

    const candidates = snapshot.docs
      .filter(doc => {
        const data = doc.data();
        const candidateId = doc.id;
        
        if (candidateId === userId) return false;
        if (state.profile.blockedUsers.includes(candidateId)) return false;
        
        if (profile.college !== 'ANY' && data.college !== 'ANY') {
          if (data.college !== profile.college) return false;
        }
        
        if (data.gender !== profile.gender) return false;
        
        return true;
      })
      .map(doc => ({ id: doc.id, data: doc.data() }));

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => {
      const scoreA = calculateMatchScore(profile.interests, a.data.interests);
      const scoreB = calculateMatchScore(profile.interests, b.data.interests);
      return scoreB - scoreA;
    });

    for (const candidate of candidates) {
      const claimed = await claimMatch(userId, candidate.id);
      
      if (claimed) {
        return {
          remoteUid: candidate.id,
          remoteInterests: candidate.data.interests || [],
          college: candidate.data.college
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Attempt match error:', error);
    return null;
  }
}

/**
 * Atomically claim a match (prevents race conditions)
 */
async function claimMatch(userId, targetId) {
  const callId = [userId, targetId].sort().join('_');
  const callRef = db.collection('calls').doc(callId);

  try {
    const claimed = await db.runTransaction(async (transaction) => {
      const callDoc = await transaction.get(callRef);
      
      // Someone else already claimed this match
      if (callDoc.exists) {
        return false;
      }

      // Check both users still in queue
      const userDoc = await transaction.get(db.collection('waiting').doc(userId));
      const targetDoc = await transaction.get(db.collection('waiting').doc(targetId));

      if (!userDoc.exists || !targetDoc.exists) {
        return false;
      }

      // Claim the match by creating call document
      transaction.set(callRef, {
        users: [userId, targetId],
        initiator: userId,
        status: 'connecting',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Remove both from queue
      transaction.update(db.collection('waiting').doc(userId), {
        searching: false,
        matched: true
      });
      transaction.update(db.collection('waiting').doc(targetId), {
        searching: false,
        matched: true
      });

      return true;
    });

    if (claimed) {
      // Cleanup queue entries after successful claim
      setTimeout(async () => {
        await cleanupQueue(userId);
        await cleanupQueue(targetId);
      }, 2000);
    }

    return claimed;
  } catch (error) {
    console.error('Claim match error:', error);
    return false;
  }
}

/**
 * Calculate interest similarity score (0-1)
 */
function calculateMatchScore(interests1, interests2) {
  if (!interests1.length || !interests2.length) return 0;
  
  const set1 = new Set(interests1.map(i => i.toLowerCase()));
  const set2 = new Set(interests2.map(i => i.toLowerCase()));
  
  let common = 0;
  set1.forEach(interest => {
    if (set2.has(interest)) common++;
  });
  
  return common / Math.max(set1.size, set2.size);
}

/**
 * Handle successful match
 */
async function handleMatchSuccess(match) {
  state.match.state = 'matched';
  state.match.remoteUid = match.remoteUid;
  state.match.remoteInterests = match.remoteInterests;
  state.match.callId = [state.user.uid, match.remoteUid].sort().join('_');

  showStrangerInfo(match.remoteInterests, match.college);
  showStatus('Match found! Connecting...', 'success');
  
  await sleep(500);

  const isInitiator = state.user.uid < match.remoteUid;

  if (state.ui.commType === 'chat') {
    await startTextChat(state.match.callId, match.remoteInterests);
  } else {
    await startVideoCall(state.match.callId, isInitiator, match.remoteInterests);
  }

  state.match.state = 'connected';
}

/**
 * Get count of users waiting
 */
async function getWaitingCount(commType) {
  try {
    const snapshot = await db.collection('waiting')
      .where('commType', '==', commType)
      .where('searching', '==', true)
      .get();
    return snapshot.size;
  } catch (error) {
    return 0;
  }
}

/**
 * Clean up queue entry
 */
async function cleanupQueue(userId) {
  if (!userId) return;
  try {
    await db.collection('waiting').doc(userId).delete();
  } catch (error) {
    console.error('Queue cleanup error:', error);
  }
}

/**
 * Skip current match and find new one
 */
export async function skipMatch() {
  if (state.match.state !== 'connected') return;

  showStatus('Finding new match...', 'info');
  
  await cleanupMatch();
  
  // Re-initiate search
  const { gender, college } = state.profile;
  const { commType } = state.ui;
  const interests = state.profile.interests;
  
  await findMatch(gender, college, commType, interests);
}

/**
 * Complete cleanup of current match
 */
export async function cleanupMatch() {
  // Cleanup listeners
  state.cleanupListeners();

  // Close peer connection
  if (state.connection.pc) {
    try {
      state.connection.pc.close();
    } catch (e) {
      console.error('PC close error:', e);
    }
    state.connection.pc = null;
  }

  // Stop local stream
  if (state.connection.localStream) {
    state.connection.localStream.getTracks().forEach(track => {
      try {
        track.stop();
      } catch (e) {
        console.error('Track stop error:', e);
      }
    });
    state.connection.localStream = null;
  }

  // Clear remote stream
  state.connection.remoteStream = null;
  resetRtcState();

  // Cleanup Firestore
  const userId = state.user?.uid;
  const callId = state.match.callId;

  if (userId) {
    await cleanupQueue(userId);
  }

  if (callId) {
    try {
      const callRef = db.collection('calls').doc(callId);

      // Mark call as ended so rules allow deletion
      try {
        await callRef.set({ status: 'ended' }, { merge: true });
      } catch (e) {
        console.warn('Call status update before delete failed', e);
      }

      // Delete subcollections in batches to avoid residual docs
      const collections = [
        callRef.collection('candidates'),
        callRef.collection('messages')
      ];

      for (const col of collections) {
        // Loop batchDelete until collection is empty
        let deleted = 0;
        do {
          deleted = await batchDelete(col, APP_CONSTANTS.FIRESTORE_BATCH_SIZE);
        } while (deleted === APP_CONSTANTS.FIRESTORE_BATCH_SIZE);
      }

      await callRef.delete();
    } catch (error) {
      console.error('Firestore cleanup error:', error);
    }
  }

  // Reset state
  state.reset();
}

// Utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
