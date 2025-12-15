import { Link } from "react-router";
import type { Route } from "./+types/account-settings";
import { requireServerAuth } from "../utils/serverAuth";
import DeleteAccountCard from "../components/DeleteAccountCard";
import { useMsal } from "@azure/msal-react";
import { handleLogout } from "../utils/authUtils";

export function meta() {
  return [
    { title: "Account Settings - Numenor Security" },
    { name: "description", content: "Manage your account settings" },
  ];
}

// Server-side authentication check
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireServerAuth(request);
  return { user };
}

export default function AccountSettings({ loaderData }: Route.ComponentProps) {
  const user = loaderData?.user;

  const onLogout = () => {
    handleLogout();
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/">
                <h1 className="text-2xl font-bold text-gray-900">
                  Numenor Security
                </h1>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/dashboard"
                className="text-gray-700 px-3 py-2 rounded-md text-base font-medium hover:text-gray-900"
              >
                Dashboard
              </Link>
              <button
                onClick={onLogout}
                className="text-gray-700 px-3 py-2 rounded-md text-base font-medium bg-white border-0 cursor-pointer"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900">Account Settings</h1>
          <p className="mt-2 text-gray-600">
            Manage your account and business settings
          </p>
        </div>

        {/* Delete Account Card */}
        <div className="px-4 mb-8">
          <DeleteAccountCard accountId={user.id} />
        </div>
      </div>
    </div>
  );
}

