import { db, firebase } from '../services/firestore.js';
import { state } from '../core/state.js';
import { showStatus, updateConnectionQuality } from '../ui/screens.js';
import { ICE_SERVERS, APP_CONSTANTS } from '../config.js';
import { COMM_TYPE } from '../utils/constants.js';

const CONNECTION_TIMEOUT = APP_CONSTANTS.CONNECTION_TIMEOUT_MS;
let connectionTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

/**
 * Start video/voice call with optimized WebRTC signaling
 */
export async function startVideoCall(callId, isInitiator, remoteInterests) {
  try {
    showStatus('Accessing camera/mic...', 'info');

    // Get media with retry
    const stream = await getMediaStreamWithRetry();
    state.connection.localStream = stream;

    // Initialize peer connection
    await initializePeerConnection(callId, isInitiator);

    // Setup signaling
    await setupSignaling(callId, isInitiator);

    // Start connection timeout
    startConnectionTimeout();

    showStatus('Connecting...', 'info');
  } catch (error) {
    console.error('StartVideoCall error:', error);
    handleMediaError(error);
    throw error;
  }
}

/**
 * Get user media with retry logic
 */
async function getMediaStreamWithRetry(retries = 3) {
  const isVideo = state.ui.commType === COMM_TYPE.VIDEO;
  
  const constraints = isVideo
    ? { 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }, 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      }
    : { 
        video: false, 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

  for (let i = 0; i < retries; i++) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (error) {
      if (i === retries - 1) throw error;
      
      // Try audio-only fallback on last retry
      if (i === retries - 2 && isVideo) {
        constraints.video = false;
        showStatus('Video unavailable, trying audio only...', 'warning');
      }
      
      await sleep(1000);
    }
  }
}

/**
 * Initialize RTCPeerConnection with enhanced config
 */
async function initializePeerConnection(callId, isInitiator) {
  const config = {
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };

  state.connection.pc = new RTCPeerConnection(config);
  const pc = state.connection.pc;

  // Add local tracks
  state.connection.localStream.getTracks().forEach(track => {
    pc.addTrack(track, state.connection.localStream);
  });

  // Handle remote tracks
  pc.ontrack = handleRemoteTrack;

  // Handle ICE candidates with buffering
  pc.onicecandidate = (event) => handleIceCandidate(event, callId);

  // Connection state monitoring
  pc.onconnectionstatechange = () => handleConnectionStateChange(pc.connectionState);
  pc.oniceconnectionstatechange = () => handleIceConnectionStateChange(pc.iceConnectionState);

  // Track statistics
  startStatsMonitoring(pc);
}

/**
 * Handle remote track with auto-play
 */
function handleRemoteTrack(event) {
  if (event.streams && event.streams[0]) {
    state.connection.remoteStream = event.streams[0];
    
    const remoteVideo = document.getElementById('remote-video');
    if (remoteVideo) {
      remoteVideo.srcObject = event.streams[0];
      
      // Auto-play with fallback
      remoteVideo.play().catch(error => {
        console.warn('Autoplay blocked, showing play button', error);
        showPlayButton();
      });
    }
    
    clearConnectionTimeout();
    showStatus('Connected!', 'success');
  }
}

/**
 * Handle ICE candidates with buffering
 */
const candidateBuffer = [];
let remoteDescriptionSet = false;

async function handleIceCandidate(event, callId) {
  if (event.candidate) {
    const candidate = event.candidate.toJSON();
    
    try {
      await db.collection('calls').doc(callId)
        .collection('candidates')
        .add({
          candidate,
          from: state.user.uid,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }
}

/**
 * Setup signaling with proper ordering
 */
async function setupSignaling(callId, isInitiator) {
  const callRef = db.collection('calls').doc(callId);

  // Listen for remote candidates
  state.listeners.candidates = db.collection('calls').doc(callId)
    .collection('candidates')
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          const data = change.doc.data();
          
          if (data.from !== state.user.uid) {
            const candidate = new RTCIceCandidate(data.candidate);
            
            // Buffer candidates until remote description is set
            if (!state.connection.pc.remoteDescription) {
              candidateBuffer.push(candidate);
            } else {
              try {
                await state.connection.pc.addIceCandidate(candidate);
              } catch (error) {
                console.error('Error adding buffered ICE candidate:', error);
              }
            }
          }
        }
      });
    });

  // Listen for offer/answer
  state.listeners.call = callRef.onSnapshot(async snapshot => {
    const data = snapshot.data();
    if (!data) return;

    const pc = state.connection.pc;

    // Handle offer (answerer)
    if (!isInitiator && data.offer && !pc.currentRemoteDescription) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        remoteDescriptionSet = true;
        
        // Add buffered candidates
        await flushCandidateBuffer();
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        await callRef.update({
          answer: {
            type: answer.type,
            sdp: answer.sdp
          }
        });
      } catch (error) {
        console.error('Error handling offer:', error);
        showStatus('Connection failed', 'error');
      }
    }

    // Handle answer (initiator)
    if (isInitiator && data.answer && !pc.currentRemoteDescription) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        remoteDescriptionSet = true;
        
        // Add buffered candidates
        await flushCandidateBuffer();
      } catch (error) {
        console.error('Error setting answer:', error);
        showStatus('Connection failed', 'error');
      }
    }
  });

  // Create offer (initiator)
  if (isInitiator) {
    try {
      const offer = await state.connection.pc.createOffer();
      await state.connection.pc.setLocalDescription(offer);
      
      await callRef.set({
        offer: {
          type: offer.type,
          sdp: offer.sdp
        },
        initiator: state.user.uid,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('Error creating offer:', error);
      throw error;
    }
  }
}

/**
 * Flush buffered ICE candidates
 */
async function flushCandidateBuffer() {
  const pc = state.connection.pc;
  
  for (const candidate of candidateBuffer) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      console.error('Error adding buffered candidate:', error);
    }
  }
  
  candidateBuffer.length = 0;
}

/**
 * Handle connection state changes
 */
function handleConnectionStateChange(connectionState) {
  console.log('Connection state:', connectionState);
  updateConnectionQuality(connectionState);

  switch (connectionState) {
    case 'connected':
      clearConnectionTimeout();
      reconnectAttempts = 0;
      showStatus('Connected!', 'success');
      break;
      
    case 'disconnected':
      showStatus('Connection interrupted...', 'warning');
      attemptReconnect();
      break;
      
    case 'failed':
      showStatus('Connection failed', 'error');
      attemptReconnect();
      break;
      
    case 'closed':
      clearConnectionTimeout();
      break;
  }
}

/**
 * Handle ICE connection state changes
 */
function handleIceConnectionStateChange(iceState) {
  console.log('ICE connection state:', iceState);
  
  if (iceState === 'failed') {
    // Try ICE restart
    restartIce();
  }
}

/**
 * Attempt to reconnect
 */
async function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    showStatus('Connection lost. Please skip to find new match.', 'error');
    return;
  }

  reconnectAttempts++;
  showStatus(`Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 'warning');

  await sleep(2000);
  restartIce();
}

/**
 * Restart ICE connection
 */
async function restartIce() {
  const pc = state.connection.pc;
  if (!pc) return;

  try {
    const offer = await pc.createOffer({ iceRestart: true });
    await pc.setLocalDescription(offer);
    
    const callRef = db.collection('calls').doc(state.match.callId);
    await callRef.update({
      offer: {
        type: offer.type,
        sdp: offer.sdp
      },
      iceRestart: true,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('ICE restart error:', error);
  }
}

/**
 * Connection timeout handler
 */
function startConnectionTimeout() {
  clearConnectionTimeout();
  
  connectionTimer = setTimeout(() => {
    if (state.connection.pc?.connectionState !== 'connected') {
      showStatus('Connection timeout. Retrying...', 'error');
      attemptReconnect();
    }
  }, CONNECTION_TIMEOUT);
}

function clearConnectionTimeout() {
  if (connectionTimer) {
    clearTimeout(connectionTimer);
    connectionTimer = null;
  }
}

/**
 * Monitor connection statistics
 */
let statsInterval = null;

function startStatsMonitoring(pc) {
  stopStatsMonitoring();
  
  statsInterval = setInterval(async () => {
    if (!pc || pc.connectionState === 'closed') {
      stopStatsMonitoring();
      return;
    }

    try {
      const stats = await pc.getStats();
      let bytesReceived = 0;
      let bytesSent = 0;

      stats.forEach(report => {
        if (report.type === 'inbound-rtp') {
          bytesReceived += report.bytesReceived || 0;
        }
        if (report.type === 'outbound-rtp') {
          bytesSent += report.bytesSent || 0;
        }
      });

      // Update UI with stats if needed
      console.log('Stats:', { bytesReceived, bytesSent });
    } catch (error) {
      console.error('Stats error:', error);
    }
  }, 5000);
}

function stopStatsMonitoring() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

/**
 * Toggle audio mute
 */
export function toggleAudio() {
  if (!state.connection.localStream) return;

  const audioTracks = state.connection.localStream.getAudioTracks();
  audioTracks.forEach(track => {
    track.enabled = !track.enabled;
  });

  state.connection.isAudioMuted = !audioTracks[0]?.enabled;
  return state.connection.isAudioMuted;
}

/**
 * Toggle video
 */
export function toggleVideo() {
  if (!state.connection.localStream) return;

  const videoTracks = state.connection.localStream.getVideoTracks();
  videoTracks.forEach(track => {
    track.enabled = !track.enabled;
  });

  state.connection.isVideoOff = !videoTracks[0]?.enabled;
  return state.connection.isVideoOff;
}

/**
 * Handle media errors with user-friendly messages
 */
function handleMediaError(error) {
  let message = 'Error accessing camera/mic';
  
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    message = 'Camera/mic permission denied. Please allow access in browser settings.';
  } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    message = 'No camera/mic found. Please connect a device.';
  } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
    message = 'Camera/mic already in use by another app.';
  } else if (error.name === 'OverconstrainedError') {
    message = 'Camera/mic constraints not supported.';
  }

  showStatus(message, 'error');
}

/**
 * Show play button for manual video start
 */
function showPlayButton() {
  const remoteVideo = document.getElementById('remote-video');
  if (!remoteVideo) return;

  const playBtn = document.createElement('button');
  playBtn.textContent = '▶️ Tap to Play';
  playBtn.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 15px 30px;
    font-size: 18px;
    background: linear-gradient(135deg, #00d2ff, #3a7bd5);
    border: none;
    border-radius: 50px;
    color: white;
    cursor: pointer;
    z-index: 100;
  `;
  
  playBtn.onclick = () => {
    remoteVideo.play();
    playBtn.remove();
  };
  
  remoteVideo.parentElement.appendChild(playBtn);
}

// Utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
