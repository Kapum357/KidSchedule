'use client';

/**
 * FontLoader Component
 *
 * Previously dynamically injected CDN links for Material Symbols,
 * Nunito Sans, and Inter. These are now handled statically:
 *
 * - Material Symbols: static <link> in app/layout.tsx <head>
 * - Nunito Sans + Inter: self-hosted via next/font/google in app/layout.tsx
 *
 * This component is kept as a no-op to avoid import churn in layout.tsx.
 * It can be removed in a future cleanup pass if desired.
 */

export function FontLoader() {
  return null;
}
