import { useState } from "react";
import { Link } from "react-router";

type TermsModalProps = {
  onSuccess: () => void; // Callback for when user accepts terms and completes onboarding
};

export default function TermsModal({ onSuccess }: TermsModalProps) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg max-w-md shadow-2xl">
        <h2 className="text-gray-800 text-xl font-bold mb-4">
          Final Step: Secure Your Account
        </h2>
        <p className="text-gray-600 text-sm mb-6">
          Welcome to Numenor Security! Before we set up your phishing protection
          dashboard, please review our Beta Participation terms.
        </p>

        <div className="flex items-center mb-6">
          <input
            id="agree-terms"
            name="agree-terms"
            type="checkbox"
            required
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
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
              Beta Participation Terms
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

        <button
          onClick={onSuccess}
          disabled={!agreed}
          className="w-full bg-blue-600 text-white py-2 rounded"
        >
          Complete Setup
        </button>
      </div>
    </div>
  );
}
