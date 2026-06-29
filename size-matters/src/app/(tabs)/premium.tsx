import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
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
  Sparkles,
  Infinity,
  Crown,
  Share2,
  Check,
  Star,
} from 'lucide-react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAppStore } from '@/lib/store';
import { colors, spacing, touchTargets, gradients } from '@/lib/design';
import {
  getOfferings,
  purchasePackage,
  hasEntitlement,
  restorePurchases,
  isRevenueCatEnabled,
} from '@/lib/revenuecatClient';
import { PRIVACY_URL, TERMS_URL } from '@/lib/appConfig';
import { track, syncSubscriptionState } from '@/lib/analytics';
import type { PurchasesPackage } from 'react-native-purchases';

// Every paywall event on this screen shares one placement so the funnel segments cleanly.
const PLACEMENT = 'premium_tab';

const FEATURES = [
  {
    icon: Infinity,
    title: 'Unlimited Resizes',
    description: 'No daily limits on your fish tales',
  },
  {
    icon: Share2,
    title: 'Watermark-Free',
    description: 'Share clean images without branding',
  },
  {
    icon: Star,
    title: 'Early Access',
    description: 'New features before everyone else',
  },
];

export default function PremiumScreen() {
  const isPremium = useAppStore((s) => s.isPremium);
  const setPremium = useAppStore((s) => s.setPremium);
  const [selectedPlan, setSelectedPlan] = useState<'annual'>('annual');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch offerings from RevenueCat
  const { data: offeringsResult, isLoading: isLoadingOfferings } = useQuery({
    queryKey: ['offerings'],
    queryFn: getOfferings,
  });

  const offerings = offeringsResult?.ok ? offeringsResult.data : null;
  const packages = offerings?.current?.availablePackages ?? [];

  // Find specific packages
  const annualPackage = packages.find((p) => p.identifier === '$rc_annual');

  useEffect(() => {
    useAppStore.getState().loadFromStorage();
  }, []);

  // Check subscription status on mount and sync with RevenueCat so isPremium is
  // accurate even if the subscription expired. The `premium` entitlement is the
  // single source of truth used everywhere in the app.
  useEffect(() => {
    const checkSubscription = async () => {
      const result = await hasEntitlement('premium');
      if (result.ok) {
        setPremium(result.data);
      }
    };
    checkSubscription();
  }, [setPremium]);

  // "Paywall Viewed" — fires when the Go Pro tab gains focus (skipped if already premium,
  // since that state shows the "You're a Legend" screen, not a paywall).
  useFocusEffect(
    useCallback(() => {
      if (!isPremium) {
        track('Paywall Viewed', {
          placement: PLACEMENT,
          free_resizes_remaining: useAppStore.getState().freeEditsRemaining,
        });
      }
    }, [isPremium]),
  );

  // Purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      const result = await purchasePackage(pkg);
      if (!result.ok) {
        const err = new Error(result.reason) as Error & { userCancelled?: boolean };
        err.userCancelled = Boolean(
          (result.error as { userCancelled?: boolean } | undefined)?.userCancelled,
        );
        throw err;
      }
      return result.data;
    },
    onSuccess: async (customerInfo) => {
      const granted = Boolean(customerInfo?.entitlements?.active?.['premium']);
      if (granted) {
        setPremium(true);
        syncSubscriptionState();
        track('Purchase Completed', {
          plan_id: '$rc_annual',
          placement: PLACEMENT,
          is_trial: false,
          price: annualPackage?.product.price,
          currency: annualPackage?.product.currencyCode,
        });
        track('Entitlement Changed', { entitlement: 'premium', source: 'purchase' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setErrorMessage("Your purchase went through but didn't unlock yet. Tap Restore Purchases below.");
      }
    },
    onError: (error: unknown) => {
      console.log('Purchase error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      track('Purchase Failed', {
        reason: error instanceof Error ? error.message : 'unknown',
        user_cancelled: Boolean((error as { userCancelled?: boolean })?.userCancelled),
        placement: PLACEMENT,
        plan_id: '$rc_annual',
      });
      setErrorMessage("That didn't go through — you haven't been charged. Try again or Restore Purchases.");
    },
  });

  // Restore purchases mutation
  const restoreMutation = useMutation({
    mutationFn: async () => {
      const result = await restorePurchases();
      if (!result.ok) {
        throw new Error(result.reason);
      }
      return result.data;
    },
    onSuccess: async (customerInfo) => {
      const granted = Boolean(customerInfo?.entitlements?.active?.['premium']);
      track('Purchase Restored', { found_subscription: granted, placement: PLACEMENT });
      if (granted) {
        setPremium(true);
        syncSubscriptionState();
        track('Entitlement Changed', { entitlement: 'premium', source: 'restore' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setErrorMessage('No active subscription was found to restore.');
      }
    },
    onError: (error: unknown) => {
      console.log('Restore error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage("Couldn't restore — check your connection and try again.");
    },
  });

  // Sparkle animation
  const sparkleRotate = useSharedValue(0);
  const sparkleScale = useSharedValue(1);

  useEffect(() => {
    sparkleRotate.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1,
      false
    );
    sparkleScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const sparkleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${sparkleRotate.value}deg` },
      { scale: sparkleScale.value },
    ],
  }));

  const selectedPackage = annualPackage;

  const handleSelect = (plan: 'annual') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setErrorMessage(null);
    setSelectedPlan(plan);
    track('Plan Selected', {
      plan_id: '$rc_annual',
      placement: PLACEMENT,
      price: annualPackage?.product.price,
      currency: annualPackage?.product.currencyCode,
    });
  };

  const handleContinue = () => {
    if (!selectedPackage || isPurchasing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setErrorMessage(null);
    track('Purchase Started', {
      plan_id: selectedPackage.identifier,
      placement: PLACEMENT,
      price: selectedPackage.product.price,
      currency: selectedPackage.product.currencyCode,
    });
    purchaseMutation.mutate(selectedPackage);
  };

  const openLink = (url: string) => {
    Linking.openURL(url).catch((error) => console.log('Could not open link:', error));
  };

  const isPurchasing = purchaseMutation.isPending || restoreMutation.isPending;

  if (isPremium) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background.primary }}>
        <LinearGradient
          colors={['#0B1623', '#1a0f28', '#0B1623']}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        <SafeAreaView
          className="flex-1 items-center justify-center"
          style={{ paddingHorizontal: spacing.screenPadding }}
          edges={['top']}
        >
          <Animated.View style={sparkleAnimatedStyle}>
            <Crown size={80} color={colors.accent.gold} />
          </Animated.View>
          <Text
            style={{
              fontSize: 34,
              lineHeight: 41,
              fontWeight: '700',
              color: colors.text.primary,
              marginTop: spacing.xl,
            }}
          >
            You're a Legend!
          </Text>
          <Text
            style={{
              fontSize: 17,
              color: colors.accent.gold,
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            Enjoy unlimited watermark-free downloads
          </Text>
          <Pressable
            onPress={() => restoreMutation.mutate()}
            className="mt-8 px-6 py-3 rounded-xl"
            style={{
              backgroundColor: `${colors.background.secondary}80`,
              minHeight: touchTargets.minimum,
            }}
          >
            <Text style={{ fontSize: 14, color: colors.text.secondary }}>Restore Purchases</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background.primary }}>
      <LinearGradient
        colors={['#0B1623', '#1a0f28', '#0B1623']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1" edges={['top']}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            className="items-center"
            style={{ paddingTop: spacing.xl, paddingBottom: spacing.md, paddingHorizontal: spacing.screenPadding }}
          >
            <Animated.View style={sparkleAnimatedStyle}>
              <View
                className="w-20 h-20 rounded-full items-center justify-center"
                style={{ backgroundColor: `${colors.accent.gold}20` }}
              >
                <Sparkles size={40} color={colors.accent.gold} />
              </View>
            </Animated.View>
            <Text
              style={{
                fontSize: 34,
                lineHeight: 41,
                fontWeight: '700',
                color: colors.text.primary,
                marginTop: spacing.md,
              }}
            >
              Go Pro Unlimited
            </Text>
            <Text
              style={{
                fontSize: 20,
                fontWeight: '500',
                color: colors.accent.gold,
                textAlign: 'center',
                marginTop: 4,
              }}
            >
              Unlock Watermark-Free Sharing
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: colors.text.secondary,
                textAlign: 'center',
                marginTop: 8,
                paddingHorizontal: spacing.md,
              }}
            >
              Share your legendary catches{'\n'}without the Size Matters branding
            </Text>
          </Animated.View>

          {/* Features */}
          <View style={{ paddingHorizontal: spacing.screenPadding, marginTop: spacing.md }}>
            <View
              className="rounded-3xl p-4"
              style={{
                backgroundColor: `${colors.background.tertiary}50`,
                borderWidth: 1,
                borderColor: `${colors.accent.gold}25`,
              }}
            >
              {FEATURES.map((feature, index) => (
                <Animated.View
                  key={feature.title}
                  entering={FadeInUp.delay(index * 100).duration(400)}
                  className="flex-row items-center py-3"
                  style={index !== FEATURES.length - 1 ? {
                    borderBottomWidth: 1,
                    borderBottomColor: `${colors.background.secondary}50`,
                  } : {}}
                >
                  <View
                    className="w-11 h-11 rounded-full items-center justify-center"
                    style={{ backgroundColor: `${colors.accent.gold}20` }}
                  >
                    <feature.icon size={22} color={colors.accent.gold} />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text.primary }}>
                      {feature.title}
                    </Text>
                    <Text style={{ fontSize: 14, color: colors.text.secondary }}>
                      {feature.description}
                    </Text>
                  </View>
                  <Check size={22} color={colors.semantic.success} />
                </Animated.View>
              ))}
            </View>
          </View>

          {/* Pricing */}
          <Animated.View
            entering={FadeInUp.delay(500).duration(400)}
            style={{ paddingHorizontal: spacing.screenPadding, marginTop: spacing.xl }}
          >
            {isLoadingOfferings ? (
              <View className="py-8 items-center">
                <ActivityIndicator size="large" color="#22d3ee" />
                <Text className="text-slate-400 mt-2">Loading plans...</Text>
              </View>
            ) : !isRevenueCatEnabled() ? (
              <View className="rounded-3xl p-6 bg-slate-800/50 border border-slate-700">
                <Text className="text-white text-center text-lg font-semibold">
                  Payments Not Available
                </Text>
                <Text className="text-slate-400 text-center mt-2">
                  Please use the mobile app to subscribe
                </Text>
              </View>
            ) : (
              <>
                {/* Annual Option - Best Value */}
                {annualPackage && (
                  <Pressable
                    onPress={() => handleSelect('annual')}
                    disabled={isPurchasing}
                    className="rounded-3xl px-5 py-6 mb-4"
                    style={{
                      backgroundColor: selectedPlan === 'annual' ? `${colors.semantic.success}15` : `${colors.semantic.success}05`,
                      borderWidth: selectedPlan === 'annual' ? 3 : 2,
                      borderColor: selectedPlan === 'annual' ? colors.semantic.success : `${colors.semantic.success}30`,
                      opacity: selectedPlan === 'annual' ? 1 : 0.6,
                    }}
                  >
                    <View className="absolute top-0 right-0 bg-green-500 px-4 py-1.5 rounded-bl-2xl rounded-tr-3xl">
                      <Text className="text-xs font-bold text-black">BEST VALUE</Text>
                    </View>

                    {selectedPlan === 'annual' && (
                      <View className="absolute top-3 left-3">
                        <View
                          className="w-5 h-5 rounded-full items-center justify-center"
                          style={{ backgroundColor: colors.semantic.success }}
                        >
                          <Check size={14} color={colors.background.primary} strokeWidth={3} />
                        </View>
                      </View>
                    )}

                    <View className="flex-row items-center justify-between mt-1">
                      <View>
                        <Text style={{ fontSize: 20, fontWeight: '700', color: selectedPlan === 'annual' ? colors.text.primary : colors.text.secondary }}>
                          Annual Pro
                        </Text>
                        <Text style={{ fontSize: 14, color: colors.semantic.success }}>
                          Unlimited resizes, all year
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.semantic.success }}>
                          {annualPackage.product.priceString}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.text.secondary }}>/year</Text>
                      </View>
                    </View>
                  </Pressable>
                )}

                {/* Error message (surfaced, not silent) */}
                {errorMessage && (
                  <View
                    className="rounded-2xl px-4 py-3 mb-3"
                    style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)' }}
                  >
                    <Text style={{ fontSize: 14, color: '#FCA5A5', textAlign: 'center' }}>
                      {errorMessage}
                    </Text>
                  </View>
                )}

                {/* Continue — select-then-confirm avoids accidental charges */}
                <Pressable
                  onPress={handleContinue}
                  disabled={!selectedPackage || isPurchasing}
                  className="rounded-2xl py-4 mb-1"
                  style={{ backgroundColor: colors.accent.gold, opacity: !selectedPackage || isPurchasing ? 0.5 : 1 }}
                >
                  <Text style={{ textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.background.primary }}>
                    {isPurchasing ? 'Processing…' : 'Continue'}
                  </Text>
                </Pressable>

                {/* Restore Purchases */}
                <Pressable
                  onPress={() => restoreMutation.mutate()}
                  disabled={isPurchasing}
                  className="py-3"
                >
                  <Text style={{ textAlign: 'center', fontSize: 14, color: colors.brand.primary }}>
                    Restore Purchases
                  </Text>
                </Pressable>

                <Text style={{ textAlign: 'center', fontSize: 12, color: colors.text.tertiary, marginTop: spacing.sm }}>
                  Cancel anytime. Auto-renews unless cancelled 24 hours before period ends. Payment is charged to your Apple ID.
                </Text>

                {/* Terms of Use + Privacy Policy — required on the subscription screen (3.1.2) */}
                <View className="flex-row items-center justify-center mt-3">
                  <Pressable onPress={() => openLink(TERMS_URL)} hitSlop={8}>
                    <Text style={{ fontSize: 13, color: colors.text.secondary, textDecorationLine: 'underline' }}>
                      Terms of Use
                    </Text>
                  </Pressable>
                  <Text style={{ fontSize: 13, color: colors.text.tertiary, marginHorizontal: 8 }}>•</Text>
                  <Pressable onPress={() => openLink(PRIVACY_URL)} hitSlop={8}>
                    <Text style={{ fontSize: 13, color: colors.text.secondary, textDecorationLine: 'underline' }}>
                      Privacy Policy
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </Animated.View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
