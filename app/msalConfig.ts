import { PublicClientApplication, type Configuration } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || '',
    authority: "https://login.microsoftonline.com/common",
    redirectUri: "http://localhost:3000",
  },
};

export let msalInstance: PublicClientApplication | undefined;

if (typeof window !== "undefined") {
  msalInstance = new PublicClientApplication(msalConfig);
}
