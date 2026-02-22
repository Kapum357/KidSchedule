import type { ConflictWindowSetting, FamilySettings } from "@/types";
import { SEARCH_BACKEND } from "@/lib/infrastructure/search-config";

const DEFAULT_CONFLICT_WINDOW_MINS = Number(process.env.CONFLICT_WINDOW_DEFAULT_MINS ?? 120);
const MIN_CONFLICT_WINDOW_MINS = 0;
const MAX_CONFLICT_WINDOW_MINS = 720;

function clampWindow(windowMins: number): number {
  if (!Number.isFinite(windowMins)) return DEFAULT_CONFLICT_WINDOW_MINS;
  return Math.min(MAX_CONFLICT_WINDOW_MINS, Math.max(MIN_CONFLICT_WINDOW_MINS, Math.round(windowMins)));
}

export class SettingsEngine {
  resolveConflictWindow(
    familyId: string,
    overrides?: Partial<ConflictWindowSetting>
  ): ConflictWindowSetting {
    const requested = overrides?.windowMins ?? DEFAULT_CONFLICT_WINDOW_MINS;
    return {
      windowMins: clampWindow(requested),
    };
  }

  resolveFamilySettings(
    familyId: string,
    overrides?: Partial<FamilySettings>
  ): FamilySettings {
    const backend = overrides?.searchBackend ?? SEARCH_BACKEND;
    return {
      familyId,
      conflictWindow: this.resolveConflictWindow(familyId, overrides?.conflictWindow),
      searchBackend: backend === "trigram" ? "trigram" : "fuse",
    };
  }
}

export function createMockFamilySettings(
  familyId: string,
  windowMins: number = DEFAULT_CONFLICT_WINDOW_MINS
): FamilySettings {
  const engine = new SettingsEngine();
  return engine.resolveFamilySettings(familyId, {
    conflictWindow: { windowMins },
    searchBackend: SEARCH_BACKEND,
  });
}
