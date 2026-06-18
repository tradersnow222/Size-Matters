import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ActivityIndicator,
  ScrollView,
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
  Crown,
  Check,
  Unlock,
  Fish,
} from 'lucide-react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  getOfferings,
  purchasePackage,
  hasEntitlement,
  restorePurchases,
} from '@/lib/revenuecatClient';
import { useAppStore } from '@/lib/store';
import { colors } from '@/lib/design';
import type { PurchasesPackage } from 'react-native-purchases';

// Funny success messages for after purchase
const SUCCESS_MESSAGES = [
  { title: "You're Official!", subtitle: "Your fish tales are now legally believable" },
  { title: "Trophy Unlocked!", subtitle: "Time to make your friends jealous" },
];

const getRandomSuccessMessage = () => {
  return SUCCESS_MESSAGES[Math.floor(Math.random() * SUCCESS_MESSAGES.length)];
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
  const [selectedPlan, setSelectedPlan] = useState<'single' | 'weekly' | 'annual'>('weekly');

  const setPremium = useAppStore((s) => s.setPremium);
  const unlockPhoto = useAppStore((s) => s.unlockPhoto);

  // Reset success state when modal closes
  useEffect(() => {
    if (!visible) {
      setShowSuccess(false);
    }
  }, [visible]);

  // Fetch offerings from RevenueCat
  const { data: offeringsResult, isLoading: isLoadingOfferings } = useQuery({
    queryKey: ['offerings'],
    queryFn: getOfferings,
    enabled: visible,
  });

  const offerings = offeringsResult?.ok ? offeringsResult.data : null;
  const packages = offerings?.current?.availablePackages ?? [];

  // Find specific packages
  const weeklyPackage = packages.find((p) => p.identifier === '$rc_weekly');
  const annualPackage = packages.find((p) => p.identifier === '$rc_annual');
  const singleUnlockPackage = packages.find((p) => p.identifier === '$rc_custom_single_unlock');

  // Purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      const result = await purchasePackage(pkg);
      if (!result.ok) {
        throw new Error(result.reason);
      }
      return { result, packageId: pkg.identifier };
    },
    onSuccess: async ({ result, packageId }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Check if this was a single unlock purchase
      if (packageId === '$rc_custom_single_unlock') {
        // Unlock the specific photo, when one was passed in (Gallery flow).
        // The Home flow has no saved photo yet and instead unlocks the
        // in-progress image via the onSuccess callback.
        if (photoId) {
          unlockPhoto(photoId);
        }
      } else {
        // It's a subscription - check for entitlement
        const entitlementResult = await hasEntitlement('pro');
        if (entitlementResult.ok && entitlementResult.data) {
          setPremium(true);
        }
      }

      // Show success screen with funny message
      setSuccessMessage(getRandomSuccessMessage());
      setShowSuccess(true);

      // Auto-close after showing success
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 3000);
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
      const entitlementResult = await hasEntitlement('pro');
      if (entitlementResult.ok && entitlementResult.data) {
        setPremium(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess();
        onClose();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    },
  });

  const handlePurchase = (pkg: PurchasesPackage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    purchaseMutation.mutate(pkg);
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
                  ) : (
                    <View>
                      {/* Single Unlock Option */}
                      {singleUnlockPackage && (
                        <Pressable
                          onPress={() => {
                            setSelectedPlan('single');
                            handlePurchase(singleUnlockPackage);
                          }}
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

                      {/* Weekly Subscription - Highlighted */}
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
                            style={{ padding: 16, paddingTop: 24, borderRadius: 24 }}
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

                      {/* Annual Subscription - Best Value */}
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

                      {/* Loading overlay */}
                      {isPurchasing && (
                        <View className="absolute inset-0 bg-black/50 items-center justify-center rounded-2xl">
                          <ActivityIndicator size="large" color="#22d3ee" />
                          <Text className="text-white mt-3 text-lg">Processing...</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Terms */}
                  <Text className="text-slate-600 text-sm text-center mt-6">
                    Subscriptions auto-renew unless cancelled 24 hours before the end of the current period.
                  </Text>
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        </LinearGradient>
      </Animated.View>
    </Modal>
  );
}
