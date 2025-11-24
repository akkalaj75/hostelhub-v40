import { state } from '../core/state.js';
import { SCREEN } from '../utils/constants.js';

/**
 * Navigate between screens
 */
export function navigateToScreen(screenName) {
  // Hide all screens
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  // Show target screen
  const targetScreen = document.getElementById(`${screenName}-screen`);
  if (targetScreen) {
    targetScreen.classList.add('active');
    state.ui.currentScreen = screenName;
  }

  // Hide/show containers
  if (screenName === SCREEN.VIDEO) {
    document.getElementById('video-container').style.display = 'block';
    document.getElementById('chat-container').style.display = 'none';
  } else if (screenName === SCREEN.CHAT) {
    document.getElementById('chat-container').style.display = 'block';
    document.getElementById('video-container').style.display = 'none';
  } else {
    document.getElementById('video-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'none';
  }
}

/**
 * Show status message
 */
export function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;

  statusEl.textContent = message;
  
  const colors = {
    info: '#ffd43b',
    success: '#4ade80',
    error: '#ff6b6b',
    warning: '#ffa500'
  };
  
  statusEl.style.color = colors[type] || colors.info;
}

/**
 * Update connection quality indicator
 */
export function updateConnectionQuality(connectionState, metrics = {}) {
  const qualityEl = document.getElementById('quality');
  if (!qualityEl) return;

  const { pingMs, bitrateMbps } = metrics;

  const states = {
    connected: { text: 'Connected', class: 'quality-good' },
    connecting: { text: 'Connecting...', class: 'quality-fair' },
    disconnected: { text: 'Connection lost', class: 'quality-poor' },
    failed: { text: 'Failed', class: 'quality-poor' },
    closed: { text: 'Closed', class: 'quality-poor' }
  };

  const state = states[connectionState] || states.connecting;
  let parts = [state.text];
  if (typeof pingMs === 'number') parts.push(`${Math.round(pingMs)} ms`);
  if (typeof bitrateMbps === 'number') parts.push(`${bitrateMbps.toFixed(2)} Mbps`);

  qualityEl.textContent = parts.join(' · ');
  qualityEl.className = state.class;
}


/**
 * Show stranger info with interests
 */
export function showStrangerInfo(interests, college) {
  const infoEl = document.getElementById('stranger-info');
  const chatInfoEl = document.getElementById('stranger-info-chat');
  
  let html = `<div>Connected with a stranger from ${college || 'your college'}</div>`;
  
  if (interests && interests.length > 0) {
    html += `<div class="stranger-interests">
      ${interests.map(i => `<span class="tag">${i}</span>`).join('')}
    </div>`;
  }
  
  if (infoEl) infoEl.innerHTML = html;
  if (chatInfoEl) chatInfoEl.innerHTML = html;
}

/**
 * Update live users counter
 */
export function updateLiveUsersCounter(count) {
  const counter = document.getElementById('live-users-counter');
  if (counter) {
        counter.innerHTML = `${count} online`;
    counter.style.display = 'block';
  }
}

/**
 * Show/hide loading indicator
 */
export function setLoading(element, isLoading) {
  if (!element) return;
  
  if (isLoading) {
    element.disabled = true;
    element.dataset.originalText = element.textContent;
    element.textContent = 'Loading...';
  } else {
    element.disabled = false;
    element.textContent = element.dataset.originalText || element.textContent;
  }
}

