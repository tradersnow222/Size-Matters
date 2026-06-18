import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import { colors, spacing } from '@/lib/design';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component to catch JavaScript errors in child components
 * and display a fallback UI instead of crashing the entire app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // You could log the error to an error reporting service here
    // For now, we just log to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: colors.background.primary,
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.screenPadding,
          }}
        >
          {/* Error Icon */}
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: `${colors.semantic.error}20`,
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: spacing.lg,
            }}
          >
            <AlertTriangle size={40} color={colors.semantic.error} />
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 24,
              fontWeight: '700',
              color: colors.text.primary,
              textAlign: 'center',
              marginBottom: spacing.sm,
            }}
          >
            Oops! Something went wrong
          </Text>

          {/* Description */}
          <Text
            style={{
              fontSize: 16,
              color: colors.text.secondary,
              textAlign: 'center',
              marginBottom: spacing.xl,
              lineHeight: 24,
              paddingHorizontal: spacing.md,
            }}
          >
            The app encountered an unexpected error.{'\n'}
            Try refreshing or restarting the app.
          </Text>

          {/* Retry Button */}
          <Pressable
            onPress={this.handleReset}
            style={{
              backgroundColor: colors.brand.primary,
              paddingVertical: 14,
              paddingHorizontal: 32,
              borderRadius: 12,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <RefreshCw size={20} color="white" />
            <Text
              style={{
                fontSize: 17,
                fontWeight: '600',
                color: 'white',
                marginLeft: 8,
              }}
            >
              Try Again
            </Text>
          </Pressable>

          {/* Error details (collapsed by default in production) */}
          {__DEV__ && this.state.error && (
            <View
              style={{
                marginTop: spacing.xl,
                padding: spacing.md,
                backgroundColor: colors.background.secondary,
                borderRadius: 8,
                maxWidth: '100%',
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: colors.text.tertiary,
                  fontFamily: 'monospace',
                }}
                numberOfLines={10}
              >
                {this.state.error.toString()}
              </Text>
            </View>
          )}
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}
