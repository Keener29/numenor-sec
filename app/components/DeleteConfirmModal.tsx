import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { authAPI } from "../utils/api";

// Maximum length for deletion reason (2000 characters)
// Note: Full sanitization (HTML stripping, etc.) is handled by the backend
const MAX_REASON_LENGTH = 2000;

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: number;
}

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  accountId,
}: DeleteConfirmModalProps) {
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [reasonError, setReasonError] = useState("");
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus management: focus Cancel button when modal opens
  useEffect(() => {
    if (isOpen && cancelButtonRef.current) {
      cancelButtonRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard handling: Escape key closes modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isDeleting) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, isDeleting, onClose]);

  // Focus trap: keep focus within modal
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const modal = modalRef.current;
    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    modal.addEventListener("keydown", handleTab);
    return () => modal.removeEventListener("keydown", handleTab);
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      setError("");
      setReasonError("");

      // Backend will handle sanitization - just trim and send
      const trimmedReason = reason.trim() || undefined;
      
      await authAPI.deleteAccount(accountId, trimmedReason);

      // Success - redirect to confirmation page
      navigate("/account-deleted");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not delete account. Try again or contact support."
      );
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    if (!isDeleting) {
      setReason("");
      setError("");
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      aria-describedby="delete-modal-description"
    >
      <div
        ref={modalRef}
        className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <h2
          id="delete-modal-title"
          className="text-xl font-semibold text-gray-900 mb-4"
        >
          Are you sure?
        </h2>

        {/* Modal Body */}
        <div id="delete-modal-description" className="mb-6">
          <p className="text-sm text-gray-700 mb-4">
            This action is permanent. Your business, account, and all monitored
            emails will be deleted and cannot be recovered. Are you sure you
            want to continue?
          </p>

          {/* Optional reason textbox */}
          <div>
            <label
              htmlFor="delete-reason"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Reason for leaving (optional)
            </label>
            <textarea
              id="delete-reason"
              value={reason}
              onChange={(e) => {
                const input = e.target.value;
                // Validate length in real-time
                if (input.length > MAX_REASON_LENGTH) {
                  setReasonError(`Reason must be ${MAX_REASON_LENGTH} characters or less`);
                } else {
                  setReasonError("");
                }
                setReason(input);
              }}
              placeholder="Tell us why you're leaving (this helps us improve)."
              rows={4}
              disabled={isDeleting}
              maxLength={MAX_REASON_LENGTH}
              className={`w-full px-3 py-2 bg-white border rounded-md shadow-sm text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                reasonError ? 'border-red-300' : 'border-gray-300'
              }`}
              aria-invalid={reasonError ? 'true' : 'false'}
              aria-describedby={reasonError ? 'reason-error reason-help' : 'reason-help'}
            />
            <div className="mt-1 flex justify-between items-start">
              <div>
                {reasonError && (
                  <p id="reason-error" className="text-xs text-red-600" role="alert">
                    {reasonError}
                  </p>
                )}
                <p id="reason-help" className="text-xs text-gray-500">
                  {reason.length}/{MAX_REASON_LENGTH} characters
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div
            className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm flex items-start justify-between"
            role="alert"
          >
            <span>{error}</span>
            <button
              onClick={() => setError("")}
              className="ml-4 text-red-700 hover:text-red-900 focus:outline-none"
              aria-label="Dismiss error"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-end space-x-3">
          <button
            ref={cancelButtonRef}
            onClick={handleCancel}
            disabled={isDeleting}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            {isDeleting ? (
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
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

