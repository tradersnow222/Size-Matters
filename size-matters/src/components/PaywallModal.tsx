import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
  ZoomIn,
} from 'react-native-reanimated';
import {
  X,
  Check,
  Unlock,
  Fish,
} from 'lucide-react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
} from '@/lib/revenuecatClient';
import { useAppStore } from '@/lib/store';
import { colors } from '@/lib/design';
import { PRIVACY_URL, TERMS_URL, SUPPORT_EMAIL } from '@/lib/appConfig';
import type { PurchasesPackage } from 'react-native-purchases';

// Funny success messages for after purchase
const SUCCESS_MESSAGES = [
  { title: "You're Official!", subtitle: "Your fish tales are now legally believable" },
  { title: "Trophy Unlocked!", subtitle: "Time to make your friends jealous" },
];

const getRandomSuccessMessage = () => {
  return SUCCESS_MESSAGES[Math.floor(Math.random() * SUCCESS_MESSAGES.length)];
};

// Turn an internal RevenueCat failure reason into something a human can act on.
const friendlyPurchaseError = (reason?: string): string => {
  switch (reason) {
    case 'not_configured':
    case 'web_not_supported':
      return "Purchases aren't available on this device right now.";
    default:
      return "That didn't go through — you haven't been charged. Check your connection and try again, or Restore Purchases.";
  }
};

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  photoId?: string; // If provided, we're unlocking a specific photo
}

export function PaywallModal({ visible, onClose, onSuccess, photoId }: PaywallModalProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState(getRandomSuccessMessage());
  const [selectedPlan, setSelectedPlan] = useState<'single' | 'annual'>('annual');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setPremium = useAppStore((s) => s.setPremium);
  const unlockPhoto = useAppStore((s) => s.unlockPhoto);

  // Reset transient state when the modal closes
  useEffect(() => {
    if (!visible) {
      setShowSuccess(false);
      setErrorMessage(null);
    }
  }, [visible]);

  // Fetch offerings from RevenueCat
  const {
    data: offeringsResult,
    isLoading: isLoadingOfferings,
    refetch: refetchOfferings,
    isFetching: isFetchingOfferings,
  } = useQuery({
    queryKey: ['offerings'],
    queryFn: getOfferings,
    enabled: visible,
  });

  const offerings = offeringsResult?.ok ? offeringsResult.data : null;
  const packages = offerings?.current?.availablePackages ?? [];

  // Find specific packages
  const annualPackage = packages.find((p) => p.identifier === '$rc_annual');
  const singleUnlockPackage = packages.find((p) => p.identifier === '$rc_custom_single_unlock');

  const hasAnyPackage = Boolean(annualPackage || singleUnlockPackage);

  // If the selected plan has no matching package, fall back to one that exists
  // so Continue is never a dead button.
  useEffect(() => {
    const byPlan = { single: singleUnlockPackage, annual: annualPackage };
    if (!byPlan[selectedPlan]) {
      if (annualPackage) setSelectedPlan('annual');
      else if (singleUnlockPackage) setSelectedPlan('single');
    }
  }, [annualPackage, singleUnlockPackage, selectedPlan]);

  const selectedPackage =
    selectedPlan === 'single' ? singleUnlockPackage : annualPackage;

  // Purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      const result = await purchasePackage(pkg);
      if (!result.ok) {
        throw new Error(result.reason);
      }
      return { customerInfo: result.data, packageId: pkg.identifier };
    },
    onSuccess: async ({ customerInfo, packageId }) => {
      // Verify the purchase actually granted access before celebrating.
      let granted = false;
      if (packageId === '$rc_custom_single_unlock') {
        // Single-photo unlock: the Apple transaction completing IS the grant.
        if (photoId) {
          unlockPhoto(photoId);
        }
        granted = true;
      } else {
        // Subscription: confirm the `premium` entitlement is actually active.
        granted = Boolean(customerInfo?.entitlements?.active?.['premium']);
        if (granted) {
          setPremium(true);
        }
      }

      if (!granted) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setErrorMessage(
          "Your purchase went through but didn't unlock yet. Tap Restore Purchases, or email " +
            SUPPORT_EMAIL + " and we'll sort it out.",
        );
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessMessage(getRandomSuccessMessage());
      setShowSuccess(true);

      // Auto-close after showing success
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 3000);
    },
    onError: (error: unknown) => {
      console.log('Purchase error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const reason = error instanceof Error ? error.message : undefined;
      setErrorMessage(friendlyPurchaseError(reason));
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
      if (granted) {
        setPremium(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess();
        onClose();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setErrorMessage('No active subscription was found to restore.');
      }
    },
    onError: (error: unknown) => {
      console.log('Restore error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const reason = error instanceof Error ? error.message : undefined;
      setErrorMessage(friendlyPurchaseError(reason));
    },
  });

  const handleSelect = (plan: 'single' | 'annual') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setErrorMessage(null);
    setSelectedPlan(plan);
  };

  const handleContinue = () => {
    if (!selectedPackage || isPurchasing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setErrorMessage(null);
    purchaseMutation.mutate(selectedPackage);
  };

  const openLink = (url: string) => {
    Linking.openURL(url).catch((error) => console.log('Could not open link:', error));
  };

  const isPurchasing = purchaseMutation.isPending || restoreMutation.isPending;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={{ flex: 1 }}
      >
        <LinearGradient
          colors={['#0a1628', '#1a0f28', '#0B1623']}
          style={{ flex: 1 }}
        >
          <SafeAreaView style={{ flex: 1 }}>
            {/* Close button - fixed at top */}
            <View className="absolute top-14 right-5 z-10">
              <Pressable
                onPress={onClose}
                className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"
              >
                <X size={20} color="white" />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Success Screen */}
              {showSuccess ? (
                <Animated.View
                  entering={ZoomIn.duration(300).springify()}
                  className="flex-1 items-center justify-center py-8"
                >
                  {/* Success Icon */}
                  <View className="w-24 h-24 rounded-full bg-green-500/20 items-center justify-center mb-6">
                    <Fish size={48} color="#22c55e" />
                  </View>

                  {/* Checkmark badge */}
                  <View className="absolute top-1/3 right-1/3 w-10 h-10 rounded-full bg-green-500 items-center justify-center">
                    <Check size={22} color="white" strokeWidth={3} />
                  </View>

                  {/* Title */}
                  <Text className="text-3xl font-bold text-white text-center mb-3">
                    {successMessage.title}
                  </Text>

                  {/* Subtitle */}
                  <Text className="text-cyan-400 text-center text-xl mb-6">
                    {successMessage.subtitle}
                  </Text>

                  {/* Fish emoji decoration */}
                  <Text className="text-4xl">🐟</Text>
                </Animated.View>
              ) : (
                <View className="flex-1">
                  {/* Header */}
                  <View className="items-center mb-8 mt-8">
                    <View className="w-20 h-20 rounded-full bg-amber-500/20 items-center justify-center mb-4">
                      <Unlock size={40} color="#f59e0b" />
                    </View>
                    <Text className="text-3xl font-bold text-white text-center">
                      Remove Watermark
                    </Text>
                    <Text className="text-slate-400 text-center mt-2 text-lg">
                      Share your legendary catch without branding
                    </Text>
                  </View>

                  {isLoadingOfferings ? (
                    <View className="py-12 items-center">
                      <ActivityIndicator size="large" color="#22d3ee" />
                      <Text className="text-slate-400 mt-3 text-lg">Loading options...</Text>
                    </View>
                  ) : !hasAnyPackage ? (
                    /* Offerings failed or empty — never show a buttonless paywall */
                    <View className="py-8 items-center">
                      <Text className="text-white text-center text-lg font-semibold">
                        Couldn't load plans
                      </Text>
                      <Text className="text-slate-400 text-center mt-2 mb-6 px-4">
                        Check your connection and try again. Already subscribed? Restore your purchase below.
                      </Text>
                      <Pressable
                        onPress={() => refetchOfferings()}
                        disabled={isFetchingOfferings}
                        className="px-6 py-3 rounded-2xl mb-3"
                        style={{ backgroundColor: colors.brand.primary }}
                      >
                        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.background.primary }}>
                          {isFetchingOfferings ? 'Loading…' : 'Try Again'}
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => restoreMutation.mutate()} disabled={isPurchasing} className="py-3">
                        <Text style={{ fontSize: 14, color: colors.brand.primary }}>Restore Purchases</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View>
                      {/* Single Unlock Option */}
                      {singleUnlockPackage && (
                        <Pressable
                          onPress={() => handleSelect('single')}
                          disabled={isPurchasing}
                          className="rounded-3xl px-5 py-7 mb-4"
                          style={{
                            backgroundColor: selectedPlan === 'single' ? `${colors.brand.primary}15` : `${colors.brand.primary}05`,
                            borderWidth: selectedPlan === 'single' ? 3 : 2,
                            borderColor: selectedPlan === 'single' ? colors.brand.primary : `${colors.brand.primary}30`,
                            opacity: selectedPlan === 'single' ? 1 : 0.6,
                          }}
                        >
                          {selectedPlan === 'single' && (
                            <View className="absolute top-3 left-3">
                              <View
                                className="w-5 h-5 rounded-full items-center justify-center"
                                style={{ backgroundColor: colors.brand.primary }}
                              >
                                <Check size={14} color={colors.background.primary} strokeWidth={3} />
                              </View>
                            </View>
                          )}

                          <View className="flex-row items-center justify-between">
                            <View>
                              <Text style={{ fontSize: 20, fontWeight: '700', color: selectedPlan === 'single' ? colors.text.primary : colors.text.secondary }}>
                                Unlock this photo only
                              </Text>
                              <Text style={{ fontSize: 14, color: colors.text.secondary }}>
                                One-time purchase for this image
                              </Text>
                            </View>
                            <View className="items-end">
                              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.brand.primary }}>
                                {singleUnlockPackage.product.priceString}
                              </Text>
                            </View>
                          </View>
                        </Pressable>
                      )}

                      {/* Divider */}
                      <View className="flex-row items-center my-6">
                        <View className="flex-1 h-px bg-slate-700" />
                        <Text className="text-slate-500 mx-4 text-base">OR GO PRO UNLIMITED</Text>
                        <View className="flex-1 h-px bg-slate-700" />
                      </View>

                      {/* Annual Subscription - Best Value */}
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

                      {/* Error message (purchase/restore failures are surfaced, not silent) */}
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

                      {/* Continue / confirm purchase — select-then-confirm avoids accidental charges */}
                      <Pressable
                        onPress={handleContinue}
                        disabled={!selectedPackage || isPurchasing}
                        className="rounded-2xl py-4 mb-1"
                        style={{
                          backgroundColor: colors.accent.gold,
                          opacity: !selectedPackage || isPurchasing ? 0.5 : 1,
                        }}
                      >
                        <Text style={{ textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.background.primary }}>
                          {selectedPlan === 'single' ? 'Unlock This Photo' : 'Continue'}
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

                      {/* Loading overlay */}
                      {isPurchasing && (
                        <View className="absolute inset-0 bg-black/50 items-center justify-center rounded-2xl">
                          <ActivityIndicator size="large" color="#22d3ee" />
                          <Text className="text-white mt-3 text-lg">Processing...</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Auto-renew disclosure */}
                  <Text className="text-slate-600 text-sm text-center mt-6">
                    Subscriptions auto-renew unless cancelled 24 hours before the end of the current period. Payment is charged to your Apple ID.
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
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        </LinearGradient>
      </Animated.View>
    </Modal>
  );
}
