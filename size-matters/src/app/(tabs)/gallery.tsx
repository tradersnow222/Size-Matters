import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Modal,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
// RN's Image is kept only for its static getSize() (expo-image has no equivalent).
import { Image as RNImage } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Fish, Share2, Trash2, ImageOff, Sparkles, X, Download, UserCircle } from 'lucide-react-native';
import { useAppStore, FishPhoto } from '@/lib/store';
import { persistImage } from '@/lib/fileStore';
import { ShareableImage, ShareableImageRef } from '@/components/ShareableImage';
import { WatermarkOverlay, ThumbnailWatermark } from '@/components/WatermarkOverlay';
import { PaywallModal } from '@/components/PaywallModal';
import { colors, spacing, touchTargets, gradients } from '@/lib/design';
import { GlowingButton } from '@/components/GlowingButton';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - (spacing.screenPadding * 2) - spacing.sm) / 2;

// Full screen image viewer component
function ImageViewer({
  photo,
  visible,
  onClose,
  onShare,
  onSave,
  onSetAsProfilePhoto,
  isSharing,
  isSaving,
  isPremium,
  shareableImageRef,
  showWatermarkConfirm,
  onShowWatermarkConfirm,
  onRemoveWatermark,
  onShareWithWatermark,
  showPaywall,
  onClosePaywall,
  onPaywallSuccess,
  pendingSharePhotoId,
}: {
  photo: FishPhoto | null;
  visible: boolean;
  onClose: () => void;
  onShare: (photo: FishPhoto) => void;
  onSave: (photo: FishPhoto) => void;
  onSetAsProfilePhoto: (photo: FishPhoto) => void;
  isSharing: boolean;
  isSaving: boolean;
  isPremium: boolean;
  shareableImageRef: React.RefObject<ShareableImageRef | null>;
  showWatermarkConfirm: boolean;
  onShowWatermarkConfirm: (show: boolean) => void;
  onRemoveWatermark: () => void;
  onShareWithWatermark: () => void;
  showPaywall: boolean;
  onClosePaywall: () => void;
  onPaywallSuccess: () => void;
  pendingSharePhotoId: string | undefined;
}) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Track actual image dimensions for proper watermark positioning
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  // Whether the underlying file is missing (e.g. an old cache-dir URI was purged).
  const [imgBroken, setImgBroken] = useState(false);

  // Fetch image dimensions when photo changes
  useEffect(() => {
    if (photo) {
      const uri = photo.editedUri || photo.originalUri;
      setImgBroken(false);
      RNImage.getSize(
        uri,
        (width, height) => {
          setImageDimensions({ width, height });
        },
        (error) => {
          console.log('Failed to get image size:', error);
          setImageDimensions(null);
        }
      );
    } else {
      setImageDimensions(null);
    }
  }, [photo?.id, photo?.editedUri, photo?.originalUri]);

  // Reset transforms when photo changes
  useEffect(() => {
    if (visible) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  }, [visible, photo?.id]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else if (scale.value > 4) {
        scale.value = withSpring(4);
        savedScale.value = 4;
      } else {
        savedScale.value = scale.value;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    doubleTapGesture
  );

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const getScaleLabel = (fishScale: number) => {
    const percent = Math.round(fishScale * 100);
    if (percent === 100) return 'Original';
    return `${percent}%`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (!photo) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.background.primary} translucent />
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background.primary }}>
        <View style={{ flex: 1, backgroundColor: colors.background.primary, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          {/* Header */}
          <View
            className="flex-row items-center justify-between px-4 py-3"
            style={{ backgroundColor: colors.background.primary }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              className="w-11 h-11 items-center justify-center rounded-full"
              style={{ backgroundColor: `${colors.brand.muted}50` }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={24} color="white" />
            </Pressable>

            <View className="flex-1 mx-4">
              <Text
                className="text-center"
                style={{ fontSize: 17, fontWeight: '600', color: 'white' }}
                numberOfLines={1}
              >
                {photo.title}
              </Text>
              <Text
                className="text-center"
                style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.6)', marginTop: 2 }}
              >
                {formatDate(photo.createdAt)}
              </Text>
            </View>

            <View style={{ width: 44 }} />
          </View>

          {/* Image with watermark overlay for non-premium */}
          <View className="flex-1 items-center justify-center" style={{ overflow: 'hidden' }}>
            <GestureDetector gesture={composedGesture}>
              <Animated.View style={animatedImageStyle}>
                <View style={{ overflow: 'hidden' }}>
                  {imgBroken ? (
                    <View style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 1.3, alignItems: 'center', justifyContent: 'center' }}>
                      <ImageOff size={48} color={colors.text.tertiary} />
                      <Text style={{ color: colors.text.tertiary, marginTop: 10 }}>Photo unavailable</Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: photo.editedUri || photo.originalUri }}
                      style={{
                        width: SCREEN_WIDTH,
                        height: SCREEN_WIDTH * 1.3,
                      }}
                      contentFit="contain"
                      onError={() => setImgBroken(true)}
                    />
                  )}
                  {/* Watermark overlay for non-premium users - positioned within actual image bounds */}
                  <WatermarkOverlay
                    width={SCREEN_WIDTH}
                    height={SCREEN_WIDTH * 1.3}
                    isPremium={isPremium}
                    isUnlocked={photo.isUnlocked}
                    imageWidth={imageDimensions?.width}
                    imageHeight={imageDimensions?.height}
                  />
                </View>
              </Animated.View>
            </GestureDetector>
          </View>

          {/* Footer with info and actions */}
          <View
            style={{ backgroundColor: colors.background.secondary, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: `${colors.brand.muted}30` }}
          >
            {/* Scale badge */}
            <View className="flex-row items-center justify-center mb-4">
              <View
                className="flex-row items-center px-4 py-2 rounded-full"
                style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)' }}
              >
                <Sparkles size={16} color={colors.accent.gold} />
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '700',
                    color: colors.accent.gold,
                    marginLeft: 8,
                  }}
                >
                  Resized to {getScaleLabel(photo.fishScale)}
                </Text>
              </View>
            </View>

            {/* Share and Save buttons row */}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <GlowingButton
                  onPress={() => onShare(photo)}
                  disabled={isSharing || isSaving}
                  isLoading={isSharing}
                  loadingLabel="Sharing..."
                  label={isPremium || photo.isUnlocked ? "Share Photo" : "Share / Remove Watermark"}
                  icon={<Share2 size={20} color="white" />}
                  variant="share"
                  enablePulse={!isSharing && !isSaving}
                  pulseDelay={400}
                />
              </View>
            </View>

            {/* Save button */}
            <Pressable
              onPress={() => onSave(photo)}
              disabled={isSaving || isSharing}
              className="mt-3 flex-row items-center justify-center py-3.5 rounded-xl active:opacity-80"
              style={{
                backgroundColor: isSaving ? `${colors.brand.muted}50` : `${colors.brand.muted}30`,
                borderWidth: 1,
                borderColor: `${colors.brand.primary}30`,
                opacity: isSaving || isSharing ? 0.6 : 1,
              }}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.brand.primary} />
              ) : (
                <>
                  <Download size={18} color={colors.brand.primary} />
                  <Text style={{ fontSize: 15, fontWeight: '500', color: colors.brand.primary, marginLeft: 8 }}>
                    Save to Photos
                  </Text>
                </>
              )}
            </Pressable>

            {/* Set as profile photo button */}
            <Pressable
              onPress={() => onSetAsProfilePhoto(photo)}
              className="mt-3 flex-row items-center justify-center py-3.5 rounded-xl active:opacity-80"
              style={{ backgroundColor: `${colors.brand.muted}30`, borderWidth: 1, borderColor: `${colors.brand.muted}50` }}
            >
              <UserCircle size={18} color={colors.text.secondary} />
              <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text.secondary, marginLeft: 8 }}>
                Set as Profile Photo
              </Text>
            </Pressable>

            <Text
              className="text-center mt-3"
              style={{ fontSize: 13, color: colors.text.tertiary }}
            >
              Pinch to zoom • Double-tap to zoom in/out
            </Text>
          </View>
        </View>
      </GestureHandlerRootView>

      {/* Watermark Confirmation Modal - rendered inside ImageViewer so it appears on top */}
      <Modal
        visible={showWatermarkConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => onShowWatermarkConfirm(false)}
      >
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="bg-[#0B1623] rounded-2xl p-6 w-full max-w-sm border border-slate-700">
            {/* Close button */}
            <Pressable
              onPress={() => onShowWatermarkConfirm(false)}
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
                onPress={onRemoveWatermark}
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
                onPress={onShareWithWatermark}
                className="rounded-xl py-3 active:scale-[0.98]"
              >
                <Text className="text-slate-500 text-base font-medium text-center">
                  Share photo with watermark
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Paywall Modal - rendered inside ImageViewer so it appears on top */}
      <PaywallModal
        visible={showPaywall}
        onClose={onClosePaywall}
        onSuccess={onPaywallSuccess}
        photoId={pendingSharePhotoId}
      />
    </Modal>
  );
}

export default function GalleryScreen() {
  const photos = useAppStore((s) => s.photos);
  const deletePhoto = useAppStore((s) => s.deletePhoto);
  const incrementShares = useAppStore((s) => s.incrementShares);
  const updatePhoto = useAppStore((s) => s.updatePhoto);
  const isPremium = useAppStore((s) => s.isPremium);
  const setProfilePhoto = useAppStore((s) => s.setProfilePhoto);

  const [sharingPhotoId, setSharingPhotoId] = useState<string | null>(null);
  const [savingPhotoId, setSavingPhotoId] = useState<string | null>(null);
  const [currentSharePhoto, setCurrentSharePhoto] = useState<FishPhoto | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<FishPhoto | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  const [showWatermarkConfirm, setShowWatermarkConfirm] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [pendingSharePhoto, setPendingSharePhoto] = useState<FishPhoto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FishPhoto | null>(null);
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());
  const shareableImageRef = useRef<ShareableImageRef>(null);

  useEffect(() => {
    useAppStore.getState().loadFromStorage();
  }, []);

  // Keep selectedPhoto in sync with the store (e.g., when isUnlocked changes)
  useEffect(() => {
    if (selectedPhoto) {
      const freshPhoto = photos.find(p => p.id === selectedPhoto.id);
      if (freshPhoto && freshPhoto.isUnlocked !== selectedPhoto.isUnlocked) {
        setSelectedPhoto(freshPhoto);
      }
    }
  }, [photos, selectedPhoto?.id, selectedPhoto?.isUnlocked]);

  const handlePhotoPress = (photo: FishPhoto) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPhoto(photo);
    setShowViewer(true);
  };

  const handleCloseViewer = () => {
    setShowViewer(false);
    setTimeout(() => setSelectedPhoto(null), 300);
  };

  const handleShare = async (photo: FishPhoto) => {
    if (!photo.editedUri) return;

    // Get the fresh photo data from the store to check current unlock status
    const freshPhoto = photos.find(p => p.id === photo.id) ?? photo;

    // If premium or photo is unlocked, share directly without watermark
    if (isPremium || freshPhoto.isUnlocked === true) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await performShare(freshPhoto);
      return;
    }

    // Otherwise, show watermark confirmation popup
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPendingSharePhoto(freshPhoto);
    setShowWatermarkConfirm(true);
  };

  // Handle "Yes" on watermark confirmation - show paywall
  const handleRemoveWatermark = () => {
    setShowWatermarkConfirm(false);
    setShowPaywall(true);
  };

  // Handle "No" on watermark confirmation - share with watermark
  const handleShareWithWatermark = async () => {
    setShowWatermarkConfirm(false);
    if (pendingSharePhoto) {
      await performShare(pendingSharePhoto);
    }
  };

  // Actually perform the share
  const performShare = async (photo: FishPhoto) => {
    setSharingPhotoId(photo.id);
    setCurrentSharePhoto(photo);

    // Wait a tick for the ShareableImage to render
    setTimeout(async () => {
      try {
        if (!shareableImageRef.current) {
          throw new Error('ShareableImage not ready');
        }

        // Capture the image (with or without watermark based on premium/unlocked status)
        const capturedUri = await shareableImageRef.current.capture();

        updatePhoto(photo.id, { shareCount: photo.shareCount + 1 });
        incrementShares();

        // Share the image
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(capturedUri, {
            mimeType: 'image/png',
          });
        }
      } catch (error) {
        console.log('Share error:', error);
      } finally {
        setSharingPhotoId(null);
        setCurrentSharePhoto(null);
        setPendingSharePhoto(null);
      }
    }, 100);
  };

  // Handle successful paywall completion - unlock photo and share
  const handlePaywallSuccess = async () => {
    setShowPaywall(false);
    if (pendingSharePhoto) {
      // Mark the photo as unlocked in the store
      updatePhoto(pendingSharePhoto.id, { isUnlocked: true });
      // Update the local reference for sharing
      const unlockedPhoto = { ...pendingSharePhoto, isUnlocked: true };
      // Also update selectedPhoto if it's the same photo (for ImageViewer background)
      if (selectedPhoto?.id === pendingSharePhoto.id) {
        setSelectedPhoto(unlockedPhoto);
      }
      await performShare(unlockedPhoto);
    }
  };

  const handleDelete = (photo: FishPhoto) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPendingDelete(photo);
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      deletePhoto(pendingDelete.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setPendingDelete(null);
  };

  const handleSetAsProfilePhoto = async (photo: FishPhoto) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const imageUri = photo.editedUri || photo.originalUri;
    // Copy out of cache so the avatar survives app updates / cache purges.
    const persisted = await persistImage(imageUri, 'profile');
    setProfilePhoto(persisted ?? imageUri);
    handleCloseViewer();
  };

  const handleSave = async (photo: FishPhoto) => {
    if (!photo.editedUri) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSavingPhotoId(photo.id);
    setCurrentSharePhoto(photo);

    // Wait a tick for the ShareableImage to render
    setTimeout(async () => {
      try {
        if (!shareableImageRef.current) {
          throw new Error('ShareableImage not ready');
        }

        // Request write-only ("add to library") permission — the app only saves,
        // never reads the library. Requires NSPhotoLibraryAddUsageDescription
        // (added via the expo-media-library plugin in app.json).
        const { status } = await MediaLibrary.requestPermissionsAsync(true);
        if (status !== 'granted') {
          console.log('Permission denied');
          return;
        }

        // Capture the watermarked image
        const watermarkedUri = await shareableImageRef.current.capture();

        // Save to camera roll
        await MediaLibrary.saveToLibraryAsync(watermarkedUri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        console.log('Save error:', error);
      } finally {
        setSavingPhotoId(null);
        setCurrentSharePhoto(null);
      }
    }, 100);
  };

  const getScaleLabel = (scale: number) => {
    const percent = Math.round(scale * 100);
    if (percent === 100) return 'Original';
    if (percent < 100) return `${percent}%`;
    return `${percent}%`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Floating fish animation
  const fishFloat = useSharedValue(0);

  useEffect(() => {
    fishFloat.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const fishAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: fishFloat.value }],
  }));

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background.primary }}>
      <LinearGradient
        colors={gradients.background}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header - HIG Large Title */}
        <Animated.View
          entering={FadeInDown.duration(500)}
          style={{ paddingHorizontal: spacing.screenPadding, paddingTop: spacing.md, paddingBottom: spacing.md }}
        >
          <View className="flex-row items-center justify-center">
            <Animated.View style={fishAnimatedStyle}>
              <Fish size={28} color={colors.brand.primary} strokeWidth={2} />
            </Animated.View>
            <Text
              style={{
                fontSize: 28,
                lineHeight: 34,
                fontWeight: '700',
                color: colors.text.primary,
                marginLeft: 12,
              }}
            >
              My Catches
            </Text>
          </View>
          <Text
            className="text-center mt-2"
            style={{ fontSize: 15, lineHeight: 20, color: colors.text.secondary }}
          >
            {photos.length === 0
              ? 'No legendary catches yet'
              : `${photos.length} legendary ${photos.length === 1 ? 'tale' : 'tales'}`}
          </Text>
        </Animated.View>

        {photos.length === 0 ? (
          <View className="flex-1 items-center justify-center" style={{ paddingHorizontal: spacing.screenPadding }}>
            <View
              className="w-24 h-24 rounded-full items-center justify-center mb-5"
              style={{ backgroundColor: `${colors.brand.primary}15` }}
            >
              <ImageOff size={48} color={colors.text.tertiary} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text.secondary, textAlign: 'center' }}>
              Your tackle box is empty
            </Text>
            <Text style={{ fontSize: 15, color: colors.text.tertiary, textAlign: 'center', marginTop: 8 }}>
              Go to Resize tab and create{'\n'}your first legendary catch!
            </Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: spacing.screenPadding, paddingBottom: spacing.xl }}
            showsVerticalScrollIndicator={false}
          >
            <View className="flex-row flex-wrap justify-between">
              {photos.map((photo, index) => (
                <Animated.View
                  key={photo.id}
                  entering={FadeInUp.delay(index * 100).duration(400)}
                  style={{ width: CARD_WIDTH, marginBottom: spacing.md }}
                >
                  <Pressable
                    className="rounded-2xl overflow-hidden"
                    style={{
                      backgroundColor: `${colors.background.tertiary}80`,
                      borderWidth: 1,
                      borderColor: `${colors.brand.muted}30`,
                    }}
                    onPress={() => handlePhotoPress(photo)}
                    onLongPress={() => handleDelete(photo)}
                  >
                    {/* Image */}
                    <View style={{ height: CARD_WIDTH * 1.2 }}>
                      {brokenIds.has(photo.id) ? (
                        <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background.tertiary }}>
                          <ImageOff size={30} color={colors.text.tertiary} />
                          <Text style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 6 }}>Photo unavailable</Text>
                        </View>
                      ) : (
                        <Image
                          source={{ uri: photo.editedUri || photo.originalUri }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                          onError={() => setBrokenIds((prev) => {
                            const next = new Set(prev);
                            next.add(photo.id);
                            return next;
                          })}
                        />
                      )}
                      {/* Watermark overlay for non-premium users */}
                      <ThumbnailWatermark
                        width={CARD_WIDTH}
                        height={CARD_WIDTH * 1.2}
                        isPremium={isPremium}
                        isUnlocked={photo.isUnlocked}
                      />
                      {/* Scale badge */}
                      <View
                        className="absolute top-2 left-2 px-2.5 py-1.5 rounded-full flex-row items-center"
                        style={{ backgroundColor: colors.overlay.medium }}
                      >
                        <Sparkles size={12} color={colors.accent.gold} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.accent.gold, marginLeft: 4 }}>
                          {getScaleLabel(photo.fishScale)}
                        </Text>
                      </View>
                    </View>

                    {/* Info - HIG compliant text sizes */}
                    <View style={{ padding: spacing.sm }}>
                      <Text
                        style={{ fontSize: 15, fontWeight: '600', color: colors.text.primary }}
                        numberOfLines={1}
                      >
                        {photo.title}
                      </Text>
                      <View className="flex-row items-center justify-between mt-2">
                        <Text style={{ fontSize: 12, color: colors.text.tertiary }}>
                          {formatDate(photo.createdAt)}
                        </Text>
                        <View className="flex-row items-center">
                          <Share2 size={12} color={colors.text.tertiary} />
                          <Text style={{ fontSize: 12, color: colors.text.tertiary, marginLeft: 4 }}>
                            {photo.shareCount}
                          </Text>
                        </View>
                      </View>

                      {/* Actions - 44pt minimum touch targets */}
                      <View className="flex-row mt-3 gap-2">
                        <View className="flex-1">
                          <GlowingButton
                            onPress={() => handleShare(photo)}
                            disabled={sharingPhotoId === photo.id}
                            isLoading={sharingPhotoId === photo.id}
                            loadingLabel=""
                            label={isPremium || photo.isUnlocked ? "Share" : "Share..."}
                            icon={<Share2 size={16} color="white" />}
                            variant="share"
                            size="compact"
                            enablePulse={false}
                          />
                        </View>
                        <Pressable
                          onPress={() => handleDelete(photo)}
                          className="rounded-lg items-center justify-center active:scale-95"
                          style={{
                            width: touchTargets.minimum,
                            height: touchTargets.minimum,
                            backgroundColor: `${colors.semantic.error}30`,
                          }}
                        >
                          <Trash2 size={18} color={colors.semantic.error} />
                        </Pressable>
                      </View>
                    </View>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Hidden shareable image for capturing with watermark */}
      {currentSharePhoto?.editedUri && (
        <View style={{ position: 'absolute', left: -9999, top: -9999 }}>
          <ShareableImage
            ref={shareableImageRef}
            imageUri={currentSharePhoto.editedUri}
            isPremium={isPremium || currentSharePhoto.isUnlocked}
          />
        </View>
      )}

      {/* Delete confirmation */}
      <Modal
        visible={!!pendingDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDelete(null)}
      >
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="bg-[#0B1623] rounded-2xl p-6 w-full max-w-sm border border-slate-700">
            <View className="items-center mb-4">
              <View className="w-14 h-14 rounded-full items-center justify-center" style={{ backgroundColor: `${colors.semantic.error}20` }}>
                <Trash2 size={26} color={colors.semantic.error} />
              </View>
            </View>
            <Text className="text-white text-xl font-bold text-center mb-1">Delete this catch?</Text>
            <Text className="text-slate-400 text-center text-sm mb-6">This can&apos;t be undone.</Text>
            <View className="gap-3">
              <Pressable onPress={confirmDelete} className="rounded-xl py-3.5 active:scale-[0.98]" style={{ backgroundColor: colors.semantic.error }}>
                <Text className="text-white text-center text-base font-bold">Delete</Text>
              </Pressable>
              <Pressable onPress={() => setPendingDelete(null)} className="rounded-xl py-3.5 active:scale-[0.98] bg-slate-700/50">
                <Text className="text-slate-200 text-center text-base font-semibold">Keep</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full screen image viewer */}
      <ImageViewer
        photo={selectedPhoto}
        visible={showViewer}
        onClose={handleCloseViewer}
        onShare={handleShare}
        onSave={handleSave}
        onSetAsProfilePhoto={handleSetAsProfilePhoto}
        isSharing={sharingPhotoId === selectedPhoto?.id}
        isSaving={savingPhotoId === selectedPhoto?.id}
        isPremium={isPremium}
        shareableImageRef={shareableImageRef}
        showWatermarkConfirm={showWatermarkConfirm && showViewer}
        onShowWatermarkConfirm={setShowWatermarkConfirm}
        onRemoveWatermark={handleRemoveWatermark}
        onShareWithWatermark={handleShareWithWatermark}
        showPaywall={showPaywall && showViewer}
        onClosePaywall={() => {
          setShowPaywall(false);
          setPendingSharePhoto(null);
        }}
        onPaywallSuccess={handlePaywallSuccess}
        pendingSharePhotoId={pendingSharePhoto?.id}
      />

      {/* Watermark Confirmation Modal - rendered at gallery level for thumbnail shares */}
      {!showViewer && (
        <Modal
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
        </Modal>
      )}

      {/* Paywall Modal - rendered at gallery level for thumbnail shares */}
      {!showViewer && (
        <PaywallModal
          visible={showPaywall}
          onClose={() => {
            setShowPaywall(false);
            setPendingSharePhoto(null);
          }}
          onSuccess={handlePaywallSuccess}
          photoId={pendingSharePhoto?.id}
        />
      )}
    </View>
  );
}
