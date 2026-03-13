import { fireEvent, render, screen } from "@testing-library/react";
import { FamilyManagementCard } from "@/components/settings/family-management-card";

const pendingInvitations = [
  {
    id: "inv-1",
    familyId: "family-1",
    invitedByUserId: "user-1",
    invitedName: "Jordan Coparent",
    email: "jordan@example.com",
    role: "secondary" as const,
    status: "pending" as const,
    token: "token-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

async function submitAction(): Promise<void> {
  await Promise.resolve();
}

describe("FamilyManagementCard", () => {
  it("opens add-member modal and switches between child and co-parent flows", () => {
    render(
      <FamilyManagementCard
        childMembers={[]}
        coParents={[]}
        pendingInvitations={pendingInvitations}
        submitAction={submitAction}
      />,
    );

    expect(screen.getByText(/Invite sent to jordan@example.com/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /Add Member/i }));

    expect(screen.getByText("Add Family Member")).toBeVisible();
    expect(screen.getByLabelText("First Name")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Invite Co-Parent" }));

    expect(screen.getByLabelText("Co-Parent Name")).toBeVisible();
    expect(screen.getByLabelText("Co-Parent Email")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send Invitation" })).toBeVisible();
  });
});
