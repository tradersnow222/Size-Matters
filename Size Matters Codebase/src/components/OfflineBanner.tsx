import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { WifiOff, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '@/lib/useNetworkStatus';
import { colors, spacing } from '@/lib/design';

/**
 * Banner component that shows when the device is offline
 * Displays at the top of the screen with a warning message
 */
export function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const insets = useSafeAreaInsets();

  // Show banner if not connected OR if internet is explicitly not reachable
  const isOffline = !isConnected || isInternetReachable === false;

  if (!isOffline) {
    return null;
  }

  return (
    <Animated.View
      entering={SlideInUp.duration(300)}
      exiting={SlideOutUp.duration(300)}
      style={{
        position: 'absolute',
        top: insets.top,
        left: 0,
        right: 0,
        zIndex: 1000,
        paddingHorizontal: spacing.screenPadding,
        paddingVertical: spacing.sm,
      }}
    >
      <View
        style={{
          backgroundColor: colors.semantic.warning,
          borderRadius: 12,
          paddingVertical: 12,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <WifiOff size={20} color="#000" />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#000' }}>
            No Internet Connection
          </Text>
          <Text style={{ fontSize: 13, color: 'rgba(0,0,0,0.7)', marginTop: 2 }}>
            Fish resizing requires an internet connection
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}
