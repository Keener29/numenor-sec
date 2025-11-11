import { useState, useEffect, useRef } from "react";
import { businessAPI } from "../utils/api";

interface BusinessNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BusinessNameModal({
  isOpen,
  onClose,
  onSuccess,
}: BusinessNameModalProps) {
  const [businessName, setBusinessName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setBusinessName("");
      setError("");
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!businessName.trim()) {
      setError("Business name is required");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      await businessAPI.updateBusiness({ name: businessName.trim() });
      
      // Success - close modal and refresh dashboard
      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save business name. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="business-name-modal-title"
      aria-describedby="business-name-modal-description"
    >
      <div
        className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6"
      >
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
            Please provide your business name to continue. This helps us personalize your experience.
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

        {/* Modal Footer */}
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !businessName.trim()}
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
    </div>
  );
}

