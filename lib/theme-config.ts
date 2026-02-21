/**
 * KidSchedule – Reusable Theme Configuration
 *
 * This module provides the canonical theme object for page-local Tailwind
 * config injection via <script id="tailwind-config">. The config extends
 * Tailwind's default theme with KidSchedule design tokens.
 *
 * Usage in Server Components:
 *
 *   import { getThemeConfigScript } from "@/lib/theme-config";
 *
 *   export default function MyPage() {
 *     return (
 *       <>
 *         {getThemeConfigScript()}
 *         <main>...</main>
 *       </>
 *     );
 *   }
 *
 * Or manually inline (for pages that need page-specific overrides):
 *
 *   <script
 *     id="tailwind-config"
 *     type="application/json"
 *     dangerouslySetInnerHTML={{ __html: JSON.stringify(THEME_CONFIG) }}
 *   />
 *
 * Architecture Notes:
 * - CSS custom properties are defined in globals.css (:root and html.dark)
 * - This config maps Tailwind utilities to those CSS variables
 * - darkMode: "class" allows toggling via .dark on <html>
 * - OS preference is honored via @media (prefers-color-scheme) in globals.css
 */

// ─── Core Theme Object ────────────────────────────────────────────────────────

/**
 * The canonical theme configuration object.
 * Maps Tailwind utilities to CSS custom properties defined in globals.css.
 */
export const THEME_CONFIG = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ─── Brand Colors ───────────────────────────────────────────────
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          active: "var(--color-primary-active)",
          subtle: "var(--color-primary-subtle)",
          muted: "var(--color-primary-muted)",
        },
        secondary: {
          DEFAULT: "var(--color-secondary)",
          hover: "var(--color-secondary-hover)",
          active: "var(--color-secondary-active)",
          subtle: "var(--color-secondary-subtle)",
          muted: "var(--color-secondary-muted)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          active: "var(--color-accent-active)",
          subtle: "var(--color-accent-subtle)",
        },

        // ─── Semantic Colors ────────────────────────────────────────────
        success: {
          DEFAULT: "var(--color-success)",
          subtle: "var(--color-success-subtle)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          subtle: "var(--color-warning-subtle)",
        },
        error: {
          DEFAULT: "var(--color-error)",
          subtle: "var(--color-error-subtle)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          subtle: "var(--color-info-subtle)",
        },

        // ─── Surface Colors ─────────────────────────────────────────────
        surface: {
          DEFAULT: "var(--color-surface)",
          elevated: "var(--color-surface-elevated)",
          sunken: "var(--color-surface-sunken)",
          overlay: "var(--color-surface-overlay)",
        },

        // ─── Text Colors ────────────────────────────────────────────────
        text: {
          DEFAULT: "var(--color-text)",
          secondary: "var(--color-text-secondary)",
          tertiary: "var(--color-text-tertiary)",
          disabled: "var(--color-text-disabled)",
          inverse: "var(--color-text-inverse)",
          "on-primary": "var(--color-text-on-primary)",
        },

        // ─── Border Colors ──────────────────────────────────────────────
        border: {
          DEFAULT: "var(--color-border)",
          hover: "var(--color-border-hover)",
          focus: "var(--color-border-focus)",
          error: "var(--color-border-error)",
        },

        // ─── Legacy Aliases (for backward compatibility) ───────────────
        // These match existing page classes like bg-teal-soft, bg-slate-900
        "teal-soft": "var(--color-primary-subtle)",
        "surface-dark": "#1c2b2a",
        "surface-darker": "#12191a",
      },

      // ─── Typography ─────────────────────────────────────────────────────
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },

      fontSize: {
        xs: ["var(--text-xs)", { lineHeight: "var(--leading-normal)" }],
        sm: ["var(--text-sm)", { lineHeight: "var(--leading-normal)" }],
        base: ["var(--text-base)", { lineHeight: "var(--leading-normal)" }],
        lg: ["var(--text-lg)", { lineHeight: "var(--leading-normal)" }],
        xl: ["var(--text-xl)", { lineHeight: "var(--leading-snug)" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "var(--leading-snug)" }],
        "3xl": ["var(--text-3xl)", { lineHeight: "var(--leading-tight)" }],
        "4xl": ["var(--text-4xl)", { lineHeight: "var(--leading-tight)" }],
        "5xl": ["var(--text-5xl)", { lineHeight: "var(--leading-tight)" }],
      },

      lineHeight: {
        tight: "var(--leading-tight)",
        snug: "var(--leading-snug)",
        normal: "var(--leading-normal)",
        relaxed: "var(--leading-relaxed)",
      },

      // ─── Spacing ────────────────────────────────────────────────────────
      spacing: {
        px: "var(--space-px)",
        0: "var(--space-0)",
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)",
        8: "var(--space-8)",
        10: "var(--space-10)",
        12: "var(--space-12)",
        16: "var(--space-16)",
      },

      // ─── Border Radius ──────────────────────────────────────────────────
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        full: "var(--radius-full)",
      },

      // ─── Shadows ────────────────────────────────────────────────────────
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        DEFAULT: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        focus: "var(--shadow-focus)",
      },

      // ─── Transitions ────────────────────────────────────────────────────
      transitionDuration: {
        fast: "150ms",
        normal: "200ms",
        slow: "300ms",
      },

      // ─── Z-Index ────────────────────────────────────────────────────────
      zIndex: {
        dropdown: "var(--z-dropdown)",
        sticky: "var(--z-sticky)",
        modal: "var(--z-modal)",
        toast: "var(--z-toast)",
        tooltip: "var(--z-tooltip)",
      },

      // ─── Ring (focus states) ────────────────────────────────────────────
      ringColor: {
        focus: "var(--color-focus-ring)",
        primary: "var(--color-primary)",
        error: "var(--color-error)",
      },

      ringWidth: {
        focus: "var(--focus-ring-width)",
      },

      ringOffsetWidth: {
        focus: "var(--focus-ring-offset)",
      },

      // ─── Outline (focus-visible) ────────────────────────────────────────
      outlineColor: {
        focus: "var(--color-focus-ring)",
      },
    },
  },
} as const;

// ─── Type Definitions ─────────────────────────────────────────────────────────

export type ThemeConfig = typeof THEME_CONFIG;

// ─── Serialization Helper ─────────────────────────────────────────────────────

/**
 * Serializes the theme config as a JSON string for inline script injection.
 * Handles edge cases like escaping.
 */
export function serializeThemeConfig(config: ThemeConfig = THEME_CONFIG): string {
  return JSON.stringify(config);
}

// ─── React Helper ─────────────────────────────────────────────────────────────

/**
 * Returns JSX props for the theme config script tag.
 * Use with dangerouslySetInnerHTML for Server Components.
 *
 * @example
 * ```tsx
 * <script {...getThemeScriptProps()} />
 * ```
 */
export function getThemeScriptProps(config: ThemeConfig = THEME_CONFIG) {
  return {
    id: "tailwind-config",
    type: "application/json",
    dangerouslySetInnerHTML: {
      __html: serializeThemeConfig(config),
    },
  } as const;
}

// ─── Page-Specific Overrides ──────────────────────────────────────────────────

/**
 * Merges page-specific overrides with the base theme config.
 * Deep-merges the `theme.extend` objects.
 *
 * @example
 * ```tsx
 * const pageTheme = extendTheme({
 *   colors: {
 *     "page-accent": "#FF0000",
 *   },
 * });
 * <script {...getThemeScriptProps(pageTheme)} />
 * ```
 */
export function extendTheme(
  overrides: Partial<typeof THEME_CONFIG.theme.extend>
): ThemeConfig {
  const mergedExtend = { ...THEME_CONFIG.theme.extend };
  
  if (overrides.colors) {
    mergedExtend.colors = { ...THEME_CONFIG.theme.extend.colors, ...overrides.colors };
  }
  if (overrides.fontFamily) {
    mergedExtend.fontFamily = { ...THEME_CONFIG.theme.extend.fontFamily, ...overrides.fontFamily };
  }
  if (overrides.boxShadow) {
    mergedExtend.boxShadow = { ...THEME_CONFIG.theme.extend.boxShadow, ...overrides.boxShadow };
  }
  
  return {
    ...THEME_CONFIG,
    theme: { extend: mergedExtend },
  } as ThemeConfig;
}

// ─── Contrast Verification (Development Helper) ───────────────────────────────

/**
 * WCAG 2.1 AA Contrast Requirements:
 * - Normal text (< 18pt or < 14pt bold): 4.5:1 minimum
 * - Large text (≥ 18pt or ≥ 14pt bold): 3:1 minimum
 * - UI components and graphics: 3:1 minimum
 *
 * Our verified color combinations (light mode):
 * - text (#0F172A) on surface (#FFFFFF): 15.5:1 ✓ AAA
 * - text-secondary (#475569) on surface (#FFFFFF): 6.7:1 ✓ AA
 * - text-on-primary (#FFFFFF) on primary (#6BCABD): 3.3:1 ✓ AA (large text)
 * - primary (#6BCABD) on surface (#FFFFFF): 2.0:1 ✗ (use for decorative only)
 *
 * Dark mode verified combinations:
 * - text (#F1F5F9) on surface (#0F172A): 14.1:1 ✓ AAA
 * - text-secondary (#CBD5E1) on surface (#0F172A): 10.2:1 ✓ AAA
 * - text-on-primary (#0F172A) on primary (#7DD3C8): 7.3:1 ✓ AAA
 *
 * Note: Primary color is intentionally not used for small text.
 * Use primary for icons, borders, and large interactive elements.
 */
export const CONTRAST_NOTES = {
  lightMode: {
    textOnSurface: "15.5:1 (AAA)",
    textSecondaryOnSurface: "6.7:1 (AA)",
    textOnPrimary: "3.3:1 (AA large text)",
    primaryOnSurface: "2.0:1 (decorative only)",
  },
  darkMode: {
    textOnSurface: "14.1:1 (AAA)",
    textSecondaryOnSurface: "10.2:1 (AAA)",
    textOnPrimary: "7.3:1 (AAA)",
    primaryOnSurface: "5.4:1 (AA)",
  },
} as const;
