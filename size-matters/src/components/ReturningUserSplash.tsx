import React, { useEffect, useRef } from 'react';
import { View, Pressable, Dimensions, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  interpolate,
} from 'react-native-reanimated';
import { Fish } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ReturningUserSplashProps {
  onComplete: () => void;
}

export function ReturningUserSplash({ onComplete }: ReturningUserSplashProps) {
  // Fish icon animations
  const fishScale = useSharedValue(0.6);
  const fishRotate = useSharedValue(-5);
  const fishOpacity = useSharedValue(0);

  // Container fade
  const containerOpacity = useSharedValue(1);

  // Bubbles
  const bubble1Progress = useSharedValue(0);
  const bubble2Progress = useSharedValue(0);
  const bubble3Progress = useSharedValue(0);

  // Allow tapping to skip, and guard the fade-out so it only runs once.
  const dismissedRef = useRef(false);
  const dismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    fishScale.value = withTiming(1.05, { duration: 200, easing: Easing.out(Easing.ease) });
    fishOpacity.value = withTiming(0, { duration: 250, easing: Easing.in(Easing.ease) });
    containerOpacity.value = withTiming(
      0,
      { duration: 300, easing: Easing.inOut(Easing.ease) },
      (finished) => {
        if (finished) runOnJS(onComplete)();
      },
    );
  };

  useEffect(() => {
    // Smooth fade in
    fishOpacity.value = withTiming(1, {
      duration: 300,
      easing: Easing.out(Easing.ease)
    });

    // Gentle scale up with soft spring
    fishScale.value = withSpring(1, {
      damping: 15,
      stiffness: 100,
      mass: 0.8,
    });

    // Subtle continuous rotation (fish swimming)
    fishRotate.value = withDelay(
      200,
      withRepeat(
        withSequence(
          withTiming(5, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(-5, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );

    // Bubble animations - smooth rise
    bubble1Progress.value = withDelay(
      100,
      withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) })
    );
    bubble2Progress.value = withDelay(
      300,
      withTiming(1, { duration: 2200, easing: Easing.out(Easing.ease) })
    );
    bubble3Progress.value = withDelay(
      500,
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) })
    );

    // Light haptic on appear
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Brief welcome — auto-dismiss quickly so it doesn't add latency every launch.
    const timeout = setTimeout(dismiss, 900);

    return () => clearTimeout(timeout);
  }, []);

  const fishAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: fishScale.value },
      { rotate: `${fishRotate.value}deg` },
    ],
    opacity: fishOpacity.value,
  }));

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const bubble1Style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(bubble1Progress.value, [0, 1], [SCREEN_HEIGHT * 0.3, -SCREEN_HEIGHT * 0.2]) },
    ],
    opacity: interpolate(bubble1Progress.value, [0, 0.1, 0.8, 1], [0, 0.25, 0.2, 0]),
  }));

  const bubble2Style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(bubble2Progress.value, [0, 1], [SCREEN_HEIGHT * 0.35, -SCREEN_HEIGHT * 0.25]) },
    ],
    opacity: interpolate(bubble2Progress.value, [0, 0.1, 0.8, 1], [0, 0.2, 0.15, 0]),
  }));

  const bubble3Style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(bubble3Progress.value, [0, 1], [SCREEN_HEIGHT * 0.25, -SCREEN_HEIGHT * 0.15]) },
    ],
    opacity: interpolate(bubble3Progress.value, [0, 0.1, 0.8, 1], [0, 0.3, 0.2, 0]),
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, containerAnimatedStyle]}>
      <LinearGradient
        colors={['#0a1628', '#0d2847', '#0a3055', '#0a1628']}
        locations={[0, 0.3, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Animated bubbles */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: '25%',
            top: '50%',
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: '#22d3ee',
          },
          bubble1Style,
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: '70%',
            top: '55%',
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: '#22d3ee',
          },
          bubble2Style,
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: '80%',
            top: '45%',
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: '#22d3ee',
          },
          bubble3Style,
        ]}
      />

      {/* Centered fish icon in circle */}
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Animated.View style={fishAnimatedStyle}>
          <View
            className="w-32 h-32 rounded-full items-center justify-center"
            style={{
              backgroundColor: 'rgba(13, 40, 71, 0.6)',
              borderWidth: 2,
              borderColor: 'rgba(34, 211, 238, 0.3)',
            }}
          >
            <Fish size={64} color="#22d3ee" strokeWidth={1.5} />
          </View>
        </Animated.View>
      </View>

      {/* Tap anywhere to skip the welcome */}
      <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
    </Animated.View>
  );
}
