'use client';

import { useEffect, useState } from 'react';

/**
 * Custom hook to track which section is currently in view
 * Uses Intersection Observer API to detect visible sections
 *
 * @param sectionIds - Array of section IDs to observe
 * @returns The ID of the currently visible section
 */
export function useSectionInView(sectionIds: readonly string[]): string {
  const [activeId, setActiveId] = useState<string>(sectionIds[0] || '');

  useEffect(() => {
    // Create a map to track which sections are visible
    const visibleSections = new Map<string, boolean>();
    sectionIds.forEach((id) => {
      visibleSections.set(id, false);
    });

    // Intersection Observer callback
    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        const sectionId = entry.target.id;
        visibleSections.set(sectionId, entry.isIntersecting);
      });

      // Find the topmost visible section
      const visibleArray = Array.from(visibleSections.entries())
        .filter(([, isVisible]) => isVisible)
        .map(([id]) => id);

      // If any section is visible, use the first one (topmost)
      if (visibleArray.length > 0) {
        setActiveId(visibleArray[0]);
      } else {
        // If no sections are visible, use the last section before scroll position
        // This handles the case when user has scrolled past all sections
        const allElements = sectionIds
          .map((id) => ({ id, element: document.getElementById(id) }))
          .filter(({ element }) => element !== null) as Array<{
          id: string;
          element: HTMLElement;
        }>;

        if (allElements.length > 0) {
          // Find the section closest to top of viewport
          const closest = allElements.reduce((prev, current) => {
            const prevRect = prev.element.getBoundingClientRect();
            const currentRect = current.element.getBoundingClientRect();

            // Use the one closest to the top of the viewport (smallest positive distance or largest negative distance)
            const prevDistance = prevRect.top;
            const currentDistance = currentRect.top;

            // Prefer sections above viewport, then sections in viewport
            if (prevDistance < 0 && currentDistance < 0) {
              return prevDistance > currentDistance ? prev : current;
            }
            if (prevDistance < 0) return prev;
            if (currentDistance < 0) return current;
            return prevDistance < currentDistance ? prev : current;
          });

          setActiveId(closest.id);
        }
      }
    };

    // Create observer with options
    const observer = new IntersectionObserver(handleIntersect, {
      root: null,
      rootMargin: '-25% 0px -75% 0px', // Top 25% of viewport
      threshold: 0,
    });

    // Observe all sections
    sectionIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [sectionIds]);

  return activeId;
}
