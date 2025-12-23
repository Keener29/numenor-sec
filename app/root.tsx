import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import {GoogleOAuthProvider} from "@react-oauth/google";
import type { Route } from "./+types/root";
import "./app.css";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "./msalConfig";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

// Provider wrapper that handles SSR gracefully
function ClientProviders({ children, googleClientId }: { readonly children: React.ReactNode; readonly googleClientId: string }) {
  // Always render GoogleOAuthProvider (handles SSR fine)
  // For MsalProvider, we need to ensure it's always rendered to satisfy useMsal() hook
  // During SSR, msalInstance will be undefined, but we'll handle that in components
  const content = (
    <GoogleOAuthProvider clientId={googleClientId}>
      {children}
    </GoogleOAuthProvider>
  );

  // Only render MsalProvider when instance exists (client-side)
  // This means useMsal() will throw during SSR, which we handle in components
  if (msalInstance) {
    return (
      <MsalProvider instance={msalInstance}>
        {content}
      </MsalProvider>
    );
  }

  return content;
}

export function Layout({ children }: { readonly children: React.ReactNode }) {
  const googleClientId = process.env.VITE_GOOGLE_CLIENT_ID || "";
  
  if (!googleClientId) {
    console.error("VITE_GOOGLE_CLIENT_ID is not configured");
  }
  
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />       
      </head>
      <body suppressHydrationWarning={true}>
        <ClientProviders googleClientId={googleClientId}>
          {children}
        </ClientProviders>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
