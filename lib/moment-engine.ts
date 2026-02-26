/**
 * KidSchedule – Moment Engine
 *
 * Pure helpers for the Share a Moment flow.
 *
 * Complexity:
 * - Parsing and validation are O(1) per submission.
 */

export type MomentVisibility = "shared" | "private";

export type MomentChildTag = "none" | "leo" | "mia" | "both";

export type ShareMomentInput = {
  title: string;
  caption: string;
  childTag: MomentChildTag;
  visibility: MomentVisibility;
  mediaFileName?: string;
  mediaFileSizeBytes?: number;
  mediaFileType?: string;
};

export type ShareMomentValidation = {
  valid: boolean;
  error?: string;
};

export const MOMENT_CHILD_TAGS: readonly { value: MomentChildTag; label: string }[] = [
  { value: "none", label: "Select children..." },
  { value: "leo", label: "Leo" },
  { value: "mia", label: "Mia" },
  { value: "both", label: "Both" },
] as const;

const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "video/mp4"]);

function readFormString(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? "").trim();
}

function isChildTag(value: string): value is MomentChildTag {
  return value === "none" || value === "leo" || value === "mia" || value === "both";
}

function isVisibility(value: string): value is MomentVisibility {
  return value === "shared" || value === "private";
}

export function sanitizeMomentTitle(value: string): string {
  return value.trim().split(/\s+/).join(" ");
}

export function sanitizeMomentCaption(value: string): string {
  return value.trim();
}

export function parseShareMomentFormData(formData: FormData): ShareMomentInput {
  const rawChild = readFormString(formData, "children");
  const rawVisibility = readFormString(formData, "visibility");
  const media = formData.get("media") as File | null;

  const childTag: MomentChildTag = isChildTag(rawChild) ? rawChild : "none";
  const visibility: MomentVisibility = isVisibility(rawVisibility) ? rawVisibility : "shared";

  return {
    title: sanitizeMomentTitle(readFormString(formData, "title")),
    caption: sanitizeMomentCaption(readFormString(formData, "caption")),
    childTag,
    visibility,
    mediaFileName: media && media.size > 0 ? media.name : undefined,
    mediaFileSizeBytes: media && media.size > 0 ? media.size : undefined,
    mediaFileType: media && media.size > 0 ? media.type : undefined,
  };
}

function validateTitle(title: string): ShareMomentValidation {
  if (title.length < 3) {
    return { valid: false, error: "Moment title must be at least 3 characters." };
  }

  if (title.length > 120) {
    return { valid: false, error: "Moment title must be 120 characters or fewer." };
  }

  return { valid: true };
}

function validateCaption(caption: string): ShareMomentValidation {
  if (caption.length > 500) {
    return { valid: false, error: "Caption must be 500 characters or fewer." };
  }

  return { valid: true };
}

function validateMedia(input: ShareMomentInput): ShareMomentValidation {
  if (!input.mediaFileName || !input.mediaFileSizeBytes || !input.mediaFileType) {
    return { valid: false, error: "Please upload a photo or video to share this moment." };
  }

  if (input.mediaFileSizeBytes > MAX_MEDIA_BYTES) {
    return { valid: false, error: "File exceeds the 50MB upload limit." };
  }

  if (!ALLOWED_MEDIA_TYPES.has(input.mediaFileType)) {
    return { valid: false, error: "Only PNG, JPG, or MP4 files are supported." };
  }

  return { valid: true };
}

export function validateShareMomentInput(input: ShareMomentInput): ShareMomentValidation {
  const validators = [validateTitle(input.title), validateCaption(input.caption), validateMedia(input)];
  const firstError = validators.find((result) => !result.valid);
  return firstError ?? { valid: true };
}
