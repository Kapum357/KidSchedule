'use client';

/**
 * FontLoader Component
 * Dynamically loads Google Fonts asynchronously after initial page paint
 * to avoid critical request chains and render-blocking behavior.
 * 
 * Usage in layout.tsx:
 * - Place <FontLoader /> in the body or right after root element
 * - Remove or keep display=optional on font links as fallback
 */

import { useEffect } from 'react';

export function FontLoader() {
  useEffect(() => {
    // Load fonts asynchronously after first paint
    // This prevents blocking the initial page render

    // Font 1: Material Symbols
    const materialSymbols = document.createElement('link');
    materialSymbols.rel = 'stylesheet';
    materialSymbols.href =
      'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap';
    materialSymbols.setAttribute('media', 'print');
    materialSymbols.onload = function () {
      (this as HTMLLinkElement).setAttribute('media', 'all');
    };
    document.head.appendChild(materialSymbols);

    // Font 2: Nunito Sans + Inter
    const primaryFonts = document.createElement('link');
    primaryFonts.rel = 'stylesheet';
    primaryFonts.href =
      'https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap';
    primaryFonts.setAttribute('media', 'print');
    primaryFonts.onload = function () {
      (this as HTMLLinkElement).setAttribute('media', 'all');
    };
    document.head.appendChild(primaryFonts);
  }, []);

  return null;
}
