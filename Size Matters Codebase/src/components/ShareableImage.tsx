import React, { useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { View, Text, Dimensions, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { captureRef } from 'react-native-view-shot';
import { APP_DOWNLOAD_LINK } from '@/lib/watermark';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_SIZE = SCREEN_WIDTH - 48;

// Watermark configuration
const WATERMARK_TEXT = 'sizematters.app';
const WATERMARK_ROWS = 4;
const WATERMARK_COLS = 3;

// Generate watermark positions
interface WatermarkPosition {
  x: number;
  y: number;
}

const generateWatermarkPositions = (size: number): WatermarkPosition[] => {
  const positions: WatermarkPosition[] = [];
  const spacingY = size / 3;
  const spacingX = size / WATERMARK_COLS;

  for (let row = 0; row < WATERMARK_ROWS; row++) {
    for (let col = 0; col < WATERMARK_COLS; col++) {
      const offsetX = row % 2 === 0 ? 0 : spacingX * 0.5;
      positions.push({
        x: col * spacingX + offsetX - 20,
        y: row * spacingY + 30,
      });
    }
  }
  return positions;
};

const WATERMARK_POSITIONS = generateWatermarkPositions(IMAGE_SIZE);

export interface ShareableImageRef {
  capture: () => Promise<string>;
}

interface ShareableImageProps {
  imageUri: string;
  scale: number;
  isPremium?: boolean;
}

export const ShareableImage = forwardRef<ShareableImageRef, ShareableImageProps>(
  ({ imageUri, isPremium = false }, ref) => {
    const viewRef = useRef<View>(null);

    console.log('[ShareableImage] Rendering with isPremium:', isPremium);

    const capture = useCallback(async () => {
      console.log('[ShareableImage] Capturing with isPremium:', isPremium);

      if (!viewRef.current) {
        throw new Error('View ref not available');
      }

      // Wait a moment for the image to fully render
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Capture the view as an image
      const uri = await captureRef(viewRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      console.log('[ShareableImage] Captured to:', uri);
      return uri;
    }, [isPremium]);

    useImperativeHandle(ref, () => ({ capture }), [capture]);

    return (
      <View
        ref={viewRef}
        style={styles.container}
        collapsable={false}
      >
        {/* Base image */}
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          contentFit="cover"
        />

        {/* Watermarks - only for non-premium users */}
        {!isPremium && (
          <View style={styles.watermarkContainer} pointerEvents="none">
            {/* Scattered diagonal watermarks */}
            {WATERMARK_POSITIONS.map((pos, index) => (
              <View
                key={index}
                style={[
                  styles.watermarkWrapper,
                  {
                    left: pos.x,
                    top: pos.y,
                  },
                ]}
              >
                <Text style={styles.watermarkText}>{WATERMARK_TEXT}</Text>
              </View>
            ))}

            {/* Bottom app link */}
            <View style={styles.bottomLink}>
              <Text style={styles.bottomLinkText}>{APP_DOWNLOAD_LINK}</Text>
            </View>
          </View>
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    backgroundColor: '#0a1628',
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  watermarkContainer: {
    position: 'absolute',
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    overflow: 'hidden',
  },
  watermarkWrapper: {
    position: 'absolute',
    transform: [{ rotate: '-30deg' }],
  },
  watermarkText: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 18,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  bottomLink: {
    position: 'absolute',
    bottom: 8,
    right: 10,
  },
  bottomLinkText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    fontWeight: '600',
  },
});

ShareableImage.displayName = 'ShareableImage';
