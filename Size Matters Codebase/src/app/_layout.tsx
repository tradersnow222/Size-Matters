import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from '@/lib/useColorScheme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { OnboardingSplash } from '@/components/OnboardingSplash';
import { ReturningUserSplash } from '@/components/ReturningUserSplash';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import * as QuickActions from 'expo-quick-actions';
import { Platform } from 'react-native';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav({ colorScheme }: { colorScheme: 'light' | 'dark' | null | undefined }) {
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        <Stack.Screen
          name="feedback"
          options={{
            presentation: 'transparentModal',
            headerShown: false,
            gestureEnabled: true,
            animation: 'fade',
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}



export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isReady, setIsReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showReturningSplash, setShowReturningSplash] = useState(false);
  const router = useRouter();

  const hasSeenOnboarding = useAppStore((s) => s.hasSeenOnboarding);
  const setHasSeenOnboarding = useAppStore((s) => s.setHasSeenOnboarding);
  const loadFromStorage = useAppStore((s) => s.loadFromStorage);

  // Handle iOS Quick Actions (home screen 3D touch menu)
  useEffect(() => {
    if (Platform.OS !== 'ios' || !isReady) return;

    // Check if app was launched via quick action (cold start)
    const checkInitialAction = async () => {
      const initialAction = QuickActions.initial;
      if (initialAction?.id === 'com.sizematters.feedback') {
        // Small delay to ensure navigation is ready
        setTimeout(() => {
          router.push('/feedback');
        }, 100);
      }
    };

    checkInitialAction();

    // Listen for quick actions while app is running (warm start)
    const subscription = QuickActions.addListener((action) => {
      if (action.id === 'com.sizematters.feedback') {
        router.push('/feedback');
      }
    });

    return () => subscription.remove();
  }, [isReady, router]);

  useEffect(() => {
    const prepare = async () => {
      await loadFromStorage();
      // Check store state after loading
      const storeState = useAppStore.getState();
      if (!storeState.hasSeenOnboarding) {
        setShowOnboarding(true);
      } else {
        // Returning user - show quick splash
        setShowReturningSplash(true);
      }
      setIsReady(true);
      await SplashScreen.hideAsync();
    };
    prepare();
  }, []);

  const handleOnboardingComplete = () => {
    setHasSeenOnboarding(true);
    setShowOnboarding(false);
  };

  const handleReturningSplashComplete = () => {
    setShowReturningSplash(false);
  };

  if (!isReady) {
    return null;
  }

  if (showOnboarding) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" />
        <OnboardingSplash onComplete={handleOnboardingComplete} />
      </GestureHandlerRootView>
    );
  }

  // Render main app with splash overlay on top (so app is pre-mounted for smooth transition)
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <StatusBar style={showReturningSplash ? 'light' : (colorScheme === 'dark' ? 'light' : 'dark')} />
            <RootLayoutNav colorScheme={colorScheme} />
            <OfflineBanner />
            {showReturningSplash && (
              <ReturningUserSplash onComplete={handleReturningSplashComplete} />
            )}
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}