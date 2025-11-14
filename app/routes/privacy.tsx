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
              
              <h3 className="text-xl font-medium text-gray-900 mb-3 mt-6">1.1 Phishing Detection Disclaimer</h3>
              <p className="text-gray-700 mb-4">
                <strong>Important:</strong> No security system is perfect. While we employ advanced detection technologies and continuously improve our service, some phishing emails may not be detected. Phishing detection is not guaranteed, and our Service is provided as a security tool to assist in identifying potential threats, but it cannot guarantee complete protection against all phishing attempts or email-based attacks.
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
                <li>Password (securely hashed and salted using industry-standard algorithms such as bcrypt or Argon2)</li>
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
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. What We Do NOT Collect</h2>
              <p className="text-gray-700 mb-4">
                To provide transparency about our data practices, we want to clarify what we do NOT do:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li><strong>No Marketing Use:</strong> We do not use your email data or personal information for marketing, advertising, or promotional purposes</li>
                <li><strong>No Unauthorized Scanning:</strong> We do not scan or monitor email inboxes that have not been explicitly authorized and consented to</li>
                <li><strong>No Sale of Data:</strong> We do not sell, rent, or trade your personal information or email data to third parties</li>
                <li><strong>No Unrelated Data Collection:</strong> We only collect data that is necessary for providing phishing detection and security monitoring services</li>
                <li><strong>No Tracking Cookies:</strong> We do not use third-party tracking cookies or analytics tools that collect personal information for marketing purposes</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. How We Use Your Information</h2>
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
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Data Minimization and Processing</h2>
              <h3 className="text-xl font-medium text-gray-900 mb-3">5.1 Automated Processing</h3>
              <p className="text-gray-700 mb-4">
                Our phishing detection service uses automated algorithms and machine learning models to analyze email data. Email content is processed automatically by our systems for threat detection purposes. We access only the minimum amount of data necessary to provide the Service, including email headers, metadata, links, attachments, and content required for phishing analysis.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">5.2 Human Review</h3>
              <p className="text-gray-700 mb-4">
                Email content is not subject to human review except in the following limited circumstances:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>When necessary for debugging technical issues or resolving service problems</li>
                <li>When investigating security incidents or potential threats to our systems</li>
                <li>When you explicitly request support or assistance that requires reviewing specific emails</li>
                <li>When required by law or legal process</li>
              </ul>
              <p className="text-gray-700 mb-4">
                Any human access to email content is logged, restricted to authorized personnel only, and conducted in accordance with strict security protocols.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Email Permission, Consent, and Customer Responsibilities</h2>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">6.1 Explicit Consent Required</h3>
              <p className="text-gray-700 mb-4">
                We will only monitor email accounts after receiving explicit written consent from the email account holder. This consent is obtained through our formal permission request process.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">6.2 Customer Responsibility for Legal Authorization</h3>
              <p className="text-gray-700 mb-4">
                <strong>Important:</strong> You, as the customer, are solely responsible for ensuring that you have all necessary legal permissions, authorizations, and consents to allow Numenor Security to monitor the email accounts you designate. This includes:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Compliance with all applicable privacy laws and regulations (including GDPR, CCPA, PIPEDA, and other regional laws)</li>
                <li>Obtaining proper consent from email account holders</li>
                <li>Compliance with employment agreements and organizational policies</li>
                <li>Ensuring that monitoring is legally permitted in your jurisdiction</li>
                <li>Verifying that you have authority to authorize monitoring on behalf of your organization</li>
              </ul>
              <p className="text-gray-700 mb-4">
                Numenor Security is NOT responsible for unlawful monitoring, unauthorized access, or violations of privacy laws that result from your failure to obtain proper authorization. You agree to indemnify and hold Numenor Security harmless from any claims arising from unauthorized or unlawful email monitoring.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">6.3 Consent Withdrawal</h3>
              <p className="text-gray-700 mb-4">
                Email account holders can withdraw their consent at any time by clicking the "Deny Permission" link in our emails or by contacting us directly. Upon withdrawal, we will immediately stop monitoring that email account and delete associated monitoring data in accordance with our data retention policies.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Data Sharing and Disclosure</h2>
              <p className="text-gray-700 mb-4">
                We do not sell, trade, or rent your personal information to third parties. We may share information only in the following circumstances:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li><strong>Service Providers:</strong> With trusted third-party vendors who assist in service delivery (see Section 8 for details)</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights and safety</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                <li><strong>Consent:</strong> When you have given explicit consent for specific sharing</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Third-Party Subprocessors</h2>
              <p className="text-gray-700 mb-4">
                To provide our Service, we use trusted third-party service providers (subprocessors) who may process your data on our behalf. These subprocessors are contractually required to protect your data and use it only for the purposes we specify.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">8.1 Categories of Subprocessors</h3>
              <p className="text-gray-700 mb-4">
                We use subprocessors in the following categories:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li><strong>Hosting and Infrastructure:</strong> Cloud hosting providers (e.g., Vercel, Render, Railway, AWS, or similar) that host our application and infrastructure</li>
                <li><strong>Cloud Storage:</strong> Secure cloud storage providers for storing email data, logs, and backups</li>
                <li><strong>Logging and Monitoring:</strong> Service providers for system logs, error tracking, and performance monitoring</li>
                <li><strong>Email Services:</strong> Email delivery services for sending permission requests and notifications</li>
                <li><strong>Payment Processing:</strong> Secure payment processors for handling subscription payments</li>
              </ul>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">8.2 Subprocessor Safeguards</h3>
              <p className="text-gray-700 mb-4">
                All subprocessors are:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Contractually bound to protect your data in accordance with applicable data protection laws</li>
                <li>Required to implement appropriate technical and organizational security measures</li>
                <li>Prohibited from using your data for any purpose other than providing services to us</li>
                <li>Subject to regular security assessments and compliance reviews</li>
              </ul>
              <p className="text-gray-700 mb-4">
                If you would like more information about our specific subprocessors or have concerns about data processing, please contact us at privacy@numenorsecurity.com.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Data Security</h2>
              <p className="text-gray-700 mb-4">
                We implement industry-standard security measures to protect your information:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>End-to-end encryption for data transmission</li>
                <li>Secure data storage with access controls</li>
                <li>Password hashing using industry-standard algorithms (bcrypt or Argon2) with salt</li>
                <li>Regular security audits and penetration testing</li>
                <li>Employee training on data protection</li>
                <li>Incident response procedures</li>
                <li>Access logging and monitoring</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Data Retention</h2>
              <p className="text-gray-700 mb-4">
                We retain your information for as long as necessary to provide our services and comply with legal obligations. Our data retention practices are designed to minimize data storage while maintaining service functionality and security:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li><strong>Account Data:</strong> Retained while your account is active. Upon account deletion, personal account information is deleted within 30 days</li>
                <li><strong>Email Monitoring Data:</strong> Minimized and retained only as long as necessary for security analysis and threat detection. Email content is processed and analyzed but not retained longer than needed for service operation</li>
                <li><strong>Security Events and Alerts:</strong> Retained for audit and compliance purposes, typically for up to 12 months</li>
                <li><strong>System Logs and Metadata:</strong> Some system logs, security metadata, and audit trails may be retained after account deletion for debugging, fraud prevention, security incident investigation, or compliance with legal obligations. This retained data is anonymized where possible and does not include email content</li>
                <li><strong>Legal Holds:</strong> Data may be retained longer if required by law, legal process, or ongoing investigations</li>
              </ul>
              <p className="text-gray-700 mb-4">
                You may request deletion of your data at any time by contacting us at privacy@numenorsecurity.com. We will honor deletion requests subject to legal obligations and the retention requirements described above.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Automated Decision-Making</h2>
              <h3 className="text-xl font-medium text-gray-900 mb-3">11.1 Phishing Detection Algorithm</h3>
              <p className="text-gray-700 mb-4">
                Our Service uses automated algorithms and machine learning models to classify emails as potentially phishing or safe. This automated decision-making process analyzes various factors including email headers, content patterns, links, attachments, and threat indicators to generate security alerts and risk scores.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">11.2 Your Rights Regarding Automated Processing</h3>
              <p className="text-gray-700 mb-4">
                You have the following rights regarding automated decision-making:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li><strong>Review:</strong> You can review and access information about how automated decisions are made regarding your emails</li>
                <li><strong>Appeal:</strong> You can request review of automated classifications if you believe an email was incorrectly flagged or missed</li>
                <li><strong>Human Review:</strong> You can request human review of automated decisions in certain circumstances</li>
                <li><strong>Transparency:</strong> You can request information about the logic, significance, and consequences of automated processing</li>
              </ul>
              <p className="text-gray-700 mb-4">
                To exercise these rights, please contact us at privacy@numenorsecurity.com. Note that automated processing is essential for the Service to function, and disabling it would prevent us from providing phishing detection.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Your Rights</h2>
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
                <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
              </ul>
              <p className="text-gray-700 mb-4">
                To exercise any of these rights, please contact us at privacy@numenorsecurity.com. We will respond to your request within the timeframes required by applicable law.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Cookies and Tracking</h2>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">13.1 Essential Cookies (No Consent Required)</h3>
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

              <h3 className="text-xl font-medium text-gray-900 mb-3">13.2 Cookie Management</h3>
              <p className="text-gray-700 mb-4">
                You can control cookie settings through your browser, but disabling essential cookies will prevent you from using our service. Our authentication cookies are automatically deleted when you log out or after 24 hours of inactivity.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">13.3 Third-Party Analytics</h3>
              <p className="text-gray-700 mb-4">
                We do not currently use third-party analytics or tracking cookies. If we implement analytics in the future, we will update this policy and obtain appropriate consent where required by law.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">14. International Data Transfers</h2>
              <p className="text-gray-700 mb-4">
                Your information may be transferred to and processed in countries other than your own, including countries that may have different data protection laws than your country of residence. We ensure appropriate safeguards are in place to protect your information in accordance with applicable data protection laws, including:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Standard contractual clauses approved by relevant data protection authorities</li>
                <li>Adequacy decisions where applicable</li>
                <li>Other legally recognized transfer mechanisms</li>
              </ul>
              <p className="text-gray-700 mb-4">
                By using our Service, you consent to the transfer of your information to countries outside your own, subject to the safeguards described above.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">15. Children's Privacy</h2>
              <p className="text-gray-700 mb-4">
                Our service is not intended for children under 13 years of age (or the applicable age of consent in your jurisdiction). We do not knowingly collect personal information from children under 13. If we become aware that we have collected such information, we will take steps to delete it promptly. If you believe we have collected information from a child under 13, please contact us immediately at privacy@numenorsecurity.com.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">16. Data Breach Notification</h2>
              <p className="text-gray-700 mb-4">
                In the event of a data breach that may affect your personal information, we will notify you and relevant authorities as required by applicable law. We will provide information about the nature of the breach, the data involved, and the steps we are taking to address the situation. Notifications will be made without undue delay and in accordance with applicable legal requirements.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">17. Compliance and Certifications</h2>
              <p className="text-gray-700 mb-4">
                We are committed to complying with applicable data protection laws, including:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>General Data Protection Regulation (GDPR) - European Union</li>
                <li>California Consumer Privacy Act (CCPA) - California, USA</li>
                <li>Personal Information Protection and Electronic Documents Act (PIPEDA) - Canada</li>
                <li>Other applicable regional privacy laws</li>
              </ul>
              <p className="text-gray-700 mb-4">
                This Privacy Policy is designed to comply with these regulations while providing clear information about our data practices.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">18. Changes to This Policy</h2>
              <p className="text-gray-700 mb-4">
                We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of any material changes by posting the new policy on this page and updating the "Last updated" date. For significant changes, we may also provide additional notice via email or through our Service. We encourage you to review this policy periodically to stay informed about how we protect your information.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">19. Contact Us</h2>
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
