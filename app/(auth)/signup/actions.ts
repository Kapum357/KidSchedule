import { redirect } from "next/navigation";
import { register } from "@/lib/auth";

export async function handleSignup(formData: FormData): Promise<void> {
  "use server";

  const fullName = (formData.get("fullName") as string | null)?.trim() ?? "";
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const confirmPassword = (formData.get("confirmPassword") as string | null) ?? "";
  const agreedToTerms = formData.get("agreedToTerms") === "on";
  const recaptchaToken = (formData.get("g-recaptcha-response") as string | null) ?? undefined;

  // Validate passwords match
  if (password !== confirmPassword) {
    redirect("/signup?error=passwords_dont_match");
  }

  // Validate terms agreement
  if (!agreedToTerms) {
    redirect("/signup?error=must_agree_terms");
  }

  const result = await register({ fullName, email, password, recaptchaToken });

  if (result.success) {
    redirect("/login?message=verify_email_sent");
  }

  // Encode error in URL params for stateless feedback
  const params = new URLSearchParams();
  if (result.error) params.set("error", result.error);
  if (result.errorMessage) params.set("message", result.errorMessage);
  redirect(`/signup?${params.toString()}`);
}
