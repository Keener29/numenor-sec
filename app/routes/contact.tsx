import { Link } from "react-router";
import type { Route } from "./+types/contact";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Contact Us - Numenor Security" },
    { name: "description", content: "Get in touch with Numenor Security. We're here to help with security questions, onboarding, or general inquiries." },
  ];
}

export default function Contact() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="text-2xl font-bold text-gray-900">
                Numenor Security
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/login"
                className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
              >
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Contact Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white shadow-lg rounded-lg p-8 lg:p-12">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-extrabold text-gray-900 mb-4">
              Get in Touch
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              We're here to help with security questions, onboarding, or general inquiries. 
              Whether you need assistance setting up your account, have questions about our 
              phishing detection service, or want to learn more about protecting your business, 
              we're ready to help. Responses are fast and personal - no automated replies.
            </p>
          </div>

          <div className="space-y-8">
            {/* Primary Contact Method */}
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Email Us
              </h2>
              <a
                href="mailto:support@numenorsecurity.com"
                className="text-2xl font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                support@numenorsecurity.com
              </a>
              <p className="mt-3 text-gray-600">
                We typically respond within 24 hours.
              </p>
            </div>

            {/* Founder Credibility */}
            <div className="border-t border-gray-200 pt-8">
              <p className="text-gray-700 text-center">
                Numenor Security is built and run by Dylan, a Computer Engineer from the 
                University of Waterloo and a certified CompTIA Security+ professional.
              </p>
            </div>
          </div>

          {/* Back to Home Link */}
          <div className="mt-12 pt-8 border-t border-gray-200 text-center">
            <Link 
              to="/" 
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900">Numenor Security</h3>
            <div className="mt-4 flex justify-center space-x-6">
              <Link to="/terms" className="text-sm text-gray-500 hover:text-gray-900">
                Terms of Service
              </Link>
              <Link to="/privacy" className="text-sm text-gray-500 hover:text-gray-900">
                Privacy Policy
              </Link>
              <Link to="/contact" className="text-sm text-gray-500 hover:text-gray-900">
                Contact
              </Link>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              © 2025 Numenor Security. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

