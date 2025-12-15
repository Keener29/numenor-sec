// Client-side authentication utilities

import { googleLogout } from "@react-oauth/google";
import type { IPublicClientApplication } from "@azure/msal-browser";
import { authAPI } from "./api";
import type { AuthenticationResult } from "@azure/msal-browser";

/**
 * Handles logout for all authentication providers (Google, Microsoft, Email/Password)
 * Clears all sessions and redirects to login page
 * 
 * @param msalInstance - Optional MSAL instance for Microsoft logout
 */
export async function handleLogout(msalInstance?: IPublicClientApplication): Promise<void> {
  try {
    // Logout from Google OAuth (safe to call even if not logged in with Google)
    try {
      googleLogout();
    } catch (err) {
      // Ignore errors - user may not be logged in with Google
      console.debug("Google logout:", err);
    }

    // Always call backend logout API first to clear server-side session
    await authAPI.logout();

    // Logout from Microsoft Azure (if logged in) - this will redirect
    if (msalInstance) {
      try {
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
          // Clear MSAL cache and redirect to login
          msalInstance.logoutRedirect({
            account: accounts[0],
            postLogoutRedirectUri: "/login",
          });
          // logoutRedirect causes a redirect, so we return early
          return;
        }
      } catch (err) {
        // Ignore errors - user may not be logged in with Microsoft
        console.debug("Microsoft logout:", err);
      }
    }
    
    // Navigate to login page (only if not redirected by Microsoft logout)
    globalThis.window.location.href = "/login";
  } catch (err) {
    console.error("Logout error:", err);
    // Still navigate to login even if logout fails
    globalThis.window.location.href = "/login";
  }
}
/**
 * Handle Google Identity Services credential response.
 * Extracts the credential and sends it to the backend for verification.
 * Throws if the credential is missing or the backend rejects it.
 */
export async function loginWithGoogle(credentialResponse: any): Promise<void> {
  const credential = credentialResponse?.credential;
  if (!credential) {
    throw new Error("Google credential not found");
  }
  await authAPI.googleLogin({ credential });
}

/**
 * Handle Microsoft/Azure AD authentication result.
 * Extracts the ID token and sends it to the backend for verification.
 * Throws if the token is missing or the backend rejects it.
 */
export async function loginWithMicrosoft(authenticationResult: AuthenticationResult): Promise<void> {
  const idToken = authenticationResult?.idToken;
  if (!idToken) {
    throw new Error("Microsoft ID token not found");
  }
  await authAPI.microsoftLogin({ idToken });
}




