// SPDX-License-Identifier: AGPL-3.0-only
// Adapted from bitsocialnet/bitsocial-web, about/src/lib/hero-graphic-performance.ts (efec9611).
// Modified 2026-10-11 for the Hooks docs: Astro theme, layout, and motion preferences.
// Upstream license and attribution: website/LICENSES/bitsocial-web-AGPL-3.0.txt.
const MOBILE_BREAKPOINT = 768;
const LOW_END_CONCURRENCY = 4;
const HIGH_END_MOBILE_CONCURRENCY = 6;
const HIGH_END_MOBILE_MEMORY_GB = 4;
const MOBILE_DEFAULT_MAX_DPR = 1.25;
const MOBILE_HIGH_END_MAX_DPR = 1.5;
const DESKTOP_MAX_DPR = 2;

function getHardwareConcurrency() {
  if (typeof navigator === "undefined") return LOW_END_CONCURRENCY;

  return navigator.hardwareConcurrency || LOW_END_CONCURRENCY;
}

function getDeviceMemory() {
  if (typeof navigator === "undefined" || !("deviceMemory" in navigator)) return null;

  return navigator.deviceMemory as number;
}

function getIsAppleTouchDevice() {
  if (typeof navigator === "undefined") return false;

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function getIsMobileHeroGraphicLayout(width: number) {
  return width < MOBILE_BREAKPOINT || getHardwareConcurrency() < LOW_END_CONCURRENCY;
}

function getUsesEnhancedMobileQuality() {
  const hardwareConcurrency = getHardwareConcurrency();
  const deviceMemory = getDeviceMemory();
  const isHighEndMobile =
    hardwareConcurrency >= HIGH_END_MOBILE_CONCURRENCY &&
    (deviceMemory == null || deviceMemory >= HIGH_END_MOBILE_MEMORY_GB);

  return isHighEndMobile || (hardwareConcurrency >= LOW_END_CONCURRENCY && getIsAppleTouchDevice());
}

export function getHeroGraphicMaxPixelRatio(isMobileLayout: boolean) {
  if (!isMobileLayout) return DESKTOP_MAX_DPR;

  return getUsesEnhancedMobileQuality() ? MOBILE_HIGH_END_MAX_DPR : MOBILE_DEFAULT_MAX_DPR;
}
