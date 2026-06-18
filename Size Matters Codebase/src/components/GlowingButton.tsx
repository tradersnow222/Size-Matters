import React, { useEffect } from 'react';
import { Pressable, Text, View, ActivityIndicator, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface GlowingButtonProps {
  onPress: () => void;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  isLoading?: boolean;
  loadingLabel?: string;
  variant?: 'primary' | 'secondary' | 'share';
  size?: 'compact' | 'default' | 'large';
  enablePulse?: boolean;
  pulseDelay?: number;
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function GlowingButton({
  onPress,
  label,
  icon,
  disabled = false,
  isLoading = false,
  loadingLabel = 'Loading...',
  variant = 'primary',
  size = 'default',
  enablePulse = true,
  pulseDelay = 300,
  style,
}: GlowingButtonProps) {
  const buttonScale = useSharedValue(1);

  useEffect(() => {
    if (enablePulse && !disabled && !isLoading) {
      buttonScale.value = withDelay(
        pulseDelay,
        withRepeat(
          withSequence(
            withTiming(1.02, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );
    } else {
      buttonScale.value = withTiming(1, { duration: 200 });
    }
  }, [enablePulse, disabled, isLoading]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const getVariantStyles = () => {
    switch (variant) {
      case 'share':
        return {
          backgroundColor: '#10b981',
          shadowColor: '#10b981',
          textColor: 'white',
        };
      case 'secondary':
        return {
          backgroundColor: '#0891b2',
          shadowColor: '#22d3ee',
          textColor: 'white',
        };
      case 'primary':
      default:
        return {
          backgroundColor: '#ffffff',
          shadowColor: '#ffffff',
          textColor: '#0f172a',
        };
    }
  };

  const variantStyles = getVariantStyles();
  const isLarge = size === 'large';
  const isCompact = size === 'compact';

  const getSizeStyles = () => {
    if (isCompact) {
      return { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, fontSize: 13 };
    }
    if (isLarge) {
      return { borderRadius: 16, paddingVertical: 16, paddingHorizontal: 32, fontSize: 18 };
    }
    return { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, fontSize: 16 };
  };

  const sizeStyles = getSizeStyles();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        onPress={handlePress}
        disabled={disabled || isLoading}
        className="active:opacity-80"
        style={{
          backgroundColor: variantStyles.backgroundColor,
          borderRadius: sizeStyles.borderRadius,
          paddingVertical: sizeStyles.paddingVertical,
          paddingHorizontal: sizeStyles.paddingHorizontal,
          opacity: disabled ? 0.5 : 1,
          shadowColor: variantStyles.shadowColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: enablePulse ? 0.4 : 0.2,
          shadowRadius: enablePulse ? 16 : 8,
          elevation: 8,
        }}
      >
        <View className="flex-row items-center justify-center">
          {isLoading ? (
            <>
              <ActivityIndicator size="small" color={variantStyles.textColor} />
              {loadingLabel ? (
                <Text
                  style={{
                    color: variantStyles.textColor,
                    fontSize: sizeStyles.fontSize,
                    fontWeight: '600',
                    marginLeft: 8,
                  }}
                >
                  {loadingLabel}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              {icon}
              <Text
                style={{
                  color: variantStyles.textColor,
                  fontSize: sizeStyles.fontSize,
                  fontWeight: '600',
                  marginLeft: icon ? 8 : 0,
                }}
              >
                {label}
              </Text>
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}
