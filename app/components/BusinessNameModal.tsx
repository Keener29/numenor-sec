import { useState, useEffect, useRef } from "react";
import { businessAPI } from "../utils/api";
import { Link } from "react-router";

interface BusinessNameModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
  readonly termsAccepted: boolean;
}

export default function BusinessNameModal({
  isOpen,
  onClose,
  onSuccess,
  termsAccepted,
}: BusinessNameModalProps) {
  const [businessName, setBusinessName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isTermsChecked, setIsTermsChecked] = useState(termsAccepted);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const allowCloseRef = useRef(false);

  // Open/close dialog using native API
  useEffect(() => {
    if (isOpen) {
      allowCloseRef.current = false; // Reset allow close when opening
      dialogRef.current?.showModal();
      // Focus input when modal opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } else {
      // Allow closing when isOpen becomes false (explicit close from parent)
      allowCloseRef.current = true;
      dialogRef.current?.close();
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setBusinessName("");
      setError("");
    }
  }, [isOpen]);

  const handleDialogCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault(); // Always prevent default close behavior
    e.stopPropagation(); // Stop event propagation
    // Modal should only close via explicit user action (Save button)
  };

  // Prevent dialog from closing via Escape key or backdrop clicks
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen) return;

    // Store original close method
    const originalClose = dialog.close.bind(dialog);

    // Override close method to prevent unauthorized closing
    dialog.close = function () {
      if (allowCloseRef.current) {
        originalClose();
        allowCloseRef.current = false; // Reset after closing
      }
      // Otherwise, ignore the close call
    };

    // Intercept Escape key presses at multiple levels
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dialog.hasAttribute("open")) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    };

    // Also intercept on the dialog element itself
    const handleDialogKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    };

    // Watch for 'open' attribute changes and reopen if closed unexpectedly
    const observer = new MutationObserver(() => {
      if (!dialog.hasAttribute("open") && isOpen) {
        setTimeout(() => {
          dialog.showModal();
        }, 0);
      }
    });

    observer.observe(dialog, {
      attributes: true,
      attributeFilter: ["open"],
    });

    // Add event listeners
    document.addEventListener("keydown", handleKeyDown, true);
    dialog.addEventListener("keydown", handleDialogKeyDown, true);
    dialog.addEventListener(
      "cancel",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      },
      true,
    );

    return () => {
      // Restore original close method
      dialog.close = originalClose;
      document.removeEventListener("keydown", handleKeyDown, true);
      dialog.removeEventListener("keydown", handleDialogKeyDown, true);
      observer.disconnect();
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!businessName.trim()) {
      setError("Business name is required");
      return;
    }
    if (!isTermsChecked) {
      setError("You must accept the terms to continue.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      await businessAPI.completeOnboarding(businessName.trim(), isTermsChecked);

      // Success - allow closing and close modal, then refresh dashboard
      allowCloseRef.current = true;
      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save business name. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleDialogCancel}
      className="bg-transparent p-4 max-w-md w-full rounded-lg shadow-xl"
      aria-labelledby="business-name-modal-title"
      aria-describedby="business-name-modal-description"
    >
      <div className="relative bg-white rounded-lg w-full p-6">
        {/* Modal Header */}
        <h2
          id="business-name-modal-title"
          className="text-xl font-semibold text-gray-900 mb-4"
        >
          Enter Your Business Name
        </h2>

        {/* Modal Body */}
        <div id="business-name-modal-description" className="mb-6">
          <p className="text-sm text-gray-700 mb-4">
            Please provide your business name to continue. This helps us
            personalize your experience.
          </p>

          <form onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="business-name"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Business Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={inputRef}
                id="business-name"
                type="text"
                value={businessName}
                onChange={(e) => {
                  setBusinessName(e.target.value);
                  setError("");
                }}
                placeholder="Enter your business name"
                disabled={isSubmitting}
                required
                className={`w-full px-3 py-2 border bg-white rounded-md shadow-sm text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  error ? "border-red-300" : "border-gray-300"
                }`}
                aria-invalid={error ? "true" : "false"}
                aria-describedby={error ? "business-name-error" : undefined}
              />
              {error && (
                <p
                  id="business-name-error"
                  className="mt-1 text-xs text-red-600"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </div>
          </form>
        </div>

        {!termsAccepted && (
          <div className="bg-black/50 flex items-center justify-center z-50">
            <input
              id="agree-terms"
              name="agree-terms"
              type="checkbox"
              required
              checked={isTermsChecked}
              onChange={(e) => setIsTermsChecked(e.target.checked)}
              className="form-checkbox"
            />
            <label
              htmlFor="agree-terms"
              className="ml-2 block text-sm text-gray-900"
            >
              I have read and agree to the <br />
              <Link
                to="/terms"
                className="text-blue-600 hover:text-blue-500 underline"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                to="/privacy"
                className="text-blue-600 hover:text-blue-500 underline"
              >
                Privacy Policy
              </Link>
            </label>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !businessName.trim() || !isTermsChecked}
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            {isSubmitting ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Saving...
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </dialog>
  );
}
