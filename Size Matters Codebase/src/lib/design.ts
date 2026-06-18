/**
 * Design System following Apple Human Interface Guidelines (HIG)
 *
 * Typography: Minimum 11pt (iOS), clear hierarchy
 * Touch Targets: Minimum 44x44pt
 * Contrast: WCAG AA compliant (4.5:1 for text, 3:1 for large text)
 * Spacing: 8pt grid system
 */

// ============================================
// COLORS - High contrast, psychologically engaging
// ============================================

export const colors = {
  // Primary Background - Deep navy creates premium, focused feel
  background: {
    primary: '#0B1623',      // Main background - slightly warmer than pure dark
    secondary: '#0F1E30',    // Elevated surfaces
    tertiary: '#142536',     // Cards and containers
  },

  // Brand Colors - Cyan family (trust, clarity, tech-forward)
  brand: {
    primary: '#00D4FF',      // Main brand - bright cyan (high visibility)
    secondary: '#0891B2',    // Darker cyan for depth
    muted: '#155E75',        // Subtle cyan backgrounds
  },

  // Semantic Colors - Clear meaning, colorblind-safe with icons
  semantic: {
    success: '#22C55E',      // Green - positive actions, enlarge
    warning: '#F59E0B',      // Amber - caution, premium features
    error: '#EF4444',        // Red - shrink, destructive actions
    info: '#3B82F6',         // Blue - neutral information
  },

  // Text Colors - WCAG AA compliant contrast ratios
  text: {
    primary: '#FFFFFF',      // 21:1 contrast on dark
    secondary: '#94A3B8',    // 7:1 contrast on dark - slate-400
    tertiary: '#64748B',     // 4.5:1 contrast on dark - slate-500
    muted: '#475569',        // 3:1 contrast - use sparingly, larger text only
  },

  // Accent Colors - Psychological hooks
  accent: {
    gold: '#FBBF24',         // Premium, achievement, reward
    purple: '#A855F7',       // Special, exclusive, trophy
    emerald: '#10B981',      // Growth, referral, gift
  },

  // Interactive States
  interactive: {
    pressed: 'rgba(255, 255, 255, 0.1)',
    disabled: 'rgba(255, 255, 255, 0.3)',
    hover: 'rgba(0, 212, 255, 0.1)',
  },

  // Overlays
  overlay: {
    light: 'rgba(0, 0, 0, 0.5)',
    medium: 'rgba(0, 0, 0, 0.7)',
    heavy: 'rgba(0, 0, 0, 0.85)',
  },
} as const;

// ============================================
// TYPOGRAPHY - Apple HIG compliant
// ============================================

// Font sizes in pixels - minimum 11pt (15px) for body text
// Apple recommends: Title 28-34pt, Headline 17pt, Body 17pt, Caption 12pt
export const typography = {
  // Display - For hero moments (sparingly)
  display: {
    size: 34,
    lineHeight: 41,
    weight: '700' as const,
    letterSpacing: 0.37,
  },

  // Large Title - Screen headers
  largeTitle: {
    size: 28,
    lineHeight: 34,
    weight: '700' as const,
    letterSpacing: 0.36,
  },

  // Title 1 - Section headers
  title1: {
    size: 22,
    lineHeight: 28,
    weight: '700' as const,
    letterSpacing: 0.35,
  },

  // Title 2 - Subsection headers
  title2: {
    size: 20,
    lineHeight: 25,
    weight: '600' as const,
    letterSpacing: 0.38,
  },

  // Title 3 - Smaller headers
  title3: {
    size: 18,
    lineHeight: 23,
    weight: '600' as const,
    letterSpacing: 0.34,
  },

  // Headline - Emphasized body text
  headline: {
    size: 17,
    lineHeight: 22,
    weight: '600' as const,
    letterSpacing: -0.41,
  },

  // Body - Default readable text
  body: {
    size: 17,
    lineHeight: 22,
    weight: '400' as const,
    letterSpacing: -0.41,
  },

  // Callout - Slightly smaller body
  callout: {
    size: 16,
    lineHeight: 21,
    weight: '400' as const,
    letterSpacing: -0.32,
  },

  // Subheadline - Supporting text
  subheadline: {
    size: 15,
    lineHeight: 20,
    weight: '400' as const,
    letterSpacing: -0.24,
  },

  // Footnote - Secondary info
  footnote: {
    size: 13,
    lineHeight: 18,
    weight: '400' as const,
    letterSpacing: -0.08,
  },

  // Caption 1 - Small labels
  caption1: {
    size: 12,
    lineHeight: 16,
    weight: '400' as const,
    letterSpacing: 0,
  },

  // Caption 2 - Smallest text (use sparingly)
  caption2: {
    size: 11,
    lineHeight: 13,
    weight: '400' as const,
    letterSpacing: 0.07,
  },
} as const;

// ============================================
// SPACING - 8pt grid system
// ============================================

export const spacing = {
  // Base unit: 4px
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,

  // Semantic spacing
  screenPadding: 20,       // Horizontal screen edges
  cardPadding: 16,         // Inside cards
  sectionGap: 24,          // Between sections
  itemGap: 12,             // Between list items
  inlineGap: 8,            // Between inline elements
} as const;

// ============================================
// TOUCH TARGETS - Apple HIG: minimum 44x44pt
// ============================================

export const touchTargets = {
  minimum: 44,              // Absolute minimum
  comfortable: 48,          // Recommended
  large: 56,                // Primary actions
} as const;

// ============================================
// BORDER RADIUS - Consistent rounding
// ============================================

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

// ============================================
// SHADOWS - Depth and elevation
// ============================================

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
} as const;

// ============================================
// ANIMATION CONFIGS - Smooth, natural motion
// ============================================

export const animation = {
  // Spring configs for natural feel
  spring: {
    gentle: { damping: 20, stiffness: 150 },
    bouncy: { damping: 10, stiffness: 100 },
    stiff: { damping: 30, stiffness: 300 },
  },

  // Timing durations
  duration: {
    instant: 100,
    fast: 200,
    normal: 300,
    slow: 500,
    emphasis: 800,
  },
} as const;

// ============================================
// PSYCHOLOGICAL HOOKS - Engagement patterns
// ============================================

export const psychological = {
  // Progress indicators create completion drive
  progressColors: {
    low: colors.semantic.error,
    medium: colors.semantic.warning,
    high: colors.semantic.success,
  },

  // Achievement badges trigger dopamine
  achievementGlow: 'rgba(251, 191, 36, 0.3)',

  // Social proof numbers
  socialProofColor: colors.text.secondary,

  // Urgency/scarcity
  urgencyColor: colors.semantic.warning,

  // Premium/exclusive feel
  premiumGradient: ['#F59E0B', '#FBBF24', '#F59E0B'],
} as const;

// ============================================
// TAILWIND CLASS MAPPINGS
// ============================================

// Typography classes that match HIG
export const tw = {
  // Text styles
  display: 'text-[34px] leading-[41px] font-bold tracking-[0.37px]',
  largeTitle: 'text-[28px] leading-[34px] font-bold tracking-[0.36px]',
  title1: 'text-[22px] leading-[28px] font-bold tracking-[0.35px]',
  title2: 'text-[20px] leading-[25px] font-semibold tracking-[0.38px]',
  title3: 'text-[18px] leading-[23px] font-semibold tracking-[0.34px]',
  headline: 'text-[17px] leading-[22px] font-semibold tracking-[-0.41px]',
  body: 'text-[17px] leading-[22px] font-normal tracking-[-0.41px]',
  callout: 'text-[16px] leading-[21px] font-normal tracking-[-0.32px]',
  subheadline: 'text-[15px] leading-[20px] font-normal tracking-[-0.24px]',
  footnote: 'text-[13px] leading-[18px] font-normal tracking-[-0.08px]',
  caption1: 'text-[12px] leading-[16px] font-normal tracking-[0px]',
  caption2: 'text-[11px] leading-[13px] font-normal tracking-[0.07px]',

  // Color classes
  textPrimary: 'text-white',
  textSecondary: 'text-slate-400',
  textTertiary: 'text-slate-500',

  // Background classes
  bgPrimary: 'bg-[#0B1623]',
  bgSecondary: 'bg-[#0F1E30]',
  bgTertiary: 'bg-[#142536]',

  // Touch target classes
  touchMinimum: 'min-h-[44px] min-w-[44px]',
  touchComfortable: 'min-h-[48px] min-w-[48px]',
  touchLarge: 'min-h-[56px] min-w-[56px]',
} as const;

// ============================================
// BUTTON STYLES
// ============================================

export const buttonStyles = {
  primary: {
    minHeight: touchTargets.comfortable,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: borderRadius.md,
  },
  secondary: {
    minHeight: touchTargets.minimum,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: borderRadius.md,
  },
  small: {
    minHeight: touchTargets.minimum,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: borderRadius.sm,
  },
} as const;

// ============================================
// GRADIENT PRESETS
// ============================================

export const gradients = {
  primary: ['#0891B2', '#00D4FF', '#0891B2'] as const,
  premium: ['#F59E0B', '#FBBF24', '#F59E0B'] as const,
  success: ['#059669', '#22C55E', '#059669'] as const,
  error: ['#DC2626', '#EF4444', '#DC2626'] as const,
  background: ['#0B1623', '#0F1E30', '#0B1623'] as const,
} as const;

export default {
  colors,
  typography,
  spacing,
  touchTargets,
  borderRadius,
  shadows,
  animation,
  psychological,
  tw,
  buttonStyles,
  gradients,
};
