import { PublicClientApplication, type Configuration } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || '',
    authority: "https://login.microsoftonline.com/common",
    redirectUri: import.meta.env.VITE_AZURE_REDIRECT_URI || ''
  },
};

// Create instance only on client (browser)
// During SSR, this will be undefined, and components will handle it gracefully
export const msalInstance: PublicClientApplication | undefined = new PublicClientApplication(msalConfig);
