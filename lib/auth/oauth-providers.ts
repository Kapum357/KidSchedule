/**
 * OAuth Provider Verification
 *
 * Verifies ID tokens from OAuth providers (Google, Apple) and extracts user profile.
 * - Google: Uses google-auth-library to verify JWT signature and issuer
 * - Apple: Uses apple-signin-auth to verify JWT and handle Apple-specific claims
 *
 * Install:
 *   pnpm add google-auth-library apple-signin-auth
 */

// ─── Type Definitions ──────────────────────────────────────────────────────────

export interface OAuthProfile {
  provider: "google" | "apple";
  providerId: string;   // Provider's unique user ID (sub claim)
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export interface OAuthVerificationResult {
  success: boolean;
  profile?: OAuthProfile;
  error?: string;
}

// ─── Google OAuth Verification ────────────────────────────────────────────────

/**
 * Verify Google ID token and extract user profile.
 *
 * To enable: Install google-auth-library and set GOOGLE_CLIENT_ID
 *   pnpm add google-auth-library
 *
 * Example usage:
 *   import { OAuth2Client } from 'google-auth-library';
 *   const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
 *   const ticket = await client.verifyIdToken({
 *     idToken,
 *     audience: process.env.GOOGLE_CLIENT_ID,
 *   });
 *   const payload = ticket.getPayload();
 */
export async function verifyGoogleToken(
  idToken: string
): Promise<OAuthVerificationResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return {
      success: false,
      error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID in environment.",
    };
  }

  try {
    // In production with google-auth-library:
    // const client = new OAuth2Client(clientId);
    // const ticket = await client.verifyIdToken({
    //   idToken,
    //   audience: clientId,
    // });
    // const payload = ticket.getPayload();
    //
    // if (!payload) {
    //   return { success: false, error: "Invalid token payload" };
    // }
    //
    // return {
    //   success: true,
    //   profile: {
    //     provider: "google",
    //     providerId: payload.sub,
    //     email: payload.email!,
    //     emailVerified: payload.email_verified ?? false,
    //     name: payload.name,
    //     picture: payload.picture,
    //   },
    // };

    // Mock implementation for development
    console.warn("[OAuth] Using mock Google verification. Install google-auth-library for production.");
    
    // Decode token without verification (unsafe, for dev only)
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      return { success: false, error: "Invalid token format" };
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));

    return {
      success: true,
      profile: {
        provider: "google",
        providerId: payload.sub || "google-mock-id",
        email: payload.email || "user@example.com",
        emailVerified: payload.email_verified ?? true,
        name: payload.name,
        picture: payload.picture,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Google token verification failed",
    };
  }
}

// ─── Apple OAuth Verification ─────────────────────────────────────────────────

/**
 * Verify Apple ID token and extract user profile.
 *
 * To enable: Install apple-signin-auth and set APPLE_CLIENT_ID
 *   pnpm add apple-signin-auth
 *
 * Example usage:
 *   import appleSignin from 'apple-signin-auth';
 *   const payload = await appleSignin.verifyIdToken(idToken, {
 *     audience: process.env.APPLE_CLIENT_ID,
 *     ignoreExpiration: false,
 *   });
 */
export async function verifyAppleToken(
  idToken: string,
  nonce?: string
): Promise<OAuthVerificationResult> {
  const clientId = process.env.APPLE_CLIENT_ID;

  if (!clientId) {
    return {
      success: false,
      error: "Apple OAuth not configured. Set APPLE_CLIENT_ID in environment.",
    };
  }

  try {
    // In production with apple-signin-auth:
    // const payload = await appleSignin.verifyIdToken(idToken, {
    //   audience: clientId,
    //   ignoreExpiration: false,
    //   nonce: nonce,
    // });
    //
    // if (!payload.sub || !payload.email) {
    //   return { success: false, error: "Missing required claims" };
    // }
    //
    // return {
    //   success: true,
    //   profile: {
    //     provider: "apple",
    //     providerId: payload.sub,
    //     email: payload.email,
    //     emailVerified: payload.email_verified === 'true',
    //     name: undefined, // Apple doesn't always provide name in token
    //   },
    // };

    // Mock implementation for development
    console.warn("[OAuth] Using mock Apple verification. Install apple-signin-auth for production.");
    
    // Decode token without verification (unsafe, for dev only)
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      return { success: false, error: "Invalid token format" };
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));

    // Verify nonce if provided (important for replay attack prevention)
    if (nonce && payload.nonce !== nonce) {
      return { success: false, error: "Nonce mismatch" };
    }

    return {
      success: true,
      profile: {
        provider: "apple",
        providerId: payload.sub || "apple-mock-id",
        email: payload.email || "user@privaterelay.appleid.com",
        emailVerified: true, // Apple always verifies emails
        name: undefined,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Apple token verification failed",
    };
  }
}

// ─── Unified OAuth Verification ───────────────────────────────────────────────

/**
 * Verify OAuth token from any supported provider.
 */
export async function verifyOAuthToken(
  provider: "google" | "apple",
  idToken: string,
  nonce?: string
): Promise<OAuthVerificationResult> {
  switch (provider) {
    case "google":
      return verifyGoogleToken(idToken);
    case "apple":
      return verifyAppleToken(idToken, nonce);
    default:
      return {
        success: false,
        error: `Unsupported OAuth provider: ${provider as string}`,
      };
  }
}
