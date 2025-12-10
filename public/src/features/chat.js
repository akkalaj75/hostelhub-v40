import { db, firebase } from '../services/firestore.js';
import { state } from '../core/state.js';
import { showStatus } from '../ui/screens.js';
import { detectContactInfo, detectAbusiveContent } from '../utils/sanitizers.js';
import { APP_CONSTANTS } from '../config.js';
import { generateConversationStarters, getRandomIcebreaker } from '../services/ai.js';

let chatHistory = [];
const MAX_MESSAGE_LENGTH = APP_CONSTANTS.MAX_MESSAGE_LENGTH;

/**
 * Start text chat session
 */
export async function startTextChat(callId, remoteInterests) {
  try {
    chatHistory = [];
    
    // Listen for incoming messages
    state.listeners.chat = db.collection('calls').doc(callId)
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const msg = change.doc.data();
            
            if (msg.from !== state.user.uid) {
              addMessageToUI(msg.text, 'remote');
              
              chatHistory.push({
                from: 'Stranger',
                text: msg.text,
                time: new Date().toLocaleTimeString()
              });
            }
          }
        });
      });

    addSystemMessage('Connected! Say hello :)');
    const starters = generateConversationStarters(state.profile.interests || [], remoteInterests || []);
    if (starters.length) {
      addSystemMessage(`Try asking about: ${starters.join(' | ')}`);
    } else {
      addSystemMessage(`Icebreaker: ${getRandomIcebreaker()}`);
    }
    showStatus('', 'info');
  } catch (error) {
    console.error('Start chat error:', error);
    throw error;
  }
}

/**
 * Send message with validation
 */
export async function sendMessage(text) {
  if (!text || !text.trim()) return;
  
  const trimmedText = text.trim().substring(0, MAX_MESSAGE_LENGTH);

  // Check for contact info
  if (detectContactInfo(trimmedText)) {
    addSystemMessage('⚠️ Sharing contact info is against the rules');
    return { blocked: true, reason: 'contact_info' };
  }

  // Check for abusive content
  const abuseResult = detectAbusiveContent(trimmedText);
  if (abuseResult.isAbusive) {
    addSystemMessage('⚠️ Please keep the conversation respectful');
    return { blocked: true, reason: 'abusive' };
  }

  // Prefer data channel if available (for active RTC sessions)
  const dc = state.connection.chatChannel;
  if (dc && dc.readyState === 'open') {
    try {
      dc.send(JSON.stringify({ type: 'chat', text: trimmedText, ts: Date.now() }));
      addMessageToUI(trimmedText, 'local');
      chatHistory.push({
        from: 'You',
        text: trimmedText,
        time: new Date().toLocaleTimeString()
      });
      return { success: true, via: 'datachannel' };
    } catch (error) {
      console.error('Data channel send error', error);
      // fall through to Firestore fallback
    }
  }

  // Firestore fallback
  addMessageToUI(trimmedText, 'local');
  
  chatHistory.push({
    from: 'You',
    text: trimmedText,
    time: new Date().toLocaleTimeString()
  });

  try {
    await db.collection('calls').doc(state.match.callId)
      .collection('messages')
      .add({
        text: trimmedText,
        from: state.user.uid,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    
    return { success: true, via: 'firestore' };
  } catch (error) {
    console.error('Send message error:', error);
    addSystemMessage('❌ Failed to send message');
    return { error: true };
  }
}

/**
 * Add message to UI
 */
function addMessageToUI(text, type) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${type}`;
  msgDiv.textContent = text;
  
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

/**
 * Add system message
 */
export function addSystemMessage(text) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'message system';
  msgDiv.textContent = text;
  
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

/**
 * Save chat history to file
 */
export function saveChatHistory() {
  if (chatHistory.length === 0) {
    showStatus('No messages to save', 'warning');
    return;
  }

  const chatText = chatHistory.map(msg => 
    `[${msg.time}] ${msg.from}: ${msg.text}`
  ).join('\n');

  const blob = new Blob([chatText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hostelhub-chat-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);

  showStatus('Chat saved!', 'success');
}

/**
 * Clear chat messages
 */
export function clearChatMessages() {
  const container = document.getElementById('chat-messages');
  if (container) {
    container.innerHTML = '';
  }
  chatHistory = [];
}

/**
 * Get chat history
 */
export function getChatHistory() {
  return [...chatHistory];
}

/**
 * Handle incoming data-channel chat payloads
 */
export function receiveDataChannelMessage(text, ts = Date.now()) {
  addMessageToUI(text, 'remote');
  chatHistory.push({
    from: 'Stranger',
    text,
    time: new Date(ts).toLocaleTimeString()
  });
}
