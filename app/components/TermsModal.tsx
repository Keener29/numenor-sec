import { useState } from "react";

type TermsModalProps = {
  onSuccess: () => void; // Callback for when user accepts terms and completes onboarding
};

export default function TermsModal({ onSuccess }: TermsModalProps) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg max-w-md shadow-2xl">
        <h2 className="text-xl font-bold mb-4">
          Final Step: Secure Your Account
        </h2>
        <p className="text-gray-600 text-sm mb-6">
          Welcome to Numenor Security! Before we set up your phishing protection
          dashboard, please review our Beta Participation terms.
        </p>

        <div className="flex items-start mb-6">
          <input
            type="checkbox"
            id="modal-agree"
            checked={agreed}
            onChange={() => setAgreed(!agreed)}
          />
          <label htmlFor="modal-agree" className="ml-2 text-sm text-gray-700">
            I agree to the Beta Terms and Conditions
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
