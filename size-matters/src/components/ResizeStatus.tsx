import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

/**
 * Operational-transparency layer shown during the resize, above the FishTapGame.
 * It does two evidence-backed jobs that the game alone does not:
 *   1. A "labor illusion" status line — naming the work in progress ("Finding your
 *      largemouth bass…") turns an *unexplained* wait into an explained one and
 *      makes it feel valuable rather than broken (Buell & Norton 2011; Maister).
 *      Stages are paced to the measured ~10–14s p50 resize.
 *   2. A decelerating progress bar — it races toward ~92% then crawls, so the wait
 *      always reads as "working" and never stalls on a number (Harrison 2010). The
 *      parent unmounts this the instant the result is ready, snapping the bar away.
 */
const STAGE_MS = 2600;
const BAR_FILL_MS = 12000;
const BAR_TARGET = 0.92;

export function ResizeStatus({ species }: { species?: string }) {
  const cleanSpecies = species?.trim();
  const fishName = cleanSpecies && cleanSpecies.length > 0 ? cleanSpecies : 'fish';

  const [stages] = useState<string[]>(() => [
    `Finding your ${fishName}…`,
    'Resizing the catch…',
    'Re-posing the grip…',
    'Blending the light…',
    'Almost there…',
  ]);
  const [stageIndex, setStageIndex] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(BAR_TARGET, { duration: BAR_FILL_MS, easing: Easing.out(Easing.cubic) });

    let i = 0;
    const id = setInterval(() => {
      i = Math.min(i + 1, stages.length - 1);
      setStageIndex(i);
    }, STAGE_MS);
    return () => clearInterval(id);
  }, [progress, stages.length]);

  // Pixel-width fill (measured via onLayout) — robust across RN versions.
  const barStyle = useAnimatedStyle(() => ({ width: progress.value * trackWidth }));

  return (
    <View className="w-full items-center mb-4 px-8">
      <Text
        className="text-cyan-200 text-base font-semibold mb-3 text-center"
        style={{ minHeight: 22 }}
      >
        {stages[stageIndex]}
      </Text>
      <View
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        className="w-full h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: 'rgba(34, 211, 238, 0.15)' }}
      >
        <Animated.View
          style={[{ height: '100%', borderRadius: 999, backgroundColor: '#22d3ee' }, barStyle]}
        />
      </View>
    </View>
  );
}
