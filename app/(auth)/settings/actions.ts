"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/persistence";
import { ensureParentExists } from "@/lib/parent-setup-engine";

const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(120, "Full name is too long"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(32, "Phone number is too long").optional(),
});

const addChildSchema = z.object({
  childFirstName: z.string().trim().min(1, "First name is required").max(80),
  childLastName: z.string().trim().min(1, "Last name is required").max(80),
  childDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
});

const addCoParentSchema = z.object({
  inviteName: z.string().trim().min(1, "Name is required").max(120),
  inviteEmail: z.string().trim().toLowerCase().email("Enter a valid email address"),
  invitePhone: z.string().trim().max(32).optional(),
});

function normalizePhone(input?: string): string | null {
  const trimmed = input?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function sanitizeReturnFragment(input: string): string {
  if (!input.startsWith("/settings")) {
    return "/settings";
  }
  return input;
}

function redirectWithProfileMessage(status: "success" | "error", message: string): never {
  const params = new URLSearchParams({
    profileStatus: status,
    profileMessage: message,
  });
  redirect(`/settings?${params.toString()}#profile`);
}

function redirectWithMemberMessage(status: "success" | "error", message: string): never {
  const params = new URLSearchParams({
    memberStatus: status,
    memberMessage: message,
  });
  redirect(`/settings?${params.toString()}#family`);
}

export async function saveProfileSettingsAction(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const db = getDb();

  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    redirectWithProfileMessage("error", parsed.error.issues[0]?.message ?? "Invalid profile data.");
  }

  const payload = parsed.data;
  const normalizedPhone = normalizePhone(payload.phone);

  const existingUser = await db.users.findById(user.userId);
  if (!existingUser) {
    redirectWithProfileMessage("error", "Unable to load your profile.");
  }

  const emailChanged = existingUser.email.toLowerCase() !== payload.email;
  const existingPhone = normalizePhone(existingUser.phone);
  const phoneChanged = existingPhone !== normalizedPhone;

  const updatedUser = await db.users.update(user.userId, {
    fullName: payload.fullName,
    email: payload.email,
    ...(phoneChanged ? { phone: normalizedPhone } : {}),
    ...(emailChanged
      ? {
          emailVerified: false,
          emailVerifiedAt: null,
        }
      : {}),
    ...(phoneChanged
      ? {
          phoneVerified: false,
          phoneVerifiedAt: null,
        }
      : {}),
  });

  if (!updatedUser) {
    redirectWithProfileMessage("error", "Unable to save your profile right now.");
  }

  const parent = await db.parents.findByUserId(user.userId);
  if (parent) {
    await db.parents.update(parent.id, {
      name: payload.fullName,
      email: payload.email,
      phone: normalizedPhone,
    });
  }

  revalidatePath("/settings");
  redirectWithProfileMessage("success", "Profile updated successfully.");
}

export async function addFamilyMemberAction(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const db = getDb();

  const memberType = (formData.get("memberType") as string | null)?.trim().toLowerCase();
  const parentResult = await ensureParentExists(user.userId);
  const familyId = parentResult.parent.familyId;

  if (memberType === "child") {
    const parsed = addChildSchema.safeParse({
      childFirstName: formData.get("childFirstName"),
      childLastName: formData.get("childLastName"),
      childDob: formData.get("childDob"),
    });

    if (!parsed.success) {
      redirectWithMemberMessage("error", parsed.error.issues[0]?.message ?? "Invalid child information.");
    }

    await db.children.create({
      familyId,
      firstName: parsed.data.childFirstName,
      lastName: parsed.data.childLastName,
      dateOfBirth: parsed.data.childDob,
      avatarUrl: undefined,
    });

    revalidatePath("/settings");
    redirectWithMemberMessage("success", "Child added successfully.");
  }

  if (memberType === "coparent") {
    const parsed = addCoParentSchema.safeParse({
      inviteName: formData.get("inviteName"),
      inviteEmail: formData.get("inviteEmail"),
      invitePhone: formData.get("invitePhone"),
    });

    if (!parsed.success) {
      redirectWithMemberMessage("error", parsed.error.issues[0]?.message ?? "Invalid co-parent invitation.");
    }

    if (parsed.data.inviteEmail === user.email.toLowerCase()) {
      redirectWithMemberMessage("error", "You cannot invite your own account.");
    }

    const parents = await db.parents.findByFamilyId(familyId);
    const existingParent = parents.find((parent) => parent.email.toLowerCase() === parsed.data.inviteEmail);
    if (existingParent) {
      redirectWithMemberMessage("error", "That co-parent is already a family member.");
    }

    const pendingInvitations = await db.parentInvitations.findPendingByFamilyId(familyId);
    const existingPending = pendingInvitations.find(
      (invitation) => invitation.email.toLowerCase() === parsed.data.inviteEmail,
    );

    if (existingPending) {
      redirectWithMemberMessage("error", "An invitation is already pending for that email.");
    }

    const now = Date.now();
    const expiresAt = new Date(now + 1000 * 60 * 60 * 24 * 14).toISOString();

    await db.parentInvitations.create({
      familyId,
      invitedByUserId: user.userId,
      invitedName: parsed.data.inviteName,
      email: parsed.data.inviteEmail,
      phone: normalizePhone(parsed.data.invitePhone) ?? undefined,
      role: "secondary",
      status: "pending",
      token: crypto.randomUUID(),
      expiresAt,
    });

    revalidatePath("/settings");
    redirectWithMemberMessage("success", "Co-parent invitation created and marked as pending.");
  }

  redirectWithMemberMessage("error", "Please choose whether you are adding a child or a co-parent.");
}

export async function goToPhoneVerificationManagementAction(formData: FormData): Promise<void> {
  const returnToRaw = (formData.get("returnTo") as string | null) ?? "/settings#security";
  const returnTo = sanitizeReturnFragment(returnToRaw);
  redirect(`/phone-verify?returnTo=${encodeURIComponent(returnTo)}`);
}
