import { Link } from "react-router";
import type { Route } from "./+types/account-deleted";

export function meta() {
  return [
    { title: "Account Deleted - Numenor Security" },
    { name: "description", content: "Your account has been deleted" },
  ];
}

export default function AccountDeletedPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Account deleted
        </h1>

        <p className="text-gray-600 mb-8">
          Your business, account, and monitored emails have been permanently
          deleted. Monitoring has stopped and no more scanning will occur.
        </p>

        <Link
          to="/"
          className="inline-block px-6 py-3 border border-transparent rounded-md text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          Return to home
        </Link>
      </div>
    </div>
  );
}

