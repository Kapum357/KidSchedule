const mockRedirect = jest.fn().mockImplementation((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

jest.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

const mockRevalidatePath = jest.fn();

jest.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

jest.mock("@/lib/auth", () => ({
  requireAuth: jest.fn(),
}));

jest.mock("@/lib/parent-setup-engine", () => ({
  ensureParentExists: jest.fn(),
}));

const mockDb = {
  users: {
    findById: jest.fn(),
    update: jest.fn(),
  },
  parents: {
    findByUserId: jest.fn(),
    findByFamilyId: jest.fn(),
    update: jest.fn(),
  },
  children: {
    create: jest.fn(),
  },
  parentInvitations: {
    findPendingByFamilyId: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock("@/lib/persistence", () => ({
  getDb: () => mockDb,
}));

import {
  addFamilyMemberAction,
  saveProfileSettingsAction,
} from "@/app/(auth)/settings/actions";

const { requireAuth } = jest.requireMock("@/lib/auth") as { requireAuth: jest.Mock };
const { ensureParentExists } = jest.requireMock("@/lib/parent-setup-engine") as {
  ensureParentExists: jest.Mock;
};

function captureRedirectUrl(error: unknown): string {
  expect(error).toBeInstanceOf(Error);
  return (error as Error).message.replace("NEXT_REDIRECT:", "");
}

describe("settings actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireAuth.mockResolvedValue({ userId: "user-1", email: "parent@home.com" });
    ensureParentExists.mockResolvedValue({ parent: { id: "parent-1", familyId: "family-1" } });
  });

  it("saveProfileSettingsAction persists profile and resets verification when contact fields change", async () => {
    mockDb.users.findById.mockResolvedValue({
      id: "user-1",
      email: "old@home.com",
      fullName: "Old Name",
      phone: "+15551110000",
      phoneVerified: true,
      emailVerified: true,
    });

    mockDb.users.update.mockResolvedValue({ id: "user-1" });
    mockDb.parents.findByUserId.mockResolvedValue({ id: "parent-1" });
    mockDb.parents.update.mockResolvedValue({ id: "parent-1" });

    const formData = new FormData();
    formData.set("fullName", "New Name");
    formData.set("email", "new@home.com");
    formData.set("phone", "+15552223333");

    const error = await saveProfileSettingsAction(formData).catch((e) => e);
    const redirectUrl = captureRedirectUrl(error);

    expect(mockDb.users.update).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        fullName: "New Name",
        email: "new@home.com",
        phone: "+15552223333",
        emailVerified: false,
        emailVerifiedAt: null,
        phoneVerified: false,
        phoneVerifiedAt: null,
      }),
    );

    expect(mockDb.parents.update).toHaveBeenCalledWith(
      "parent-1",
      expect.objectContaining({
        name: "New Name",
        email: "new@home.com",
        phone: "+15552223333",
      }),
    );

    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings");
    expect(redirectUrl).toContain("profileStatus=success");
  });

  it("addFamilyMemberAction creates child records", async () => {
    mockDb.children.create.mockResolvedValue({ id: "child-1" });

    const formData = new FormData();
    formData.set("memberType", "child");
    formData.set("childFirstName", "Sam");
    formData.set("childLastName", "Rivera");
    formData.set("childDob", "2016-02-14");

    const error = await addFamilyMemberAction(formData).catch((e) => e);
    const redirectUrl = captureRedirectUrl(error);

    expect(mockDb.children.create).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: "family-1",
        firstName: "Sam",
        lastName: "Rivera",
        dateOfBirth: "2016-02-14",
      }),
    );
    expect(redirectUrl).toContain("memberStatus=success");
  });

  it("addFamilyMemberAction creates pending co-parent invitations", async () => {
    mockDb.parents.findByFamilyId.mockResolvedValue([]);
    mockDb.parentInvitations.findPendingByFamilyId.mockResolvedValue([]);
    mockDb.parentInvitations.create.mockResolvedValue({ id: "invite-1" });

    const formData = new FormData();
    formData.set("memberType", "coparent");
    formData.set("inviteName", "Morgan Rivera");
    formData.set("inviteEmail", "coparent@example.com");
    formData.set("invitePhone", "+15554445555");

    const error = await addFamilyMemberAction(formData).catch((e) => e);
    const redirectUrl = captureRedirectUrl(error);

    expect(mockDb.parentInvitations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: "family-1",
        invitedName: "Morgan Rivera",
        email: "coparent@example.com",
        status: "pending",
        role: "secondary",
      }),
    );

    expect(redirectUrl).toContain("memberStatus=success");
  });
});
