import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Fish, Flame, Zap } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GAME_WIDTH = SCREEN_WIDTH - 64;
const GAME_HEIGHT = Math.min(SCREEN_HEIGHT * 0.28, 220);

const TAP_TARGET_SIZE = 100;
const FISH_ICON_SIZE = 48;
const FISH_VISUAL_SIZE = 74;

// Boundary padding - fish stays this far from edges
const BOUNDARY_PADDING = FISH_VISUAL_SIZE / 2 + 10;

// Fish types with different point values
type FishType = 'normal' | 'golden' | 'rainbow';
const FISH_CONFIGS: Record<FishType, { color: string; points: number; chance: number; bgColor: string }> = {
  normal: { color: '#22d3ee', points: 1, chance: 0.75, bgColor: 'rgba(34, 211, 238, 0.25)' },
  golden: { color: '#fbbf24', points: 3, chance: 0.20, bgColor: 'rgba(251, 191, 36, 0.3)' },
  rainbow: { color: '#f472b6', points: 5, chance: 0.05, bgColor: 'rgba(244, 114, 182, 0.35)' },
};

// Sound effect sources
const TAP_SOUND_ASSETS = [
  require('../../public/sound-effect-1768513318717.mp3'),
  require('../../public/sound-effect-1768513377312.mp3'),
  require('../../public/sound-effect-1768513533574.mp3'),
  require('../../public/sound-effect-1768513787645.mp3'),
  require('../../public/sound-effect-1768513884808.mp3'),
  require('../../public/sound-effect-1768514230381.mp3'),
];

let currentSound: Audio.Sound | null = null;
let loadedSounds: Audio.Sound[] = [];
// The game remounts on every resize; load the shared sound pool only once so
// we don't leak Audio.Sound instances on each remount.
let soundsInitialized = false;

const loadSounds = async () => {
  if (soundsInitialized) return;
  soundsInitialized = true;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });

    const sounds = await Promise.all(
      TAP_SOUND_ASSETS.map(async (source) => {
        const { sound } = await Audio.Sound.createAsync(source);
        await sound.setVolumeAsync(0.6);
        return sound;
      })
    );
    loadedSounds = sounds;
  } catch (e) {
    soundsInitialized = false;
    console.log('Failed to load sounds:', e);
  }
};

const playTapSound = async () => {
  if (loadedSounds.length === 0) return;

  try {
    const sound = loadedSounds[Math.floor(Math.random() * loadedSounds.length)];

    if (currentSound) {
      try {
        await currentSound.stopAsync();
        await currentSound.setPositionAsync(0);
      } catch {
        // Ignore
      }
    }

    currentSound = sound;
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (e) {
    console.log('Error playing sound:', e);
  }
};

interface FishTarget {
  id: number;
  x: number;
  y: number;
  type: FishType;
  velocityX: number;
  velocityY: number;
  spawnTime: number;
  lifetime: number;
}

interface FloatingBubble {
  id: number;
  x: number;
  y: number;
  points: number;
  isCombo?: boolean;
  color: string; // Fish color for the bubble
}

const pickFishType = (): FishType => {
  const rand = Math.random();
  if (rand < FISH_CONFIGS.rainbow.chance) return 'rainbow';
  if (rand < FISH_CONFIGS.rainbow.chance + FISH_CONFIGS.golden.chance) return 'golden';
  return 'normal';
};

const getDifficultySettings = (score: number) => {
  if (score < 3) return { spawnInterval: 2500, appearDuration: 80 };
  if (score < 6) return { spawnInterval: 2200, appearDuration: 70 };
  if (score < 10) return { spawnInterval: 1900, appearDuration: 60 };
  if (score < 15) return { spawnInterval: 1600, appearDuration: 50 };
  if (score < 20) return { spawnInterval: 1300, appearDuration: 40 };
  return { spawnInterval: 1000, appearDuration: 35 };
};

function FloatingScoreBubble({ bubble, onComplete }: { bubble: FloatingBubble; onComplete: () => void }) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 100 });
    translateY.value = withTiming(-80, { duration: 800, easing: Easing.out(Easing.cubic) });
    opacity.value = withSequence(
      withTiming(1, { duration: 400 }),
      withTiming(0, { duration: 400 })
    );

    const timeout = setTimeout(onComplete, 800);
    return () => clearTimeout(timeout);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  if (bubble.isCombo) {
    return (
      <Animated.View
        style={[
          { position: 'absolute', left: bubble.x - 25, top: bubble.y - 15, width: 50, alignItems: 'center' },
          animatedStyle,
        ]}
      >
        <View className="bg-orange-500 px-2 py-1 rounded-full shadow-lg flex-row items-center">
          <Flame size={12} color="#fff" />
          <Text className="text-white font-bold text-sm ml-0.5">+{bubble.points}</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        { position: 'absolute', left: bubble.x - 20, top: bubble.y - 15, width: 40, alignItems: 'center' },
        animatedStyle,
      ]}
    >
      <View style={{ backgroundColor: bubble.color, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
        <Text style={{ color: '#0a1628', fontWeight: '700', fontSize: 14 }}>+{bubble.points}</Text>
      </View>
    </Animated.View>
  );
}

export function FishTapGame() {
  const [score, setScore] = useState(0);
  const [fish, setFish] = useState<FishTarget | null>(null);
  const [floatingBubbles, setFloatingBubbles] = useState<FloatingBubble[]>([]);
  const [streak, setStreak] = useState(0);
  const fishIdRef = useRef(0);
  const bubbleIdRef = useRef(0);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const fishRef = useRef<FishTarget | null>(null);

  const fishScale = useSharedValue(1);
  const fishRotate = useSharedValue(0);
  const fishX = useSharedValue(0);
  const fishY = useSharedValue(0);
  const streakScale = useSharedValue(1);

  // Simple pulsing glow - just one clean animation
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.6);

  useEffect(() => {
    loadSounds();
  }, []);

  // Single, simple pulsing animation for the glow
  useEffect(() => {
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 500, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 500, easing: Easing.in(Easing.ease) })
      ),
      -1,
      false
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.15, { duration: 500 }),
        withTiming(0.35, { duration: 500 })
      ),
      -1,
      false
    );
  }, [glowScale, glowOpacity]);

  const spawnFish = useCallback(() => {
    const minX = BOUNDARY_PADDING;
    const maxX = GAME_WIDTH - BOUNDARY_PADDING;
    const minY = BOUNDARY_PADDING;
    const maxY = GAME_HEIGHT - BOUNDARY_PADDING;

    let x = minX + Math.random() * (maxX - minX);
    let y = minY + Math.random() * (maxY - minY);

    // Calculate room for swimming
    const roomLeft = x - minX;
    const roomRight = maxX - x;
    const roomUp = y - minY;
    const roomDown = maxY - y;

    const newFish: FishTarget = {
      id: fishIdRef.current++,
      x,
      y,
      type: pickFishType(),
      velocityX: (Math.random() - 0.5) * 2,
      velocityY: (Math.random() - 0.5) * 1.5,
      spawnTime: Date.now(),
      lifetime: 3000 + Math.random() * 2000,
    };
    setFish(newFish);
    fishRef.current = newFish;

    fishX.value = 0;
    fishY.value = 0;

    // Gentle swimming within bounds
    const swimDuration = 800;
    const maxSwimX = Math.min(15, roomLeft, roomRight);
    const maxSwimY = Math.min(12, roomUp, roomDown);

    fishX.value = withRepeat(
      withSequence(
        withTiming(newFish.velocityX > 0 ? maxSwimX : -maxSwimX, { duration: swimDuration, easing: Easing.inOut(Easing.sin) }),
        withTiming(newFish.velocityX > 0 ? -maxSwimX * 0.5 : maxSwimX * 0.5, { duration: swimDuration, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    fishY.value = withRepeat(
      withSequence(
        withTiming(newFish.velocityY > 0 ? maxSwimY : -maxSwimY, { duration: swimDuration * 1.2, easing: Easing.inOut(Easing.sin) }),
        withTiming(newFish.velocityY > 0 ? -maxSwimY * 0.5 : maxSwimY * 0.5, { duration: swimDuration * 1.2, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    const { appearDuration } = getDifficultySettings(scoreRef.current);
    fishScale.value = 0;
    fishRotate.value = Math.random() * 20 - 10;
    fishScale.value = withTiming(1, { duration: appearDuration });
  }, [fishScale, fishRotate, fishX, fishY]);

  useEffect(() => {
    spawnFish();

    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNextSpawn = () => {
      const { spawnInterval } = getDifficultySettings(scoreRef.current);
      timeoutId = setTimeout(() => {
        spawnFish();
        scheduleNextSpawn();
      }, spawnInterval);
    };

    scheduleNextSpawn();
    return () => clearTimeout(timeoutId);
  }, [spawnFish]);

  const handleTapFish = useCallback(() => {
    if (!fish) return;

    const caughtFish = fish;
    setFish(null);
    fishRef.current = null;

    playTapSound();

    const basePoints = FISH_CONFIGS[caughtFish.type].points;
    const newStreak = streakRef.current + 1;
    streakRef.current = newStreak;
    setStreak(newStreak);

    const streakBonus = Math.floor(newStreak / 3);
    const totalPoints = basePoints + streakBonus;

    if (caughtFish.type === 'rainbow') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (caughtFish.type === 'golden' || streakBonus > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 50);

    const newScore = scoreRef.current + totalPoints;
    scoreRef.current = newScore;
    setScore(newScore);

    if (newStreak % 3 === 0) {
      streakScale.value = withSequence(
        withSpring(1.4, { damping: 8 }),
        withSpring(1, { damping: 12 })
      );
    }

    const newBubble: FloatingBubble = {
      id: bubbleIdRef.current++,
      x: caughtFish.x,
      y: caughtFish.y,
      points: totalPoints,
      isCombo: newStreak >= 3,
      color: FISH_CONFIGS[caughtFish.type].color,
    };
    setFloatingBubbles((prev) => [...prev, newBubble]);

    fishScale.value = withSequence(
      withTiming(1.3, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );

    setTimeout(() => {
      spawnFish();
    }, 80);
  }, [spawnFish, fishScale, fish, streakScale]);

  const removeBubble = useCallback((id: number) => {
    setFloatingBubbles((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const fishAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: fishX.value },
      { translateY: fishY.value },
      { scale: fishScale.value },
      { rotate: `${fishRotate.value}deg` },
    ],
  }));

  const streakAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: streakScale.value }],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: fishX.value },
      { translateY: fishY.value },
      { scale: glowScale.value },
    ],
    opacity: glowOpacity.value,
  }));

  const fishConfig = fish ? FISH_CONFIGS[fish.type] : FISH_CONFIGS.normal;

  return (
    <View className="items-center flex-1 justify-center px-4">
      {/* Header: a clear call-to-action until the first catch, then the score.
          Without this, the bobbing fish reads as a passive loading animation. */}
      <View className="flex-row items-center justify-center mb-3 gap-4" style={{ minHeight: 40 }}>
        {score === 0 ? (
          <Text className="text-cyan-300 text-xl font-bold text-center">
            👆 Tap the fish while you wait!
          </Text>
        ) : (
          <>
            <View className="flex-row items-center">
              <Fish size={28} color="#fbbf24" />
              <Text className="text-amber-400 text-3xl font-bold ml-2">{score}</Text>
              <Text className="text-amber-400/70 text-base font-semibold ml-1.5">caught</Text>
            </View>

            {streak >= 3 && (
              <Animated.View style={streakAnimatedStyle} className="flex-row items-center bg-orange-500/20 px-2 py-1 rounded-full">
                <Flame size={16} color="#f97316" />
                <Text className="text-orange-400 text-sm font-bold ml-1">{streak}x</Text>
              </Animated.View>
            )}
          </>
        )}
      </View>

      {/* Game area */}
      <View
        className="rounded-3xl overflow-hidden border-2 border-cyan-800/60"
        style={{
          width: GAME_WIDTH,
          height: GAME_HEIGHT,
          backgroundColor: 'rgba(15, 39, 68, 0.9)',
        }}
      >
        {/* Subtle bubbles decoration */}
        <View className="absolute top-4 left-4 w-3 h-3 rounded-full bg-cyan-500/20" />
        <View className="absolute top-12 left-8 w-2 h-2 rounded-full bg-cyan-500/15" />
        <View className="absolute top-8 right-6 w-4 h-4 rounded-full bg-cyan-500/20" />
        <View className="absolute bottom-6 right-10 w-2 h-2 rounded-full bg-cyan-500/15" />
        <View className="absolute bottom-16 left-12 w-3 h-3 rounded-full bg-cyan-500/20" />

        {/* Fish target - clean, simple design inspired by successful tap games */}
        {fish && (
          <Pressable
            onPress={handleTapFish}
            style={{
              position: 'absolute',
              left: fish.x - TAP_TARGET_SIZE / 2,
              top: fish.y - TAP_TARGET_SIZE / 2,
              width: TAP_TARGET_SIZE,
              height: TAP_TARGET_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            {/* Simple pulsing glow behind fish - like Cookie Clicker / Whack-a-Mole */}
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: FISH_VISUAL_SIZE + 20,
                  height: FISH_VISUAL_SIZE + 20,
                  borderRadius: (FISH_VISUAL_SIZE + 20) / 2,
                  backgroundColor: fishConfig.color,
                },
                glowAnimatedStyle,
              ]}
            />

            {/* The fish itself - high contrast, clearly tappable */}
            <Animated.View
              style={[
                {
                  width: FISH_VISUAL_SIZE,
                  height: FISH_VISUAL_SIZE,
                  borderRadius: FISH_VISUAL_SIZE / 2,
                  backgroundColor: fishConfig.bgColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 3,
                  borderColor: fishConfig.color,
                },
                fishAnimatedStyle,
              ]}
            >
              <Fish size={FISH_ICON_SIZE} color={fishConfig.color} strokeWidth={2.5} />
              {fish.type === 'golden' && (
                <View className="absolute -top-1 -right-1">
                  <Zap size={14} color="#fbbf24" fill="#fbbf24" />
                </View>
              )}
              {fish.type === 'rainbow' && (
                <View className="absolute -top-1 -right-1">
                  <Zap size={16} color="#f472b6" fill="#f472b6" />
                </View>
              )}
            </Animated.View>
          </Pressable>
        )}

        {/* Floating score bubbles */}
        {floatingBubbles.map((bubble) => (
          <FloatingScoreBubble
            key={bubble.id}
            bubble={bubble}
            onComplete={() => removeBubble(bubble.id)}
          />
        ))}
      </View>
    </View>
  );
}
