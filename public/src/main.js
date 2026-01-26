import { onAuthChange, signup, login, resetPassword, logout } from './core/auth.js';
import { findMatch, skipMatch, cleanupMatch } from './features/matchmaking.js';
import { toggleAudio, toggleVideo } from './features/rtc.js';
import { sendMessage, saveChatHistory, addSystemMessage } from './features/chat.js';
import { reportUser, blockUser, unblockUser, getBlockedUsers } from './features/reporting.js';
import { state } from './core/state.js';
import { APP_CONSTANTS } from './config.js';
import { 
  navigateToScreen, 
  showStatus, 
  showStrangerInfo,
  updateLiveUsersCounter,
  setLoading 
} from './ui/screens.js';
import { trackLiveUsers, db, firebase } from './services/firestore.js';
import { validateEmail, validatePassword, validateInterest } from './utils/validators.js';
import { SCREEN, COMM_TYPE } from './utils/constants.js';
import { loadPreferences, savePreferences } from './core/storage.js';

let skipCooldownActive = false;
let findCooldownActive = false;
let debugEnabled = false;
let debugUnsubs = [];
let debugStateTimer = null;
let communityChannel = 'general';
let communityUnsub = null;
let communityMembersUnsub = null;
let authMode = 'login';

/**
 * Initialize app
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('HostelHub V40 Initializing...');
  
  initializeAuth();
  initializeUI();
  applyGenderTheme(state.profile.gender);
  restorePreferences();
  initializeLiveCounter();
  initializeRevealAnimations();
  
  console.log('HostelHub V40 Ready');
});

/**
 * Initialize authentication
 */
function initializeAuth() {
  onAuthChange(({ authenticated, user }) => {
    if (authenticated) {
      document.getElementById('user-email').textContent = user.email.split('@')[0];
      navigateToScreen(SCREEN.SETUP);
      loadBlockedUsers();
      setupDebugPanel(user.uid);
    } else {
      teardownDebugPanel();
      showLoginAuth();
    }
  });
}

/**
 * Initialize UI event listeners
 */
function initializeUI() {
  // Auth buttons
  document.getElementById('signupBtn').onclick = handleSignup;
  document.getElementById('loginBtn').onclick = handleLogin;
  document.getElementById('forgotPasswordBtn').onclick = handleForgotPassword;
  document.getElementById('logoutBtn').onclick = handleLogout;
  document.getElementById('goSignupBtn').onclick = showSignupAuth;
  document.getElementById('goLoginBtn').onclick = showLoginAuth;

  // Matchmaking
  document.getElementById('findBtn').onclick = handleFindMatch;
  
  // Communication type selection
  document.querySelectorAll('.comm-type').forEach(el => {
    el.onclick = () => selectCommType(el);
  });

  // Interests
  document.getElementById('add-interest-btn').onclick = handleAddInterest;
  document.getElementById('interest-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddInterest();
    }
  });

  // Profile selections
  document.getElementById('gender').onchange = handleProfileSelectionChange;
  document.getElementById('college').onchange = handleProfileSelectionChange;

  // Video controls
  document.getElementById('muteBtn').onclick = handleMuteToggle;
  document.getElementById('videoBtn').onclick = handleVideoToggle;
  document.getElementById('skipBtn').onclick = handleSkip;
  document.getElementById('endCall').onclick = handleEndCall;
  document.getElementById('reportBtn').onclick = () => openReportModal();

  // Chat controls
  document.getElementById('send-btn').onclick = handleSendMessage;
  document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  });
  document.getElementById('skipBtnChat').onclick = handleSkip;
  document.getElementById('endChat').onclick = handleEndCall;
  document.getElementById('saveChatBtn').onclick = handleSaveChat;
  document.getElementById('reportBtnChat').onclick = () => openReportModal();

  // Report modal
  document.getElementById('cancelReport').onclick = closeReportModal;
  document.getElementById('submitReport').onclick = handleSubmitReport;

  // Landing page navigation
  document.querySelector('.logo').onclick = () => scrollToTop();
  document.querySelectorAll('.nav-cta, .nav-trigger').forEach(el => {
    el.onclick = (e) => {
      e.preventDefault();
      openApp();
    };
  });
  
  document.querySelectorAll('.cta-btn').forEach(el => {
    el.onclick = openApp;
  });

  document.querySelectorAll('.feature-card').forEach(el => {
    el.onclick = openApp;
  });

  // Modal controls
  document.querySelector('.close-btn').onclick = closeApp;
  document.querySelector('.menu-toggle').onclick = toggleMenu;

  // Mode toggle
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.onclick = () => setMode(btn.dataset.mode);
  });

  // Community channel switching
  document.querySelectorAll('.channel-item').forEach(btn => {
    btn.onclick = () => setCommunityChannel(btn);
  });

  const communitySend = document.getElementById('community-send');
  if (communitySend) {
    communitySend.onclick = sendCommunityMessage;
  }
  const communityInput = document.getElementById('community-input');
  if (communityInput) {
    communityInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendCommunityMessage();
      }
    });
  }
}

/**
 * Initialize live user counter
 */
function initializeLiveCounter() {
  trackLiveUsers(count => {
    updateLiveUsersCounter(count);
  });
}

/**
 * Restore saved setup preferences
 */
function restorePreferences() {
  const prefs = loadPreferences();

  const genderSelect = document.getElementById('gender');
  const collegeSelect = document.getElementById('college');

  if (genderSelect) {
    genderSelect.value = prefs.gender || '';
    state.profile.gender = genderSelect.value;
    applyGenderTheme(state.profile.gender);
  }

  if (collegeSelect) {
    collegeSelect.value = prefs.college || '';
    state.profile.college = collegeSelect.value;
  }

  if (prefs.commType) {
    const commEl = document.querySelector(`.comm-type[data-type="${prefs.commType}"]`);
    if (commEl) {
      selectCommType(commEl);
    }
  }

  if (prefs.interests?.length) {
    state.profile.interests = prefs.interests.slice(0, APP_CONSTANTS.MAX_INTERESTS);
    updateInterestTags();
  }
}

// ============================================
// AUTH HANDLERS
// ============================================

async function handleSignup() {
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const btn = document.getElementById('signupBtn');

  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    showStatus(emailValidation.message, 'error');
    return;
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    showStatus(passwordValidation.message, 'error');
    return;
  }

  try {
    setLoading(btn, true);
    await signup(email, password);
    document.getElementById('signup-verify-notice').style.display = 'block';
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

async function handleLogin() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('loginBtn');

  try {
    setLoading(btn, true);
    await login(email, password);
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

async function handleForgotPassword() {
  const email = document.getElementById('email').value.trim();
  const btn = document.getElementById('forgotPasswordBtn');

  try {
    setLoading(btn, true);
    await resetPassword(email);
    document.getElementById('reset-notice').style.display = 'block';
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

async function handleLogout() {
  const btn = document.getElementById('logoutBtn');
  
  try {
    setLoading(btn, true);
    await logout();
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

// ============================================
// MATCHMAKING HANDLERS
// ============================================

async function handleFindMatch() {
  const gender = document.getElementById('gender').value;
  const college = document.getElementById('college').value;
  const btn = document.getElementById('findBtn');

  if (findCooldownActive) {
    showStatus(`Please wait ${APP_CONSTANTS.FIND_COOLDOWN_MS / 1000}s before searching again`, 'warning');
    return;
  }

  if (state.match.state === 'searching') {
    showStatus('Already searching for a match', 'warning');
    return;
  }

  if (state.match.state === 'connected') {
    showStatus('End the current session before starting a new match', 'warning');
    return;
  }

  if (!gender || !college) {
    showStatus('Please select gender and college', 'error');
    return;
  }

  try {
    setLoading(btn, true);
    findCooldownActive = true;
    setTimeout(() => {
      findCooldownActive = false;
    }, APP_CONSTANTS.FIND_COOLDOWN_MS);

    // Persist selections for subsequent skips/retries
    state.profile.gender = gender;
    state.profile.college = college;
    savePreferences({ gender, college });
    await findMatch(gender, college, state.ui.commType, state.profile.interests);
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    // Always re-enable the button after the attempt completes
    setLoading(btn, false);
  }
}

async function handleSkip() {
  if (skipCooldownActive) {
    showStatus(`Please wait ${APP_CONSTANTS.SKIP_COOLDOWN_MS / 1000}s before skipping again`, 'warning');
    return;
  }

  const confirmed = confirm('Skip to next match?');
  if (!confirmed) return;

  skipCooldownActive = true;
  setSkipButtonsDisabled(true);

  try {
    await skipMatch();
  } catch (error) {
    showStatus('Error skipping match', 'error');
  } finally {
    setTimeout(() => {
      skipCooldownActive = false;
      setSkipButtonsDisabled(false);
    }, APP_CONSTANTS.SKIP_COOLDOWN_MS);
  }
}

async function handleEndCall() {
  const confirmed = confirm('End session and return to setup?');
  if (!confirmed) return;

  try {
    await cleanupMatch();
    navigateToScreen(SCREEN.SETUP);
    document.getElementById('findBtn').disabled = false;
  } catch (error) {
    showStatus('Error ending session', 'error');
  }
}

function setSkipButtonsDisabled(disabled) {
  ['skipBtn', 'skipBtnChat'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = disabled;
    }
  });
}

// ============================================
// VIDEO/AUDIO HANDLERS
// ============================================

function handleMuteToggle() {
  const isMuted = toggleAudio();
  const btn = document.getElementById('muteBtn');
  btn.textContent = isMuted ? 'Unmute' : 'Mute';
}

function handleVideoToggle() {
  const isOff = toggleVideo();
  const btn = document.getElementById('videoBtn');
  btn.textContent = isOff ? 'Video On' : 'Video Off';
}

// ============================================
// CHAT HANDLERS
// ============================================

async function handleSendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();

  if (!text) return;

  const result = await sendMessage(text);
  
  if (result.success) {
    input.value = '';
  } else if (result.blocked) {
    // Message was blocked, status shown by sendMessage
  }
}

function handleSaveChat() {
  saveChatHistory();
}

// ============================================
// INTERESTS HANDLERS
// ============================================

function handleAddInterest() {
  const input = document.getElementById('interest-input');
  const interest = input.value.trim();

  if (state.profile.interests.length >= APP_CONSTANTS.MAX_INTERESTS) {
    showStatus(`Maximum ${APP_CONSTANTS.MAX_INTERESTS} interests allowed`, 'warning');
    return;
  }

  const validation = validateInterest(interest);
  if (!validation.valid) {
    showStatus(validation.message, 'error');
    return;
  }

  if (state.profile.interests.includes(validation.value)) {
    showStatus('Interest already added', 'warning');
    return;
  }

  state.profile.interests.push(validation.value);
  updateInterestTags();
  persistInterests();
  input.value = '';
}

function removeInterest(interest) {
  state.profile.interests = state.profile.interests.filter(i => i !== interest);
  updateInterestTags();
  persistInterests();
}

function updateInterestTags() {
  const container = document.getElementById('interest-tags');
  container.innerHTML = state.profile.interests.map(interest => 
    `<div class="interest-tag">
      ${interest} 
      <span class="remove" onclick="window.removeInterest('${interest}')">x</span>
    </div>`
  ).join('');
}

function persistInterests() {
  savePreferences({ interests: state.profile.interests });
}

// Expose to window for onclick handlers
window.removeInterest = removeInterest;

function handleProfileSelectionChange() {
  const gender = document.getElementById('gender').value;
  const college = document.getElementById('college').value;
  state.profile.gender = gender;
  state.profile.college = college;
  applyGenderTheme(gender);
  savePreferences({ gender, college });
}

function applyGenderTheme(gender) {
  const body = document.body;
  body.classList.toggle('theme-men', gender === 'men');
  body.classList.toggle('theme-women', gender === 'women');
  if (gender !== 'men' && gender !== 'women') {
    body.classList.remove('theme-men');
    body.classList.remove('theme-women');
  }
}

// ============================================
// COMMUNICATION TYPE
// ============================================

function selectCommType(element) {
  document.querySelectorAll('.comm-type').forEach(el => {
    el.classList.remove('active');
  });
  
  element.classList.add('active');
  state.ui.commType = element.dataset.type;
  savePreferences({ commType: state.ui.commType });
}

// ============================================
// REPORTING
// ============================================

function openReportModal() {
  document.getElementById('reportModal').classList.add('active');
}

function closeReportModal() {
  document.getElementById('reportModal').classList.remove('active');
  document.getElementById('reportReason').value = '';
  document.getElementById('reportDetails').value = '';
}

async function handleSubmitReport() {
  const reason = document.getElementById('reportReason').value;
  const details = document.getElementById('reportDetails').value;

  if (!reason) {
    showStatus('Please select a reason', 'error');
    return;
  }

  try {
    await reportUser(reason, details);
    closeReportModal();
    
    // Skip after 2 seconds
    setTimeout(() => handleSkip(), 2000);
  } catch (error) {
    showStatus('Failed to submit report', 'error');
  }
}

// ============================================
// BLOCKED USERS
// ============================================

async function loadBlockedUsers() {
  const blockedUsers = getBlockedUsers();
  updateBlockedUsersList(blockedUsers);
}

function updateBlockedUsersList(blockedUsers) {
  const section = document.getElementById('blocked-section');
  const list = document.getElementById('blocked-list');

  if (blockedUsers.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  list.innerHTML = blockedUsers.map(id => 
    `<div class="blocked-user">
      <span>User ${id.substring(0, 8)}...</span>
      <span class="unblock-btn" onclick="window.handleUnblock('${id}')">Unblock</span>
    </div>`
  ).join('');
}

async function handleUnblock(userId) {
  try {
    await unblockUser(userId);
    loadBlockedUsers();
    showStatus('User unblocked', 'success');
  } catch (error) {
    showStatus('Failed to unblock user', 'error');
  }
}

window.handleUnblock = handleUnblock;

// ============================================
// MODAL & NAVIGATION
// ============================================

function openApp() {
  document.getElementById('appModal').classList.add('active');
  document.body.style.overflow = 'hidden';
  if (state.user) {
    setMode('match');
  } else {
    showLoginAuth();
  }
}

function closeApp() {
  document.getElementById('appModal').classList.remove('active');
  document.body.style.overflow = '';
}

function toggleMenu() {
  document.getElementById('navLinks').classList.toggle('active');
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// AUTH PAGES
// ============================================

function showLoginAuth() {
  const loginScreen = document.getElementById('login-screen');
  const signupScreen = document.getElementById('signup-screen');
  if (signupScreen) signupScreen.classList.remove('active');
  if (loginScreen) loginScreen.classList.add('active');
  authMode = 'login';
}

function showSignupAuth() {
  const loginScreen = document.getElementById('login-screen');
  const signupScreen = document.getElementById('signup-screen');
  if (loginScreen) loginScreen.classList.remove('active');
  if (signupScreen) signupScreen.classList.add('active');
  authMode = 'signup';
}

// ============================================
// MODE TOGGLE (MATCH vs COMMUNITY)
// ============================================

function setMode(mode) {
  const buttons = document.querySelectorAll('.mode-btn');
  buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));

  const setupScreen = document.getElementById('setup-screen');
  const communityScreen = document.getElementById('community-screen');
  const videoContainer = document.getElementById('video-container');
  const chatContainer = document.getElementById('chat-container');

  if (mode === 'community') {
    if (setupScreen) setupScreen.classList.remove('active');
    if (communityScreen) communityScreen.classList.add('active');
    if (videoContainer) videoContainer.style.display = 'none';
    if (chatContainer) chatContainer.style.display = 'none';
    state.ui.currentScreen = 'community';
    startCommunity();
  } else {
    if (communityScreen) communityScreen.classList.remove('active');
    if (setupScreen) setupScreen.classList.add('active');
    state.ui.currentScreen = SCREEN.SETUP;
    stopCommunity();
  }
}

function setCommunityChannel(button) {
  document.querySelectorAll('.channel-item').forEach(btn => btn.classList.remove('active'));
  button.classList.add('active');

  const title = document.querySelector('.community-title');
  const subtitle = document.querySelector('.community-subtitle');
  const channelName = button.textContent.trim();

  if (title) {
    title.textContent = channelName.startsWith('#') ? channelName : `# ${channelName}`;
  }

  if (subtitle) {
    subtitle.textContent = 'Community channel';
  }

  communityChannel = button.dataset.channel || 'general';
  subscribeCommunityChannel();
}

function startCommunity() {
  subscribeCommunityChannel();
  subscribeCommunityMembers();
}

function stopCommunity() {
  if (communityUnsub) {
    communityUnsub();
    communityUnsub = null;
  }
  if (communityMembersUnsub) {
    communityMembersUnsub();
    communityMembersUnsub = null;
  }
}

function subscribeCommunityChannel() {
  const container = document.getElementById('community-messages');
  if (!container || !state.user) return;

  if (communityUnsub) {
    communityUnsub();
    communityUnsub = null;
  }

  container.innerHTML = '';

  communityUnsub = db.collection('community')
    .doc(communityChannel)
    .collection('messages')
    .orderBy('timestamp', 'asc')
    .limit(100)
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type !== 'added') return;
        const data = change.doc.data() || {};
        const row = document.createElement('div');
        row.className = 'community-message';
        row.innerHTML = `<span class="community-user">${data.displayName || 'Student'}</span>` +
          `<span class="community-text">${data.text || ''}</span>`;
        container.appendChild(row);
        container.scrollTop = container.scrollHeight;
      });
    });
}

async function sendCommunityMessage() {
  const input = document.getElementById('community-input');
  if (!input || !state.user) return;
  const text = input.value.trim();
  if (!text) return;

  const displayName = state.user.email ? state.user.email.split('@')[0] : 'Student';

  try {
    await db.collection('community')
      .doc(communityChannel)
      .collection('messages')
      .add({
        text,
        from: state.user.uid,
        displayName,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    input.value = '';
  } catch (error) {
    showStatus('Failed to send community message', 'error');
  }
}

function subscribeCommunityMembers() {
  const container = document.getElementById('community-members');
  if (!container) return;

  if (communityMembersUnsub) {
    communityMembersUnsub();
    communityMembersUnsub = null;
  }

  communityMembersUnsub = db.collection('status')
    .where('online', '==', true)
    .limit(20)
    .onSnapshot(snapshot => {
      container.innerHTML = '';
      snapshot.docs.forEach(doc => {
        const data = doc.data() || {};
        const row = document.createElement('div');
        row.className = 'member-item';
        row.innerHTML = `<span class="presence"></span> ${data.email || 'Student'}`;
        container.appendChild(row);
      });
    });
}

// ============================================
// DEBUG PANEL
// ============================================

function setupDebugPanel(userId) {
  const panel = document.getElementById('debug-panel');
  if (!panel) return;

  debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1';
  if (!debugEnabled) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  updateDebugRow('debug-auth', `auth: ${userId}`);

  debugStateTimer = setInterval(() => {
    updateDebugRow('debug-state', `state: ${state.match.state} | ${state.ui.commType}`);
  }, 500);

  const queueUnsub = db.collection('waiting').doc(userId).onSnapshot(doc => {
    if (!doc.exists) {
      updateDebugRow('debug-queue', 'queue: none');
      return;
    }
    const data = doc.data() || {};
    updateDebugRow('debug-queue', `queue: ${data.searching ? 'searching' : 'idle'} | ${data.commType || '-'}`);
  });

  const waitingUnsub = db.collection('waiting')
    .where('searching', '==', true)
    .onSnapshot(snapshot => {
      updateDebugRow('debug-waiting', `waiting: ${snapshot.size}`);
    });

  const callUnsub = db.collection('calls')
    .where('users', 'array-contains', userId)
    .onSnapshot(snapshot => {
      if (snapshot.empty) {
        updateDebugRow('debug-call', 'call: none');
        return;
      }
      const doc = snapshot.docs[0];
      const data = doc.data() || {};
      updateDebugRow('debug-call', `call: ${doc.id} | ${data.status || '-'}`);
    });

  debugUnsubs = [queueUnsub, waitingUnsub, callUnsub];
}

function teardownDebugPanel() {
  if (debugStateTimer) {
    clearInterval(debugStateTimer);
    debugStateTimer = null;
  }
  debugUnsubs.forEach(unsub => {
    try { unsub(); } catch (_) {}
  });
  debugUnsubs = [];
  const panel = document.getElementById('debug-panel');
  if (panel) {
    panel.classList.add('hidden');
  }
}

function updateDebugRow(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ============================================
// REVEAL ANIMATIONS
// ============================================

function initializeRevealAnimations() {
  const revealItems = Array.from(document.querySelectorAll('.reveal'));
  if (!revealItems.length) return;

  revealItems.forEach((el, index) => {
    if (el.classList.contains('feature-card')) {
      el.style.setProperty('--reveal-delay', `${index * 70}ms`);
    } else {
      el.style.setProperty('--reveal-delay', '0ms');
    }
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  revealItems.forEach(el => observer.observe(el));
}

// Expose globals
window.openApp = openApp;
window.closeApp = closeApp;
window.toggleMenu = toggleMenu;
