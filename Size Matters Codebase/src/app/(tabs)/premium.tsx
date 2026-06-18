import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
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
  Fish,
  Infinity,
  Zap,
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
  hasActiveSubscription,
  restorePurchases,
  isRevenueCatEnabled,
} from '@/lib/revenuecatClient';
import type { PurchasesPackage } from 'react-native-purchases';

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

const TESTIMONIALS = [
  {
    name: 'BigBass_Bob',
    text: "Now my 6-inch bluegill looks like a trophy bass. My buddies are FURIOUS.",
    rating: 5,
  },
];

export default function PremiumScreen() {
  const isPremium = useAppStore((s) => s.isPremium);
  const setPremium = useAppStore((s) => s.setPremium);
  const [selectedPlan, setSelectedPlan] = useState<'weekly' | 'annual'>('weekly');

  // Fetch offerings from RevenueCat
  const { data: offeringsResult, isLoading: isLoadingOfferings } = useQuery({
    queryKey: ['offerings'],
    queryFn: getOfferings,
  });

  const offerings = offeringsResult?.ok ? offeringsResult.data : null;
  const packages = offerings?.current?.availablePackages ?? [];

  // Find specific packages
  const weeklyPackage = packages.find((p) => p.identifier === '$rc_weekly');
  const annualPackage = packages.find((p) => p.identifier === '$rc_annual');

  useEffect(() => {
    useAppStore.getState().loadFromStorage();
  }, []);

  // Check subscription status on mount and sync with RevenueCat
  // This ensures isPremium is accurate even if the subscription expired
  // We use hasActiveSubscription instead of hasEntitlement to avoid
  // false positives from consumable purchases in Test Store
  useEffect(() => {
    const checkSubscription = async () => {
      const result = await hasActiveSubscription();
      if (result.ok) {
        // Sync local state with actual subscription status
        setPremium(result.data);
      }
    };
    checkSubscription();
  }, [setPremium]);

  // Purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      const result = await purchasePackage(pkg);
      if (!result.ok) {
        throw new Error(result.reason);
      }
      return result;
    },
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const subscriptionResult = await hasActiveSubscription();
      if (subscriptionResult.ok && subscriptionResult.data) {
        setPremium(true);
      }
    },
    onError: (error) => {
      console.log('Purchase error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  // Restore purchases mutation
  const restoreMutation = useMutation({
    mutationFn: async () => {
      const result = await restorePurchases();
      if (!result.ok) {
        throw new Error(result.reason);
      }
      return result;
    },
    onSuccess: async () => {
      const subscriptionResult = await hasActiveSubscription();
      if (subscriptionResult.ok && subscriptionResult.data) {
        setPremium(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
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

  const handlePurchase = (pkg: PurchasesPackage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    purchaseMutation.mutate(pkg);
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
                {/* Weekly Option - Highlighted */}
                {weeklyPackage && (
                  <Pressable
                    onPress={() => {
                      setSelectedPlan('weekly');
                      handlePurchase(weeklyPackage);
                    }}
                    disabled={isPurchasing}
                    className="rounded-3xl overflow-hidden mb-4"
                    style={{
                      borderWidth: selectedPlan === 'weekly' ? 3 : 2,
                      borderColor: selectedPlan === 'weekly' ? colors.accent.gold : `${colors.accent.gold}30`,
                      opacity: selectedPlan === 'weekly' ? 1 : 0.6,
                    }}
                  >
                    <LinearGradient
                      colors={selectedPlan === 'weekly' ? ['#451a03', '#1a0f28'] : ['#1a1a1a', '#0f0f0f']}
                      style={{ padding: spacing.md, paddingTop: spacing.lg, borderRadius: 24 }}
                    >
                      <View className="absolute top-0 right-0 bg-amber-500 px-4 py-1.5 rounded-bl-2xl">
                        <Text className="text-xs font-bold text-black">MOST POPULAR</Text>
                      </View>

                      {selectedPlan === 'weekly' && (
                        <View className="absolute top-4 left-4">
                          <View
                            className="w-6 h-6 rounded-full items-center justify-center"
                            style={{ backgroundColor: colors.accent.gold }}
                          >
                            <Check size={16} color={colors.background.primary} strokeWidth={3} />
                          </View>
                        </View>
                      )}

                      <View className="flex-row items-baseline justify-center mt-2">
                        <Text style={{ fontSize: 32, fontWeight: '700', color: selectedPlan === 'weekly' ? colors.text.primary : colors.text.secondary }}>
                          {weeklyPackage.product.priceString}
                        </Text>
                        <Text style={{ fontSize: 18, color: colors.text.secondary, marginLeft: 4 }}>/week</Text>
                      </View>

                      <Text style={{ textAlign: 'center', fontSize: 15, color: colors.text.secondary, marginTop: 4 }}>
                        Perfect for fishing season
                      </Text>
                    </LinearGradient>
                  </Pressable>
                )}

                {/* Annual Option - Best Value */}
                {annualPackage && (
                  <Pressable
                    onPress={() => {
                      setSelectedPlan('annual');
                      handlePurchase(annualPackage);
                    }}
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
                          Save 80% vs weekly
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
                  Cancel anytime. Auto-renews unless cancelled 24 hours before period ends.
                </Text>
              </>
            )}
          </Animated.View>

          {/* Testimonials */}
          <Animated.View
            entering={FadeInUp.delay(600).duration(400)}
            style={{ paddingHorizontal: spacing.screenPadding, marginTop: spacing.xxl }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: '700',
                color: colors.text.primary,
                textAlign: 'center',
                marginBottom: spacing.md,
              }}
            >
              What Fellow Anglers Say
            </Text>
            {TESTIMONIALS.map((testimonial) => (
              <View
                key={testimonial.name}
                className="rounded-2xl p-4 mb-3"
                style={{
                  backgroundColor: `${colors.background.tertiary}50`,
                  borderWidth: 1,
                  borderColor: `${colors.background.secondary}50`,
                }}
              >
                <View className="flex-row items-center mb-2">
                  <View
                    className="w-9 h-9 rounded-full items-center justify-center"
                    style={{ backgroundColor: `${colors.brand.primary}30` }}
                  >
                    <Fish size={18} color={colors.brand.primary} />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.brand.primary, marginLeft: 8 }}>
                    {testimonial.name}
                  </Text>
                  <View className="flex-row ml-auto">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} size={14} color={colors.accent.gold} fill={colors.accent.gold} />
                    ))}
                  </View>
                </View>
                <Text style={{ fontSize: 15, color: colors.text.secondary, fontStyle: 'italic' }}>
                  "{testimonial.text}"
                </Text>
              </View>
            ))}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
