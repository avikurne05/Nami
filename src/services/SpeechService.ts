import * as Speech from 'expo-speech';

export type SpeechMode = 'ALL' | 'ALERTS_ONLY' | 'MUTED';

export const SpeechService = {
  mode: 'ALL' as SpeechMode,
  lastSpokenText: '',
  lastSpokenTime: 0,

  setMode(newMode: SpeechMode) {
    this.mode = newMode;
    if (newMode === 'MUTED') {
      Speech.stop();
    }
  },

  /**
   * Speak a navigation instruction (if not muted)
   */
  speakInstruction(text: string) {
    if (this.mode === 'MUTED') return;
    
    // Avoid repeating the exact same spoken instruction within 10 seconds
    if (text === this.lastSpokenText && Date.now() - this.lastSpokenTime < 10000) {
      return;
    }

    this.lastSpokenText = text;
    this.lastSpokenTime = Date.now();

    try {
      Speech.stop();
      Speech.speak(text, {
        language: 'en-US',
        pitch: 1.0,
        rate: 0.95, // Clear speaking rate for riders
      });
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  },

  /**
   * Speak critical safety / hazard alert (spoken in ALL and ALERTS_ONLY modes)
   */
  speakAlert(text: string) {
    if (this.mode === 'MUTED') return;

    try {
      Speech.stop();
      Speech.speak(text, {
        language: 'en-US',
        pitch: 1.1,
        rate: 1.0,
      });
    } catch (e) {
      console.warn('Speech alert error:', e);
    }
  },
};

export default SpeechService;
