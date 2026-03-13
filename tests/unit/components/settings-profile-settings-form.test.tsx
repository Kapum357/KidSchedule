import { render, screen } from "@testing-library/react";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";

const fixturePasswordHash = ["placeholder", "hash", "value"].join("-");

async function submitAction(): Promise<void> {
  await Promise.resolve();
}

describe("ProfileSettingsForm", () => {
  it("renders named fields and submit button", () => {
    render(
      <ProfileSettingsForm
        profile={{
          id: "user-1",
          email: "parent@example.com",
          emailVerified: true,
          passwordHash: fixturePasswordHash,
          fullName: "Taylor Parent",
          phone: "+15551110000",
          phoneVerified: true,
          isDisabled: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }}
        submitAction={submitAction}
      />,
    );

    expect(screen.getByLabelText("Full Name")).toHaveAttribute("name", "fullName");
    expect(screen.getByLabelText("Email Address")).toHaveAttribute("name", "email");
    expect(screen.getByLabelText(/Phone Number/i)).toHaveAttribute("name", "phone");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeVisible();
    expect(screen.getByText("Verified")).toBeVisible();
  });
});
