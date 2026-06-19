import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface WatermarkOverlayProps {
  width: number;
  height: number;
  isPremium: boolean;
  isUnlocked?: boolean;
  // Optional: actual image dimensions to calculate visible bounds for "contain" mode
  imageWidth?: number;
  imageHeight?: number;
}

/**
 * Calculates the visible image bounds when using resizeMode="contain".
 * Returns the offset and dimensions of the actual visible image area within the container.
 */
function calculateContainBounds(
  containerWidth: number,
  containerHeight: number,
  imageWidth?: number,
  imageHeight?: number
): { x: number; y: number; width: number; height: number } {
  // If no image dimensions provided, assume image fills container
  if (!imageWidth || !imageHeight) {
    return { x: 0, y: 0, width: containerWidth, height: containerHeight };
  }

  const containerAspect = containerWidth / containerHeight;
  const imageAspect = imageWidth / imageHeight;

  let visibleWidth: number;
  let visibleHeight: number;
  let offsetX: number;
  let offsetY: number;

  if (imageAspect > containerAspect) {
    // Image is wider - will have black bars on top/bottom
    visibleWidth = containerWidth;
    visibleHeight = containerWidth / imageAspect;
    offsetX = 0;
    offsetY = (containerHeight - visibleHeight) / 2;
  } else {
    // Image is taller - will have black bars on left/right
    visibleHeight = containerHeight;
    visibleWidth = containerHeight * imageAspect;
    offsetX = (containerWidth - visibleWidth) / 2;
    offsetY = 0;
  }

  return { x: offsetX, y: offsetY, width: visibleWidth, height: visibleHeight };
}

/**
 * Reusable watermark overlay for non-premium users.
 * Displays a scattered diagonal pattern of "sizematters.app" text.
 * When imageWidth/imageHeight are provided, watermarks are positioned within
 * the actual visible image bounds (for resizeMode="contain").
 */
export function WatermarkOverlay({
  width,
  height,
  isPremium,
  isUnlocked,
  imageWidth,
  imageHeight,
}: WatermarkOverlayProps) {
  if (isPremium || isUnlocked) return null;

  // Calculate where the image actually renders within the container
  const bounds = calculateContainBounds(width, height, imageWidth, imageHeight);

  // Add small inset to keep watermarks away from very edges
  const inset = Math.min(bounds.width, bounds.height) * 0.05;
  const effectiveWidth = bounds.width - inset * 2;
  const effectiveHeight = bounds.height - inset * 2;

  const spacingY = effectiveHeight / 3.5;
  const spacingX = effectiveWidth / 2.5;

  return (
    <View
      style={[styles.container, { width, height }]}
      pointerEvents="none"
    >
      {/* Inner clipping container positioned exactly over the visible image */}
      <View
        style={[
          styles.clipContainer,
          {
            left: bounds.x,
            top: bounds.y,
            width: bounds.width,
            height: bounds.height,
          },
        ]}
      >
        {/* Scattered diagonal watermarks - within visible image bounds */}
        {[0, 1, 2, 3].map((row) =>
          [0, 1, 2].map((col) => {
            const offsetX = row % 2 === 0 ? 0 : spacingX * 0.4;
            const x = inset + col * spacingX + offsetX;
            const y = inset + row * spacingY;
            return (
              <View
                key={`${row}-${col}`}
                style={[
                  styles.watermarkWrapper,
                  {
                    left: x,
                    top: y,
                  },
                ]}
              >
                <Text style={styles.watermarkText}>sizematters.app</Text>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

/**
 * Smaller watermark for thumbnail images in the gallery grid.
 * Uses a simplified pattern with smaller text.
 * Thumbnails use "cover" mode so no bounds calculation needed.
 */
export function ThumbnailWatermark({ width, height, isPremium, isUnlocked }: WatermarkOverlayProps) {
  if (isPremium || isUnlocked) return null;

  const spacingY = height / 2.5;
  const spacingX = width / 2;

  return (
    <View
      style={[styles.container, { width, height }]}
      pointerEvents="none"
    >
      {/* Simplified 2x2 watermark pattern for thumbnails */}
      {[0, 1, 2].map((row) =>
        [0, 1].map((col) => {
          const offsetX = row % 2 === 0 ? 0 : spacingX * 0.25;
          const x = col * spacingX + offsetX + 5;
          const y = row * spacingY + 15;
          return (
            <View
              key={`${row}-${col}`}
              style={[
                styles.watermarkWrapper,
                {
                  left: x,
                  top: y,
                },
              ]}
            >
              <Text style={styles.thumbnailWatermarkText}>sizematters.app</Text>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    overflow: 'hidden',
  },
  clipContainer: {
    position: 'absolute',
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
  thumbnailWatermarkText: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 10,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});
