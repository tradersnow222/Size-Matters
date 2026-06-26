import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
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
  MessageSquare,
  Heart,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react-native';
import { useAppStore } from '@/lib/store';
import { colors, spacing, touchTargets, gradients } from '@/lib/design';
import { sendFeedbackEmail } from '@/lib/appConfig';

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

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const resetAllData = useAppStore((s) => s.resetAllData);

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

  // Pick a new profile photo. The system image picker provides a square
  // crop/zoom editor (allowsEditing + 1:1 aspect) and we persist exactly what
  // the user crops, so no separate (non-persisting) editor is needed.
  const pickProfilePhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProfilePhoto(result.assets[0].uri);
    }
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
                  sendFeedbackEmail('Size Matters Feedback', '');
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
              Size Matters v{Constants.expoConfig?.version ?? '1.0.0'}
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
                This will delete all your photos, stats, and progress. Your free resize will be restored. This cannot be undone.
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
    </View>
  );
}
