import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, SlideInUp } from 'react-native-reanimated';
import { X, Send } from 'lucide-react-native';
import { colors, spacing } from '@/lib/design';
import { useAppStore } from '@/lib/store';
import { requestAppReview, sendFeedbackEmail } from '@/lib/appConfig';

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

type FeedbackStep = 'initial' | 'positive' | 'negative' | 'submitted';

export function FeedbackModal({ visible, onClose }: FeedbackModalProps) {
  const [step, setStep] = useState<FeedbackStep>('initial');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setHasRatedApp = useAppStore((s) => s.setHasRatedApp);
  const setHasProvidedFeedback = useAppStore((s) => s.setHasProvidedFeedback);
  const setLastFeedbackPromptTime = useAppStore((s) => s.setLastFeedbackPromptTime);

  const handlePositive = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep('positive');
  };

  const handleNegative = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep('negative');
  };

  const handleRateOnAppStore = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setHasRatedApp(true);
    setLastFeedbackPromptTime(Date.now());

    // Apple's NATIVE in-app review sheet (guideline-compliant), with a
    // write-review deep-link fallback handled inside requestAppReview().
    await requestAppReview();

    setStep('submitted');
    setTimeout(() => {
      onClose();
      resetModal();
    }, 2000);
  };

  const handleSubmitFeedback = async () => {
    if (!feedback.trim()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);

    // Deliver the feedback to the support inbox (native mail composer, with a
    // mailto fallback) so it is never silently dropped.
    await sendFeedbackEmail('Size Matters Feedback', feedback.trim());

    setHasProvidedFeedback(true);
    setLastFeedbackPromptTime(Date.now());
    setIsSubmitting(false);
    setStep('submitted');

    setTimeout(() => {
      onClose();
      resetModal();
    }, 2000);
  };

  const handleMaybeLater = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLastFeedbackPromptTime(Date.now());
    onClose();
    resetModal();
  };

  const resetModal = () => {
    setStep('initial');
    setFeedback('');
    setIsSubmitting(false);
  };

  const handleClose = () => {
    onClose();
    resetModal();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <Pressable
          onPress={handleClose}
          style={{
            flex: 1,
            backgroundColor: 'rgba(10, 22, 40, 0.9)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.screenPadding,
          }}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Animated.View
              entering={SlideInUp.springify().damping(20)}
              style={{
                backgroundColor: '#0B1623',
                borderRadius: 24,
                padding: spacing.xl,
                width: '100%',
                maxWidth: 340,
                borderWidth: 2,
                borderColor: '#155E75',
              }}
            >
              {/* Close button */}
              <Pressable
                onPress={handleClose}
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                }}
              >
                <X size={18} color="#64748B" />
              </Pressable>

              {step === 'initial' && (
                <Animated.View entering={FadeIn.duration(300)}>
                  {/* Fish emoji */}
                  <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
                    <Text style={{ fontSize: 56 }}>🐟</Text>
                  </View>

                  {/* Title */}
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: '700',
                      color: '#FFFFFF',
                      textAlign: 'center',
                      marginBottom: spacing.xs,
                    }}
                  >
                    Loving your catch?
                  </Text>

                  <Text
                    style={{
                      fontSize: 16,
                      color: '#94A3B8',
                      textAlign: 'center',
                      marginBottom: spacing.xl,
                      lineHeight: 22,
                    }}
                  >
                    How's your experience with Size Matters so far?
                  </Text>

                  {/* Buttons */}
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Pressable
                      onPress={handleNegative}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 16,
                        borderRadius: 14,
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        borderWidth: 1,
                        borderColor: 'rgba(239, 68, 68, 0.3)',
                        gap: 8,
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>😕</Text>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: '#F87171' }}>
                        Not Great
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handlePositive}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 16,
                        borderRadius: 14,
                        backgroundColor: '#22C55E',
                        gap: 8,
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>😍</Text>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: 'white' }}>
                        Love It!
                      </Text>
                    </Pressable>
                  </View>
                </Animated.View>
              )}

              {step === 'positive' && (
                <Animated.View entering={FadeIn.duration(300)}>
                  {/* Star emoji */}
                  <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
                    <Text style={{ fontSize: 56 }}>⭐</Text>
                  </View>

                  {/* Title */}
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: '700',
                      color: '#FFFFFF',
                      textAlign: 'center',
                      marginBottom: spacing.xs,
                    }}
                  >
                    You're awesome! 🎣
                  </Text>

                  <Text
                    style={{
                      fontSize: 16,
                      color: '#94A3B8',
                      textAlign: 'center',
                      marginBottom: spacing.xl,
                      lineHeight: 24,
                    }}
                  >
                    Would you take 30 seconds to leave a review? It helps other anglers find us!
                  </Text>

                  {/* Rate Button */}
                  <Pressable
                    onPress={handleRateOnAppStore}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 16,
                      borderRadius: 14,
                      backgroundColor: '#FBBF24',
                      gap: 8,
                      marginBottom: spacing.sm,
                    }}
                  >
                    <Text style={{ fontSize: 20 }}>⭐</Text>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: '#0B1623' }}>
                      Leave a Review
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={handleMaybeLater}
                    style={{
                      alignItems: 'center',
                      paddingVertical: 12,
                    }}
                  >
                    <Text style={{ fontSize: 15, color: '#64748B' }}>
                      Maybe Later
                    </Text>
                  </Pressable>
                </Animated.View>
              )}

              {step === 'negative' && (
                <Animated.View entering={FadeIn.duration(300)}>
                  {/* Thinking emoji */}
                  <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
                    <Text style={{ fontSize: 56 }}>🤔</Text>
                  </View>

                  {/* Title */}
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: '700',
                      color: '#FFFFFF',
                      textAlign: 'center',
                      marginBottom: spacing.xs,
                    }}
                  >
                    We want to improve!
                  </Text>

                  <Text
                    style={{
                      fontSize: 16,
                      color: '#94A3B8',
                      textAlign: 'center',
                      marginBottom: spacing.lg,
                      lineHeight: 22,
                    }}
                  >
                    What can we do better? Your feedback goes directly to our team.
                  </Text>

                  {/* Text Input */}
                  <TextInput
                    value={feedback}
                    onChangeText={setFeedback}
                    placeholder="Tell us what's on your mind..."
                    placeholderTextColor="#64748B"
                    multiline
                    numberOfLines={4}
                    style={{
                      backgroundColor: '#142536',
                      borderRadius: 14,
                      padding: 16,
                      color: '#FFFFFF',
                      fontSize: 16,
                      minHeight: 110,
                      textAlignVertical: 'top',
                      marginBottom: spacing.md,
                      borderWidth: 1,
                      borderColor: '#155E75',
                    }}
                  />

                  {/* Submit Button */}
                  <Pressable
                    onPress={handleSubmitFeedback}
                    disabled={!feedback.trim() || isSubmitting}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 16,
                      borderRadius: 14,
                      backgroundColor: feedback.trim() ? '#00D4FF' : 'rgba(0, 212, 255, 0.3)',
                      gap: 8,
                    }}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <Send size={18} color={feedback.trim() ? '#0B1623' : '#64748B'} />
                        <Text style={{
                          fontSize: 16,
                          fontWeight: '600',
                          color: feedback.trim() ? '#0B1623' : '#64748B',
                        }}>
                          Send Feedback
                        </Text>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={handleMaybeLater}
                    style={{
                      alignItems: 'center',
                      paddingVertical: 12,
                      marginTop: spacing.xs,
                    }}
                  >
                    <Text style={{ fontSize: 15, color: '#64748B' }}>
                      Skip
                    </Text>
                  </Pressable>
                </Animated.View>
              )}

              {step === 'submitted' && (
                <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: 'center' }}>
                  {/* Success emoji */}
                  <View style={{ marginBottom: spacing.md }}>
                    <Text style={{ fontSize: 64 }}>🙏</Text>
                  </View>

                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: '700',
                      color: '#FFFFFF',
                      textAlign: 'center',
                      marginBottom: spacing.xs,
                    }}
                  >
                    Thank You! 💙
                  </Text>

                  <Text
                    style={{
                      fontSize: 16,
                      color: '#94A3B8',
                      textAlign: 'center',
                      lineHeight: 22,
                    }}
                  >
                    Your feedback helps us make{'\n'}Size Matters even better!
                  </Text>
                </Animated.View>
              )}
            </Animated.View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
