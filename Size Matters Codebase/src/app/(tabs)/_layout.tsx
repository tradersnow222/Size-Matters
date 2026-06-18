import React, { useEffect } from 'react';
import { Tabs, usePathname } from 'expo-router';
import { Fish, Images, User, Sparkles } from 'lucide-react-native';
import { View, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { colors, touchTargets } from '@/lib/design';
import { useAppStore } from '@/lib/store';

export default function TabLayout() {
  const isPremium = useAppStore((s) => s.isPremium);
  const freeEditsRemaining = useAppStore((s) => s.freeEditsRemaining);
  const pathname = usePathname();

  // Highlight Go Pro tab when low on free edits, but NOT when already on premium screen
  const isOnPremiumScreen = pathname === '/premium' || pathname === '/(tabs)/premium';
  const shouldHighlightPro = !isPremium && freeEditsRemaining <= 1 && !isOnPremiumScreen;
  const shouldPulsePro = !isPremium && freeEditsRemaining <= 0 && !isOnPremiumScreen;

  // Pulse animation for Go Pro tab
  const proTabScale = useSharedValue(1);

  useEffect(() => {
    if (shouldPulsePro) {
      proTabScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(proTabScale);
      proTabScale.value = 1;
    }
  }, [shouldPulsePro, proTabScale]);

  const proTabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: proTabScale.value }],
  }));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background.primary,
          borderTopColor: colors.brand.muted,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.brand.primary,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarLabelStyle: {
          fontSize: 11, // HIG Caption 2 for tab labels
          fontWeight: '500',
          letterSpacing: 0.07,
          marginTop: 2,
        },
        // Ensure minimum 44pt touch targets
        tabBarItemStyle: {
          minHeight: touchTargets.minimum,
          paddingVertical: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Resize',
          tabBarIcon: ({ color, focused }) => (
            <View
              className="items-center justify-center"
              style={{ width: touchTargets.minimum, height: touchTargets.minimum }}
            >
              {focused && (
                <View
                  className="absolute w-11 h-11 rounded-full"
                  style={{ backgroundColor: `${colors.brand.primary}15` }}
                />
              )}
              <Fish size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          title: 'My Catches',
          tabBarIcon: ({ color, focused }) => (
            <View
              className="items-center justify-center"
              style={{ width: touchTargets.minimum, height: touchTargets.minimum }}
            >
              {focused && (
                <View
                  className="absolute w-11 h-11 rounded-full"
                  style={{ backgroundColor: `${colors.brand.primary}15` }}
                />
              )}
              <Images size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="premium"
        options={{
          title: 'Go Pro',
          tabBarActiveTintColor: colors.accent.gold,
          tabBarInactiveTintColor: shouldHighlightPro ? colors.accent.gold : colors.text.tertiary,
          tabBarIcon: ({ focused }) => (
            <Animated.View
              className="items-center justify-center"
              style={[
                { width: touchTargets.minimum, height: touchTargets.minimum },
                proTabAnimatedStyle
              ]}
            >
              {(focused || shouldHighlightPro) && (
                <View
                  className="absolute w-11 h-11 rounded-full"
                  style={{ backgroundColor: `${colors.accent.gold}15` }}
                />
              )}
              <Sparkles
                size={24}
                color={colors.accent.gold}
                strokeWidth={focused ? 2.5 : 2}
              />
            </Animated.View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <View
              className="items-center justify-center"
              style={{ width: touchTargets.minimum, height: touchTargets.minimum }}
            >
              {focused && (
                <View
                  className="absolute w-11 h-11 rounded-full"
                  style={{ backgroundColor: `${colors.brand.primary}15` }}
                />
              )}
              <User size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
