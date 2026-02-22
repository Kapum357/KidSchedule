"use client";

import { useEffect } from "react";
import Link from "next/link";

type Audience = "family" | "coparent" | "team" | "pta";
type PricingMode = "per-parent" | "full-family";

/**
 * LandingPageClient – Client Component
 *
 * Handles:
 * 1. Audience detection and persistence (URL param, referrer, localStorage)
 * 2. Mobile menu drawer toggle
 * 3. Pricing mode toggle (per-parent ↔ full-family)
 *
 * Usage: <LandingPageClient /> in the landing page Server Component
 */
export function LandingPageClient() {
  useEffect(() => {
    // Initialize pricing mode from localStorage
    const storedPricingMode = localStorage.getItem("ks_pricing_mode") as PricingMode | null;
    if (storedPricingMode) {
      updatePricingDisplay(storedPricingMode);
      document.documentElement.dataset.pricingMode = storedPricingMode;
    }

    // Check localStorage first for audience
    const stored = localStorage.getItem("ks_audience") as Audience | null;

    // Check URL param
    const params = new URLSearchParams(globalThis.location.search);
    const urlAudience = params.get("audience") as Audience | null;

    // Detect from referrer
    const referrer = globalThis.document.referrer.toLowerCase();
    let detectedAudience: Audience | null = null;

    if (
      referrer.includes("divorce") ||
      referrer.includes("custody") ||
      referrer.includes("lawyer")
    ) {
      detectedAudience = "coparent";
    } else if (
      referrer.includes("soccer") ||
      referrer.includes("sport") ||
      referrer.includes("team")
    ) {
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

    // Set up mobile menu button handler
    const menuButton = document.querySelector(".mobile-menu-btn") as HTMLButtonElement;
    if (menuButton) {
      menuButton.addEventListener("click", toggleMobileMenu);
    }

    // Set up overlay click handler to close menu
    const overlay = document.querySelector(".mobile-menu-overlay") as HTMLElement;
    if (overlay) {
      overlay.addEventListener("click", closeMobileMenu);
    }

    // Set up pricing toggle handlers
    const pricingButtons = document.querySelectorAll<HTMLButtonElement>(
      ".pricing-toggle-btn"
    );
    pricingButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        handlePricingToggle(btn, pricingButtons);
      });
    });

    // Close menu when clicking a nav link
    const navLinks = document.querySelectorAll(".mobile-nav-link");
    navLinks.forEach((link) => {
      link.addEventListener("click", closeMobileMenu);
    });
  }, []);

  return (
    <>
      {/* Mobile Menu Overlay */}
      <div
        className="mobile-menu-overlay fixed inset-0 z-40 md:hidden transition-opacity duration-300 opacity-0 pointer-events-none bg-black/30 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Mobile Menu Drawer */}
      <nav className="mobile-menu-drawer fixed top-16 left-0 bottom-0 w-64 bg-white z-40 md:hidden transform transition-transform duration-300 shadow-xl -translate-x-full">
        <div className="px-4 py-6 space-y-4">
          <a
            href="#features"
            className="mobile-nav-link block px-4 py-3 text-gray-700 hover:bg-primary/10 hover:text-primary rounded-lg transition-colors font-medium"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="mobile-nav-link block px-4 py-3 text-gray-700 hover:bg-primary/10 hover:text-primary rounded-lg transition-colors font-medium"
          >
            Pricing
          </a>
          <Link
            href="/blog"
            className="mobile-nav-link block px-4 py-3 text-gray-700 hover:bg-primary/10 hover:text-primary rounded-lg transition-colors font-medium"
          >
            Blog
          </Link>
          <Link
            href="/school"
            className="mobile-nav-link block px-4 py-3 text-gray-700 hover:bg-primary/10 hover:text-primary rounded-lg transition-colors font-medium"
          >
            For PTAs
          </Link>
          <hr className="my-4" />
          <Link
            href="/login"
            className="mobile-nav-link block px-4 py-3 text-gray-700 hover:bg-primary/10 hover:text-primary rounded-lg transition-colors font-medium"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="mobile-nav-link block w-full text-center bg-primary hover:bg-primary-hover text-white px-4 py-3 rounded-lg font-semibold transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>
    </>
  );
}

// Alias for backward compatibility
export const AudienceDetector = LandingPageClient;

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

/**
 * Toggles the mobile menu drawer open/closed
 */
function toggleMobileMenu() {
  const drawer = document.querySelector(".mobile-menu-drawer") as HTMLElement;
  const overlay = document.querySelector(".mobile-menu-overlay") as HTMLElement;
  const isOpen = drawer?.classList.contains("translate-x-0");

  if (isOpen) {
    drawer?.classList.remove("translate-x-0");
    drawer?.classList.add("-translate-x-full");
    overlay?.classList.add("opacity-0", "pointer-events-none");
  } else {
    drawer?.classList.add("translate-x-0");
    drawer?.classList.remove("-translate-x-full");
    overlay?.classList.remove("opacity-0", "pointer-events-none");
  }
}

/**
 * Closes the mobile menu drawer
 */
function closeMobileMenu() {
  const drawer = document.querySelector(".mobile-menu-drawer") as HTMLElement;
  const overlay = document.querySelector(".mobile-menu-overlay") as HTMLElement;
  drawer?.classList.remove("translate-x-0");
  drawer?.classList.add("-translate-x-full");
  overlay?.classList.add("opacity-0", "pointer-events-none");
}

/**
 * Handles pricing toggle between per-parent and full-family
 */
function handlePricingToggle(
  clickedBtn: HTMLButtonElement,
  allBtns: NodeListOf<HTMLButtonElement>
) {
  const mode = clickedBtn.dataset.mode as PricingMode;
  localStorage.setItem("ks_pricing_mode", mode);
  updatePricingDisplay(mode);
  document.documentElement.dataset.pricingMode = mode;

  // Update button states
  allBtns.forEach((button) => {
    if (button.dataset.mode === mode) {
      button.classList.add("bg-white");
      button.classList.remove("text-gray-600");
    } else {
      button.classList.remove("bg-white");
      button.classList.add("text-gray-600");
    }
  });
}

/**
 * Updates pricing display based on selected mode
 */
function updatePricingDisplay(mode: PricingMode) {
  const priceElements = document.querySelectorAll("[data-price]");

  priceElements.forEach((el) => {
    const htmlElement = el as HTMLElement;
    const perParentPrice = htmlElement.dataset.price;
    const fullFamilyPrice = htmlElement.dataset.priceFullFamily;

    if (mode === "per-parent" && perParentPrice) {
      el.textContent = perParentPrice;
    } else if (mode === "full-family" && fullFamilyPrice) {
      el.textContent = fullFamilyPrice;
    }
  });

  // Update pricing note text
  const priceNote = document.getElementById("pricing-note");
  if (priceNote) {
    if (mode === "per-parent") {
      priceNote.textContent =
        "Per parent pricing shown. Toggle to Full Family to include both parents. Cancel anytime.";
    } else {
      priceNote.textContent =
        "Full family pricing shown (includes both parents). Toggle to Per Parent for single-parent pricing. Cancel anytime.";
    }
  }
}
