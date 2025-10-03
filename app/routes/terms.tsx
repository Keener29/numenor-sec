import { Link } from 'react-router';

export default function Terms() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Terms and Conditions</h1>
            <p className="text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
          </div>

          <div className="prose prose-lg max-w-none">
            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Acceptance of Terms</h2>
              <p className="text-gray-700 mb-4">
                By accessing and using Numenor Security ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Description of Service</h2>
              <p className="text-gray-700 mb-4">
                Numenor Security is a phishing protection SaaS platform designed for small to medium businesses. Our service includes:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Email monitoring and phishing detection</li>
                <li>Security alerts and threat analysis</li>
                <li>Business dashboard and reporting</li>
                <li>Email permission management</li>
                <li>Security event logging and audit trails</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. User Accounts and Responsibilities</h2>
              <h3 className="text-xl font-medium text-gray-900 mb-3">3.1 Account Creation</h3>
              <p className="text-gray-700 mb-4">
                To use our service, you must create an account with accurate and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">3.2 Business Authorization</h3>
              <p className="text-gray-700 mb-4">
                You represent and warrant that you have the authority to bind your business to these terms and to use our service on behalf of your organization.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Email Monitoring and Privacy</h2>
              <h3 className="text-xl font-medium text-gray-900 mb-3">4.1 Email Permission</h3>
              <p className="text-gray-700 mb-4">
                Our service requires explicit permission from email recipients before monitoring their email accounts. We will send formal permission requests and only monitor emails after receiving explicit consent.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">4.2 Data Processing</h3>
              <p className="text-gray-700 mb-4">
                We process email data solely for the purpose of phishing detection and security monitoring. We do not use your data for marketing or any other purposes without your explicit consent.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Service Availability and Support</h2>
              <p className="text-gray-700 mb-4">
                While we strive to maintain high service availability, we do not guarantee uninterrupted access to our service. We provide support during business hours and will make reasonable efforts to resolve issues promptly.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Payment and Billing</h2>
              <h3 className="text-xl font-medium text-gray-900 mb-3">6.1 Subscription Fees</h3>
              <p className="text-gray-700 mb-4">
                Service fees are billed in advance on a monthly or annual basis. All fees are non-refundable except as required by law.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">6.2 Price Changes</h3>
              <p className="text-gray-700 mb-4">
                We reserve the right to modify our pricing with 30 days' notice. Continued use of the service after price changes constitutes acceptance of the new pricing.
              </p>

              <h3 className="text-xl font-medium text-gray-900 mb-3">6.3 Free Trial</h3>
              <p className="text-gray-700 mb-4">
                We may offer free trials or promotional periods. These are subject to the same terms and conditions, and you may be required to provide payment information to access the trial.
              </p>

              <h3 className="text-xl font-medium text-gray-900 mb-3">6.4 Payment Processing</h3>
              <p className="text-gray-700 mb-4">
                Payments are processed through third-party payment processors. You agree to their terms and conditions and acknowledge that we do not store your payment information.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Intellectual Property</h2>
              <p className="text-gray-700 mb-4">
                The service and its original content, features, and functionality are owned by Numenor Security and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Prohibited Uses and Content</h2>
              <p className="text-gray-700 mb-4">
                You agree not to use the service for any unlawful purpose or in any way that could damage, disable, overburden, or impair the service. Prohibited activities include:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Violating any applicable laws or regulations</li>
                <li>Transmitting malicious code or harmful content</li>
                <li>Attempting to gain unauthorized access to our systems</li>
                <li>Interfering with other users' use of the service</li>
                <li>Using the service to monitor emails without proper authorization</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Service Level Agreement</h2>
              <h3 className="text-xl font-medium text-gray-900 mb-3">9.1 Uptime Commitment</h3>
              <p className="text-gray-700 mb-4">
                We strive to maintain 99.9% uptime for our core services. Scheduled maintenance will be announced in advance when possible.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">9.2 Support</h3>
              <p className="text-gray-700 mb-4">
                We provide email support during business hours (Monday-Friday, 9 AM - 5 PM EST). Response times may vary based on issue severity.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Limitation of Liability</h2>
              <p className="text-gray-700 mb-4">
                In no event shall Numenor Security, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your use of the service.
              </p>
              <p className="text-gray-700 mb-4">
                Our total liability to you for any claims arising from or related to the service shall not exceed the amount you paid us in the 12 months preceding the claim.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Termination</h2>
              <p className="text-gray-700 mb-4">
                We may terminate or suspend your account and bar access to the service immediately, without prior notice or liability, under our sole discretion, for any reason whatsoever, including without limitation if you breach the terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Governing Law</h2>
              <p className="text-gray-700 mb-4">
                These terms shall be interpreted and governed by the laws of the jurisdiction in which Numenor Security operates, without regard to its conflict of law provisions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Changes to Terms</h2>
              <p className="text-gray-700 mb-4">
                We reserve the right, at our sole discretion, to modify or replace these terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">14. Contact Information</h2>
              <p className="text-gray-700 mb-4">
                If you have any questions about these Terms and Conditions, please contact us at:
              </p>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-700">
                  <strong>Numenor Security</strong><br />
                  Email: legal@numenorsecurity.com<br />
                </p>
              </div>
            </section>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <Link 
              to="/" 
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
