import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Modal, Platform, Linking as RNLinking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  User,
  Fish,
  Share2,
  Trophy,
  Crown,
  Target,
  Award,
  FileText,
  Shield,
  ExternalLink,
  Camera,
  X,
  Check,
  ZoomIn,
  Move,
  Star,
  MessageSquare,
  Heart,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react-native';
import { useAppStore } from '@/lib/store';
import { colors, spacing, touchTargets, gradients } from '@/lib/design';
import { FeedbackModal } from '@/components/FeedbackModal';

const ACHIEVEMENTS = [
  {
    id: 'first_catch',
    icon: Fish,
    title: 'First Catch',
    description: 'Resize your first fish',
    requirement: 1,
    type: 'edits' as const,
  },
  {
    id: 'big_talker',
    icon: Trophy,
    title: 'Big Talker',
    description: 'Resize 10 fish',
    requirement: 10,
    type: 'edits' as const,
  },
  {
    id: 'fish_whisperer',
    icon: Award,
    title: 'Fish Whisperer',
    description: 'Resize 50 fish',
    requirement: 50,
    type: 'edits' as const,
  },
  {
    id: 'social_angler',
    icon: Share2,
    title: 'Social Angler',
    description: 'Share 5 photos',
    requirement: 5,
    type: 'shares' as const,
  },
  {
    id: 'viral_fisher',
    icon: Target,
    title: 'Viral Fisher',
    description: 'Share 25 photos',
    requirement: 25,
    type: 'shares' as const,
  },
];

export default function ProfileScreen() {
  const totalEdits = useAppStore((s) => s.totalEdits);
  const totalShares = useAppStore((s) => s.totalShares);
  const isPremium = useAppStore((s) => s.isPremium);
  const photos = useAppStore((s) => s.photos);
  const profilePhotoUri = useAppStore((s) => s.profilePhotoUri);
  const setProfilePhoto = useAppStore((s) => s.setProfilePhoto);
  const freeEditsRemaining = useAppStore((s) => s.freeEditsRemaining);

  const [showPhotoEditor, setShowPhotoEditor] = useState(false);
  const [tempPhotoUri, setTempPhotoUri] = useState<string | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const resetAllData = useAppStore((s) => s.resetAllData);

  // Photo editor gesture values
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    useAppStore.getState().loadFromStorage();
  }, []);

  // Fish animation
  const fishSwim = useSharedValue(0);

  useEffect(() => {
    fishSwim.value = withRepeat(
      withSequence(
        withTiming(10, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(-10, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const fishAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: fishSwim.value }],
  }));

  // Photo editor animated style
  const photoEditorStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Pinch gesture for scaling
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(3, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  // Pan gesture for positioning
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const pickProfilePhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setTempPhotoUri(result.assets[0].uri);
      // Reset transform values
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      setShowPhotoEditor(true);
    }
  };

  const confirmProfilePhoto = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (tempPhotoUri) {
      setProfilePhoto(tempPhotoUri);
    }
    setShowPhotoEditor(false);
    setTempPhotoUri(null);
  };

  const cancelPhotoEditor = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPhotoEditor(false);
    setTempPhotoUri(null);
  };

  const handleResetApp = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await resetAllData();
    setShowResetConfirm(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const getAchievementProgress = (achievement: typeof ACHIEVEMENTS[0]) => {
    const current = achievement.type === 'edits' ? totalEdits : totalShares;
    return Math.min(current / achievement.requirement, 1);
  };

  const isAchievementUnlocked = (achievement: typeof ACHIEVEMENTS[0]) => {
    const current = achievement.type === 'edits' ? totalEdits : totalShares;
    return current >= achievement.requirement;
  };

  const unlockedCount = ACHIEVEMENTS.filter(isAchievementUnlocked).length;

  // Calculate average fish scale
  const avgScale = photos.length > 0
    ? photos.reduce((sum, p) => sum + p.fishScale, 0) / photos.length
    : 1;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background.primary }}>
      <LinearGradient
        colors={gradients.background}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1" edges={['top']}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header - HIG Large Title */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="items-center"
            style={{ paddingTop: spacing.xl, paddingBottom: spacing.md }}
          >
            <Pressable onPress={pickProfilePhoto} className="relative active:opacity-80">
              <View
                className="w-24 h-24 rounded-full items-center justify-center overflow-hidden"
                style={{
                  backgroundColor: `${colors.brand.primary}20`,
                  borderWidth: 2,
                  borderColor: `${colors.brand.primary}50`,
                }}
              >
                {profilePhotoUri ? (
                  <Image
                    source={{ uri: profilePhotoUri }}
                    style={{ width: 96, height: 96 }}
                    resizeMode="cover"
                  />
                ) : (
                  <User size={48} color={colors.brand.primary} />
                )}
              </View>
              {/* Camera badge */}
              <View
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full items-center justify-center"
                style={{
                  backgroundColor: colors.brand.primary,
                  borderWidth: 2,
                  borderColor: colors.background.primary,
                }}
              >
                <Camera size={14} color="white" />
              </View>
              {isPremium && (
                <View
                  className="absolute -top-1 -right-1 w-8 h-8 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: colors.accent.gold,
                    borderWidth: 2,
                    borderColor: colors.background.primary,
                  }}
                >
                  <Crown size={16} color={colors.background.primary} />
                </View>
              )}
            </Pressable>
            <Text
              style={{
                fontSize: 28,
                lineHeight: 34,
                fontWeight: '700',
                color: colors.text.primary,
                marginTop: spacing.md,
              }}
            >
              Legendary Angler
            </Text>
            <View className="flex-row items-center mt-2">
              <Animated.View style={fishAnimatedStyle}>
                <Fish size={18} color={colors.brand.primary} />
              </Animated.View>
              <Text style={{ fontSize: 15, color: colors.brand.primary, marginLeft: 8 }}>
                {isPremium ? 'Pro Member' : 'Free Angler'}
              </Text>
            </View>
          </Animated.View>

          {/* Stats - HIG compliant cards */}
          <Animated.View
            entering={FadeInUp.delay(200).duration(400)}
            style={{ paddingHorizontal: spacing.screenPadding, marginTop: spacing.xs }}
          >
            <View className="flex-row gap-3">
              <View
                className="flex-1 rounded-2xl p-4"
                style={{
                  backgroundColor: `${colors.background.tertiary}80`,
                  borderWidth: 1,
                  borderColor: `${colors.brand.muted}30`,
                }}
              >
                <View className="flex-row items-center">
                  <Fish size={20} color={colors.brand.primary} />
                  <Text style={{ fontSize: 13, color: colors.text.secondary, marginLeft: 8 }}>Total Resizes</Text>
                </View>
                <Text style={{ fontSize: 32, fontWeight: '700', color: colors.text.primary, marginTop: 8 }}>
                  {totalEdits}
                </Text>
              </View>
              <View
                className="flex-1 rounded-2xl p-4"
                style={{
                  backgroundColor: `${colors.background.tertiary}80`,
                  borderWidth: 1,
                  borderColor: `${colors.brand.muted}30`,
                }}
              >
                <View className="flex-row items-center">
                  <Share2 size={20} color={colors.semantic.success} />
                  <Text style={{ fontSize: 13, color: colors.text.secondary, marginLeft: 8 }}>Shares</Text>
                </View>
                <Text style={{ fontSize: 32, fontWeight: '700', color: colors.text.primary, marginTop: 8 }}>
                  {totalShares}
                </Text>
              </View>
            </View>

            <View className="flex-row gap-3 mt-3">
              <View
                className="flex-1 rounded-2xl p-4"
                style={{
                  backgroundColor: `${colors.background.tertiary}80`,
                  borderWidth: 1,
                  borderColor: `${colors.brand.muted}30`,
                }}
              >
                <View className="flex-row items-center">
                  <Target size={20} color={colors.accent.gold} />
                  <Text style={{ fontSize: 13, color: colors.text.secondary, marginLeft: 8 }}>Avg Scale</Text>
                </View>
                <Text style={{ fontSize: 32, fontWeight: '700', color: colors.text.primary, marginTop: 8 }}>
                  {avgScale.toFixed(1)}x
                </Text>
              </View>
              <View
                className="flex-1 rounded-2xl p-4"
                style={{
                  backgroundColor: `${colors.background.tertiary}80`,
                  borderWidth: 1,
                  borderColor: `${colors.brand.muted}30`,
                }}
              >
                <View className="flex-row items-center">
                  <Trophy size={20} color={colors.accent.purple} />
                  <Text style={{ fontSize: 13, color: colors.text.secondary, marginLeft: 8 }}>Badges</Text>
                </View>
                <Text style={{ fontSize: 32, fontWeight: '700', color: colors.text.primary, marginTop: 8 }}>
                  {unlockedCount}/{ACHIEVEMENTS.length}
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* Account & Subscription Management */}
          <Animated.View
            entering={FadeInUp.delay(300).duration(400)}
            style={{ paddingHorizontal: spacing.screenPadding, marginTop: spacing.xl }}
          >
            <View className="flex-row items-center mb-4">
              <Crown size={22} color={colors.accent.gold} />
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text.primary, marginLeft: 8 }}>
                Subscription
              </Text>
            </View>

            <View
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: `${colors.background.tertiary}50`,
                borderWidth: 1,
                borderColor: isPremium ? `${colors.accent.gold}50` : `${colors.background.secondary}50`,
              }}
            >
              <View className="p-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center"
                      style={{
                        backgroundColor: isPremium ? `${colors.accent.gold}20` : `${colors.brand.primary}20`,
                      }}
                    >
                      {isPremium ? (
                        <Crown size={20} color={colors.accent.gold} />
                      ) : (
                        <User size={20} color={colors.brand.primary} />
                      )}
                    </View>
                    <View className="ml-3">
                      <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text.primary }}>
                        {isPremium ? 'Pro Member' : 'Free Plan'}
                      </Text>
                      <Text style={{ fontSize: 14, color: colors.text.tertiary }}>
                        {isPremium
                          ? 'Unlimited resizes & features'
                          : `${freeEditsRemaining} free resize${freeEditsRemaining !== 1 ? 's' : ''} remaining`}
                      </Text>
                    </View>
                  </View>
                  {isPremium && (
                    <View
                      className="px-3 py-1.5 rounded-full"
                      style={{ backgroundColor: colors.accent.gold }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.background.primary }}>
                        ACTIVE
                      </Text>
                    </View>
                  )}
                </View>

                {isPremium && (
                  <Text style={{ fontSize: 13, color: colors.text.tertiary, marginTop: 12 }}>
                    Manage your subscription in Settings {'>'} Subscriptions on your device
                  </Text>
                )}
              </View>

              {!isPremium && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    // Navigate to Go Pro tab
                    const { router } = require('expo-router');
                    router.push('/(tabs)/premium');
                  }}
                  className="overflow-hidden active:opacity-90"
                  style={{
                    margin: 12,
                    marginTop: 0,
                    borderRadius: 16,
                  }}
                >
                  <LinearGradient
                    colors={['#F59E0B', '#FBBF24', '#F59E0B']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 20,
                      borderRadius: 16,
                    }}
                  >
                    <Crown size={20} color={colors.background.primary} />
                    <Text style={{
                      fontSize: 17,
                      fontWeight: '700',
                      color: colors.background.primary,
                      marginLeft: 10,
                      letterSpacing: 0.3,
                    }}>
                      Upgrade to Pro Unlimited
                    </Text>
                  </LinearGradient>
                </Pressable>
              )}
            </View>
          </Animated.View>

          {/* Achievements - Dopamine triggers */}
          <Animated.View
            entering={FadeInUp.delay(400).duration(400)}
            style={{ paddingHorizontal: spacing.screenPadding, marginTop: spacing.xl }}
          >
            <View className="flex-row items-center mb-4">
              <Award size={22} color={colors.accent.gold} />
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text.primary, marginLeft: 8 }}>
                Achievements
              </Text>
            </View>

            {ACHIEVEMENTS.map((achievement, index) => {
              const progress = getAchievementProgress(achievement);
              const unlocked = isAchievementUnlocked(achievement);
              const current = achievement.type === 'edits' ? totalEdits : totalShares;

              return (
                <View
                  key={achievement.id}
                  className="rounded-2xl p-4 mb-3"
                  style={{
                    backgroundColor: `${colors.background.tertiary}50`,
                    borderWidth: 1,
                    borderColor: unlocked ? `${colors.accent.gold}50` : `${colors.background.secondary}50`,
                  }}
                >
                  <View className="flex-row items-center">
                    <View
                      className="w-12 h-12 rounded-full items-center justify-center"
                      style={{
                        backgroundColor: unlocked ? `${colors.accent.gold}20` : `${colors.background.secondary}80`,
                      }}
                    >
                      <achievement.icon
                        size={24}
                        color={unlocked ? colors.accent.gold : colors.text.tertiary}
                      />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text
                        style={{
                          fontSize: 17,
                          fontWeight: '600',
                          color: unlocked ? colors.text.primary : colors.text.secondary,
                        }}
                      >
                        {achievement.title}
                      </Text>
                      <Text style={{ fontSize: 14, color: colors.text.tertiary }}>{achievement.description}</Text>
                    </View>
                    {unlocked && (
                      <View
                        className="px-3 py-1.5 rounded-full"
                        style={{ backgroundColor: colors.accent.gold }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.background.primary }}>
                          UNLOCKED
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Progress bar - visual feedback */}
                  {!unlocked && (
                    <View className="mt-3">
                      <View
                        className="h-2 rounded-full overflow-hidden"
                        style={{ backgroundColor: colors.background.secondary }}
                      >
                        <View
                          className="h-full rounded-full"
                          style={{
                            width: `${progress * 100}%`,
                            backgroundColor: colors.brand.primary,
                          }}
                        />
                      </View>
                      <Text style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 4 }}>
                        {current} / {achievement.requirement}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </Animated.View>

          {/* Feedback & Support Section */}
          <Animated.View
            entering={FadeInUp.delay(550).duration(400)}
            style={{ paddingHorizontal: spacing.screenPadding, marginTop: spacing.xl }}
          >
            <View className="flex-row items-center mb-4">
              <Heart size={22} color={colors.semantic.error} />
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text.primary, marginLeft: 8 }}>
                Feedback & Support
              </Text>
            </View>

            <View
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: `${colors.background.tertiary}50`,
                borderWidth: 1,
                borderColor: `${colors.background.secondary}50`,
              }}
            >
              {/* Send Feedback */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  // Open email for feedback
                  RNLinking.openURL('mailto:info@sizematters.app?subject=Size%20Matters%20Feedback');
                }}
                className="flex-row items-center p-4 active:opacity-70"
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${colors.brand.primary}20` }}
                >
                  <MessageSquare size={20} color={colors.brand.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontSize: 17, color: colors.text.primary }}>
                    Send Feedback
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.text.tertiary }}>
                    Report bugs or suggest features
                  </Text>
                </View>
                <ExternalLink size={18} color={colors.text.tertiary} />
              </Pressable>
            </View>
          </Animated.View>

          {/* Legal Links - Required for App Store */}
          <Animated.View
            entering={FadeInUp.delay(600).duration(400)}
            style={{ paddingHorizontal: spacing.screenPadding, marginTop: spacing.xl }}
          >
            <View
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: `${colors.background.tertiary}50`,
                borderWidth: 1,
                borderColor: `${colors.background.secondary}50`,
              }}
            >
              <Pressable
                onPress={() => Linking.openURL('https://sizematters.app/terms-of-use/')}
                className="flex-row items-center p-4 active:opacity-70"
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: `${colors.background.secondary}50`,
                }}
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${colors.brand.primary}20` }}
                >
                  <FileText size={20} color={colors.brand.primary} />
                </View>
                <Text style={{ fontSize: 17, color: colors.text.primary, marginLeft: 12, flex: 1 }}>
                  Terms of Use
                </Text>
                <ExternalLink size={18} color={colors.text.tertiary} />
              </Pressable>

              <Pressable
                onPress={() => Linking.openURL('https://sizematters.app/privacy-policy/')}
                className="flex-row items-center p-4 active:opacity-70"
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: `${colors.background.secondary}50`,
                }}
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${colors.brand.primary}20` }}
                >
                  <Shield size={20} color={colors.brand.primary} />
                </View>
                <Text style={{ fontSize: 17, color: colors.text.primary, marginLeft: 12, flex: 1 }}>
                  Privacy Policy
                </Text>
                <ExternalLink size={18} color={colors.text.tertiary} />
              </Pressable>
            </View>

            <Text
              style={{
                fontSize: 12,
                color: colors.text.tertiary,
                textAlign: 'center',
                marginTop: spacing.md,
              }}
            >
              Size Matters v1.0.0
            </Text>
          </Animated.View>

          {/* Reset App Section */}
          <Animated.View
            entering={FadeInUp.delay(650).duration(400)}
            style={{ paddingHorizontal: spacing.screenPadding, marginTop: spacing.xl, marginBottom: spacing.lg }}
          >
            <View
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: `${colors.semantic.error}08`,
                borderWidth: 1,
                borderColor: `${colors.semantic.error}20`,
              }}
            >
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowResetConfirm(true);
                }}
                className="flex-row items-center p-4 active:opacity-70"
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${colors.semantic.error}15` }}
                >
                  <RotateCcw size={20} color={colors.semantic.error} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontSize: 17, color: colors.semantic.error }}>
                    Reset App
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.text.tertiary }}>
                    Clear all data and start fresh
                  </Text>
                </View>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      {/* Reset Confirmation Modal */}
      <Modal
        visible={showResetConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResetConfirm(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setShowResetConfirm(false)}
        >
          <Pressable
            onPress={() => {}}
            className="rounded-3xl overflow-hidden mx-6"
            style={{
              backgroundColor: colors.background.secondary,
              width: '85%',
              maxWidth: 340,
            }}
          >
            {/* Warning Icon */}
            <View className="items-center pt-6 pb-4">
              <View
                className="w-16 h-16 rounded-full items-center justify-center"
                style={{ backgroundColor: `${colors.semantic.error}15` }}
              >
                <AlertTriangle size={32} color={colors.semantic.error} />
              </View>
            </View>

            {/* Title & Description */}
            <View className="px-6 pb-4">
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: '700',
                  color: colors.text.primary,
                  textAlign: 'center',
                  marginBottom: 8,
                }}
              >
                Reset App?
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  color: colors.text.secondary,
                  textAlign: 'center',
                  lineHeight: 22,
                }}
              >
                This will delete all your photos, stats, and progress. Your 3 free resizes will be restored. This cannot be undone.
              </Text>
            </View>

            {/* Buttons */}
            <View
              className="flex-row"
              style={{
                borderTopWidth: 1,
                borderTopColor: `${colors.background.tertiary}80`,
              }}
            >
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowResetConfirm(false);
                }}
                className="flex-1 py-4 items-center active:opacity-70"
                style={{
                  borderRightWidth: 1,
                  borderRightColor: `${colors.background.tertiary}80`,
                }}
              >
                <Text style={{ fontSize: 17, fontWeight: '600', color: colors.brand.primary }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleResetApp}
                className="flex-1 py-4 items-center active:opacity-70"
              >
                <Text style={{ fontSize: 17, fontWeight: '600', color: colors.semantic.error }}>
                  Reset
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Photo Editor Modal */}
      <Modal
        visible={showPhotoEditor}
        transparent
        animationType="fade"
        onRequestClose={cancelPhotoEditor}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.95)' }} edges={['top', 'bottom']}>
            {/* Header */}
            <View className="flex-row items-center justify-between px-4 py-3">
              <Pressable
                onPress={cancelPhotoEditor}
                className="w-11 h-11 items-center justify-center rounded-full"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', zIndex: 10 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={24} color="white" />
              </Pressable>
              <Text style={{ fontSize: 17, fontWeight: '600', color: 'white' }}>
                Adjust Photo
              </Text>
              <Pressable
                onPress={confirmProfilePhoto}
                className="w-11 h-11 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.brand.primary, zIndex: 10 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Check size={24} color="white" />
              </Pressable>
            </View>

              {/* Photo preview with circular mask */}
              <View className="flex-1 items-center justify-center">
                <View
                  className="w-72 h-72 rounded-full overflow-hidden items-center justify-center"
                  style={{
                    borderWidth: 3,
                    borderColor: colors.brand.primary,
                  }}
                >
                  {tempPhotoUri && (
                    <GestureDetector gesture={composedGesture}>
                      <Animated.Image
                        source={{ uri: tempPhotoUri }}
                        style={[
                          { width: 288, height: 288 },
                          photoEditorStyle,
                        ]}
                        resizeMode="cover"
                      />
                    </GestureDetector>
                  )}
                </View>

                {/* Instructions */}
                <View className="mt-6 items-center">
                  <View className="flex-row items-center mb-2">
                    <Move size={16} color={colors.text.secondary} />
                    <Text style={{ fontSize: 14, color: colors.text.secondary, marginLeft: 8 }}>
                      Drag to reposition
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <ZoomIn size={16} color={colors.text.secondary} />
                    <Text style={{ fontSize: 14, color: colors.text.secondary, marginLeft: 8 }}>
                      Pinch to zoom
                    </Text>
                  </View>
                </View>
              </View>
          </SafeAreaView>
        </GestureHandlerRootView>
      </Modal>

      {/* Feedback Modal */}
      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
      />
    </View>
  );
}
