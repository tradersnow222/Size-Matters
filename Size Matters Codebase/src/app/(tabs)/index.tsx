import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Modal as RNModal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
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
import { GlowingButton } from '@/components/GlowingButton';
import { PaywallModal } from '@/components/PaywallModal';
import { FeedbackModal } from '@/components/FeedbackModal';
import { detectFishInImage, resizeFish } from '@/lib/fishEditor';
import * as MediaLibrary from 'expo-media-library';
import { useAppStore, FishPhoto } from '@/lib/store';
import { getRandomTagline, getSliderTagline, getRandomTitle } from '@/lib/taglines';
import { cn } from '@/lib/cn';
import * as Sharing from 'expo-sharing';
import { ShareableImage, ShareableImageRef } from '@/components/ShareableImage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_SIZE = SCREEN_WIDTH - 48;

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
  const [showingBefore, setShowingBefore] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [gameKey, setGameKey] = useState(0); // Key to force game remount
  const [showPaywall, setShowPaywall] = useState(false);
  const [currentPhotoId, setCurrentPhotoId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'save' | 'share' | null>(null);
  const [showWatermarkConfirm, setShowWatermarkConfirm] = useState(false);
  const [noFishDetected, setNoFishDetected] = useState(false);
  const [isValidatingImage, setIsValidatingImage] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const shareableImageRef = useRef<ShareableImageRef>(null);
  const router = useRouter();

  // Track previous snapped value to detect changes during gesture
  const lastSnappedValue = useRef(1.0);

  const isPremium = useAppStore((s) => s.isPremium);
  const freeEditsRemaining = useAppStore((s) => s.freeEditsRemaining);
  const addPhoto = useAppStore((s) => s.addPhoto);
  const incrementEdits = useAppStore((s) => s.incrementEdits);
  const decrementFreeEdits = useAppStore((s) => s.decrementFreeEdits);
  const incrementShares = useAppStore((s) => s.incrementShares);
  const unlockPhoto = useAppStore((s) => s.unlockPhoto);
  const totalEdits = useAppStore((s) => s.totalEdits);
  const shouldShowReviewPrompt = useAppStore((s) => s.shouldShowReviewPrompt);
  const setLastFeedbackPromptTime = useAppStore((s) => s.setLastFeedbackPromptTime);
  const hasUsedSizeButtons = useAppStore((s) => s.hasUsedSizeButtons);
  const setHasUsedSizeButtons = useAppStore((s) => s.setHasUsedSizeButtons);

  // Animations
  const fishBounce = useSharedValue(0);
  const buttonScale = useSharedValue(1);
  const sliderGlow = useSharedValue(0);
  const compareSlider = useSharedValue(IMAGE_SIZE); // Start showing edited (full width)
  const sliderThumbScale = useSharedValue(1); // For thumb grow animation when dragging
  const uploadGlow = useSharedValue(0); // For upload icon pulsing glow
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
      // Snap to nearest edge or stay in middle
      const current = compareSlider.value;
      if (current < IMAGE_SIZE * 0.2) {
        compareSlider.value = withSpring(0);
        runOnJS(setShowingBefore)(true);
      } else if (current > IMAGE_SIZE * 0.8) {
        compareSlider.value = withSpring(IMAGE_SIZE);
        runOnJS(setShowingBefore)(false);
      }
      runOnJS(triggerHaptic)();
    }), [triggerHaptic, startSliderPosition, compareSlider, hasInteractedWithSlider, swipeHandleBounce]);

  const compareClipStyle = useAnimatedStyle(() => ({
    width: compareSlider.value,
  }));

  const sliderHandleStyle = useAnimatedStyle(() => ({
    // Combine both transforms: position from compareSlider + bounce animation
    transform: [
      { translateX: compareSlider.value - 20 + swipeHandleBounce.value }
    ],
  }));

  const sliderThumbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sliderThumbScale.value }],
  }));

  useEffect(() => {
    useAppStore.getState().loadFromStorage();
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

    // Upload icon pulsing glow animation
    uploadGlow.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
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

  const uploadIconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: uploadScale.value }],
    shadowColor: '#22d3ee',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: uploadGlow.value,
    shadowRadius: 25 + uploadGlow.value * 20,
  }));

  const button3xAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: button3xScale.value }],
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: button3xGlow.value,
    shadowRadius: 8 + button3xGlow.value * 12,
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
    console.log('[HomeScreen] Opening image picker...');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      aspect: [4, 3],
    });

    if (!result.canceled) {
      const imageUri = result.assets[0].uri;
      console.log('[HomeScreen] Image selected, setting state...');
      setSelectedImage(imageUri);
      setEditedImage(null);
      setFishScale(1.0);
      setTagline(getRandomTagline('home'));
      setNoFishDetected(false);

      // Validate image contains a fish
      console.log('[HomeScreen] Starting fish validation...');
      setIsValidatingImage(true);
      try {
        const detection = await detectFishInImage(imageUri);
        console.log('[HomeScreen] Fish validation complete:', detection);
        if (!detection.hasFish && detection.confidence !== 'low') {
          setNoFishDetected(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      } catch (error) {
        console.log('Fish detection error (non-blocking):', error);
      } finally {
        console.log('[HomeScreen] Setting isValidatingImage to false...');
        setIsValidatingImage(false);
        console.log('[HomeScreen] State update complete, screen should be interactive now');
      }
    }
  };

  const resizeFishMutation = useMutation({
    mutationFn: async ({ imageUri, scale }: { imageUri: string; scale: number }) => {
      console.log('Starting fish resize with Flux...');
      console.log('Image URI:', imageUri);
      console.log('Scale:', scale);

      const result = await resizeFish(imageUri, scale);

      if (!result.success) {
        throw new Error(result.error || 'Failed to resize fish');
      }

      return result.editedImageUri!;
    },
    onSuccess: (url) => {
      setEditedImage(url);
      compareSlider.value = IMAGE_SIZE; // Reset to show edited image
      setShowingBefore(false);
      incrementEdits();
      if (!isPremium) {
        decrementFreeEdits();
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error) => {
      console.log('Fish resize error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  // Animate 3x button nudge when photo is uploaded and scale is at original
  // Only show animation if user has never tapped a size button before
  useEffect(() => {
    // Always cancel any existing animations first to prevent conflicts
    cancelAnimation(button3xScale);
    cancelAnimation(button3xGlow);

    const shouldAnimate = selectedImage && !editedImage && fishScale === 1.0 && !noFishDetected && !isValidatingImage && !resizeFishMutation.isPending && !hasUsedSizeButtons;
    console.log('[HomeScreen] Animation effect running, shouldAnimate:', shouldAnimate, {
      selectedImage: !!selectedImage,
      editedImage: !!editedImage,
      fishScale,
      noFishDetected,
      isValidatingImage,
      isPending: resizeFishMutation.isPending,
      hasUsedSizeButtons
    });

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
  }, [selectedImage, editedImage, fishScale, noFishDetected, isValidatingImage, resizeFishMutation.isPending, hasUsedSizeButtons]);

  // Animate swipe handle bounce when edited image is shown
  useEffect(() => {
    // Cancel any existing animation first
    cancelAnimation(swipeHandleBounce);

    if (editedImage) {
      // Reset interaction flag for new edited image
      hasInteractedWithSlider.value = false;

      // Start bouncing animation after a short delay (right to left)
      const timeout = setTimeout(() => {
        // Only start animation if user hasn't interacted yet
        // Bounce from right to left (negative values) to indicate swiping left to see before
        swipeHandleBounce.value = withRepeat(
          withSequence(
            withTiming(0, { duration: 100 }), // Start at center
            withTiming(-20, { duration: 350, easing: Easing.out(Easing.ease) }), // Swipe left
            withTiming(-5, { duration: 200, easing: Easing.inOut(Easing.ease) }), // Bounce back slightly
            withTiming(-15, { duration: 150, easing: Easing.inOut(Easing.ease) }), // Swipe left again
            withTiming(0, { duration: 250, easing: Easing.out(Easing.ease) }), // Return to center
            withTiming(0, { duration: 1500 }) // Pause before repeating
          ),
          -1,
          false
        );
      }, 800); // Start after image loads

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
    if (!isPremium && freeEditsRemaining <= 0) {
      // This shouldn't happen since button changes, but just in case
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.push('/(tabs)/premium');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setGameKey((k) => k + 1); // Increment key to force game remount
    resizeFishMutation.mutate({ imageUri: selectedImage, scale: fishScale });
  };

  const handleSliderChange = useCallback((value: number) => {
    lastSnappedValue.current = value;
    setFishScale(value);
    setSliderTagline(getSliderTagline(value));
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

  const handleShare = async () => {
    if (!editedImage || !shareableImageRef.current) return;

    // If not premium, show watermark confirmation popup
    if (!isPremium) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShowWatermarkConfirm(true);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSharing(true);

    try {
      // Capture the image (watermark-free for premium users)
      const imageUri = await shareableImageRef.current.capture();

      // Save to gallery
      const newPhoto: FishPhoto = {
        id: Date.now().toString(),
        originalUri: selectedImage!,
        editedUri: editedImage,
        fishScale,
        createdAt: Date.now(),
        shareCount: 1,
        title: getRandomTitle(),
        isUnlocked: true,
      };
      addPhoto(newPhoto);
      incrementShares();

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

      // Save to gallery
      const newPhoto: FishPhoto = {
        id: Date.now().toString(),
        originalUri: selectedImage!,
        editedUri: editedImage,
        fishScale,
        createdAt: Date.now(),
        shareCount: 1,
        title: getRandomTitle(),
        isUnlocked: false,
      };
      addPhoto(newPhoto);
      incrementShares();

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

    console.log('[Save] Starting save, isPremium:', isPremium);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      // Request permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
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

      // Save to app gallery too
      const newPhoto: FishPhoto = {
        id: Date.now().toString(),
        originalUri: selectedImage!,
        editedUri: editedImage,
        fishScale,
        createdAt: Date.now(),
        shareCount: 0,
        title: getRandomTitle(),
        isUnlocked: isPremium,
      };
      addPhoto(newPhoto);

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
    if (pendingAction === 'share') {
      // Now share without watermark
      setIsSharing(true);
      try {
        if (shareableImageRef.current) {
          const imageUri = await shareableImageRef.current.capture();
          const newPhoto: FishPhoto = {
            id: Date.now().toString(),
            originalUri: selectedImage!,
            editedUri: editedImage!,
            fishScale,
            createdAt: Date.now(),
            shareCount: 1,
            title: getRandomTitle(),
            isUnlocked: true,
          };
          addPhoto(newPhoto);
          incrementShares();

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
    setSelectedImage(null);
    setEditedImage(null);
    setFishScale(1.0);
    setTagline(getRandomTagline('home'));
    setNoFishDetected(false);
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
                    style={uploadIconAnimatedStyle}
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
                      resizeMode="cover"
                    />

                    {/* Watermark overlay for non-premium users - scattered diagonal pattern */}
                    {!isPremium && (
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

                        {/* Bottom app link */}
                        <View style={{
                          position: 'absolute',
                          bottom: 8,
                          right: 10,
                        }}>
                          <Text style={{
                            color: 'rgba(255, 255, 255, 0.5)',
                            fontSize: 10,
                            fontWeight: '600',
                          }}>
                            sizematters.app
                          </Text>
                        </View>
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
                        resizeMode="cover"
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

                    {/* Labels */}
                    <View className="absolute top-3 left-3 bg-black/60 px-2 py-1 rounded-lg">
                      <Text className="text-white text-xs font-bold">BEFORE</Text>
                    </View>
                    <View className="absolute top-3 right-3 bg-cyan-600/80 px-2 py-1 rounded-lg">
                      <Text className="text-white text-xs font-bold">AFTER</Text>
                    </View>

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
                    resizeMode="cover"
                  />

                  {/* Validating image overlay */}
                  {isValidatingImage && (
                    <View
                      className="absolute inset-0 items-center justify-center"
                      style={{ backgroundColor: 'rgba(10, 22, 40, 0.85)' }}
                    >
                      <ActivityIndicator size="large" color="#22d3ee" />
                      <Text className="text-cyan-400 text-lg font-semibold mt-3">
                        Analyzing your photo...
                      </Text>
                    </View>
                  )}

                  {/* No fish detected warning overlay */}
                  {noFishDetected && !isValidatingImage && !resizeFishMutation.isPending && (
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
                          onPress={pickImage}
                          className="bg-cyan-600 rounded-xl px-6 py-3 active:scale-95"
                        >
                          <View className="flex-row items-center">
                            <Upload size={18} color="white" />
                            <Text className="text-white font-bold ml-2">Try Another</Text>
                          </View>
                        </Pressable>
                        <Pressable
                          onPress={() => setNoFishDetected(false)}
                          className="bg-slate-700 rounded-xl px-6 py-3 active:scale-95"
                        >
                          <Text className="text-slate-300 font-bold">Use Anyway</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {resizeFishMutation.isPending && (
                    <View
                      className="absolute inset-0 items-center justify-center"
                      style={{ backgroundColor: 'rgba(10, 22, 40, 0.95)' }}
                    >
                      <Text className="text-cyan-400 text-2xl font-bold mb-2">
                        Resizing your fish...
                      </Text>
                      <Text className="text-slate-300 text-base mb-6">
                        This takes about 30 seconds
                      </Text>
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
                    label={isPremium ? "Share Photo" : "Share / Remove Watermark"}
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
                          You've used all 3 free resizes
                        </Text>
                      </View>
                    </View>
                  ) : (
                    // Has free resizes - show normal button
                    <Pressable
                      onPress={handleResize}
                      disabled={resizeFishMutation.isPending || fishScale === 1.0}
                      className={cn(
                        'rounded-xl overflow-hidden active:scale-[0.98]',
                        fishScale === 1.0 && 'opacity-50'
                      )}
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
                            {resizeFishMutation.isPending ? 'Resizing...' : 'Make It Happen'}
                          </Text>
                        </View>
                      </LinearGradient>
                    </Pressable>
                  )
                )}

                {/* Free edits counter - only show when not already edited */}
                {!isPremium && !editedImage && freeEditsRemaining > 0 && (
                  <View className="mt-1.5">
                    {freeEditsRemaining > 1 ? (
                      <Text className="text-center text-slate-400 text-xs">
                        {fishScale === 1.0
                          ? 'Adjust the fish size to resize'
                          : `${freeEditsRemaining} free resizes remaining`}
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

                {/* Error message */}
                {resizeFishMutation.isError && (
                  <View className="bg-red-900/30 rounded-xl p-3 mt-2">
                    <View className="flex-row items-center justify-center mb-2">
                      <AlertCircle size={16} color="#ef4444" />
                      <Text className="text-red-400 text-sm font-semibold ml-2">
                        Couldn't resize the fish
                      </Text>
                    </View>
                    <Text className="text-slate-400 text-center text-xs mb-2">
                      The AI had trouble processing this image. Try a different photo or angle.
                    </Text>
                    <Pressable
                      onPress={pickImage}
                      className="bg-slate-700/50 rounded-lg py-2 active:scale-98"
                    >
                      <Text className="text-cyan-400 text-center text-sm font-medium">
                        Try Another Photo
                      </Text>
                    </Pressable>
                  </View>
                )}
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
            scale={fishScale}
            isPremium={isPremium}
          />
        </View>
      )}

      {/* Paywall Modal */}
      <PaywallModal
        visible={showPaywall}
        onClose={() => {
          setShowPaywall(false);
          setPendingAction(null);
        }}
        onSuccess={handlePaywallSuccess}
        photoId={currentPhotoId ?? undefined}
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
