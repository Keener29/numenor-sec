import { authAPI } from "./api";

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


