import { useEffect, useRef } from "react";

interface GoogleLoginButtonProps {
  onSuccess?: (response: any) => void;
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: any) => void;
          renderButton: (element: HTMLElement | null, options: any) => void;
          prompt?: () => void;
        };
      };
    };
  }
}

export default function GoogleLoginButton({
  onSuccess,
  text = "signin_with",
  theme = "outline",
  size = "large",
}: GoogleLoginButtonProps) {
  const buttonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scriptId = "google-identity-services";
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;

    // Initialize the Google button once the SDK has loaded
    const initialize = () => {
      if (!window.google?.accounts?.id || !clientId) return;
      // Configure Google Identity Services
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: any) => {
          onSuccess?.(response);
        },
        ux_mode: "popup", // Display the Google login button in a popup
        auto_select: false,
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme,
        size,
        text,
        shape: "rectangular",
        logo_alignment: "left",
      });
    };

    if (existingScript) {
      initialize();
      return;
    }
    // Dynamically load the Google Identity Services script
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initialize;
    document.head.appendChild(script);

    return () => {
      // no-op cleanup; GIS manages its own state
    };
  }, [onSuccess, text, theme, size]);

  return (
    <div className="w-full">
      <div ref={buttonRef} className="w-full flex justify-center" />
      {/* Fallback link if script fails to load */}
      <noscript>
        <a
          href="http://localhost:3001/api/auth/google"
          className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <img src="/googlelogo.png" alt="Google" className="h-5 w-5 mr-2" /> Continue with Google
        </a>
      </noscript>
    </div>
  );
}
