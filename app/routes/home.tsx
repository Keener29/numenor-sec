import { Link } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Numenor Security - Phishing Protection for Small & Medium Businesses" },
    { name: "description", content: "Protect your business from phishing attacks with Numenor Security" },
  ];
}

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">Numenor Security</h1>
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

      {/* Hero Section */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-center">
            {/* Left side - Text content */}
            <div className="flex-1 py-12 lg:py-20">
              <div className="max-w-2xl">
                  <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
                    <span className="block xl:inline">Protect Your Business from</span>{" "}
                    <span className="block text-blue-600 xl:inline">Phishing Attacks</span>
                  </h1>
                  <p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-lg md:mt-5 md:text-xl">
                    Numenor Security provides comprehensive email security monitoring designed for small to medium businesses.
                    Keep your business and customers safe from phishing threats.
                  </p>
                <div className="mt-5 sm:mt-8 sm:flex sm:justify-start">
                  <div className="rounded-md shadow">
                    <Link
                      to="/signup"
                      className="inline-flex items-center justify-center px-8 py-4 border border-transparent text-lg font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 md:py-6 md:text-2xl md:px-20"
                    >
                      Get Started
                    </Link>
                  </div>
                  <div className="mt-3 sm:mt-0 sm:ml-3">
                    <Link
                      to="/login"
                      className="inline-flex items-center justify-center px-8 py-4 border border-transparent text-lg font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 md:py-6 md:text-2xl md:px-20"
                    >
                      Sign In
                    </Link>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right side - Dashboard preview */}
            <div className="flex-1 lg:pl-12">
              <div className="h-64 w-full bg-blue-600 sm:h-80 md:h-96 lg:h-[500px] flex items-center justify-center rounded-lg shadow-2xl">
                <div className="text-white text-center">
                  <div className="text-6xl mb-4">🛡️</div>
                    <h2 className="text-2xl font-bold">Email Security Dashboard</h2>
                    <p className="mt-2">Monitor and protect your business communications</p>
                    <div className="mt-3 sm:mt-0 sm:ml-3">
                    <a
                      href="/How%20to%20Spot%20a%20Phishing%20Email_%20The%20Basics.pdf"
                      download
                      className="inline-flex items-center justify-center px-8 py-4 border border-gray-300 text-lg font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 md:py-6 md:text-2xl md:px-20 mt-6"
                    >
                      Download Free Phishing Guide
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-blue-600 font-semibold tracking-wide uppercase">Features</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Everything you need to stay secure
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              Our comprehensive security suite is designed specifically for small and medium businesses.
            </p>
          </div>

          <div className="mt-10">
            <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-10">
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                    📧
                  </div>
                  <p className="ml-16 mb-0 text-lg leading-6 font-medium text-gray-900">Email Monitoring</p>
                </dt>
                <dd className="ml-16 text-base text-gray-500">
                  Monitor all your company's email addresses for suspicious activity and phishing attempts.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                    ⚠️
                  </div>
                  <p className="ml-16 mb-0 text-lg leading-6 font-medium text-gray-900">Real-time Alerts</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Get instant notifications when potential threats are detected in your email system.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                    📊
                  </div>
                  <p className="ml-16 mb-0 text-lg leading-6 font-medium text-gray-900">Analytics Dashboard</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Track security trends and get insights into your company's email security posture.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                    🔒
                  </div>
                  <p className="ml-16 mb-0 text-lg leading-6 font-medium text-gray-900">Easy Management</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Simple interface to manage your security settings and respond to threats quickly.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-blue-700">
        <div className="max-w-2xl mx-auto text-center py-16 px-4 sm:py-20 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            <span className="block">Ready to protect your business?</span>
            <span className="block">Start for free today.</span>
          </h2>
          <p className="mt-4 text-lg leading-6 text-blue-200">
            Built and backed by cybersecurity best practices.
          </p>
          <Link
            to="/signup"
            className="mt-8 w-full inline-flex items-center justify-center px-8 py-4 border border-transparent text-lg font-medium rounded-md text-blue-600 bg-white hover:bg-blue-50 sm:w-auto"
          >
            Get Started
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white">
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
