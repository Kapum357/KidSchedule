"use client";

import { useEffect } from "react";

type Audience = "family" | "coparent" | "team" | "pta";

/**
 * AudienceDetector – Client Component
 *
 * Detects and persists the user's audience segment using:
 * 1. URL param ?audience=coparent|family|team|pta
 * 2. Referrer detection (e.g., from divorce lawyer sites → coparent)
 * 3. localStorage persistence across visits
 *
 * Updates the hero messaging and shows/hides audience-specific features.
 *
 * Usage: <AudienceDetector /> in the landing page Server Component
 */
export function AudienceDetector() {
  useEffect(() => {
    // Check localStorage first
    const stored = localStorage.getItem("ks_audience") as Audience | null;
    
    // Check URL param
    const params = new URLSearchParams(globalThis.location.search);
    const urlAudience = params.get("audience") as Audience | null;
    
    // Detect from referrer
    const referrer = globalThis.document.referrer.toLowerCase();
    let detectedAudience: Audience | null = null;
    
    if (referrer.includes("divorce") || referrer.includes("custody") || referrer.includes("lawyer")) {
      detectedAudience = "coparent";
    } else if (referrer.includes("soccer") || referrer.includes("sport") || referrer.includes("team")) {
      detectedAudience = "team";
    } else if (referrer.includes("pta") || referrer.includes("school")) {
      detectedAudience = "pta";
    }
    
    // Priority: URL param > localStorage > detected > null
    const audience = urlAudience || stored || detectedAudience;
    
    if (audience) {
      applyAudience(audience);
      localStorage.setItem("ks_audience", audience);
    }
    
    // Set up pill click handlers
    const pills = document.querySelectorAll<HTMLButtonElement>(".audience-pill");
    pills.forEach((pill) => {
      pill.addEventListener("click", () => {
        const selectedAudience = pill.dataset.audience as Audience;
        applyAudience(selectedAudience);
        localStorage.setItem("ks_audience", selectedAudience);
        
        // Scroll to features after selection
        document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
      });
    });
  }, []);
  
  return null; // This component only runs side effects
}

/**
 * Applies audience-specific messaging and feature visibility.
 */
function applyAudience(audience: Audience) {
  // Update hero headline
  const headline = document.getElementById("hero-headline");
  const subheadline = document.getElementById("hero-subheadline");
  
  if (headline) {
    const text = headline.getAttribute(`data-${audience}`);
    if (text) headline.textContent = text;
  }
  
  if (subheadline) {
    const text = subheadline.getAttribute(`data-${audience}`);
    if (text) subheadline.textContent = text;
  }
  
  // Show/hide audience-specific features
  const coparentFeatures = document.querySelectorAll(".feature-coparent");
  if (audience === "coparent") {
    coparentFeatures.forEach((el) => el.classList.remove("hidden"));
  } else {
    // Keep them visible by default, just highlight for co-parents
    // (Could hide them here if needed: el.classList.add("hidden"))
  }
  
  // Highlight the selected pill
  const pills = document.querySelectorAll<HTMLElement>(".audience-pill");
  pills.forEach((pill) => {
    const pillAudience = pill.dataset.audience;
    if (pillAudience === audience) {
      pill.classList.add("border-primary", "bg-primary/10");
      pill.classList.remove("border-gray-200");
    } else {
      pill.classList.remove("border-primary", "bg-primary/10");
      pill.classList.add("border-gray-200");
    }
  });
}
