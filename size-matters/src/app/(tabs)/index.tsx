import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Modal as RNModal,
  AccessibilityInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  runOnJS,
  clamp,
  cancelAnimation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Fish, Upload, Wand2, Share2, RotateCcw, Ruler, ArrowLeftRight, Download, TrendingDown, TrendingUp, Minus, Lock, X, AlertCircle, ImageOff } from 'lucide-react-native';
import { FishTapGame } from '@/components/FishTapGame';
import { ResizeStatus } from '@/components/ResizeStatus';
import { GlowingButton } from '@/components/GlowingButton';
import { PaywallModal } from '@/components/PaywallModal';
import { FeedbackModal } from '@/components/FeedbackModal';
import { detectFishInImage, resizeFish, getEngineInfo } from '@/lib/fishEditor';
import { persistImage } from '@/lib/fileStore';
import { track, timeEvent, incrementProfile, setProfile } from '@/lib/analytics';
import * as MediaLibrary from 'expo-media-library';
import { useAppStore, FishPhoto } from '@/lib/store';
import { getRandomTagline, getSliderTagline, getRandomTitle } from '@/lib/taglines';
import { cn } from '@/lib/cn';
import * as Sharing from 'expo-sharing';
import { ShareableImage, ShareableImageRef } from '@/components/ShareableImage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_SIZE = SCREEN_WIDTH - 48;

// Minimum time the resize overlay (status + game) stays up, so a fast resize
// doesn't flash the game and vanish before the user can engage with it.
const MIN_RESIZE_OVERLAY_MS = 2800;

// After the reveal, the before/after divider eases to rest here (fraction of
// IMAGE_SIZE shown as the "before" original) instead of wiping all the way to the
// bare result. A centered split keeps BOTH the original and the resized fish on
// screen — the size contrast is the whole payoff — and parks the drag handle
// mid-frame where it's obviously grabbable, so the comparison reads as something
// the user controls rather than a one-shot animation that's already over.
const REVEAL_REST_SPLIT = 0.5;

// Maps fish scale value to slider percentage (0-100)
// Creates a non-linear mapping where 1x is at 50%
const scaleToSliderPercent = (scale: number): number => {
  if (scale <= 1) {
    // Left half: 0.5 to 1.0 maps to 0% to 50%
    // At 0.5x scale, slider should be at 0%
    return ((scale - 0.5) / 0.5) * 50;
  } else {
    // Right half: 1.0 to 3.0 maps to 50% to 100%
    return 50 + ((scale - 1) / 2) * 50;
  }
};

// Maps slider percentage (0-100) to fish scale value
const sliderPercentToScale = (percent: number): number => {
  if (percent <= 50) {
    // Left half: 0% to 50% maps to 0.5 to 1.0
    return 0.5 + (percent / 50) * 0.5;
  } else {
    // Right half: 50% to 100% maps to 1.0 to 3.0
    return 1 + ((percent - 50) / 50) * 2;
  }
};

export default function HomeScreen() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [fishScale, setFishScale] = useState(1.0);
  const [tagline, setTagline] = useState(() => getRandomTagline('home'));
  const [sliderTagline, setSliderTagline] = useState('Original Size');
  const [noPhotoTagline] = useState(() => getRandomTagline('noPhoto'));
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [gameKey, setGameKey] = useState(0); // Key to force game remount
  // Controlled loading-overlay state, decoupled from the mutation's isPending so we
  // can enforce a minimum on-screen time (below). Without a floor, a fast resize
  // makes the FishTapGame flash for a second and vanish, which reads as a glitch.
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef(0);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest OS "Reduce Motion" setting, read synchronously when we kick off the
  // reveal/nudge so we can honor it (Reanimated/RN have no reduced-motion hook).
  const reduceMotionRef = useRef(false);
  const [showPaywall, setShowPaywall] = useState(false);
  // Whether the current edited image has been unlocked via the single ($0.99)
  // purchase, so it can be shared/saved watermark-free without a subscription.
  const [currentImageUnlocked, setCurrentImageUnlocked] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'share' | null>(null);
  const [showWatermarkConfirm, setShowWatermarkConfirm] = useState(false);
  const [noFishDetected, setNoFishDetected] = useState(false);
  const [detectedSpecies, setDetectedSpecies] = useState<string | undefined>(undefined);
  const [isValidatingImage, setIsValidatingImage] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const shareableImageRef = useRef<ShareableImageRef>(null);
  const router = useRouter();

  // Gallery entry id for the CURRENT edited image, so save + share don't create
  // duplicate "My Catches" entries for the same resize.
  const currentPhotoIdRef = useRef<string | null>(null);

  // Track previous snapped value to detect changes during gesture
  const lastSnappedValue = useRef(1.0);

  const isPremium = useAppStore((s) => s.isPremium);
  const freeEditsRemaining = useAppStore((s) => s.freeEditsRemaining);
  const addPhoto = useAppStore((s) => s.addPhoto);
  const updatePhoto = useAppStore((s) => s.updatePhoto);
  const incrementEdits = useAppStore((s) => s.incrementEdits);
  const decrementFreeEdits = useAppStore((s) => s.decrementFreeEdits);
  const incrementShares = useAppStore((s) => s.incrementShares);
  const totalEdits = useAppStore((s) => s.totalEdits);
  const shouldShowReviewPrompt = useAppStore((s) => s.shouldShowReviewPrompt);
  const setLastFeedbackPromptTime = useAppStore((s) => s.setLastFeedbackPromptTime);
  const hasUsedSizeButtons = useAppStore((s) => s.hasUsedSizeButtons);
  const setHasUsedSizeButtons = useAppStore((s) => s.setHasUsedSizeButtons);

  // Animations
  const fishBounce = useSharedValue(0);
  const buttonScale = useSharedValue(1);
  const sliderGlow = useSharedValue(0);
  // compareSlider = width of the BEFORE (original) overlay clipped from the left.
  // 0 => before fully hidden => the AFTER (resized) image is shown (the payoff).
  // IMAGE_SIZE => before covers everything => the original is shown.
  // The reveal animation drives this explicitly and rests it at a centered split
  // (see resizeFishMutation.onSuccess); this initial value is just a pre-reveal default.
  const compareSlider = useSharedValue(0);
  const sliderThumbScale = useSharedValue(1); // For thumb grow animation when dragging
  const uploadScale = useSharedValue(1); // For upload icon breathing scale
  const button3xScale = useSharedValue(1); // For 3x button nudge animation
  const button3xGlow = useSharedValue(0); // For 3x button glow
  const swipeHandleBounce = useSharedValue(0); // For swipe handle bounce nudge
  const hasInteractedWithSlider = useSharedValue(false); // Track if user has interacted with compare slider
  const upgradeButtonScale = useSharedValue(1); // For upgrade button pulse when 0 free resizes

  // Haptic feedback for comparison slider
  const triggerHaptic = () => {
    Haptics.selectionAsync();
  };

  // Store starting position for pan gesture
  const startSliderPosition = useSharedValue(IMAGE_SIZE);

  // Pan gesture for before/after comparison - memoized to prevent recreation on every render
  const panGesture = useMemo(() => Gesture.Pan()
    .onStart(() => {
      'worklet';
      startSliderPosition.value = compareSlider.value;
      // Stop bounce animation when user touches
      hasInteractedWithSlider.value = true;
      swipeHandleBounce.value = withTiming(0, { duration: 100 });
      runOnJS(triggerHaptic)();
    })
    .onUpdate((event) => {
      'worklet';
      // Use translationX (delta from start) + starting position
      const newValue = clamp(startSliderPosition.value + event.translationX, 0, IMAGE_SIZE);
      compareSlider.value = newValue;
    })
    .onEnd(() => {
      'worklet';
      // Snap to an edge when released close to it; otherwise keep the partial split.
      const current = compareSlider.value;
      if (current < IMAGE_SIZE * 0.2) {
        compareSlider.value = withSpring(0);
      } else if (current > IMAGE_SIZE * 0.8) {
        compareSlider.value = withSpring(IMAGE_SIZE);
      }
      runOnJS(triggerHaptic)();
    }), [triggerHaptic, startSliderPosition, compareSlider, hasInteractedWithSlider, swipeHandleBounce]);

  const compareClipStyle = useAnimatedStyle(() => ({
    width: compareSlider.value,
  }));

  const sliderHandleStyle = useAnimatedStyle(() => ({
    // Position from compareSlider + bounce nudge. Clamp so the 40px handle stays
    // fully on-screen even when the slider is parked at either edge.
    transform: [
      { translateX: clamp(compareSlider.value - 20, 0, IMAGE_SIZE - 40) + swipeHandleBounce.value }
    ],
  }));

  const sliderThumbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sliderThumbScale.value }],
  }));

  useEffect(() => {
    useAppStore.getState().loadFromStorage();
  }, []);

  // Clear any pending reveal timer if the screen unmounts mid-resize.
  useEffect(() => () => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
  }, []);

  // Track the OS "Reduce Motion" accessibility setting (and live changes) so the
  // before/after reveal and the handle nudge can be skipped for users who opt out
  // of non-essential animation.
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) reduceMotionRef.current = enabled;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reduceMotionRef.current = enabled;
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    fishBounce.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Upload icon breathing scale animation
    uploadScale.value = withRepeat(
      withTiming(1.15, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const fishAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: fishBounce.value }],
  }));

  // Note: only `transform` is animated here. Animating shadowOpacity/shadowRadius
  // every frame forces iOS to re-rasterize the shadow path continuously, which
  // janks the whole UI (including touch responsiveness). The glow is now a cheap
  // static shadow set on the view itself.
  const uploadIconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: uploadScale.value }],
  }));

  const button3xAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: button3xScale.value }],
  }));

  // Animated style for upgrade button pulse
  const upgradeButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: upgradeButtonScale.value }],
  }));

  // Pulse animation for upgrade button when 0 free resizes
  useEffect(() => {
    if (!isPremium && freeEditsRemaining <= 0) {
      upgradeButtonScale.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(upgradeButtonScale);
      upgradeButtonScale.value = 1;
    }
  }, [isPremium, freeEditsRemaining, upgradeButtonScale]);

  const pickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      aspect: [4, 3],
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      track('Photo Picked', { source: 'library' });

      // Downscale before any AI call. A full-resolution catch photo becomes a
      // multi-MB base64 string that blocks the JS thread (during detect + resize)
      // and is slow to upload. 1280px wide is plenty for detection, the resize
      // model, and the on-screen comparison — and makes everything feel instant.
      let imageUri = asset.uri;
      try {
        const TARGET_WIDTH = 1280;
        const actions =
          asset.width && asset.width > TARGET_WIDTH
            ? [{ resize: { width: TARGET_WIDTH } }]
            : [];
        const optimized = await ImageManipulator.manipulateAsync(asset.uri, actions, {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        imageUri = optimized.uri;
      } catch (e) {
        console.log('Image downscale failed, using original:', e);
      }

      setSelectedImage(imageUri);
      setEditedImage(null);
      setFishScale(1.0);
      setTagline(getRandomTagline('home'));
      setNoFishDetected(false);
      setDetectedSpecies(undefined);
      setCurrentImageUnlocked(false);
      currentPhotoIdRef.current = null;

      // Validate image contains a fish
      setIsValidatingImage(true);
      const detectEngine = getEngineInfo();
      timeEvent('Detection Completed'); // injects $duration onto the matching event
      track('Detection Started', { provider: detectEngine.detectProvider });
      try {
        const detection = await detectFishInImage(imageUri);
        // Remember the detected species so the resize step can keep the same fish.
        setDetectedSpecies(detection.species);
        track('Detection Completed', {
          has_fish: detection.hasFish,
          confidence: detection.confidence,
          species: detection.species,
          provider: detectEngine.detectProvider,
        });
        if (!detection.hasFish && detection.confidence !== 'low') {
          setNoFishDetected(true);
          track('No Fish Prompt Shown', { confidence: detection.confidence });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      } catch (error) {
        console.log('Fish detection error (non-blocking):', error);
        track('Detection Failed', { error_type: 'exception', provider: detectEngine.detectProvider });
      } finally {
        setIsValidatingImage(false);
      }
    }
  };

  const resizeFishMutation = useMutation({
    mutationFn: async ({ imageUri, scale, species }: { imageUri: string; scale: number; species?: string }) => {
      const result = await resizeFish(imageUri, scale, species);

      if (!result.success) {
        throw new Error(result.error || 'Failed to resize fish');
      }

      return result.editedImageUri!;
    },
    onSuccess: (url, variables) => {
      // Track the resize the instant the engine returns — BEFORE the minimum overlay
      // hold below — so duration_sec is true engine latency, not the UI floor.
      const durationSec = Math.round((Date.now() - resizeStartRef.current) / 100) / 10;
      const engine = getEngineInfo();
      track('Resize Completed', {
        factor: variables.scale,
        species: variables.species,
        provider: engine.resizeProvider,
        model_id: engine.resizeModel,
        is_subscriber: isPremium,
        edit_number: useAppStore.getState().totalEdits + 1,
        duration_sec: durationSec,
      });
      incrementProfile('lifetime_resizes', 1);
      setProfile({ last_resize_at: new Date().toISOString() });

      // Hold the overlay until it has been up at least MIN_RESIZE_OVERLAY_MS, so a
      // fast resize doesn't snap the game away the instant it appears. Then reveal.
      const remaining = Math.max(0, MIN_RESIZE_OVERLAY_MS - (Date.now() - resizeStartRef.current));
      revealTimerRef.current = setTimeout(() => {
        revealTimerRef.current = null;
        setEditedImage(url);
        // Reveal the resized result, then SETTLE INTO A COMPARISON instead of
        // dumping the user on the bare result with the handle jammed off-screen.
        // Start on the original, wipe across to the full resized fish (the payoff
        // beat), hold briefly so the size change registers against the otherwise
        // identical photo, then ease back to a centered split so both states stay
        // on screen and the handle rests mid-frame where it's clearly draggable.
        // Under "Reduce Motion", skip the sweep and just present the split.
        const restSplit = IMAGE_SIZE * REVEAL_REST_SPLIT;
        if (reduceMotionRef.current) {
          compareSlider.value = restSplit;
        } else {
          compareSlider.value = IMAGE_SIZE;
          compareSlider.value = withSequence(
            withTiming(0, { duration: 750, easing: Easing.inOut(Easing.ease) }), // wipe original away → full result
            withTiming(0, { duration: 400 }),                                    // hold on the result so it lands
            withTiming(restSplit, { duration: 450, easing: Easing.out(Easing.ease) }) // settle into the comparison
          );
        }
        incrementEdits();
        if (!isPremium) {
          decrementFreeEdits();
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setIsResizing(false);
      }, remaining);
    },
    onError: (error, variables) => {
      // Surface errors promptly (no min-hold) — a quick config error shouldn't sit
      // behind the game pretending to work.
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      // Bucket the failure to match the app's hardened error handling — this is the
      // metric to watch (paying users hitting a wall).
      const msg = error instanceof Error ? error.message : String(error);
      const errorType = /tim(e|ed)\s?out|connection/i.test(msg)
        ? 'timeout'
        : /busy|rate limit/i.test(msg)
        ? 'rate_limited'
        : /configured|api key|rejected the request|invalid|not included/i.test(msg)
        ? 'config_error'
        : /blocked by the model/i.test(msg)
        ? 'safety_block'
        : 'api_error';
      const engine = getEngineInfo();
      track('Resize Failed', {
        error_type: errorType,
        provider: engine.resizeProvider,
        model_id: engine.resizeModel,
        factor: variables.scale,
      });
      console.log('Fish resize error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIsResizing(false);
    },
  });

  // Animate 3x button nudge when photo is uploaded and scale is at original
  // Only show animation if user has never tapped a size button before
  useEffect(() => {
    // Always cancel any existing animations first to prevent conflicts
    cancelAnimation(button3xScale);
    cancelAnimation(button3xGlow);

    const shouldAnimate = selectedImage && !editedImage && fishScale === 1.0 && !noFishDetected && !isValidatingImage && !isResizing && !hasUsedSizeButtons;

    if (shouldAnimate) {
      // Start the nudge animation after a short delay
      const timeout = setTimeout(() => {
        // Pulsing scale animation
        button3xScale.value = withRepeat(
          withSequence(
            withTiming(1.12, { duration: 500, easing: Easing.inOut(Easing.ease) }),
            withTiming(1.0, { duration: 500, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        // Glow animation
        button3xGlow.value = withRepeat(
          withSequence(
            withTiming(0.8, { duration: 500, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.2, { duration: 500, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
      }, 1500); // Wait 1.5 seconds after photo upload before starting animation

      return () => {
        clearTimeout(timeout);
        cancelAnimation(button3xScale);
        cancelAnimation(button3xGlow);
      };
    } else {
      // Stop animation when scale changes or conditions no longer met
      button3xScale.value = withTiming(1, { duration: 200 });
      button3xGlow.value = withTiming(0, { duration: 200 });
    }
  }, [selectedImage, editedImage, fishScale, noFishDetected, isValidatingImage, isResizing, hasUsedSizeButtons]);

  // Nudge the swipe handle a few times once the comparison has settled, to signal
  // it's draggable. The handle now rests mid-frame (see the reveal in
  // resizeFishMutation.onSuccess), so this is a light "you can move me" wiggle
  // rather than the primary signifier — finite (not an infinite loop), and skipped
  // entirely under Reduce Motion.
  useEffect(() => {
    // Cancel any existing animation first
    cancelAnimation(swipeHandleBounce);

    if (editedImage) {
      // Reset interaction flag for new edited image
      hasInteractedWithSlider.value = false;

      const timeout = setTimeout(() => {
        if (reduceMotionRef.current) return; // respect Reduce Motion: no nudge
        swipeHandleBounce.value = withRepeat(
          withSequence(
            withTiming(0, { duration: 100 }), // Start at rest
            withTiming(20, { duration: 350, easing: Easing.out(Easing.ease) }), // Nudge right
            withTiming(5, { duration: 200, easing: Easing.inOut(Easing.ease) }), // Settle slightly
            withTiming(15, { duration: 150, easing: Easing.inOut(Easing.ease) }), // Nudge right again
            withTiming(0, { duration: 250, easing: Easing.out(Easing.ease) }), // Return to rest
            withTiming(0, { duration: 1500 }) // Pause before repeating
          ),
          3, // finite — was -1 (infinite), which fought Reduce Motion and never rested
          false
        );
      }, 1700); // start after the reveal sequence (~1600ms) settles into the split

      return () => {
        clearTimeout(timeout);
        cancelAnimation(swipeHandleBounce);
      };
    } else {
      swipeHandleBounce.value = withTiming(0, { duration: 200 });
      hasInteractedWithSlider.value = false;
    }
  }, [editedImage]);

  const handleResize = () => {
    if (!selectedImage) return;
    if (isResizing) return; // already running (e.g. double-tap during the min-display hold)
    if (!isPremium && freeEditsRemaining <= 0) {
      // This shouldn't happen since button changes, but just in case
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.push('/(tabs)/premium');
      return;
    }
    // At original size the primary button isn't a dead end: treat the tap as
    // "make it bigger" and jump to 2x, so a first-timer always gets a result.
    let scale = fishScale;
    if (scale === 1.0) {
      scale = 2.0;
      setFishScale(2.0);
      setSliderTagline(getSliderTagline(2.0));
      if (!hasUsedSizeButtons) setHasUsedSizeButtons(true);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    // New resize → its own gallery entry.
    currentPhotoIdRef.current = null;
    resizeStartRef.current = Date.now();
    setIsResizing(true);
    setGameKey((k) => k + 1); // Increment key to force game remount
    const resizeEngine = getEngineInfo();
    timeEvent('Resize Completed');
    track('Resize Started', {
      factor: scale,
      species: detectedSpecies,
      provider: resizeEngine.resizeProvider,
      model_id: resizeEngine.resizeModel,
      is_subscriber: isPremium,
      free_resizes_remaining: freeEditsRemaining,
    });
    resizeFishMutation.mutate({ imageUri: selectedImage, scale, species: detectedSpecies });
  };

  const handleSliderChange = useCallback((value: number) => {
    lastSnappedValue.current = value;
    setFishScale(value);
    setSliderTagline(getSliderTagline(value));
    track('Resize Adjusted', { factor: value, method: 'preset' });
    Haptics.selectionAsync();
    // Mark that user has used size buttons (stops animation permanently)
    if (!hasUsedSizeButtons) {
      setHasUsedSizeButtons(true);
    }
  }, [hasUsedSizeButtons, setHasUsedSizeButtons]);

  // Silent version for gesture handler (no haptics, called via runOnJS)
  const updateSliderValue = useCallback((value: number) => {
    setFishScale(value);
    setSliderTagline(getSliderTagline(value));
  }, []);

  // Preset values that the slider snaps to
  const SNAP_VALUES = [0.5, 0.75, 1.0, 2.0, 3.0];

  // Find the closest snap value to a given scale
  const snapToPreset = useCallback((scale: number): number => {
    let closest = SNAP_VALUES[0];
    let minDiff = Math.abs(scale - closest);

    for (const value of SNAP_VALUES) {
      const diff = Math.abs(scale - value);
      if (diff < minDiff) {
        minDiff = diff;
        closest = value;
      }
    }
    return closest;
  }, []);

  // Handler for gesture that takes x position and calculates scale
  const handleGestureSliderUpdate = useCallback((x: number) => {
    const sliderWidth = SCREEN_WIDTH - 60;
    const percentage = Math.max(0, Math.min(100, (x / sliderWidth) * 100));
    const rawScale = sliderPercentToScale(percentage);
    const snappedScale = snapToPreset(rawScale);

    // Only update if snapped to a different value
    if (snappedScale !== lastSnappedValue.current) {
      lastSnappedValue.current = snappedScale;
      setFishScale(snappedScale);
      setSliderTagline(getSliderTagline(snappedScale));
      track('Resize Adjusted', { factor: snappedScale, method: 'slider' });
      Haptics.selectionAsync();
      // Mark that user has used size buttons (stops animation permanently)
      if (!hasUsedSizeButtons) {
        setHasUsedSizeButtons(true);
      }
    }
  }, [snapToPreset, hasUsedSizeButtons, setHasUsedSizeButtons]);

  // Memoized pan gesture for the fish size slider to prevent gesture conflicts
  const sliderPanGesture = useMemo(() =>
    Gesture.Pan()
      .onStart(() => {
        'worklet';
        sliderThumbScale.value = withSpring(1.4, { damping: 15, stiffness: 300 });
        runOnJS(Haptics.selectionAsync)();
      })
      .onUpdate((e) => {
        'worklet';
        runOnJS(handleGestureSliderUpdate)(e.x);
      })
      .onEnd(() => {
        'worklet';
        sliderThumbScale.value = withSpring(1, { damping: 15, stiffness: 300 });
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      })
      .minDistance(5) // Require slight movement before activating
      .activeOffsetX([-10, 10]) // Only activate for horizontal drags
  , [handleGestureSliderUpdate, sliderThumbScale]);

  // Persist the current resize into "My Catches" exactly once. Copies the cache-
  // directory images into the app's document directory first (cache files get
  // purged by iOS on update / under storage pressure, which would blank the
  // gallery), and dedupes so save + share don't add two entries for one resize.
  const ensureSavedToGallery = async (opts: { unlocked: boolean; share: boolean }) => {
    const existingId = currentPhotoIdRef.current;
    if (existingId) {
      const existing = useAppStore.getState().photos.find((p) => p.id === existingId);
      updatePhoto(existingId, {
        isUnlocked: opts.unlocked || existing?.isUnlocked,
        shareCount: (existing?.shareCount ?? 0) + (opts.share ? 1 : 0),
      });
      return;
    }
    const [persistedOriginal, persistedEdited] = await Promise.all([
      persistImage(selectedImage, 'orig'),
      persistImage(editedImage, 'edit'),
    ]);
    const id = Date.now().toString();
    const newPhoto: FishPhoto = {
      id,
      originalUri: persistedOriginal ?? selectedImage!,
      editedUri: persistedEdited ?? editedImage,
      fishScale,
      createdAt: Date.now(),
      shareCount: opts.share ? 1 : 0,
      title: getRandomTitle(),
      isUnlocked: opts.unlocked,
    };
    addPhoto(newPhoto);
    currentPhotoIdRef.current = id;
  };

  const handleShare = async () => {
    if (!editedImage || !shareableImageRef.current) return;

    // If not premium and this image hasn't been unlocked, show watermark confirmation popup
    if (!isPremium && !currentImageUnlocked) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShowWatermarkConfirm(true);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSharing(true);

    try {
      // Capture the image (watermark-free for premium or unlocked images)
      const imageUri = await shareableImageRef.current.capture();

      // Persist into "My Catches" (deduped, copied out of cache)
      await ensureSavedToGallery({ unlocked: true, share: true });
      incrementShares();
      track('Photo Shared', { has_watermark: false, source: 'home', factor: fishScale, species: detectedSpecies });
      incrementProfile('lifetime_shares', 1);

      // Share the image
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(imageUri, {
          mimeType: 'image/png',
        });
      }

      // Show feedback prompt 5 seconds after successful share (for premium users)
      setTimeout(() => {
        if (shouldShowReviewPrompt()) {
          setShowFeedbackModal(true);
        }
      }, 5000);
    } catch (error) {
      console.log('Share error:', error);
    } finally {
      setIsSharing(false);
    }
  };

  // Handle "Yes" on watermark confirmation - show paywall
  const handleRemoveWatermark = () => {
    setShowWatermarkConfirm(false);
    setPendingAction('share');
    setShowPaywall(true);
  };

  // Handle "No" on watermark confirmation - share with watermark
  const handleShareWithWatermark = async () => {
    setShowWatermarkConfirm(false);
    if (!editedImage || !shareableImageRef.current) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSharing(true);

    try {
      // Capture the image (with watermark for non-premium users)
      const imageUri = await shareableImageRef.current.capture();

      await ensureSavedToGallery({ unlocked: false, share: true });
      incrementShares();
      track('Photo Shared', { has_watermark: true, source: 'home', factor: fishScale, species: detectedSpecies });
      incrementProfile('lifetime_shares', 1);

      // Share the image
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(imageUri, {
          mimeType: 'image/png',
        });
      }
    } catch (error) {
      console.log('Share error:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleSaveToPhone = async () => {
    if (!editedImage || !shareableImageRef.current) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      // Request write-only ("add to library") permission — the app only saves,
      // never reads the library. This shows iOS's lighter "Add to Photos" prompt
      // and needs only NSPhotoLibraryAddUsageDescription (added in app.json).
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      track('Photo Permission Result', { granted: status === 'granted', status });
      if (status !== 'granted') {
        console.log('Media library permission denied');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setIsSaving(false);
        return;
      }

      // Capture the image using ShareableImage (includes watermark for non-premium)
      const capturedUri = await shareableImageRef.current.capture();

      // Save to camera roll
      await MediaLibrary.saveToLibraryAsync(capturedUri);

      // Save to app gallery too (deduped, copied out of cache)
      await ensureSavedToGallery({ unlocked: isPremium || currentImageUnlocked, share: false });

      track('Photo Saved', {
        factor: fishScale,
        species: detectedSpecies,
        has_watermark: !(isPremium || currentImageUnlocked),
        destination: 'camera_roll',
        source: 'home',
      });

      setSaveSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Show feedback prompt 5 seconds after successful save
      setTimeout(() => {
        if (shouldShowReviewPrompt()) {
          setShowFeedbackModal(true);
        }
      }, 5000);

      // Reset success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.log('Save error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle successful paywall completion
  const handlePaywallSuccess = async () => {
    // A successful purchase from the watermark-removal flow unlocks this image,
    // so the capture below (and any future share/save) is watermark-free even
    // for a single ($0.99) unlock that doesn't grant full premium.
    setCurrentImageUnlocked(true);

    if (pendingAction === 'share') {
      // Now share without watermark
      setIsSharing(true);
      try {
        // Let the hidden ShareableImage re-render with the unlocked state
        // before we capture it, otherwise the watermark would still be baked in.
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (shareableImageRef.current) {
          const imageUri = await shareableImageRef.current.capture();
          await ensureSavedToGallery({ unlocked: true, share: true });
          incrementShares();
          track('Photo Shared', { has_watermark: false, source: 'home', factor: fishScale, species: detectedSpecies });
          incrementProfile('lifetime_shares', 1);

          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(imageUri, { mimeType: 'image/png' });
          }

          // Show feedback prompt 5 seconds after successful share (after payment)
          setTimeout(() => {
            if (shouldShowReviewPrompt()) {
              setShowFeedbackModal(true);
            }
          }, 5000);
        }
      } catch (error) {
        console.log('Share error:', error);
      } finally {
        setIsSharing(false);
      }
    }
    setPendingAction(null);
  };

  const handleReset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setIsResizing(false);
    setSelectedImage(null);
    setEditedImage(null);
    setFishScale(1.0);
    setTagline(getRandomTagline('home'));
    setNoFishDetected(false);
    setDetectedSpecies(undefined);
    setCurrentImageUnlocked(false);
    currentPhotoIdRef.current = null;
  };

  const getScaleLabel = () => {
    const percent = Math.round(fishScale * 100);
    if (percent === 100) return 'Original';
    if (percent < 100) return `${percent}% (Shrunk)`;
    return `${percent}% (Enlarged)`;
  };

  return (
    <View className="flex-1 bg-[#0a1628]">
      <LinearGradient
        colors={['#0a1628', '#0f2744', '#0a1628']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1" edges={['top']}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Section: Header + Image */}
          <View>
            {/* Header */}
            <View className="pt-2 pb-3">
              <View className="flex-row items-center justify-center">
                <Animated.View style={fishAnimatedStyle}>
                  <Fish size={28} color="#22d3ee" strokeWidth={2} />
                </Animated.View>
                <Text className="text-2xl font-bold text-white ml-2 tracking-tight">
                  Size Matters
                </Text>
              </View>
              <Text className="text-cyan-400 text-center mt-1 text-sm font-medium italic">
                "{tagline}"
              </Text>
            </View>

            {/* Image Display Area */}
            <View
              className="rounded-2xl overflow-hidden border-2 border-cyan-900/50 mt-2"
              style={{
                height: IMAGE_SIZE,
                backgroundColor: '#0f2744'
              }}
            >
              {!selectedImage ? (
                <Pressable
                  onPress={pickImage}
                  className="flex-1 items-center justify-center active:opacity-80"
                >
                  <Animated.View
                    style={[
                      uploadIconAnimatedStyle,
                      {
                        shadowColor: '#22d3ee',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.7,
                        shadowRadius: 22,
                      },
                    ]}
                    className="w-28 h-28 rounded-full bg-cyan-800/50 items-center justify-center mb-4 border-2 border-cyan-400/60"
                  >
                    <Upload size={48} color="#22d3ee" />
                  </Animated.View>
                  <Text className="text-white text-3xl font-bold">Upload Your Catch</Text>
                  <Text className="text-cyan-300 text-lg mt-2 text-center px-8">
                    Tap here to select a photo
                  </Text>
                </Pressable>
              ) : editedImage ? (
                // Before/After Comparison View
                <GestureDetector gesture={panGesture}>
                  <View style={{ flex: 1 }}>
                    {/* After image (edited) - full background */}
                    <Image
                      source={{ uri: editedImage }}
                      style={{ width: IMAGE_SIZE, height: IMAGE_SIZE, position: 'absolute' }}
                      contentFit="cover"
                    />

                    {/* Watermark overlay for non-premium users - scattered diagonal pattern */}
                    {!(isPremium || currentImageUnlocked) && (
                      <View style={{ position: 'absolute', width: IMAGE_SIZE, height: IMAGE_SIZE, overflow: 'hidden' }} pointerEvents="none">
                        {/* Scattered diagonal watermarks - matching ShareableImage pattern */}
                        {[0, 1, 2, 3].map((row) =>
                          [0, 1, 2].map((col) => {
                            const spacingY = IMAGE_SIZE / 3;
                            const spacingX = IMAGE_SIZE / 3;
                            const offsetX = row % 2 === 0 ? 0 : spacingX * 0.5;
                            const x = col * spacingX + offsetX - 20;
                            const y = row * spacingY + 30;
                            return (
                              <View
                                key={`${row}-${col}`}
                                style={{
                                  position: 'absolute',
                                  left: x,
                                  top: y,
                                  transform: [{ rotate: '-30deg' }],
                                }}
                              >
                                <Text style={{
                                  color: 'rgba(255, 255, 255, 0.35)',
                                  fontSize: 18,
                                  fontWeight: 'bold',
                                  textShadowColor: 'rgba(0, 0, 0, 0.5)',
                                  textShadowOffset: { width: 1, height: 1 },
                                  textShadowRadius: 2,
                                }}>
                                  sizematters.app
                                </Text>
                              </View>
                            );
                          })
                        )}
                      </View>
                    )}

                    {/* Before image (original) - clipped */}
                    <Animated.View
                      style={[
                        {
                          position: 'absolute',
                          height: IMAGE_SIZE,
                          overflow: 'hidden',
                        },
                        compareClipStyle
                      ]}
                    >
                      <Image
                        source={{ uri: selectedImage }}
                        style={{ width: IMAGE_SIZE, height: IMAGE_SIZE }}
                        contentFit="cover"
                      />
                    </Animated.View>

                    {/* Slider handle */}
                    <Animated.View
                      style={[
                        {
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          width: 40,
                          alignItems: 'center',
                          justifyContent: 'center',
                        },
                        sliderHandleStyle
                      ]}
                    >
                      {/* Vertical line */}
                      <View
                        style={{
                          position: 'absolute',
                          width: 3,
                          height: '100%',
                          backgroundColor: 'white',
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.5,
                          shadowRadius: 4,
                        }}
                      />
                      {/* Handle circle */}
                      <View className="w-10 h-10 rounded-full bg-white items-center justify-center shadow-lg">
                        <ArrowLeftRight size={20} color="#0a1628" />
                      </View>
                    </Animated.View>

                    {/* Hint text */}
                    <View className="absolute bottom-3 left-0 right-0 items-center">
                      <View className="bg-black/50 px-3 py-1 rounded-full">
                        <Text className="text-white/80 text-xs">Swipe to compare</Text>
                      </View>
                    </View>

                    {/* Reset button */}
                    <Pressable
                      onPress={handleReset}
                      className="absolute bottom-3 left-3 w-10 h-10 rounded-full bg-black/50 items-center justify-center active:scale-95"
                    >
                      <RotateCcw size={20} color="white" />
                    </Pressable>
                  </View>
                </GestureDetector>
              ) : (
                // Just the original image (no edit yet)
                <View className="flex-1">
                  <Image
                    source={{ uri: selectedImage }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />

                  {/* Validating image overlay */}
                  {isValidatingImage && (
                    <View
                      className="absolute inset-0 items-center justify-center"
                      style={{ backgroundColor: 'rgba(10, 22, 40, 0.85)' }}
                    >
                      <ActivityIndicator size="large" color="#22d3ee" />
                      <Text className="text-cyan-400 text-lg font-semibold mt-3 text-center px-6">
                        Making sure it's a legit fish photo 🧐
                      </Text>
                    </View>
                  )}

                  {/* No fish detected warning overlay */}
                  {noFishDetected && !isValidatingImage && !isResizing && (
                    <View
                      className="absolute inset-0 items-center justify-center px-6"
                      style={{ backgroundColor: 'rgba(10, 22, 40, 0.92)' }}
                    >
                      <View className="w-20 h-20 rounded-full bg-amber-500/20 items-center justify-center mb-4">
                        <ImageOff size={40} color="#f59e0b" />
                      </View>
                      <Text className="text-amber-400 text-xl font-bold text-center mb-2">
                        No Fish Detected
                      </Text>
                      <Text className="text-slate-300 text-center text-base mb-6 leading-relaxed">
                        We couldn't find a fish in this photo.{'\n'}
                        For best results, use a photo of{'\n'}someone holding their catch!
                      </Text>
                      <View className="flex-row gap-3">
                        <Pressable
                          onPress={() => {
                            track('No Fish Prompt Result', { action: 'try_another' });
                            pickImage();
                          }}
                          className="bg-cyan-600 rounded-xl px-6 py-3 active:scale-95"
                        >
                          <View className="flex-row items-center">
                            <Upload size={18} color="white" />
                            <Text className="text-white font-bold ml-2">Try Another</Text>
                          </View>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            track('No Fish Prompt Result', { action: 'use_anyway' });
                            setNoFishDetected(false);
                          }}
                          className="bg-slate-700 rounded-xl px-6 py-3 active:scale-95"
                        >
                          <Text className="text-slate-300 font-bold">Use Anyway</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {isResizing && (
                    <View
                      className="absolute inset-0 items-center justify-center px-2"
                      style={{ backgroundColor: 'rgba(10, 22, 40, 0.96)' }}
                    >
                      <Text className="text-cyan-400 text-xl font-bold">
                        Resizing your fish…
                      </Text>
                      <Text className="text-slate-400 text-xs mb-3">
                        usually about 10–15 seconds
                      </Text>
                      {/* Labor-illusion status + progress bar above the game: names the
                          work and shows forward motion so the wait reads as valuable,
                          not broken. */}
                      <ResizeStatus species={detectedSpecies} />
                      <FishTapGame key={gameKey} />
                    </View>
                  )}
                  {/* Reset button */}
                  <Pressable
                    onPress={handleReset}
                    className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/50 items-center justify-center active:scale-95"
                  >
                    <RotateCcw size={20} color="white" />
                  </Pressable>
                </View>
              )}
            </View>

            {/* Original Size Tagline - below image */}
            <Text className="text-2xl font-semibold italic text-center mt-3 text-amber-400">
              "{selectedImage ? sliderTagline : noPhotoTagline}"
            </Text>

            {/* Action Buttons - between image and slider */}
            {selectedImage && (
              <View className="mt-3">
                {/* Main Action Button - Changes based on state */}
                {editedImage ? (
                  // After resize is complete - Share is the primary action
                  <GlowingButton
                    onPress={handleShare}
                    disabled={isSharing}
                    isLoading={isSharing}
                    loadingLabel="Preparing..."
                    label={isPremium || currentImageUnlocked ? "Share Photo" : "Share / Remove Watermark"}
                    icon={<Share2 size={20} color="white" />}
                    variant="share"
                    enablePulse={!isSharing}
                    pulseDelay={500}
                  />
                ) : (
                  // Before resize - show "Make It Happen" button or upgrade prompt
                  !isPremium && freeEditsRemaining <= 0 ? (
                    // Out of free resizes - show upgrade button
                    <View>
                      <Animated.View style={upgradeButtonAnimatedStyle}>
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            router.push('/(tabs)/premium');
                          }}
                          className="rounded-xl overflow-hidden active:scale-[0.98]"
                        >
                          <LinearGradient
                            colors={['#b45309', '#d97706', '#f59e0b']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={{ paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12 }}
                          >
                            <View className="flex-row items-center justify-center">
                              <Lock size={20} color="white" />
                              <Text className="text-white text-lg font-bold ml-2">
                                Get Unlimited Resizes
                              </Text>
                            </View>
                          </LinearGradient>
                        </Pressable>
                      </Animated.View>
                      <View className="mt-2">
                        <Text className="text-center text-red-400 text-sm">
                          You've used your free resize
                        </Text>
                      </View>
                    </View>
                  ) : (
                    // Has free resizes - show normal button
                    <Pressable
                      onPress={handleResize}
                      disabled={isResizing}
                      className="rounded-xl overflow-hidden active:scale-[0.98]"
                    >
                      <LinearGradient
                        colors={['#0891b2', '#22d3ee', '#06b6d4']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12 }}
                      >
                        <View className="flex-row items-center justify-center">
                          <Wand2 size={20} color="white" />
                          <Text className="text-white text-lg font-bold ml-2">
                            {isResizing ? 'Resizing…' : 'Make It Happen'}
                          </Text>
                        </View>
                      </LinearGradient>
                    </Pressable>
                  )
                )}

                {/* Free edits counter - only show when not already edited */}
                {!isPremium && !editedImage && freeEditsRemaining > 0 && (
                  <View className="mt-1.5">
                    {fishScale === 1.0 ? (
                      <Text className="text-center text-slate-400 text-xs">
                        Slide to pick a size — or just tap to go 2×
                      </Text>
                    ) : freeEditsRemaining > 1 ? (
                      <Text className="text-center text-slate-400 text-xs">
                        {`${freeEditsRemaining} free resizes remaining`}
                      </Text>
                    ) : (
                      /* Last free resize indicator - simple View to avoid touch conflicts */
                      <View className="flex-row items-center justify-center mt-1">
                        <AlertCircle size={16} color="#f59e0b" />
                        <Text className="text-amber-400 text-sm font-medium ml-1.5">
                          Last free resize!
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Secondary buttons: New Catch and Save */}
                {editedImage && (
                  <View className="flex-row gap-2 mt-2">
                    {/* Upload New Catch - Secondary */}
                    <Pressable
                      onPress={pickImage}
                      className="flex-1 rounded-xl py-3 px-4 active:scale-[0.98] border bg-slate-700/50 border-cyan-600/50"
                    >
                      <View className="flex-row items-center justify-center">
                        <Upload size={18} color="#22d3ee" />
                        <Text className="text-cyan-400 text-base font-bold ml-2">
                          New Catch
                        </Text>
                      </View>
                    </Pressable>

                    {/* Save to Phone Button - Secondary */}
                    <Pressable
                      onPress={handleSaveToPhone}
                      disabled={isSaving}
                      className={cn(
                        'flex-1 rounded-xl py-3 px-4 active:scale-[0.98] border bg-slate-700/50 border-slate-600',
                        isSaving && 'opacity-70'
                      )}
                    >
                      <View className="flex-row items-center justify-center">
                        {isSaving ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <Download size={18} color="#94a3b8" />
                        )}
                        <Text className="text-slate-300 text-base font-bold ml-2">
                          {isSaving ? 'Saving...' : 'Save'}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                )}

                {/* Save success message */}
                {saveSuccess && (
                  <View className="bg-green-900/40 rounded-lg p-1.5 mt-1.5">
                    <Text className="text-green-400 text-center text-xs font-medium">
                      Saved to your photo library!
                    </Text>
                  </View>
                )}

                {/* Error message — tailored to the actual failure so a network blip
                    or a busy server isn't misreported as a bad photo. */}
                {resizeFishMutation.isError && !isResizing && (() => {
                  const msg = resizeFishMutation.error instanceof Error ? resizeFishMutation.error.message : '';
                  const isTimeout = /tim(e|ed)\s?out|connection/i.test(msg);
                  const isBusy = /busy|rate limit/i.test(msg);
                  const isConfig = /configured|api key|rejected the request|invalid|not included/i.test(msg);
                  const headline = isTimeout
                    ? 'Connection problem'
                    : isBusy
                    ? 'Servers are busy'
                    : isConfig
                    ? 'Resize unavailable right now'
                    : "Couldn't resize the fish";
                  const detail = isTimeout
                    ? 'That took too long — check your internet connection and try again.'
                    : isBusy
                    ? 'Lots of anglers resizing right now. Give it a few seconds and try again.'
                    : isConfig
                    ? 'Resizing is temporarily unavailable. Please try again later.'
                    : 'The AI had trouble with this one. Try again, or use a different photo.';
                  return (
                    <View className="bg-red-900/30 rounded-xl p-3 mt-2">
                      <View className="flex-row items-center justify-center mb-2">
                        <AlertCircle size={16} color="#ef4444" />
                        <Text className="text-red-400 text-sm font-semibold ml-2">
                          {headline}
                        </Text>
                      </View>
                      <Text className="text-slate-400 text-center text-xs mb-2">
                        {detail}
                      </Text>
                      {__DEV__ && !!msg && (
                        <Text className="text-red-300/70 text-center text-[10px] mb-2">
                          {msg}
                        </Text>
                      )}
                      <View className="flex-row gap-2">
                        <Pressable
                          onPress={handleResize}
                          className="flex-1 bg-cyan-600/30 rounded-lg py-2 active:scale-[0.98]"
                        >
                          <Text className="text-cyan-300 text-center text-sm font-medium">
                            Try Again
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={pickImage}
                          className="flex-1 bg-slate-700/50 rounded-lg py-2 active:scale-[0.98]"
                        >
                          <Text className="text-cyan-400 text-center text-sm font-medium">
                            New Photo
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })()}
              </View>
            )}
          </View>

          {/* Bottom Section: Slider */}
          <View className={cn("mt-4", !selectedImage && "opacity-40")}>
            {/* Slider Section */}
            <View pointerEvents={selectedImage ? 'auto' : 'none'}>
              <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center">
                <Ruler size={20} color="#22d3ee" />
                <Text className="text-white font-semibold ml-2 text-xl">Fish Size</Text>
              </View>
              <View className="flex-row items-center">
                {fishScale < 1 ? (
                  <TrendingDown size={14} color="#ef4444" />
                ) : fishScale === 1 ? (
                  <Minus size={14} color="#64748b" />
                ) : (
                  <TrendingUp size={14} color="#22c55e" />
                )}
                <Text className={cn(
                  "font-medium ml-1 text-base",
                  fishScale < 1 ? "text-red-400" : fishScale === 1 ? "text-slate-400" : "text-green-400"
                )}>
                  {getScaleLabel()}
                </Text>
              </View>
            </View>

            <View className="bg-slate-800/50 rounded-xl p-4">
              {/* Custom Draggable Slider */}
              <View className="mb-3">
                {/* Labels above slider */}
                <View className="flex-row justify-between mb-3 px-1">
                  <Text className="text-slate-500 text-sm font-medium">Shrink</Text>
                  <Text className="text-slate-500 text-sm font-medium">Original</Text>
                  <Text className="text-slate-500 text-sm font-medium">Enlarge</Text>
                </View>

                {/* Slider track with pan gesture - requires finger directly on track */}
                <GestureDetector gesture={sliderPanGesture}>
                  <Pressable
                    onPress={(e) => {
                      const { locationX } = e.nativeEvent;
                      const sliderWidth = SCREEN_WIDTH - 60;
                      const percentage = Math.max(0, Math.min(100, (locationX / sliderWidth) * 100));
                      const rawScale = sliderPercentToScale(percentage);
                      const snappedScale = snapToPreset(rawScale);
                      handleSliderChange(snappedScale);
                    }}
                  >
                    <View className="h-3 bg-slate-700 rounded-full overflow-hidden flex-row">
                      {/* Filled portion - always cyan */}
                      <View
                        style={{
                          width: `${scaleToSliderPercent(fishScale)}%`,
                          backgroundColor: '#22d3ee'
                        }}
                        className="h-full rounded-full"
                      />
                    </View>

                    {/* Slider thumb - animated scale */}
                    <Animated.View
                      style={[
                        {
                          position: 'absolute',
                          left: `${scaleToSliderPercent(fishScale)}%`,
                          top: -8,
                          marginLeft: -14,
                        },
                        sliderThumbAnimatedStyle
                      ]}
                    >
                      <View className="w-7 h-7 rounded-full items-center justify-center shadow-lg border-2 bg-cyan-500 border-cyan-300">
                        <Fish size={14} color="white" />
                      </View>
                    </Animated.View>
                  </Pressable>
                </GestureDetector>
              </View>

              {/* Preset buttons - single row */}
              <View className="flex-row items-center justify-center gap-3 mt-2">
                {/* Shrink buttons */}
                {[0.5, 0.75].map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => handleSliderChange(value)}
                    className={cn(
                      'px-5 py-3 rounded-xl items-center',
                      fishScale === value ? 'bg-red-500' : 'bg-red-900/40'
                    )}
                  >
                    <Text
                      className={cn(
                        'text-lg font-bold',
                        fishScale === value ? 'text-white' : 'text-red-400'
                      )}
                    >
                      {`${Math.round(value * 100)}%`}
                    </Text>
                  </Pressable>
                ))}

                {/* 1x Original button */}
                <Pressable
                  onPress={() => handleSliderChange(1.0)}
                  className={cn(
                    'px-6 py-3 rounded-xl items-center',
                    fishScale === 1.0 ? 'bg-cyan-500' : 'bg-cyan-900/40'
                  )}
                >
                  <Text
                    className={cn(
                      'text-lg font-bold',
                      fishScale === 1.0 ? 'text-white' : 'text-cyan-400'
                    )}
                  >
                    1x
                  </Text>
                </Pressable>

                {/* Enlarge buttons */}
                <Pressable
                  onPress={() => handleSliderChange(2.0)}
                  className={cn(
                    'px-5 py-3 rounded-xl items-center',
                    fishScale === 2.0 ? 'bg-green-500' : 'bg-green-900/40'
                  )}
                >
                  <Text
                    className={cn(
                      'text-lg font-bold',
                      fishScale === 2.0 ? 'text-white' : 'text-green-400'
                    )}
                  >
                    2x
                  </Text>
                </Pressable>

                {/* 3x button with nudge animation */}
                <Animated.View style={button3xAnimatedStyle}>
                  <Pressable
                    onPress={() => handleSliderChange(3.0)}
                    className={cn(
                      'px-5 py-3 rounded-xl items-center',
                      fishScale === 3.0 ? 'bg-green-500' : 'bg-green-900/40'
                    )}
                  >
                    <Text
                      className={cn(
                        'text-lg font-bold',
                        fishScale === 3.0 ? 'text-white' : 'text-green-400'
                      )}
                    >
                      3x
                    </Text>
                  </Pressable>
                </Animated.View>
              </View>
            </View>
            </View>
          </View>
          {/* Hint when no image selected - outside dimmed container */}
          {!selectedImage && (
            <Text className="text-center text-slate-400 text-sm mt-2 italic">
              Upload a photo first to adjust fish size
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Hidden shareable image for capturing with watermark */}
      {editedImage && (
        <View style={{ position: 'absolute', left: -9999, top: -9999 }}>
          <ShareableImage
            ref={shareableImageRef}
            imageUri={editedImage}
            isPremium={isPremium || currentImageUnlocked}
          />
        </View>
      )}

      {/* Paywall Modal */}
      <PaywallModal
        visible={showPaywall}
        placement="watermark_removal_home"
        onClose={() => {
          setShowPaywall(false);
          setPendingAction(null);
        }}
        onSuccess={handlePaywallSuccess}
      />

      {/* Watermark Confirmation Modal */}
      <RNModal
        visible={showWatermarkConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWatermarkConfirm(false)}
      >
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="bg-[#0B1623] rounded-2xl p-6 w-full max-w-sm border border-slate-700">
            {/* Close button */}
            <Pressable
              onPress={() => setShowWatermarkConfirm(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 items-center justify-center"
            >
              <X size={16} color="white" />
            </Pressable>

            {/* Icon */}
            <View className="items-center mb-4">
              <View className="w-14 h-14 rounded-full bg-amber-500/20 items-center justify-center">
                <Fish size={28} color="#f59e0b" />
              </View>
            </View>

            {/* Title */}
            <Text className="text-white text-xl font-bold text-center mb-6">
              Remove watermark before sharing?
            </Text>

            {/* Buttons */}
            <View className="gap-3">
              {/* Yes - highlighted */}
              <Pressable
                onPress={handleRemoveWatermark}
                className="rounded-xl overflow-hidden active:scale-[0.98]"
              >
                <LinearGradient
                  colors={['#f59e0b', '#d97706']}
                  style={{ paddingVertical: 14, borderRadius: 12 }}
                >
                  <Text className="text-white text-lg font-bold text-center">
                    Yes, remove it
                  </Text>
                </LinearGradient>
              </Pressable>

              {/* No - dimmed */}
              <Pressable
                onPress={handleShareWithWatermark}
                className="rounded-xl py-3 active:scale-[0.98]"
              >
                <Text className="text-slate-500 text-base font-medium text-center">
                  Share photo with watermark
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </RNModal>

      {/* Feedback Modal */}
      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
      />
    </View>
  );
}
