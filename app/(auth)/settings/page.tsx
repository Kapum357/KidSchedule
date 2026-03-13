/**
 * Settings Page
 *
 * Main settings hub with profile, family, notifications, security, and billing sections.
 */

import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/persistence";
import Link from "next/link";
import type { DbParent, DbChild, DbParentInvitation } from "@/lib/persistence/types";
import { ConflictWindowSettings } from "@/components/conflict-window-settings";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { FamilyManagementCard } from "@/components/settings/family-management-card";
import { SecurityManagementCard } from "@/components/settings/security-management-card";
import { addFamilyMemberAction, saveProfileSettingsAction } from "./actions";

export const metadata = {
  title: "Settings — KidSchedule",
  description: "Manage your account settings and preferences",
};

/**
 * Fetch the current conflict window value from the API server-side.
 * Falls back to default (120 minutes) on any error to avoid blocking page render.
 */
async function getConflictWindowValue(): Promise<number> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/settings/conflict-window`,
      {
        method: "GET",
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return 120; // Default on HTTP error
    }

    const data = await response.json();
    return data.windowMins ?? 120;
  } catch {
    // Default on network error or parsing error
    return 120;
  }
}

interface SettingsPageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SettingsPage({ searchParams }: Readonly<SettingsPageProps>) {
  const user = await requireAuth();
  const db = getDb();
  const params = await searchParams;

  // Fetch user profile
  const profile = await db.users.findById(user.userId);

  // Fetch family and members
  const family = await db.families.findByParentUserId(user.userId);

  let parents: DbParent[] = [];
  let children: DbChild[] = [];
  let pendingInvitations: DbParentInvitation[] = [];

  if (family) {
    parents = await db.parents.findByFamilyId(family.id);
    children = await db.children.findByFamilyId(family.id);
    pendingInvitations = await db.parentInvitations.findPendingByFamilyId(family.id);
  }

  const stripeCustomer = await db.stripeCustomers.findByUserId(user.userId);
  let subscription = null;
  if (stripeCustomer) {
    subscription = await db.subscriptions.findByCustomer(stripeCustomer.id);
  }

  // Fetch conflict window setting server-side
  const conflictWindowMins = await getConflictWindowValue();

  const otherParents = parents.filter((p) => p.userId !== user.userId);

  const profileStatus =
    typeof params?.profileStatus === "string" && (params.profileStatus === "success" || params.profileStatus === "error")
      ? params.profileStatus
      : undefined;
  const profileMessage = typeof params?.profileMessage === "string" ? params.profileMessage : undefined;

  const memberStatus =
    typeof params?.memberStatus === "string" && (params.memberStatus === "success" || params.memberStatus === "error")
      ? params.memberStatus
      : undefined;
  const memberMessage = typeof params?.memberMessage === "string" ? params.memberMessage : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark">
      <main className="flex flex-1 justify-center py-8">
        <div className="flex w-full max-w-[1200px] flex-1 gap-8 px-4 md:px-10">
          {/* Sidebar Navigation */}
          <aside className="hidden w-64 flex-shrink-0 flex-col gap-2 md:flex">
            <h1 className="mb-4 text-xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
            <nav className="flex flex-col gap-1">
              <a
                className="flex items-center gap-3 rounded-lg bg-primary px-4 py-3 font-semibold text-white"
                href="#profile"
              >
                <span className="material-symbols-outlined">person</span>
                <span>Profile</span>
              </a>
              <a
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-slate-600 transition-colors hover:bg-primary/10 dark:text-slate-300"
                href="#family"
              >
                <span className="material-symbols-outlined">family_restroom</span>
                <span>Family Members</span>
              </a>
              <a
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-slate-600 transition-colors hover:bg-primary/10 dark:text-slate-300"
                href="#notifications"
              >
                <span className="material-symbols-outlined">notifications_active</span>
                <span>Notifications</span>
              </a>
              <a
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-slate-600 transition-colors hover:bg-primary/10 dark:text-slate-300"
                href="#security"
              >
                <span className="material-symbols-outlined">shield</span>
                <span>Security &amp; Privacy</span>
              </a>
              <a
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-slate-600 transition-colors hover:bg-primary/10 dark:text-slate-300"
                href="#subscription"
              >
                <span className="material-symbols-outlined">credit_card</span>
                <span>Subscription</span>
              </a>
              {family && (
                <a
                  className="flex items-center gap-3 rounded-lg px-4 py-3 text-slate-600 transition-colors hover:bg-primary/10 dark:text-slate-300"
                  href="#conflict-buffer"
                >
                  <span className="material-symbols-outlined">schedule</span>
                  <span>Conflict Buffer</span>
                </a>
              )}
            </nav>
          </aside>

          {/* Content Area */}
          <div className="flex max-w-3xl flex-1 flex-col gap-8">
            <ProfileSettingsForm
              message={profileMessage}
              profile={profile}
              status={profileStatus}
              submitAction={saveProfileSettingsAction}
            />

            <FamilyManagementCard
              childMembers={children}
              coParents={otherParents}
              message={memberMessage}
              pendingInvitations={pendingInvitations}
              status={memberStatus}
              submitAction={addFamilyMemberAction}
            />

            {/* Notification Preferences Section */}
            <section
              className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white shadow-sm dark:bg-neutral-dark"
              id="notifications"
            >
              <div className="border-b border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-bold text-slate-600 dark:text-slate-900">Notification Preferences</h3>
                <p className="text-sm text-slate-500">Configure how and when you receive alerts.</p>
              </div>
              <div className="flex flex-col gap-6 p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-600 dark:text-slate-900">Calendar Changes</p>
                      <p className="text-xs text-slate-500">New events or schedule modifications</p>
                    </div>
                    <div className="flex gap-4">
                      <label className="flex flex-col items-center gap-1">
                        <input
                          defaultChecked
                          className="h-5 w-5 rounded text-primary focus:ring-primary"
                          type="checkbox"
                        />
                        <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Push</span>
                      </label>
                      <label className="flex flex-col items-center gap-1">
                        <input
                          defaultChecked
                          className="h-5 w-5 rounded text-primary focus:ring-primary"
                          type="checkbox"
                        />
                        <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">SMS</span>
                      </label>
                    </div>
                  </div>
                    <hr className="border-slate-200 dark:border-slate-700" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-600 dark:text-slate-900">Expense Entries</p>
                      <p className="text-xs text-slate-500">New shared expenses or payment requests</p>
                    </div>
                    <div className="flex gap-4">
                      <label className="flex flex-col items-center gap-1">
                        <input
                          defaultChecked
                          className="h-5 w-5 rounded text-primary focus:ring-primary"
                          type="checkbox"
                        />
                        <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Push</span>
                      </label>
                      <label className="flex flex-col items-center gap-1">
                        <input
                          className="h-5 w-5 rounded text-primary focus:ring-primary"
                          type="checkbox"
                        />
                        <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">SMS</span>
                      </label>
                    </div>
                  </div>
                  <hr className="border-slate-200 dark:border-slate-700" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-red-500">Mediation Warnings</p>
                      <p className="text-xs text-slate-500">AI-detected conflict in communications</p>
                    </div>
                    <div className="flex gap-4">
                      <label className="flex flex-col items-center gap-1">
                        <input
                          defaultChecked
                          className="h-5 w-5 rounded text-primary focus:ring-primary"
                          type="checkbox"
                        />
                        <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Push</span>
                      </label>
                      <label className="flex flex-col items-center gap-1">
                        <input
                          defaultChecked
                          className="h-5 w-5 rounded text-primary focus:ring-primary"
                          type="checkbox"
                        />
                        <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">SMS</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <SecurityManagementCard phone={profile?.phone} phoneVerified={Boolean(profile?.phoneVerified)} />

            {/* Billing & Subscription Section */}
            <section
              className="mb-12 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white shadow-sm dark:bg-neutral-dark"
              id="subscription"
            >
              <div className="border-b border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-bold text-slate-600 dark:text-slate-900">Billing &amp; Subscription</h3>
                <p className="text-sm text-slate-500">
                  Manage your Stripe-integrated subscription plan.
                </p>
              </div>
              <div className="p-6">
                <div className="flex flex-col items-center gap-6 md:flex-row">
                  <div className="relative w-full flex-1 overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary/60 p-6 text-white">
                    <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-9xl opacity-10">
                      workspace_premium
                    </span>
                    <div className="relative z-10">
                      <p className="text-xs font-bold uppercase tracking-widest opacity-80">
                        Current Plan
                      </p>
                      <h4 className="my-2 text-3xl font-extrabold">
                        {subscription && subscription.planTier.replace("-", " ").toUpperCase()}
                        {!subscription && "Free Plan"}
                      </h4>
                      <p className="text-sm opacity-90">
                        {subscription && (
                          <>
                            Renews{" "}
                            {new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </>
                        )}
                        {!subscription && "No active subscription"}
                      </p>
                    </div>
                  </div>
                  <div className="flex w-full flex-col gap-2 md:w-auto">
                    <Link href="/settings/billing">
                      <button
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-8 py-3 font-bold text-white md:w-auto"
                      >
                        <span className="material-symbols-outlined">payments</span> Manage Billing
                      </button>
                    </Link>
                    {subscription && (
                      <button className="w-full rounded-lg border border-primary px-8 py-3 font-bold text-primary hover:bg-primary/5 md:w-auto">
                        Cancel Subscription
                      </button>
                    )}
                  </div>
                </div>
                {subscription && (
                  <div className="mt-8">
                    <h4 className="mb-4 text-sm font-bold">Payment Methods</h4>
                    <div className="flex items-center gap-4 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                      <div className="flex h-8 w-12 items-center justify-center rounded bg-slate-200 dark:bg-neutral-800">
                        <span className="text-[10px] font-black italic">CARD</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold">Payment method on file</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">Managed via Stripe</p>
                      </div>
                      <Link href="/settings/billing">
                        <button className="text-xs font-bold text-slate-600 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-200">Edit</button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Schedule Conflict Buffer Section */}
            {family && (
              <section
                className="mb-12 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white shadow-sm dark:bg-neutral-dark"
                id="conflict-buffer"
              >
                <div className="border-b border-slate-200 dark:border-slate-700 p-6">
                  <h3 className="text-lg font-bold text-slate-600 dark:text-slate-900">Schedule Conflict Buffer</h3>
                  <p className="text-sm text-slate-500">
                    Set how far ahead the system looks for potential scheduling conflicts between parents.
                  </p>
                </div>
                <div className="p-6">
                  <ConflictWindowSettings
                    defaultWindowMins={conflictWindowMins}
                    familyId={family.id}
                  />
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
