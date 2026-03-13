"use client";

import { useState } from "react";
import type { DbChild, DbParent, DbParentInvitation } from "@/lib/persistence/types";

interface FamilyManagementCardProps {
  childMembers: DbChild[];
  coParents: DbParent[];
  pendingInvitations: DbParentInvitation[];
  submitAction: (formData: FormData) => Promise<void>;
  status?: "success" | "error";
  message?: string;
}

export function FamilyManagementCard({
  childMembers,
  coParents,
  pendingInvitations,
  submitAction,
  status,
  message,
}: Readonly<FamilyManagementCardProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [memberType, setMemberType] = useState<"child" | "coparent">("child");

  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white shadow-sm dark:bg-neutral-dark"
      id="family"
    >
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 p-6">
        <div>
          <h3 className="text-lg font-bold text-slate-600 dark:text-slate-900">Family Management</h3>
          <p className="text-sm text-slate-500">Manage children and co-parent access.</p>
        </div>
        <button
          className="flex items-center gap-1 rounded-lg p-2 text-sm font-semibold text-primary hover:bg-primary/10"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          <span className="material-symbols-outlined">add</span> Add Member
        </button>
      </div>

      <div className="space-y-4 p-6">
        {status && message && (
          <p
            className={`rounded-md border px-3 py-2 text-sm ${
              status === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-200"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/40 dark:bg-rose-900/20 dark:text-rose-200"
            }`}
            role="status"
          >
            {message}
          </p>
        )}

        {childMembers.map((child) => (
          <div
            key={child.id}
            className="flex items-center justify-between rounded-xl border border-slate-300 dark:border-slate-600 bg-background-light p-4 dark:bg-background-dark"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary">
                <span className="material-symbols-outlined">child_care</span>
              </div>
              <div>
                <p className="font-bold">{child.firstName} {child.lastName}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Born: {new Date(child.dateOfBirth).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>
        ))}

        {coParents.map((parent) => (
          <div
            key={parent.id}
            className="flex items-center justify-between rounded-xl border border-slate-300 dark:border-slate-600 bg-background-light p-4 dark:bg-background-dark"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary">
                <span className="material-symbols-outlined">person</span>
              </div>
              <div>
                <p className="font-bold">
                  {parent.name}{" "}
                  <span className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] uppercase text-primary">
                    Co-Parent
                  </span>
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">Status: Active member</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-primary">check_circle</span>
          </div>
        ))}

        {pendingInvitations.map((invitation) => (
          <div
            key={invitation.id}
            className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                <span className="material-symbols-outlined">mail</span>
              </div>
              <div>
                <p className="font-bold text-slate-700 dark:text-slate-100">
                  {invitation.invitedName || invitation.email}
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-100">
                    Pending
                  </span>
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Invite sent to {invitation.email}
                </p>
              </div>
            </div>
            <span className="material-symbols-outlined text-amber-700 dark:text-amber-300">hourglass_top</span>
          </div>
        ))}
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-neutral-dark">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-lg font-bold text-slate-700 dark:text-slate-100">Add Family Member</h4>
              <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setIsOpen(false)} type="button">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="mb-4 flex gap-2">
              <button
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  memberType === "child" ? "bg-primary text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200"
                }`}
                onClick={() => setMemberType("child")}
                type="button"
              >
                Add Child
              </button>
              <button
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  memberType === "coparent" ? "bg-primary text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200"
                }`}
                onClick={() => setMemberType("coparent")}
                type="button"
              >
                Invite Co-Parent
              </button>
            </div>

            <form action={submitAction} className="space-y-4">
              <input name="memberType" type="hidden" value={memberType} />

              {memberType === "child" ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300" htmlFor="childFirstName">
                        First Name
                      </label>
                      <input id="childFirstName" name="childFirstName" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-600 dark:bg-slate-900" required type="text" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300" htmlFor="childLastName">
                        Last Name
                      </label>
                      <input id="childLastName" name="childLastName" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-600 dark:bg-slate-900" required type="text" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300" htmlFor="childDob">
                      Date of Birth
                    </label>
                    <input id="childDob" name="childDob" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-600 dark:bg-slate-900" required type="date" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300" htmlFor="inviteName">
                      Co-Parent Name
                    </label>
                    <input id="inviteName" name="inviteName" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-600 dark:bg-slate-900" required type="text" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300" htmlFor="inviteEmail">
                      Co-Parent Email
                    </label>
                    <input id="inviteEmail" name="inviteEmail" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-600 dark:bg-slate-900" required type="email" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300" htmlFor="invitePhone">
                      Co-Parent Phone (optional)
                    </label>
                    <input id="invitePhone" name="invitePhone" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-600 dark:bg-slate-900" type="tel" />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200" onClick={() => setIsOpen(false)} type="button">
                  Cancel
                </button>
                <button className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white" type="submit">
                  {memberType === "child" ? "Add Child" : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
