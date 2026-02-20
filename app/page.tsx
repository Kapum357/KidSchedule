import { redirect } from "next/navigation";

/**
 * Root route – immediately redirects to the parent dashboard.
 * Once authentication is implemented, this should check session state
 * and redirect unauthenticated users to /login instead.
 */
export default function RootPage() {
  redirect("/dashboard");
}
