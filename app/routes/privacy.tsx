import { Link } from 'react-router';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
            <p className="text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
          </div>

          <div className="prose prose-lg max-w-none">
            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
              <p className="text-gray-700 mb-4">
                Numenor Security ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our phishing protection service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Information We Collect</h2>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">2.1 Account Information</h3>
              <p className="text-gray-700 mb-4">
                When you create an account, we collect:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Email address</li>
                <li>First and last name</li>
                <li>Business name and contact information</li>
                <li>Password (encrypted and hashed)</li>
              </ul>

              <h3 className="text-xl font-medium text-gray-900 mb-3">2.2 Email Monitoring Data</h3>
              <p className="text-gray-700 mb-4">
                With explicit permission, we may collect and analyze:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Email headers (sender, recipient, subject, timestamp)</li>
                <li>Email content for phishing detection</li>
                <li>Attachment metadata (not content)</li>
                <li>Security threat indicators</li>
              </ul>

              <h3 className="text-xl font-medium text-gray-900 mb-3">2.3 Usage Data</h3>
              <p className="text-gray-700 mb-4">
                We automatically collect:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Login timestamps and IP addresses</li>
                <li>Service usage patterns</li>
                <li>Security events and alerts</li>
                <li>System performance metrics</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. How We Use Your Information</h2>
              <p className="text-gray-700 mb-4">
                We use the collected information for the following purposes:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li><strong>Service Delivery:</strong> To provide phishing protection and security monitoring</li>
                <li><strong>Account Management:</strong> To maintain your account and provide customer support</li>
                <li><strong>Security Analysis:</strong> To detect and prevent phishing attempts and security threats</li>
                <li><strong>Service Improvement:</strong> To enhance our algorithms and service quality</li>
                <li><strong>Compliance:</strong> To meet legal and regulatory requirements</li>
                <li><strong>Communication:</strong> To send important service updates and security alerts</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Email Permission and Consent</h2>
              <h3 className="text-xl font-medium text-gray-900 mb-3">4.1 Explicit Consent Required</h3>
              <p className="text-gray-700 mb-4">
                We will only monitor email accounts after receiving explicit written consent from the email account holder. This consent is obtained through our formal permission request process.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">4.2 Consent Withdrawal</h3>
              <p className="text-gray-700 mb-4">
                Email account holders can withdraw their consent at any time by clicking the "Deny Permission" link in our emails or by contacting us directly. Upon withdrawal, we will immediately stop monitoring that email account.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Data Sharing and Disclosure</h2>
              <p className="text-gray-700 mb-4">
                We do not sell, trade, or rent your personal information to third parties. We may share information only in the following circumstances:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li><strong>Service Providers:</strong> With trusted third-party vendors who assist in service delivery</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights and safety</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                <li><strong>Consent:</strong> When you have given explicit consent for specific sharing</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Data Security</h2>
              <p className="text-gray-700 mb-4">
                We implement industry-standard security measures to protect your information:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>End-to-end encryption for data transmission</li>
                <li>Secure data storage with access controls</li>
                <li>Regular security audits and penetration testing</li>
                <li>Employee training on data protection</li>
                <li>Incident response procedures</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Data Retention</h2>
              <p className="text-gray-700 mb-4">
                We retain your information for as long as necessary to provide our services and comply with legal obligations:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li><strong>Account Data:</strong> Retained while your account is active</li>
                <li><strong>Email Monitoring Data:</strong> Retained for security analysis and threat detection</li>
                <li><strong>Security Events:</strong> Retained for audit and compliance purposes</li>
                <li><strong>Deleted Accounts:</strong> Data is securely deleted within 30 days</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Your Rights</h2>
              <p className="text-gray-700 mb-4">
                Depending on your jurisdiction, you may have the following rights:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li><strong>Access:</strong> Request access to your personal information</li>
                <li><strong>Correction:</strong> Request correction of inaccurate information</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information</li>
                <li><strong>Portability:</strong> Request a copy of your data in a portable format</li>
                <li><strong>Objection:</strong> Object to certain processing activities</li>
                <li><strong>Withdrawal:</strong> Withdraw consent for email monitoring</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Cookies and Tracking</h2>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">9.1 Essential Cookies (No Consent Required)</h3>
              <p className="text-gray-700 mb-4">
                We use HTTP-only cookies that are essential for the security and functionality of our service:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li><strong>Authentication Cookies:</strong> HTTP-only cookies that maintain your secure login session</li>
                <li><strong>Security Cookies:</strong> Cookies that help protect against unauthorized access and security threats</li>
                <li><strong>Session Management:</strong> Cookies that ensure proper service functionality</li>
              </ul>
              <p className="text-gray-700 mb-4">
                These cookies are necessary for the service to function properly and do not require your explicit consent under applicable privacy laws (GDPR, CCPA, etc.). They are not accessible to JavaScript and cannot be used for tracking purposes.
              </p>

              <h3 className="text-xl font-medium text-gray-900 mb-3">9.2 Cookie Management</h3>
              <p className="text-gray-700 mb-4">
                You can control cookie settings through your browser, but disabling essential cookies will prevent you from using our service. Our authentication cookies are automatically deleted when you log out or after 24 hours of inactivity.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">9.3 Third-Party Analytics</h3>
              <p className="text-gray-700 mb-4">
                We do not currently use third-party analytics or tracking cookies. If we implement analytics in the future, we will update this policy and obtain appropriate consent where required by law.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. International Data Transfers</h2>
              <p className="text-gray-700 mb-4">
                Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place to protect your information in accordance with applicable data protection laws.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Children's Privacy</h2>
              <p className="text-gray-700 mb-4">
                Our service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If we become aware that we have collected such information, we will take steps to delete it promptly.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Data Breach Notification</h2>
              <p className="text-gray-700 mb-4">
                In the event of a data breach that may affect your personal information, we will notify you and relevant authorities as required by applicable law. We will provide information about the nature of the breach, the data involved, and the steps we are taking to address the situation.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Compliance and Certifications</h2>
              <p className="text-gray-700 mb-4">
                We are committed to complying with applicable data protection laws, including:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>General Data Protection Regulation (GDPR)</li>
                <li>California Consumer Privacy Act (CCPA)</li>
                <li>Other applicable regional privacy laws</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">14. Changes to This Policy</h2>
              <p className="text-gray-700 mb-4">
                We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last updated" date. We encourage you to review this policy periodically.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">15. Contact Us</h2>
              <p className="text-gray-700 mb-4">
                If you have any questions about this Privacy Policy or our data practices, please contact us:
              </p>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-700">
                  <strong>Numenor Security</strong><br />
                  Privacy Officer<br />
                  Email: privacy@numenorsecurity.com<br />
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
