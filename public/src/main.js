import { onAuthChange, signup, login, resetPassword, logout } from './core/auth.js';
import { findMatch, skipMatch, cleanupMatch } from './features/matchmaking.js';
import { toggleAudio, toggleVideo } from './features/rtc.js';
import { sendMessage, saveChatHistory, addSystemMessage } from './features/chat.js';
import { reportUser, blockUser, unblockUser, getBlockedUsers } from './features/reporting.js';
import { state } from './core/state.js';
import { 
  navigateToScreen, 
  showStatus, 
  showStrangerInfo,
  updateLiveUsersCounter,
  setLoading 
} from './ui/screens.js';
import { trackLiveUsers } from './services/firestore.js';
import { validateEmail, validatePassword, validateInterest } from './utils/validators.js';
import { SCREEN, COMM_TYPE } from './utils/constants.js';
import { getRandomIcebreaker, generateConversationStarters } from './services/ai.js';

/**
 * Initialize app
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('HostelHub V40 Initializing...');
  
  initializeAuth();
  initializeUI();
  initializeLiveCounter();
  
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
    } else {
      navigateToScreen(SCREEN.LOGIN);
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
}

/**
 * Initialize live user counter
 */
function initializeLiveCounter() {
  trackLiveUsers(count => {
    updateLiveUsersCounter(count);
  });
}

// ============================================
// AUTH HANDLERS
// ============================================

async function handleSignup() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
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
    document.getElementById('verify-notice').style.display = 'block';
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

  if (!gender || !college) {
    showStatus('Please select gender and college', 'error');
    return;
  }

  try {
    setLoading(btn, true);
    // Persist selections for subsequent skips/retries
    state.profile.gender = gender;
    state.profile.college = college;
    await findMatch(gender, college, state.ui.commType, state.profile.interests);
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    // Always re-enable the button after the attempt completes
    setLoading(btn, false);
  }
}

async function handleSkip() {
  const confirmed = confirm('Skip to next match?');
  if (!confirmed) return;

  try {
    await skipMatch();
  } catch (error) {
    showStatus('Error skipping match', 'error');
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

  if (state.profile.interests.length >= 5) {
    showStatus('Maximum 5 interests allowed', 'warning');
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
  input.value = '';
}

function removeInterest(interest) {
  state.profile.interests = state.profile.interests.filter(i => i !== interest);
  updateInterestTags();
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

// Expose to window for onclick handlers
window.removeInterest = removeInterest;

// ============================================
// COMMUNICATION TYPE
// ============================================

function selectCommType(element) {
  document.querySelectorAll('.comm-type').forEach(el => {
    el.classList.remove('active');
  });
  
  element.classList.add('active');
  state.ui.commType = element.dataset.type;
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

// Expose globals
window.openApp = openApp;
window.closeApp = closeApp;
window.toggleMenu = toggleMenu;
