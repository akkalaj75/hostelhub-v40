import { db, firebase } from '../services/firestore.js';
import { state } from '../core/state.js';
import { showStatus, showStrangerInfo } from '../ui/screens.js';
import { startVideoCall, resetRtcState } from './rtc.js';
import { startTextChat } from './chat.js';
import { APP_CONSTANTS } from '../config.js';

const MATCH_TIMEOUT = APP_CONSTANTS.MATCH_TIMEOUT_MS;
const QUEUE_STALE_MS = APP_CONSTANTS.QUEUE_STALE_MS;
let matchTimeoutTimer = null;

/**
 * Start matchmaking with snapshot-based matching
 */
export async function findMatch(gender, college, commType, interests) {
  if (!state.user) {
    throw new Error('User not authenticated');
  }

  const userId = state.user.uid;
  state.match.state = 'searching';

  showStatus('Finding match...', 'info');

  try {
    await addToQueue(userId, { gender, college, commType, interests });
    startIncomingMatchListener(userId);
    startQueueListener(userId, { gender, college, commType, interests });
  } catch (error) {
    console.error('Matchmaking error:', error);
    await cleanupQueue(userId);
    state.match.state = 'idle';
    throw error;
  }
}

/**
 * Add user to waiting queue (upsert)
 */
async function addToQueue(userId, profile) {
  const queueRef = db.collection('waiting').doc(userId);

  await queueRef.set({
    userId,
    gender: profile.gender,
    college: profile.college,
    commType: profile.commType,
    interests: profile.interests || [],
    searching: true,
    matched: false,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    version: Date.now()
  }, { merge: true });
}

/**
 * Listen to the waiting queue and attempt a match
 */
function startQueueListener(userId, profile) {
  stopQueueListener();

  let attempting = false;

  matchTimeoutTimer = setTimeout(async () => {
    if (state.match.state === 'searching') {
      stopQueueListener();
      await cleanupQueue(userId);
      state.match.state = 'idle';
      showStatus('No match found. Please try again.', 'error');
    }
  }, MATCH_TIMEOUT);

  state.listeners.queue = db.collection('waiting')
    .where('commType', '==', profile.commType)
    .where('searching', '==', true)
    .onSnapshot(async snapshot => {
      if (state.match.state !== 'searching') return;

      const candidates = snapshot.docs
        .filter(doc => {
          const data = doc.data();
          const candidateId = doc.id;

          if (candidateId === userId) return false;
          if (state.profile.blockedUsers.includes(candidateId)) return false;
          if (!isCandidateFresh(data)) return false;

          if (profile.college !== 'ANY' && data.college !== 'ANY') {
            if (data.college !== profile.college) return false;
          }

          if (data.gender !== profile.gender) return false;

          return true;
        })
        .map(doc => ({ id: doc.id, data: doc.data() }));

      const waitingCount = Math.max(snapshot.size - 1, 0);
      showStatus(`Finding match... (${waitingCount} others waiting)`, 'info');

      if (!candidates.length || attempting) return;

      attempting = true;
      const candidate = candidates[0];

      const claimed = await claimMatch(userId, candidate.id, profile, candidate.data);
      if (!claimed) {
        attempting = false;
        return;
      }

      await handleMatchSuccess({
        remoteUid: candidate.id,
        remoteInterests: candidate.data.interests || [],
        college: candidate.data.college,
        gender: candidate.data.gender || '',
        callId: claimed.callId
      });
    });
}

function stopQueueListener() {
  if (state.listeners.queue) {
    state.listeners.queue();
    state.listeners.queue = null;
  }
  if (matchTimeoutTimer) {
    clearTimeout(matchTimeoutTimer);
    matchTimeoutTimer = null;
  }
}

function isCandidateFresh(data) {
  if (!data || !data.timestamp || typeof data.timestamp.toMillis !== 'function') {
    return true;
  }
  return Date.now() - data.timestamp.toMillis() < QUEUE_STALE_MS;
}

/**
 * Atomically claim a match (prevents race conditions)
 */
async function claimMatch(userId, targetId, profile, targetProfile) {
  const callId = [userId, targetId].sort().join('_');
  const callRef = db.collection('calls').doc(callId);

  try {
    const claimed = await db.runTransaction(async (transaction) => {
      const callDoc = await transaction.get(callRef);
      if (callDoc.exists) return false;

      const userDoc = await transaction.get(db.collection('waiting').doc(userId));
      const targetDoc = await transaction.get(db.collection('waiting').doc(targetId));

      if (!userDoc.exists || !targetDoc.exists) return false;

      transaction.set(callRef, {
        users: [userId, targetId],
        initiator: userId,
        status: 'connecting',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        profiles: {
          [userId]: {
            gender: profile.gender,
            college: profile.college,
            interests: profile.interests || []
          },
          [targetId]: {
            gender: targetProfile.gender || '',
            college: targetProfile.college || '',
            interests: targetProfile.interests || []
          }
        }
      });

      transaction.update(db.collection('waiting').doc(userId), {
        searching: false,
        matched: true
      });

      return true;
    });

    return claimed ? { callId } : false;
  } catch (error) {
    console.error('Claim match error:', error);
    return false;
  }
}

/**
 * Handle successful match
 */
async function handleMatchSuccess(match) {
  stopQueueListener();
  stopIncomingMatchListener();
  state.match.state = 'matched';
  state.match.remoteUid = match.remoteUid;
  state.match.remoteInterests = match.remoteInterests;
  state.match.remoteGender = match.gender || '';
  state.match.callId = match.callId || [state.user.uid, match.remoteUid].sort().join('_');

  showStrangerInfo(match.remoteInterests, match.college, match.gender);
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

  const { gender, college } = state.profile;
  const { commType } = state.ui;
  const interests = state.profile.interests;

  await findMatch(gender, college, commType, interests);
}

/**
 * Complete cleanup of current match
 */
export async function cleanupMatch() {
  state.cleanupListeners();
  stopQueueListener();

  if (state.connection.pc) {
    try {
      state.connection.pc.close();
    } catch (e) {
      console.error('PC close error:', e);
    }
    state.connection.pc = null;
  }

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

  state.connection.remoteStream = null;
  resetRtcState();

  const userId = state.user?.uid;
  const callId = state.match.callId;

  if (userId) {
    await cleanupQueue(userId);
  }

  if (callId) {
    try {
      const callRef = db.collection('calls').doc(callId);

      try {
        await callRef.set({ status: 'ended' }, { merge: true });
      } catch (e) {
        console.warn('Call status update before delete failed', e);
      }

      await callRef.delete();
    } catch (error) {
      console.error('Firestore cleanup error:', error);
    }
  }

  state.reset();
}

function startIncomingMatchListener(userId) {
  stopIncomingMatchListener();
  state.listeners.match = db.collection('calls')
    .where('users', 'array-contains', userId)
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type !== 'added' && change.type !== 'modified') return;
        if (state.match.state !== 'searching') return;

        const data = change.doc.data();
        if (!data || !Array.isArray(data.users)) return;
        if (!data.users.includes(userId)) return;
        if (data.status && data.status !== 'connecting') return;

        const otherUid = data.users.find(uid => uid !== userId);
        if (!otherUid) return;

        await markOwnQueueMatched(userId);

        const otherProfile = (data.profiles && data.profiles[otherUid]) || {};
        await handleMatchSuccess({
          callId: change.doc.id,
          remoteUid: otherUid,
          remoteInterests: otherProfile.interests || [],
          college: otherProfile.college || '',
          gender: otherProfile.gender || ''
        });
      });
    });
}

function stopIncomingMatchListener() {
  if (state.listeners.match) {
    state.listeners.match();
    state.listeners.match = null;
  }
}

async function markOwnQueueMatched(userId) {
  if (!userId) return;
  try {
    await db.collection('waiting').doc(userId).update({
      searching: false,
      matched: true
    });
  } catch (error) {
    console.warn('Failed to mark queue matched:', error);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
