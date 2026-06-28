import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FishPhoto {
  id: string;
  originalUri: string;
  editedUri: string | null;
  fishScale: number; // 0.2 to 3.0 (20% to 300%)
  createdAt: number;
  shareCount: number;
  title: string;
  isUnlocked?: boolean; // true if user paid to remove watermark for this specific photo
}

interface AppState {
  // Photos
  photos: FishPhoto[];
  addPhoto: (photo: FishPhoto) => void;
  updatePhoto: (id: string, updates: Partial<FishPhoto>) => void;
  deletePhoto: (id: string) => void;
  unlockPhoto: (id: string) => void;

  // Profile photo
  profilePhotoUri: string | null;
  setProfilePhoto: (uri: string | null) => void;

  // User stats
  totalEdits: number;
  totalShares: number;
  incrementEdits: () => void;
  incrementShares: () => void;

  // Premium
  isPremium: boolean;
  freeEditsRemaining: number;
  decrementFreeEdits: () => void;
  setPremium: (value: boolean) => void;

  // Onboarding
  hasSeenOnboarding: boolean;
  setHasSeenOnboarding: (value: boolean) => void;

  // UI hints
  hasUsedSizeButtons: boolean;
  setHasUsedSizeButtons: (value: boolean) => void;

  // Feedback & Reviews
  hasRatedApp: boolean;
  hasProvidedFeedback: boolean;
  lastFeedbackPromptTime: number | null;
  setHasRatedApp: (value: boolean) => void;
  setHasProvidedFeedback: (value: boolean) => void;
  setLastFeedbackPromptTime: (time: number) => void;
  shouldShowReviewPrompt: () => boolean;

  // Persistence
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
  scheduleSave: () => void;
  resetAllData: () => Promise<void>;
}

// Debounce persistence: mutations fire `scheduleSave()` (often several in one
// tick), and the actual JSON.stringify + AsyncStorage write happens once, shortly
// after the last change — instead of stringifying the whole photo list per call.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 400;

// Free AI resizes a new user gets before the paywall. Keep the App Store listing
// description in sync with this number (currently 1).
export const DEFAULT_FREE_EDITS = 1;

export const useAppStore = create<AppState>((set, get) => ({
  photos: [],
  totalEdits: 0,
  totalShares: 0,
  profilePhotoUri: null,
  isPremium: false,
  freeEditsRemaining: DEFAULT_FREE_EDITS,
  hasSeenOnboarding: false,
  hasUsedSizeButtons: false,
  hasRatedApp: false,
  hasProvidedFeedback: false,
  lastFeedbackPromptTime: null,

  setHasRatedApp: (value) => {
    set({ hasRatedApp: value });
    get().scheduleSave();
  },

  setHasProvidedFeedback: (value) => {
    set({ hasProvidedFeedback: value });
    get().scheduleSave();
  },

  setLastFeedbackPromptTime: (time) => {
    set({ lastFeedbackPromptTime: time });
    get().scheduleSave();
  },

  shouldShowReviewPrompt: () => {
    const state = get();
    // Don't show if already rated
    if (state.hasRatedApp) return false;
    // Must have at least 1 successful edit
    if (state.totalEdits < 1) return false;
    // Don't prompt more than once per 7 days
    if (state.lastFeedbackPromptTime) {
      const daysSinceLastPrompt = (Date.now() - state.lastFeedbackPromptTime) / (1000 * 60 * 60 * 24);
      if (daysSinceLastPrompt < 7) return false;
    }
    return true;
  },

  setHasSeenOnboarding: (value) => {
    set({ hasSeenOnboarding: value });
    get().scheduleSave();
  },

  setHasUsedSizeButtons: (value) => {
    set({ hasUsedSizeButtons: value });
    get().scheduleSave();
  },

  setProfilePhoto: (uri) => {
    set({ profilePhotoUri: uri });
    get().scheduleSave();
  },

  addPhoto: (photo) => {
    set((state) => ({ photos: [photo, ...state.photos] }));
    get().scheduleSave();
  },

  updatePhoto: (id, updates) => {
    set((state) => ({
      photos: state.photos.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
    get().scheduleSave();
  },

  deletePhoto: (id) => {
    set((state) => ({ photos: state.photos.filter((p) => p.id !== id) }));
    get().scheduleSave();
  },

  unlockPhoto: (id) => {
    set((state) => ({
      photos: state.photos.map((p) => (p.id === id ? { ...p, isUnlocked: true } : p)),
    }));
    get().scheduleSave();
  },

  incrementEdits: () => {
    set((state) => ({ totalEdits: state.totalEdits + 1 }));
    get().scheduleSave();
  },

  incrementShares: () => {
    set((state) => ({ totalShares: state.totalShares + 1 }));
    get().scheduleSave();
  },

  decrementFreeEdits: () => {
    set((state) => ({ freeEditsRemaining: Math.max(0, state.freeEditsRemaining - 1) }));
    get().scheduleSave();
  },

  setPremium: (value) => {
    set({ isPremium: value });
    get().scheduleSave();
  },

  loadFromStorage: async () => {
    try {
      const data = await AsyncStorage.getItem('size-matters-data');
      if (data) {
        const parsed = JSON.parse(data);
        set({
          photos: parsed.photos || [],
          totalEdits: parsed.totalEdits || 0,
          totalShares: parsed.totalShares || 0,
          profilePhotoUri: parsed.profilePhotoUri || null,
          isPremium: parsed.isPremium || false,
          freeEditsRemaining: parsed.freeEditsRemaining ?? DEFAULT_FREE_EDITS,
          hasSeenOnboarding: parsed.hasSeenOnboarding || false,
          hasUsedSizeButtons: parsed.hasUsedSizeButtons || false,
          hasRatedApp: parsed.hasRatedApp || false,
          hasProvidedFeedback: parsed.hasProvidedFeedback || false,
          lastFeedbackPromptTime: parsed.lastFeedbackPromptTime || null,
        });
      }
    } catch (error) {
      console.log('Error loading from storage:', error);
    }
  },

  saveToStorage: async () => {
    try {
      const state = get();
      await AsyncStorage.setItem(
        'size-matters-data',
        JSON.stringify({
          photos: state.photos,
          totalEdits: state.totalEdits,
          totalShares: state.totalShares,
          profilePhotoUri: state.profilePhotoUri,
          isPremium: state.isPremium,
          freeEditsRemaining: state.freeEditsRemaining,
          hasSeenOnboarding: state.hasSeenOnboarding,
          hasUsedSizeButtons: state.hasUsedSizeButtons,
          hasRatedApp: state.hasRatedApp,
          hasProvidedFeedback: state.hasProvidedFeedback,
          lastFeedbackPromptTime: state.lastFeedbackPromptTime,
        })
      );
    } catch (error) {
      console.log('Error saving to storage:', error);
    }
  },

  scheduleSave: () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      get().saveToStorage();
    }, SAVE_DEBOUNCE_MS);
  },

  resetAllData: async () => {
    try {
      // Cancel any pending debounced write so it can't resurrect stale data.
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      await AsyncStorage.removeItem('size-matters-data');
      set({
        photos: [],
        totalEdits: 0,
        totalShares: 0,
        profilePhotoUri: null,
        isPremium: false,
        freeEditsRemaining: DEFAULT_FREE_EDITS,
        hasSeenOnboarding: false,
        hasUsedSizeButtons: false,
        hasRatedApp: false,
        hasProvidedFeedback: false,
        lastFeedbackPromptTime: null,
      });
    } catch (error) {
      console.log('Error resetting data:', error);
    }
  },
}));
