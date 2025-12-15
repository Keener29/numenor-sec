import { PublicClientApplication, type Configuration } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || '',
    authority: "https://login.microsoftonline.com/common",
    redirectUri: "http://localhost:3000",
  },
};

// Create instance only on client (browser)
// During SSR, this will be undefined, and components will handle it gracefully
export let msalInstance: PublicClientApplication | undefined;

if (typeof window !== "undefined") {
  try {
    msalInstance = new PublicClientApplication(msalConfig);
  } catch (err) {
    console.error("Failed to create MSAL instance:", err);
    msalInstance = undefined;
  }
}
