/**
 * Settings Page
 *
 * Main settings hub with profile, family, notifications, security, and billing sections.
 */

import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/persistence";
import Link from "next/link";
import type { DbParent, DbChild } from "@/lib/persistence/types";
import { ConflictWindowSettings } from "@/components/conflict-window-settings";

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

export default async function SettingsPage() {
  const user = await requireAuth();
  const db = getDb();

  // Fetch user profile
  const profile = await db.users.findById(user.userId);

  // Fetch family and members
  const family = await db.families.findByParentUserId(user.userId);

  let parents: DbParent[] = [];
  let children: DbChild[] = [];

  if (family) {
    parents = await db.parents.findByFamilyId(family.id);
    children = await db.children.findByFamilyId(family.id);
  }

  const stripeCustomer = await db.stripeCustomers.findByUserId(user.userId);
  let subscription = null;
  if (stripeCustomer) {
    subscription = await db.subscriptions.findByCustomer(stripeCustomer.id);
  }

  // Fetch conflict window setting server-side
  const conflictWindowMins = await getConflictWindowValue();

  const otherParents = parents.filter((p) => p.userId !== user.userId);

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
            {/* Profile Settings Section */}
            <section
              className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white shadow-sm dark:bg-neutral-dark"
              id="profile"
            >
              <div className="border-b border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-bold text-slate-600 dark:text-slate-900">Profile Settings</h3>
                <p className="text-smtext-slate-500 text-slate-600 dark:text-slate-900">
                  Update your personal identification and contact details.
                </p>
              </div>
              <div className="flex flex-col gap-6 p-6">
                <div className="flex flex-col gap-4 md:flex-row">
                  <div className="flex flex-1 flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-600 dark:text-slate-900" htmlFor="fullName">Full Name</label>
                    <input
                      id="fullName"
                      className={`w-full rounded-lg border border-slate-300 dark:border-slate-600
                        bg-background-light p-3 focus:border-primary focus:ring-primary
                        dark:bg-background-dark text-slate-700 dark:text-slate-800`}
                      type="text"
                      defaultValue={profile?.fullName ?? ""}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-600 dark:text-slate-900" htmlFor="emailAddress">Email Address</label>
                    <input
                      id="emailAddress"
                      className={`w-full rounded-lg border border-slate-300 dark:border-slate-600
                        bg-background-light p-3 focus:border-primary focus:ring-primary
                        dark:bg-background-dark text-slate-700 dark:text-slate-800`}
                      type="email"
                      defaultValue={profile?.email ?? ""}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-600 dark:text-slate-900" htmlFor="phoneNumber">Phone Number (Verified via Twilio)</label>
                  <div className="flex gap-2">
                    <input
                      id="phoneNumber"
                      className={`flex-1 rounded-lg border border-slate-300 dark:border-slate-600
                        bg-background-light p-3 focus:border-primary focus:ring-primary
                        dark:bg-background-dark text-slate-700 dark:text-slate-800`}
                      type="tel"
                      defaultValue={profile?.phone ?? ""}
                    />
                    {profile?.phoneVerified && (
                      <div className="flex items-center gap-1 rounded-lg bg-green-100 px-3 text-xs font-bold uppercase tracking-wider text-green-700">
                        <span className="material-symbols-outlined text-sm">verified</span>
                        Verified
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button className="rounded-lg bg-primary px-6 py-2 font-bold text-white transition-colors hover:bg-primary/90">
                    Save Changes
                  </button>
                </div>
              </div>
            </section>

            {/* Family Management Section */}
            <section
              className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white shadow-sm dark:bg-neutral-dark"
              id="family"
            >
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 p-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-600 dark:text-slate-900">Family Management</h3>
                  <p className="text-sm text-slate-500">Manage children and co-parent access.</p>
                </div>
                <button className="flex items-center gap-1 rounded-lg p-2 text-sm font-semibold text-primary hover:bg-primary/10">
                  <span className="material-symbols-outlined">add</span> Add Member
                </button>
              </div>
              <div className="space-y-4 p-6">
                {children.map((child) => (
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
                    <button className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                      <span className="material-symbols-outlined">edit</span>
                    </button>
                  </div>
                ))}
                
                {otherParents.map((parent) => {
                  const isAccepted = parent.createdAt !== "";
                  let statusText = "Pending";
                  if (isAccepted) {
                    statusText = "Invitation Accepted";
                  }
                  
                  return (
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
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                            Status: {statusText}
                          </p>
                        </div>
                      </div>
                      {isAccepted && (
                        <span className="material-symbols-outlined text-primary">check_circle</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

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

            {/* Security & Privacy Section */}
            <section
              className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white shadow-sm dark:bg-neutral-dark"
              id="security"
            >
              <div className="border-b border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-bold text-slate-600 dark:text-slate-900">Security &amp; Privacy</h3>
                <p className="text-sm text-slate-500">Manage password and compliance settings.</p>
              </div>
              <div className="flex flex-col gap-6 p-6">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-600 dark:text-slate-900" htmlFor="twoFactor">Two-Factor Authentication</label>
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-primary/5 p-4">
                    <span className="material-symbols-outlined text-primary">security</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-900">
                        2FA is currently DISABLED
                      </p>
                      <p className="text-xs text-slate-500">
                        Using Twilio-verified mobile number for login attempts.
                      </p>
                    </div>
                    <button className="text-xs font-bold text-primary underline">Manage</button>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-900">GDPR &amp; Consent (FR-12)</p>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3">
                      <input
                        defaultChecked
                        className="mt-1 rounded text-primary focus:ring-primary"
                        type="checkbox"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-800">
                        I consent to the processing of my communication data for the purpose of
                        mediation analysis.
                      </span>
                    </label>
                    <label className="flex items-start gap-3">
                      <input
                        defaultChecked
                        className="mt-1 rounded text-primary focus:ring-primary"
                        type="checkbox"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-800">
                        Allow legal export of my communication logs for mediation purposes.
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

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
