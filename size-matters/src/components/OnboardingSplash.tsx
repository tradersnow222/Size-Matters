import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Dimensions, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Fish } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useFonts, DancingScript_700Bold } from '@expo-google-fonts/dancing-script';
import { track, timeEvent } from '@/lib/analytics';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.2;

interface OnboardingSplashProps {
  onComplete: () => void;
}

// Bump when the onboarding flow changes, so funnels can be compared across versions.
const ONBOARDING_VERSION = 'v1';

const STEPS = [
  {
    title: "That fish you caught?",
    subtitle: "Yeah, it was pretty small...",
    emoji: "🐟",
  },
  {
    title: "But what if...",
    subtitle: "It was actually HUGE?",
    emoji: "🐋",
  },
  {
    title: "Here's the magic",
    subtitle: "Upload a catch photo — AI resizes the fish in seconds (needs internet)",
    emoji: "📸",
  },
  {
    title: "Size Matters",
    subtitle: "Make Your Catch Legendary",
    emoji: "🏆",
  },
];

export function OnboardingSplash({ onComplete }: OnboardingSplashProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const nudgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fontsLoaded] = useFonts({
    DancingScript_700Bold,
  });

  // Main horizontal scroll position (0 = first page, -SCREEN_WIDTH = second, etc.)
  const translateX = useSharedValue(0);
  const gestureTranslateX = useSharedValue(0);

  // Decorative animations
  const fishScale = useSharedValue(0.3);
  const fishRotate = useSharedValue(-15);
  const fishY = useSharedValue(50);
  const buttonScale = useSharedValue(1);

  // Bubbles
  const bubble1Y = useSharedValue(SCREEN_HEIGHT);
  const bubble2Y = useSharedValue(SCREEN_HEIGHT);
  const bubble3Y = useSharedValue(SCREEN_HEIGHT);

  // Start the nudge animation after delay - auto-peek effect
  const startNudgeTimer = () => {
    if (nudgeTimeoutRef.current) {
      clearTimeout(nudgeTimeoutRef.current);
    }

    nudgeTimeoutRef.current = setTimeout(() => {
      // Auto-peek: slide content left then bounce back
      gestureTranslateX.value = withSequence(
        withTiming(-80, { duration: 500, easing: Easing.out(Easing.ease) }),
        withSpring(0, { damping: 8, stiffness: 200 })
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Repeat the peek after another delay if user still hasn't swiped
      nudgeTimeoutRef.current = setTimeout(() => {
        gestureTranslateX.value = withSequence(
          withTiming(-50, { duration: 400, easing: Easing.out(Easing.ease) }),
          withSpring(0, { damping: 10, stiffness: 180 })
        );
      }, 4000);
    }, 2500);
  };

  useEffect(() => {
    // Onboarding analytics: mark the start and time the whole flow ("Onboarding
    // Completed" then carries $duration). "Step Viewed" is fired per step below.
    track('Onboarding Started', { onboarding_version: ONBOARDING_VERSION });
    timeEvent('Onboarding Completed');

    // Initial animation sequence
    fishScale.value = withSpring(1, { damping: 8, stiffness: 100 });
    fishY.value = withSpring(0, { damping: 12 });
    fishRotate.value = withRepeat(
      withSequence(
        withTiming(10, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(-10, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Bubbles animation
    bubble1Y.value = withRepeat(
      withTiming(-100, { duration: 4000, easing: Easing.linear }),
      -1
    );
    bubble2Y.value = withDelay(
      1000,
      withRepeat(
        withTiming(-100, { duration: 5000, easing: Easing.linear }),
        -1
      )
    );
    bubble3Y.value = withDelay(
      2000,
      withRepeat(
        withTiming(-100, { duration: 3500, easing: Easing.linear }),
        -1
      )
    );

    // Start nudge timer for first screen
    startNudgeTimer();

    return () => {
      if (nudgeTimeoutRef.current) {
        clearTimeout(nudgeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // One event per step (step in a property) — drives the onboarding drop-off funnel.
    track('Onboarding Step Viewed', {
      step_index: currentStep,
      step_name: STEPS[currentStep].title,
      onboarding_version: ONBOARDING_VERSION,
    });

    // Special animation for step 2 (the big fish reveal)
    if (currentStep === 1) {
      fishScale.value = withSequence(
        withTiming(0.5, { duration: 200 }),
        withSpring(1.5, { damping: 5, stiffness: 80 })
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else if (currentStep === STEPS.length - 1) {
      fishScale.value = withSpring(1.2, { damping: 8 });
      // Start subtle pulse animation for CTA button
      buttonScale.value = withDelay(
        600,
        withRepeat(
          withSequence(
            withTiming(1.03, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );
    }

    // Restart nudge timer for each step (except last)
    if (currentStep < STEPS.length - 1) {
      startNudgeTimer();
    }
  }, [currentStep]);

  const goToStep = (step: number) => {
    if (nudgeTimeoutRef.current) {
      clearTimeout(nudgeTimeoutRef.current);
    }

    if (step < STEPS.length) {
      setCurrentStep(step);
      translateX.value = withSpring(-step * SCREEN_WIDTH, {
        damping: 20,
        stiffness: 200,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      // Complete onboarding
      track('Onboarding Completed', { onboarding_version: ONBOARDING_VERSION });
      translateX.value = withTiming(-STEPS.length * SCREEN_WIDTH, { duration: 300 });
      fishScale.value = withSequence(
        withSpring(1.5, { damping: 5 }),
        withTiming(0, { duration: 300 })
      );
      setTimeout(() => {
        onComplete();
      }, 400);
    }
  };

  // Swipe gesture for horizontal scrolling
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Only allow swiping left (negative direction) and don't go past first screen
      const newX = event.translationX;
      if (newX < 0 || currentStep > 0) {
        // Limit how far right you can swipe (can't go before first screen)
        const maxRight = currentStep * SCREEN_WIDTH;
        // Limit how far left you can swipe (can't go past last screen)
        const maxLeft = -(STEPS.length - 1 - currentStep) * SCREEN_WIDTH;
        gestureTranslateX.value = Math.max(maxLeft, Math.min(maxRight, newX));
      }
    })
    .onEnd((event) => {
      const velocityThreshold = 500;

      if (event.translationX < -SWIPE_THRESHOLD || event.velocityX < -velocityThreshold) {
        // Swipe left - go to next
        if (currentStep < STEPS.length - 1) {
          runOnJS(goToStep)(currentStep + 1);
        }
      } else if (event.translationX > SWIPE_THRESHOLD || event.velocityX > velocityThreshold) {
        // Swipe right - go to previous
        if (currentStep > 0) {
          runOnJS(goToStep)(currentStep - 1);
        }
      }

      // Reset gesture offset
      gestureTranslateX.value = withSpring(0, { damping: 20 });
    });

  // Tap gesture to advance
  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      runOnJS(goToStep)(currentStep + 1);
    });

  const composedGesture = Gesture.Exclusive(panGesture, tapGesture);

  const fishAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: fishScale.value },
      { rotate: `${fishRotate.value}deg` },
      { translateY: fishY.value },
    ],
  }));

  // Combined translation for all pages
  const pagesAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value + gestureTranslateX.value }],
  }));

  const bubble1Style = useAnimatedStyle(() => ({
    transform: [{ translateY: bubble1Y.value }],
  }));

  const bubble2Style = useAnimatedStyle(() => ({
    transform: [{ translateY: bubble2Y.value }],
  }));

  const bubble3Style = useAnimatedStyle(() => ({
    transform: [{ translateY: bubble3Y.value }],
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  return (
    <View className="flex-1">
      <LinearGradient
        colors={['#0a1628', '#0d2847', '#0a3055', '#0a1628']}
        locations={[0, 0.3, 0.6, 1]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      {/* Animated bubbles */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: '20%',
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: 'rgba(34, 211, 238, 0.2)',
          },
          bubble1Style,
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: '60%',
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: 'rgba(34, 211, 238, 0.15)',
          },
          bubble2Style,
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: '80%',
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: 'rgba(34, 211, 238, 0.25)',
          },
          bubble3Style,
        ]}
      />

      {/* Water wave effect at bottom */}
      <View
        className="absolute bottom-0 left-0 right-0 h-32"
        style={{ backgroundColor: 'rgba(6, 182, 212, 0.1)' }}
      />

      <GestureDetector gesture={composedGesture}>
        <SafeAreaView className="flex-1">
          {/* Main fish icon - stays in place */}
          <View className="items-center pt-16">
            <Animated.View style={[fishAnimatedStyle]}>
              <View className="w-32 h-32 rounded-full bg-cyan-900/30 items-center justify-center border-2 border-cyan-500/30">
                <Fish size={64} color="#22d3ee" strokeWidth={1.5} />
              </View>
            </Animated.View>
          </View>

          {/* Horizontal scrolling pages container */}
          <View className="flex-1 overflow-hidden">
            <Animated.View
              style={[
                {
                  flexDirection: 'row',
                  width: SCREEN_WIDTH * STEPS.length,
                  flex: 1,
                },
                pagesAnimatedStyle,
              ]}
            >
              {STEPS.map((step, index) => (
                <View
                  key={index}
                  style={{ width: SCREEN_WIDTH }}
                  className="items-center justify-center px-8"
                >
                  {/* Emoji - larger for trophy on last step */}
                  <Text style={{ fontSize: index === STEPS.length - 1 ? 100 : 64 }} className="mb-4">
                    {step.emoji}
                  </Text>

                  {/* Title - bigger and bolder for last step */}
                  {index === STEPS.length - 1 ? (
                    <Text className="text-white text-5xl font-black text-center mb-3 tracking-tight">
                      {step.title}
                    </Text>
                  ) : (
                    <Text className="text-white text-3xl font-bold text-center mb-2">
                      {step.title}
                    </Text>
                  )}

                  {/* Subtitle or Tagline for last step */}
                  {index < STEPS.length - 1 ? (
                    <Text className="text-cyan-300 text-xl text-center mb-8">
                      {step.subtitle}
                    </Text>
                  ) : (
                    <Text
                      className="text-amber-400 text-center mb-6"
                      style={{
                        fontFamily: fontsLoaded ? 'DancingScript_700Bold' : undefined,
                        fontSize: 32,
                      }}
                    >
                      {step.subtitle}
                    </Text>
                  )}
                </View>
              ))}
            </Animated.View>
          </View>

          {/* Get Started Button - above dots, only on last step */}
          {currentStep === STEPS.length - 1 && (
            <View className="items-center px-8 mb-20">
              <Animated.View style={buttonAnimatedStyle}>
                <Pressable
                  onPress={() => goToStep(currentStep + 1)}
                  className="bg-white rounded-2xl px-14 py-4 active:opacity-80"
                  style={{
                    shadowColor: '#fff',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.3,
                    shadowRadius: 12,
                    elevation: 8,
                  }}
                >
                  <Text className="text-slate-900 text-xl font-bold text-center">
                    Get Started
                  </Text>
                </Pressable>
              </Animated.View>
            </View>
          )}

          {/* Progress dots - fixed at bottom, hidden on final step */}
          <View className="items-center pb-4">
            {currentStep < STEPS.length - 1 && (
              <View className="flex-row items-center mb-6">
                {STEPS.map((_, index) => (
                  <View
                    key={index}
                    className={`h-2 rounded-full mx-1 ${
                      index === currentStep ? 'bg-cyan-400 w-6' : 'bg-slate-600 w-2'
                    }`}
                  />
                ))}
              </View>
            )}

            {/* Footer - only show on last screen */}
            {currentStep === STEPS.length - 1 && (
              <View className="px-8">
                <Text className="text-slate-300 text-sm tracking-wider uppercase text-center">
                  No fish were harmed in the making of this app
                </Text>
                <Text className="text-slate-400 text-sm text-center mt-0.5">
                  (Just their reputations)
                </Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </GestureDetector>
    </View>
  );
}
