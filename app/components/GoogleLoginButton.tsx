import { useEffect, useRef, useState } from "react";

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
    ENV?: {
      GOOGLE_CLIENT_ID: string;
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
    const clientId = (window as any).GOOGLE_CLIENT_ID;
    console.log("Google Client ID (window):", clientId);
    if (!clientId) {
      console.error("Google Client ID not available on window. Ensure it's injected in root.tsx.");
      return;
    }

    // Initialize Google Identity Services
    if (!window.google?.accounts?.id) {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        window.google?.accounts?.id?.initialize({
          client_id: clientId,
          callback: onSuccess,
        });
        window.google?.accounts?.id?.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
        });
      };
      document.head.appendChild(script);
    } else {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: onSuccess,
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
      });
    }
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
