// Humorous taglines and copy for the app
export const taglines = {
  home: [
    "Because Size Matters... in Fishing",
    "Make Your Catch Legendary",
    "Turn Minnows into Monsters",
    "The One That Got Away? Not Anymore.",
    "Flex Your Fish",
    "Go Big or Go Home",
  ],
  slider: {
    // 50% - Half size
    small: ["A Grower, Not a Shower", "Below Average... For Now", "Modest Proportions", "Room Temperature Confidence"],
    // 75% - Slightly shrunk
    modest: ["Suspiciously Humble", "Under-Promise Territory", "The Honest Fisherman's Curse", "Almost Believable"],
    // 100% - Original
    original: ["Boring. You Can Do Better.", "Reality is Overrated", "Where's Your Sense of Adventure?", "Vanilla Mode"],
    // 200% - Double size
    large: ["Compensating? Maybe.", "Big Fish Energy", "That's What Legends Are Made Of", "Impressive... If True"],
    // 300% - Massive
    massive: ["ABSOLUTE UNIT", "Your Ex Won't Believe This", "Bar Story Material", "Full Send Mode"],
  },
  share: [
    "Share the Exaggeration",
    "Spread the Legend",
    "Let Them See Your 'Catch'",
    "Make Your Friends Jealous",
  ],
  premium: [
    "Unlimited Fish Tales",
    "No Limits on Your Lies",
    "Go Pro, Go Big",
  ],
  empty: [
    "Your tackle box is empty",
    "No fish tales yet...",
    "Time to start exaggerating",
  ],
  noPhoto: [
    "Where's the Fish?",
    "Your Fish Awaits...",
    "Upload Something Already!",
    "Don't Be Shy, Show Us Your Catch",
    "The Fish Aren't Gonna Upload Themselves",
  ],
  loading: [
    "Scaling your fish...",
    "Adjusting the truth...",
    "Making magic happen...",
    "Enhancing your story...",
    "Growing your catch...",
  ],
};

export const getRandomTagline = (category: keyof typeof taglines): string => {
  const options = taglines[category];
  if (Array.isArray(options)) {
    return options[Math.floor(Math.random() * options.length)];
  }
  return "";
};

export const getSliderTagline = (scale: number): string => {
  // Match the slider's snap presets (0.5, 0.75, 1.0, 2.0, 3.0) - random tagline per preset
  const getRandomFromArray = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  if (scale <= 0.5) return getRandomFromArray(taglines.slider.small);
  if (scale === 0.75) return getRandomFromArray(taglines.slider.modest);
  if (scale === 1.0) return getRandomFromArray(taglines.slider.original);
  if (scale >= 3.0) return getRandomFromArray(taglines.slider.massive);
  if (scale >= 2.0) return getRandomFromArray(taglines.slider.large);
  // Fallback for any value between presets
  return getRandomFromArray(taglines.slider.original);
};

export const fishingFacts = [
  "The largest fish ever caught was a 2,664 lb Great White Shark",
  "Bass can see in almost all directions at once",
  "Fish have been on Earth for over 500 million years",
  "The oldest known fish was a Koi that lived 226 years",
  "Tuna can swim up to 43 miles per hour",
];

export const funnyTitles = [
  "The Beast",
  "Moby's Cousin",
  "Dinner",
  "The Legend",
  "My New Best Friend",
  "Trophy Material",
  "Instagram Gold",
  "The One",
  "Absolute Unit",
  "River Monster",
];

export const getRandomTitle = (): string => {
  return funnyTitles[Math.floor(Math.random() * funnyTitles.length)];
};
