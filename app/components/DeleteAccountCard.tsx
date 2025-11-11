import { useState } from "react";
import DeleteConfirmModal from "./DeleteConfirmModal";

interface DeleteAccountCardProps {
  accountId: number;
}

export default function DeleteAccountCard({ accountId }: DeleteAccountCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="bg-white overflow-hidden shadow rounded-lg border-2 border-red-200">
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-medium text-gray-900 mb-1">
                Delete Account & Business
              </h3>
              <p className="text-sm text-gray-600">
                Permanently delete this business account and all monitored email data.
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="ml-4 px-4 py-2 border-2 border-red-500 text-red-600 rounded-md text-sm font-medium hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
              Delete account & business
            </button>
          </div>
        </div>
      </div>

      <DeleteConfirmModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        accountId={accountId}
      />
    </>
  );
}

