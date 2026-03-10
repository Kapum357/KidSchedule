// KidSchedule – Signup Validator

import type {
  SignupCredentials,
  SignupResult,
  AuthProvider,
} from "@/lib";

// ─── Configuration ────────────────────────────────────────────────────────────

const MIN_NAME_LENGTH = 2;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

/** RFC 5322 simplified – catches obvious malformed emails */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Password strength rules: must contain uppercase, lowercase, digit, special */
const PASSWORD_RULES = {
  hasMinLength: (pwd: string) => pwd.length >= MIN_PASSWORD_LENGTH,
  hasMaxLength: (pwd: string) => pwd.length <= MAX_PASSWORD_LENGTH,
  hasUppercase: (pwd: string) => /[A-Z]/.test(pwd),
  hasLowercase: (pwd: string) => /[a-z]/.test(pwd),
  hasDigit: (pwd: string) => /\d/.test(pwd),
  hasSpecial: (pwd: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
};

// ─── Internal Validation Helpers ──────────────────────────────────────────────

/**
 * Validates name field (2+ chars, no leading/trailing whitespace).
 * Complexity: O(n) where n = name.length (bounded)
 *
 * @param name Full name to validate
 * @returns Error message or null if valid
 */
function validateName(name: string): string | null {
  const trimmed = name?.trim() ?? "";

  if (trimmed.length < MIN_NAME_LENGTH) {
    return `Please provide your full name (at least ${MIN_NAME_LENGTH} characters).`;
  }

  // Basic XSS check – reject if contains HTML-like patterns
  if (/<[^>]*>/.test(name)) {
    return "Name contains invalid characters.";
  }

  return null;
}

/**
 * Validates email format using simplified RFC 5322.
 * Complexity: O(n) where n = email.length (bounded ~250 chars)
 *
 * Note: Does NOT check if email exists in DB or is deliverable.
 * Those checks happen later in the registration flow for performance.
 *
 * @param email Email address to validate
 * @returns Error message or null if valid
 */
function validateEmail(email: string): string | null {
  const trimmed = email?.trim() ?? "";

  if (!EMAIL_REGEX.test(trimmed)) {
    return "Please enter a valid email address.";
  }

  if (trimmed.length > 254) {
    return "Email address is too long.";
  }

  return null;
}

/**
 * Validates password strength and format.
 * Requires all four categories: uppercase, lowercase, digit, special char.
 * Complexity: O(password.length) but password capped at 128 chars ≈ O(1)
 *
 * @param password Password to validate
 * @returns Array of error messages (empty if valid)
 */
function validatePasswordStrength(password: string): string[] {
  const errors: string[] = [];

  // Length checks
  if (!PASSWORD_RULES.hasMinLength(password)) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!PASSWORD_RULES.hasMaxLength(password)) {
    errors.push(`Password must be less than ${MAX_PASSWORD_LENGTH} characters.`);
  }

  // Character composition (only if length is valid)
  if (PASSWORD_RULES.hasMinLength(password) && PASSWORD_RULES.hasMaxLength(password)) {
    if (!PASSWORD_RULES.hasUppercase(password)) {
      errors.push("Password must contain at least one uppercase letter (A–Z).");
    }
    if (!PASSWORD_RULES.hasLowercase(password)) {
      errors.push("Password must contain at least one lowercase letter (a–z).");
    }
    if (!PASSWORD_RULES.hasDigit(password)) {
      errors.push("Password must contain at least one number (0–9).");
    }
    if (!PASSWORD_RULES.hasSpecial(password)) {
      errors.push(
        "Password must contain at least one special character (!@#$%^&*()_+, etc.)."
      );
    }
  }

  return errors;
}

/**
 * Validates that password and confirmation match.
 * Complexity: O(n) where n = password.length (constant-time comparison)
 *
 * @param password Password
 * @param confirmPassword Confirmation password
 * @returns Error message or null if they match
 */
function validatePasswordMatch(
  password: string,
  confirmPassword: string
): string | null {
  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }
  return null;
}

// ─── Main Validation Function ────────────────────────────────────────────────

export interface SignupValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string>;
  errors: string[];
}

/**
 * Validates signup credentials against the specified auth provider.
 *
 * @param credentials User-submitted signup form data
 * @param provider Auth provider determining validation rules
 * @returns Validation result with field-level errors
 */
export function validateSignupCredentials(
  credentials: Partial<SignupCredentials> | null,
  provider: AuthProvider
): SignupValidationResult {
  const fieldErrors: Record<string, string> = {};
  const errors: string[] = [];

  // ── Null/undefined check ──────────────────────────────────────────────────
  if (!credentials) {
    return {
      valid: false,
      fieldErrors: { form: "Missing signup form data." },
      errors: ["Missing signup form data."],
    };
  }

  // ── Name Validation (all providers) ───────────────────────────────────────
  const nameError = validateName(credentials.fullName ?? "");
  if (nameError) {
    fieldErrors.fullName = nameError;
    errors.push(nameError);
  }

  // ── Email Validation (all providers) ──────────────────────────────────────
  const emailError = validateEmail(credentials.email ?? "");
  if (emailError) {
    fieldErrors.email = emailError;
    errors.push(emailError);
  }

  // ── Provider-specific validation ──────────────────────────────────────────

  if (provider === "email") {
    // Email/password flow: validate password fields
    const password = credentials.password ?? "";
    const confirmPassword = credentials.confirmPassword ?? "";

    // Password strength
    const strengthErrors = validatePasswordStrength(password);
    if (strengthErrors.length > 0) {
      fieldErrors.password = strengthErrors[0];
      errors.push(...strengthErrors);
    }

    // Password match
    const matchError = validatePasswordMatch(password, confirmPassword);
    if (matchError) {
      fieldErrors.confirmPassword = matchError;
      errors.push(matchError);
    }
  } else if (provider === "google" || provider === "apple") {
    // OAuth flow: no password needed, skip password validation
    // (OAuth provider has already verified identity via ID token)
  }

  // ── Terms acceptance (all providers) ──────────────────────────────────────
  if (!credentials.agreedToTerms) {
    fieldErrors.terms = "You must agree to the terms and conditions.";
    errors.push("You must agree to the terms and conditions.");
  }

  // ── Return aggregated result ────────────────────────────────────────────
  return {
    valid: errors.length === 0,
    fieldErrors,
    errors,
  };
}

// ─── Integration with SignupResult ───────────────────────────────────────────

/**
 * Converts validation result to SignupResult format for API responses.
 * Used when validation fails before attempting registration.
 *
 * USAGE:
 *   const validation = validateSignupCredentials(formData, "email");
 *   if (!validation.valid) {
 *     return validationToSignupResult(validation);
 *   }
 *
 * @param validation Result from validateSignupCredentials
 * @returns SignupResult compatible with auth flow
 */
export function validationToSignupResult(
  validation: SignupValidationResult
): SignupResult {
  return {
    success: false,
    error: "invalid_credentials",
    errorMessage:
      validation.errors[0] ?? "Please review the form and correct any errors.",
    fieldErrors: validation.fieldErrors,
  };
}

// ─── Password Strength Checker (Exported Utility) ────────────────────────────

/**
 * Standalone password strength checker for real-time UI feedback during typing.
 * Returns a score and list of unmet requirements.
 *
 * USAGE (in client component):
 *   const [password, setPassword] = useState("");
 *   const strength = getPasswordStrength(password);
 *   return (
 *     <>
 *       <input value={password} onChange={(e) => setPassword(e.target.value)} />
 *       <StrengthBar score={strength.score} />
 *       <ErrorList errors={strength.unmetRequirements} />
 *     </>
 *   );
 *
 * Complexity: O(password.length)
 */
export interface PasswordStrength {
  score: number; // 0–100
  label: "weak" | "fair" | "good" | "strong";
  unmetRequirements: string[];
}

export function getPasswordStrength(password: string): PasswordStrength {
  const unmetRequirements: string[] = [];

  if (!PASSWORD_RULES.hasMinLength(password)) {
    unmetRequirements.push(`At least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!PASSWORD_RULES.hasUppercase(password)) {
    unmetRequirements.push("One uppercase letter");
  }
  if (!PASSWORD_RULES.hasLowercase(password)) {
    unmetRequirements.push("One lowercase letter");
  }
  if (!PASSWORD_RULES.hasDigit(password)) {
    unmetRequirements.push("One number");
  }
  if (!PASSWORD_RULES.hasSpecial(password)) {
    unmetRequirements.push("One special character");
  }

  const metRequirements = 5 - unmetRequirements.length;
  const score = Math.round((metRequirements / 5) * 100);

  let label: "weak" | "fair" | "good" | "strong";
  if (score <= 20) label = "weak";
  else if (score <= 50) label = "fair";
  else if (score <= 80) label = "good";
  else label = "strong";

  return { score, label, unmetRequirements };
}
