/**
 * SMS Relay Setup Component
 *
 * Allows parents to enroll/unenroll phone numbers for SMS relay.
 * Shows current enrollment status and provides form for phone registration.
 */

"use client";

import { useState, useEffect } from "react";

interface SmsRelayStatus {
  isEnrolled: boolean;
  phone?: string;
  proxyNumber?: string;
}

export function SmsRelaySetup() {
  const [status, setStatus] = useState<SmsRelayStatus | null>(null);
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch current enrollment status
  useEffect(() => {
    async function loadStatus() {
      try {
        const response = await fetch("/api/messages/relay");
        if (response.ok) {
          const data = await response.json();
          setStatus(data);
        } else {
          // Default to not enrolled if endpoint returns error
          setStatus({ isEnrolled: false });
        }
      } catch (err) {
        console.error("[SmsRelay] Failed to load status:", err);
        setStatus({ isEnrolled: false });
      }
    }

    loadStatus();
  }, []);

  // Handle phone enrollment
  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/messages/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to enroll");
      }

      const result = await response.json();
      setStatus({
        isEnrolled: true,
        phone: result.phone,
        proxyNumber: result.proxyNumber,
      });
      setPhone("");
      setSuccess(
        `SMS relay enabled! You'll receive messages at ${result.phone} from ${result.proxyNumber}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Enrollment failed";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle unenrollment
  const handleUnenroll = async () => {
    if (!confirm("Are you sure you want to disable SMS relay?")) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/messages/relay", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to disable SMS relay");
      }

      setStatus({ isEnrolled: false });
      setSuccess("SMS relay disabled");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unenrollment failed";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!status) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Loading SMS relay status...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 dark:text-white">
          SMS Relay
        </h3>
        <span
          className={`text-xs font-medium px-2 py-1 rounded ${
            status.isEnrolled
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
          }`}
        >
          {status.isEnrolled ? "Enabled" : "Disabled"}
        </span>
      </div>

      {status.isEnrolled && status.phone && status.proxyNumber ? (
        <div className="space-y-3">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            <p className="mb-2">
              Your phone: <span className="font-mono font-semibold">{status.phone}</span>
            </p>
            <p>
              Relay number: <span className="font-mono font-semibold">{status.proxyNumber}</span>
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Messages sent to your family will be forwarded to your phone as SMS.
              You can reply by texting the relay number.
            </p>
          </div>

          <button
            onClick={handleUnenroll}
            disabled={isLoading}
            className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30"
          >
            Disable SMS Relay
          </button>
        </div>
      ) : (
        <form onSubmit={handleEnroll} className="space-y-3">
          <div>
            <label
              htmlFor="phone"
              className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Phone number (E.164 format, e.g., +12025551234)
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (202) 555-1234"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !phone}
            className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {isLoading ? "Setting up..." : "Enable SMS Relay"}
          </button>
        </form>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
          {success}
        </div>
      )}
    </div>
  );
}
