import { auth, db } from '../services/firestore.js';
import { state } from './state.js';
import { showStatus, navigateToScreen } from '../ui/screens.js';

export async function signup(email, password) {
  if (!email || !email.includes('@')) {
    throw new Error('Please enter a valid email');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  showStatus('Creating account...', 'info');
  
  try {
    const result = await auth.createUserWithEmailAndPassword(email, password);
    await result.user.sendEmailVerification();
    
    // Initialize user document
    await db.collection('users').doc(result.user.uid).set({
      email: email,
      created: firebase.firestore.FieldValue.serverTimestamp(),
      blockedUsers: [],
      reportCount: 0
    });
    
    showStatus('Verification email sent! Check your inbox.', 'success');
    setTimeout(() => auth.signOut(), 3000);
    
    return { success: true };
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('Email already registered. Try logging in.');
    }
    throw error;
  }
}

export async function login(email, password) {
  if (!email || !password) {
    throw new Error('Please enter email and password');
  }

  showStatus('Logging in...', 'info');
  
  try {
    await auth.signInWithEmailAndPassword(email, password);
    return { success: true };
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      throw new Error('No account found. Please sign up first.');
    } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-login-credentials') {
      throw new Error('Incorrect password. Try "Forgot Password".');
    }
    throw error;
  }
}

export async function resetPassword(email) {
  if (!email || !email.includes('@')) {
    throw new Error('Please enter your email first');
  }

  showStatus('Sending reset email...', 'info');
  
  try {
    await auth.sendPasswordResetEmail(email);
    showStatus('Password reset email sent!', 'success');
    return { success: true };
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      throw new Error('No account found with this email.');
    }
    throw error;
  }
}

export async function logout() {
  await cleanup();
  await auth.signOut();
}

export function onAuthChange(callback) {
  return auth.onAuthStateChanged(async (user) => {
    if (user && user.emailVerified) {
      state.user = user;
      await loadUserProfile(user.uid);
      await trackOnline(user.uid);
      callback({ authenticated: true, user });
    } else if (user && !user.emailVerified) {
      showStatus('Please verify your email first', 'warning');
      setTimeout(() => auth.signOut(), 3000);
      callback({ authenticated: false });
    } else {
      state.user = null;
      await trackOffline();
      callback({ authenticated: false });
    }
  });
}

async function loadUserProfile(uid) {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      state.profile.blockedUsers = data.blockedUsers || [];
    }
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

let statusRef = null;

async function trackOnline(uid) {
  statusRef = db.collection('status').doc(uid);
  await statusRef.set({
    online: true,
    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function trackOffline() {
  if (statusRef) {
    await statusRef.update({
      online: false,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  }
}

// Cleanup function (imported from matchmaking)
async function cleanup() {
  const { cleanupMatch } = await import('../features/matchmaking.js');
  await cleanupMatch();
}

// Track offline on page close
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', trackOffline);
  window.addEventListener('unload', trackOffline);
}