import React, { useRef, useImperativeHandle, forwardRef, useCallback, useEffect, useState } from 'react';
import { View, Text, Dimensions, StyleSheet, Image as RNImage } from 'react-native';
import { Image } from 'expo-image';
import { captureRef } from 'react-native-view-shot';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Base width in points. The component is mounted off-screen and captured at the
// device pixel scale (~2–3x), so the exported PNG is ~800–1170px wide.
const BASE_WIDTH = SCREEN_WIDTH - 48;
// Until the real image is measured, assume a typical portrait catch photo so a
// capture that races the measurement still isn't square-cropped.
const DEFAULT_ASPECT = 3 / 4;

// Watermark configuration
const WATERMARK_TEXT = 'sizematters.app';
const WATERMARK_COLS = 3;

interface WatermarkPosition {
  x: number;
  y: number;
}

// Tile the watermark across the (now aspect-correct) image. Density is anchored to
// the width so it matches the in-app preview, and rows extend to cover any height.
const generateWatermarkPositions = (width: number, height: number): WatermarkPosition[] => {
  const positions: WatermarkPosition[] = [];
  const spacingX = width / WATERMARK_COLS;
  const spacingY = width / 3;
  const rows = Math.ceil(height / spacingY) + 1;

  for (let row = 0; row < rows; row++) {
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

export interface ShareableImageRef {
  capture: () => Promise<string>;
}

interface ShareableImageProps {
  imageUri: string;
  isPremium?: boolean;
}

export const ShareableImage = React.memo(forwardRef<ShareableImageRef, ShareableImageProps>(
  ({ imageUri, isPremium = false }, ref) => {
    const viewRef = useRef<View>(null);
    // Keep the export in the photo's real aspect ratio instead of force-cropping it
    // to a square (which lopped the fish or the angler's face off the shared image).
    const [aspect, setAspect] = useState(DEFAULT_ASPECT);

    useEffect(() => {
      let active = true;
      RNImage.getSize(
        imageUri,
        (w, h) => {
          if (active && w > 0 && h > 0) setAspect(w / h);
        },
        () => {
          /* keep the default portrait aspect on failure */
        },
      );
      return () => {
        active = false;
      };
    }, [imageUri]);

    const width = BASE_WIDTH;
    const height = Math.round(BASE_WIDTH / aspect);

    const capture = useCallback(async () => {
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

      return uri;
    }, []);

    useImperativeHandle(ref, () => ({ capture }), [capture]);

    const positions = generateWatermarkPositions(width, height);

    return (
      <View
        ref={viewRef}
        style={{ width, height, backgroundColor: '#0a1628' }}
        collapsable={false}
      >
        {/* Base image — aspect-correct, so nothing is cropped out */}
        <Image
          source={{ uri: imageUri }}
          style={{ width, height }}
          contentFit="cover"
        />

        {/* Watermarks - only for non-premium users */}
        {!isPremium && (
          <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
            {positions.map((pos, index) => (
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
          </View>
        )}
      </View>
    );
  }
));

const styles = StyleSheet.create({
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
});

ShareableImage.displayName = 'ShareableImage';
