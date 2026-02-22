"use client";

import { useEffect, useState } from "react";

/**
 * Theme Toggle Component
 * 
 * A simple toggle button to switch between light and dark modes.
 * Uses localStorage to persist the user's preference.
 * 
 * Usage:
 * <ThemeToggle />
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Hydration fix - apply theme and show toggle only after mount
  useEffect(() => {
    // Check localStorage and system preference
    const stored = localStorage.getItem("theme");
    const systemPrefersDark = globalThis.window?.matchMedia("(prefers-color-scheme: dark)").matches ?? false;
    const shouldBeDark = stored === "dark" || (!stored && systemPrefersDark);
    
    // Apply theme class to document
    if (shouldBeDark) {
      document.documentElement.classList.add("dark");
    }
    
    // Update component state after applying to DOM
    setIsDark(shouldBeDark); // eslint-disable-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    
    if (newIsDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  // Avoid hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <button
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        disabled
        aria-label="Loading theme toggle"
      >
        <span className="material-symbols-outlined text-lg">wb_sunny</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <>
          <span className="material-symbols-outlined text-lg">dark_mode</span>
          <span>Dark</span>
        </>
      ) : (
        <>
          <span className="material-symbols-outlined text-lg">light_mode</span>
          <span>Light</span>
        </>
      )}
    </button>
  );
}
