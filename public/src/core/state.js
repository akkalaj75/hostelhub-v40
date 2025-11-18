// Centralized State Management (Singleton)
class AppState {
  constructor() {
    this.user = null;
    this.profile = {
      gender: '',
      college: '',
      interests: [],
      blockedUsers: []
    };
    this.match = {
      state: 'idle',
      callId: null,
      remoteUid: null,
      remoteInterests: []
    };
    this.connection = {
      pc: null,
      localStream: null,
      remoteStream: null,
      isAudioMuted: false,
      isVideoOff: false
    };
    this.ui = {
      currentScreen: 'login',
      commType: 'video'
    };
    this.listeners = {
      match: null,
      call: null,
      candidates: null,
      chat: null,
      status: null
    };
  }

  reset() {
    this.match = {
      state: 'idle',
      callId: null,
      remoteUid: null,
      remoteInterests: []
    };
  }

  cleanupListeners() {
    Object.keys(this.listeners).forEach(key => {
      if (this.listeners[key]) {
        try {
          this.listeners[key]();
        } catch (e) {
          console.warn(`Failed to cleanup listener: ${key}`, e);
        }
        this.listeners[key] = null;
      }
    });
  }
}

export const state = new AppState();