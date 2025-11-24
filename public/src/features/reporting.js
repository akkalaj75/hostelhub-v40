import { db, firebase } from '../services/firestore.js';
import { state } from '../core/state.js';
import { showStatus } from '../ui/screens.js';

// ============================================
// BLOCK / REPORT UTILITIES
// ============================================

export function getBlockedUsers() {
  return state.profile.blockedUsers || [];
}

export async function blockUser(userId) {
  if (!state.user?.uid) {
    showStatus('Please log in first', 'warning');
    return;
  }
  if (!userId || userId === state.user.uid) return;

  try {
    await db.collection('users').doc(state.user.uid).update({
      blockedUsers: firebase.firestore.FieldValue.arrayUnion(userId)
    });
    state.profile.blockedUsers = [...new Set([...(state.profile.blockedUsers || []), userId])];
    showStatus('User blocked', 'success');
  } catch (error) {
    console.error('blockUser error', error);
    showStatus('Failed to block user', 'error');
  }
}

export async function unblockUser(userId) {
  if (!state.user?.uid) return;
  if (!userId) return;

  try {
    await db.collection('users').doc(state.user.uid).update({
      blockedUsers: firebase.firestore.FieldValue.arrayRemove(userId)
    });
    state.profile.blockedUsers = (state.profile.blockedUsers || []).filter(id => id !== userId);
    showStatus('User unblocked', 'success');
  } catch (error) {
    console.error('unblockUser error', error);
    showStatus('Failed to unblock user', 'error');
  }
}

export async function reportUser(reason, details = '') {
  if (!state.user?.uid) {
    showStatus('Please log in first', 'warning');
    return;
  }

  const reportedUser = state.match?.remoteUid;
  if (!reportedUser) {
    showStatus('No active match to report', 'warning');
    return;
  }

  try {
    await db.collection('reports').add({
      reportedBy: state.user.uid,
      reportedUser,
      reason,
      details: details || '',
      status: 'pending',
      created: firebase.firestore.FieldValue.serverTimestamp()
    });
    showStatus('Report submitted', 'success');
  } catch (error) {
    console.error('reportUser error', error);
    showStatus('Failed to submit report', 'error');
    throw error;
  }
}
