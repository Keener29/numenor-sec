import { useSearchParams } from "react-router";

export async function loader({ request }: { request: Request }) {
  // This is a public page, no authentication required
  return null;
}

export function meta() {
  // return metadata for the dashboard
  return [
    { title: "Success - Numenor Security" },
    { name: "description", content: "Successfully connected your email account" },
  ];
}

export default function Success() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email');
  const error = searchParams.get('oauth_error');

  let errorMessage = '';
  switch (error) {
    case 'missing_parameters':
      errorMessage = 'Missing required parameters';
      break;
    case 'invalid_state':
      errorMessage = 'Invalid request state';
      break;
    case 'callback_failed':
      errorMessage = 'OAuth callback failed';
      break;
    default:
      errorMessage = error || 'Unknown error';
      break;
  }
  // If there's an error, show error message
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Connection Failed
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              There was an error connecting your email account.
            </p>
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">
                Error: {errorMessage}
              </p>
            </div>
            <div className="mt-6">
              <a
                href="/"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Return to Home
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success case
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Email Connected Successfully!
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Your email account has been successfully connected for security monitoring.
          </p>
          {email && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">
                <strong>Connected Email:</strong> {email}
              </p>
            </div>
          )}
          <div className="mt-6 space-y-3">
            <div className="text-sm text-gray-600">
              <p>Your email is now being monitored for phishing threats</p>
              <p>You'll receive alerts for suspicious emails</p>
              <p>Your account is protected by advanced security analysis</p>
            </div>
            <div className="mt-6">
              <a
                href="/"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Return to Home
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
