import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { Send, X, Frown, Meh, ThumbsDown, HelpCircle, Sparkles } from 'lucide-react-native';
import { useAppStore } from '@/lib/store';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type FeedbackReason =
  | 'not_using'
  | 'too_expensive'
  | 'missing_features'
  | 'bugs'
  | 'other';

const feedbackReasons: { id: FeedbackReason; label: string; icon: React.ReactNode }[] = [
  { id: 'not_using', label: "I don't use it enough", icon: <Meh size={20} color="#94A3B8" /> },
  { id: 'too_expensive', label: "It's too expensive", icon: <ThumbsDown size={20} color="#94A3B8" /> },
  { id: 'missing_features', label: "Missing features I need", icon: <Sparkles size={20} color="#94A3B8" /> },
  { id: 'bugs', label: "Too many bugs/issues", icon: <Frown size={20} color="#94A3B8" /> },
  { id: 'other', label: "Something else", icon: <HelpCircle size={20} color="#94A3B8" /> },
];

export default function FeedbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedReason, setSelectedReason] = useState<FeedbackReason | null>(null);
  const [additionalFeedback, setAdditionalFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const setHasProvidedFeedback = useAppStore((s) => s.setHasProvidedFeedback);
  const setLastFeedbackPromptTime = useAppStore((s) => s.setLastFeedbackPromptTime);

  const handleSelectReason = (reason: FeedbackReason) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedReason(reason);
  };

  const handleSubmit = async () => {
    if (!selectedReason) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);

    // Log feedback - in production, send to your backend
    console.log('Deletion feedback submitted:', {
      reason: selectedReason,
      additionalFeedback: additionalFeedback.trim() || null,
      timestamp: new Date().toISOString(),
      source: 'quick_action',
    });

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setHasProvidedFeedback(true);
    setLastFeedbackPromptTime(Date.now());
    setIsSubmitting(false);
    setIsSubmitted(true);

    // Auto-close after showing thank you
    setTimeout(() => {
      router.back();
    }, 2500);
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      {/* Transparent overlay to tap to dismiss */}
      <Pressable
        onPress={handleClose}
        style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      />

      {/* 3/4 Sheet Modal */}
      <Animated.View
        entering={SlideInDown.springify().damping(20)}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: SCREEN_HEIGHT * 0.75,
          backgroundColor: '#0A1628',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          overflow: 'hidden',
        }}
      >
        {/* Drag Handle */}
        <View className="items-center pt-3 pb-2">
          <View
            style={{
              width: 40,
              height: 5,
              backgroundColor: '#334155',
              borderRadius: 3,
            }}
          />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!isSubmitted ? (
              <Animated.View entering={FadeIn.duration(400)}>
                {/* Header with Title */}
                <View className="items-center mt-4 mb-5">
                  {/* Title with Fish */}
                  <View className="flex-row items-center gap-2">
                    <Text className="text-white text-2xl font-bold">
                      Deleting
                    </Text>
                    <Text style={{ fontSize: 28 }}>🐟</Text>
                    <Text className="text-white text-2xl font-bold">
                      Size Matters?
                    </Text>
                  </View>

                  <Text className="text-slate-400 text-base mt-3 text-center leading-6">
                    We're sad to see you go! Help us improve{'\n'}by sharing why you're leaving.
                  </Text>
                </View>

                {/* Reason Selection */}
                <View className="gap-3">
                  {feedbackReasons.map((reason, index) => (
                    <Animated.View
                      key={reason.id}
                      entering={FadeInDown.delay(index * 60).duration(250)}
                    >
                      <Pressable
                        onPress={() => handleSelectReason(reason.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 16,
                          borderRadius: 14,
                          backgroundColor: selectedReason === reason.id ? 'rgba(0, 212, 255, 0.15)' : '#0F1D2E',
                          borderWidth: 2,
                          borderColor: selectedReason === reason.id ? '#00D4FF' : '#1E3A5F',
                          gap: 12,
                        }}
                      >
                        {reason.icon}
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 16,
                            color: selectedReason === reason.id ? '#00D4FF' : '#CBD5E1',
                            fontWeight: selectedReason === reason.id ? '600' : '400',
                          }}
                        >
                          {reason.label}
                        </Text>
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 2,
                            borderColor: selectedReason === reason.id ? '#00D4FF' : '#475569',
                            backgroundColor: selectedReason === reason.id ? '#00D4FF' : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {selectedReason === reason.id && (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: '#0A1628',
                              }}
                            />
                          )}
                        </View>
                      </Pressable>
                    </Animated.View>
                  ))}
                </View>

                {/* Additional Feedback */}
                <Animated.View entering={FadeInDown.delay(350).duration(250)} className="mt-5">
                  <Text className="text-slate-400 text-sm mb-2 ml-1">
                    Anything else? (optional)
                  </Text>
                  <TextInput
                    value={additionalFeedback}
                    onChangeText={setAdditionalFeedback}
                    placeholder="Your feedback helps us improve..."
                    placeholderTextColor="#64748B"
                    multiline
                    numberOfLines={3}
                    style={{
                      backgroundColor: '#0F1D2E',
                      borderRadius: 14,
                      padding: 16,
                      color: '#FFFFFF',
                      fontSize: 16,
                      minHeight: 90,
                      textAlignVertical: 'top',
                      borderWidth: 1,
                      borderColor: '#1E3A5F',
                    }}
                  />
                </Animated.View>

                {/* Submit Button */}
                <Animated.View entering={FadeInDown.delay(400).duration(250)} className="mt-6">
                  <Pressable
                    onPress={handleSubmit}
                    disabled={!selectedReason || isSubmitting}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 18,
                      borderRadius: 16,
                      backgroundColor: selectedReason ? '#00D4FF' : 'rgba(0, 212, 255, 0.3)',
                      gap: 10,
                    }}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#0A1628" />
                    ) : (
                      <>
                        <Send size={20} color={selectedReason ? '#0A1628' : '#64748B'} />
                        <Text
                          style={{
                            fontSize: 17,
                            fontWeight: '700',
                            color: selectedReason ? '#0A1628' : '#64748B',
                          }}
                        >
                          Send Feedback
                        </Text>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={handleClose}
                    className="items-center py-4 mt-1"
                  >
                    <Text className="text-slate-500 text-base">Skip</Text>
                  </Pressable>
                </Animated.View>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn.duration(400)} className="items-center mt-16">
                <Text style={{ fontSize: 72 }}>💙</Text>
                <Text className="text-white text-2xl font-bold mt-6 text-center">
                  Thank you!
                </Text>
                <Text className="text-slate-400 text-base mt-3 text-center leading-6">
                  Your feedback means the world to us.{'\n'}We hope to win you back someday!
                </Text>
              </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Close button in top right */}
        <Pressable
          onPress={handleClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={18} color="#94A3B8" />
        </Pressable>
      </Animated.View>
    </View>
  );
}
