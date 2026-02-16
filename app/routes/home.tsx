import { Link } from "react-router";

export function meta() {
  return [
    { title: "Numenor Security - Automated Phishing Detection for Small & Medium Businesses" },
    { name: "description", content: "Automated phishing detection for SMBs. Built by a Waterloo-trained cybersecurity engineer. Protect your inbox with real-time email scanning." },
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="text-center">
                  <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
              <span className="block">Stopping Phishing Attacks</span>{" "}
              {/* Stop Phishing Attacks Before Your Team Ever Sees Them */}
              {/* One Phishing Email Can Shut Down Your Business.*/}
              {/* Enterprise-Grade Phishing Protection — Built for SMBs */}
              <span className="block text-blue-600">Against Waterloo Businesses</span>
                  </h1>
            <p className="mt-6 max-w-3xl mx-auto text-xl text-gray-600">
              Simple, reliable email security that works automatically. Get peace of mind knowing every email is scanned for threats before they reach your team.
                  </p>
            <div className="mt-10">
                    <Link
                      to="/signup"
                className="inline-flex items-center justify-center px-8 py-4 border border-transparent text-lg font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 shadow-lg"
              >
                Start Protecting Your Inbox
                    </Link>
                  </div>
                </div>
              </div>
            </div>
            
      {/* The Problem Section */}
      <div className="bg-gray-50 py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              The Phishing Problem in 10 Seconds
            </h2>
            <p className="mt-6 max-w-3xl mx-auto text-lg text-gray-600">
              Phishing emails are fake messages designed to trick your employees into giving away passwords, money, or sensitive data. They look real, but they're scams.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <div className="text-4xl font-bold text-red-600">90%</div>
              <p className="mt-2 text-gray-600">of Small and Medium Businesses' data breaches start with phishing attacks</p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <div className="text-4xl font-bold text-red-600">1 in 4</div>
              <p className="mt-2 text-gray-600">employees will click a phishing link if it looks legitimate</p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <div className="text-4xl font-bold text-red-600">$5K-$50K</div>
              <p className="mt-2 text-gray-600">average financial impact per phishing incident for small and medium businesses</p>
            </div>
          </div>
        </div>
      </div>

      {/* Why Trust Numenor Security Section */}
      <div className="bg-white py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-blue-600 font-semibold tracking-wide uppercase">Why Trust Numenor Security</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Built by a Cybersecurity Expert
            </p>
          </div>
          <div className="mt-12 max-w-4xl mx-auto">
            <div className="bg-gray-50 rounded-lg p-8 lg:p-10">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-6 lg:gap-8">
                <div className="flex-shrink-0">
                  <img
                    src="/headshot.JPEG"
                    alt="Founder of Numenor Security"
                    className="w-32 h-32 lg:w-40 lg:h-40 rounded-full object-cover object-[60%_30%] shadow-lg"
                  />
                  </div>
                <div className="flex-1 text-center md:text-left">
                  <p className="text-lg text-gray-700 leading-relaxed">
                    Numenor Security was created by a <strong className="text-gray-900">Computer Engineer from the University of Waterloo</strong> with <strong className="text-gray-900">CompTIA Security+ certification</strong>. Built with engineering rigor and cybersecurity expertise.
                  </p>
                  <p className="mt-4 text-lg text-gray-700 leading-relaxed">
                    We specialize in protecting small and medium businesses - dentists, law firms, medical clinics, accountants, and agencies. These organizations are prime targets for phishing because they handle sensitive client data but often lack enterprise-level security teams.
                  </p>
                  <p className="mt-4 text-lg text-gray-700 leading-relaxed">
                    Our solution combines professional security training with practical engineering to give small and medium businesses protection without the enterprise complexity.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="bg-gray-50 py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              How It Works
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Three simple steps to protect your business
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <div className="text-4xl font-bold text-blue-600 mb-4">1</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Connect Your Inbox</h3>
              <p className="text-gray-600">
                Link your Google or Microsoft email account. Setup takes less than 2 minutes.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <div className="text-4xl font-bold text-blue-600 mb-4">2</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">We Scan Every Email</h3>
              <p className="text-gray-600">
                Our system automatically scans every incoming email in real time using advanced threat analysis.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <div className="text-4xl font-bold text-blue-600 mb-4">3</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Get Immediate Alerts</h3>
              <p className="text-gray-600">
                Receive instant notifications when suspicious activity is detected, so you can act fast.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Who It's For Section */}
      <div className="bg-white py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Who It's For
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-600">
              These businesses are common phishing targets because they handle sensitive client information but often lack dedicated IT security teams.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-6">
            <div className="text-center">
              <div className="text-3xl mb-2">🦷</div>
              <p className="text-gray-900 font-medium">Dentists</p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">🏥</div>
              <p className="text-gray-900 font-medium">Medical Clinics</p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">⚖️</div>
              <p className="text-gray-900 font-medium">Law Firms</p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">📊</div>
              <p className="text-gray-900 font-medium">Accountants</p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">🏠</div>
              <p className="text-gray-900 font-medium">Realtors</p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">💼</div>
              <p className="text-gray-900 font-medium">Agencies</p>
            </div>
          </div>
          {/* <div className="mt-8 text-center">
            <p className="text-gray-600">
              Perfect for businesses with <strong className="text-gray-900">1 to 500 email accounts</strong>
            </p>
          </div> */}
        </div>
      </div>

      {/* Social Proof / Credibility Section */}
      <div className="bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 text-center">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <p className="text-gray-700 font-medium">Built for Canadian small and medium businesses</p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <p className="text-gray-700 font-medium">Designed using industry best practices</p>
              <p className="text-sm text-gray-500 mt-1">DMARC, SPF, DKIM analysis</p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <p className="text-gray-700 font-medium">From a Waterloo-trained cybersecurity engineer</p>
            </div>
          </div>
        </div>
          </div>

      {/* Free PDF Section */}
      <div className="bg-white py-16 lg:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Free Phishing Protection Guide
          </h2>
          <p className="mt-6 text-lg text-gray-600">
            Download our free PDF guide to learn how to spot phishing emails and protect your business. This guide includes actionable steps you can implement today, real-world examples of phishing attempts, and best practices for training your team.
          </p>
          <div className="mt-8">
            <a
              href="/phishing-guide.pdf"
              download
              className="inline-flex items-center justify-center px-8 py-4 border border-gray-300 text-lg font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 shadow-md"
            >
              Download Free Phishing Guide
            </a>
          </div>
                  </div>
              </div>

      {/* Reviews / Testimonials Section */}
      {/* <div className="bg-gray-50 py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Trusted by Small Businesses
            </h2>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center mb-4">
                <div className="flex text-yellow-400">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  </div>
              </div>
              <p className="text-gray-700 mb-4">
                "Finally, a security solution that actually makes sense for small businesses. Easy to set up and gives us real peace of mind."
              </p>
              <p className="text-sm text-gray-500"> -  Small Business Owner</p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center mb-4">
                <div className="flex text-yellow-400">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  </div>
              </div>
              <p className="text-gray-700 mb-4">
                "The alerts are clear and actionable. We caught a phishing attempt the first week and avoided what could have been a costly mistake."
              </p>
              <p className="text-sm text-gray-500"> -  Medical Practice Manager</p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center mb-4">
                <div className="flex text-yellow-400">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  </div>
              </div>
              <p className="text-gray-700 mb-4">
                "As a small law firm, we needed enterprise-level security without the enterprise price tag. This delivers exactly that."
              </p>
              <p className="text-sm text-gray-500"> -  Law Firm Partner</p>
            </div>
          </div>
        </div>
      </div> */}

      {/* Final CTA Section */}
      <div className="bg-blue-700">
        <div className="max-w-2xl mx-auto text-center py-16 px-4 sm:py-20 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            Protect Your Inbox Today
          </h2>
          <p className="mt-4 text-lg leading-6 text-blue-100">
            Simple setup. Real-time protection. Peace of mind. Get started in minutes.
          </p>
          <Link
            to="/signup"
            className="mt-8 inline-flex items-center justify-center px-8 py-4 border border-transparent text-lg font-medium rounded-md text-blue-600 bg-white hover:bg-blue-50 shadow-lg"
          >
            Start Protecting Your Inbox
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
              <Link to="/contact" className="text-sm text-gray-500 hover:text-gray-900">
                Contact
              </Link>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              © 2026 Numenor Security. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
