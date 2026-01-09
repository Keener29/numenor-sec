import { Link } from 'react-router';

export function meta() {
  // return metadata for the dashboard
  return [
    { title: "Terms and Conditions - Numenor Security" },
    { name: "description", content: "Terms and conditions for using Numenor Security" },
  ];
}

export default function Terms() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Terms and Conditions</h1>
            <p className="text-gray-600">Last updated: 12/26/2025</p>
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
              
              <h3 className="text-xl font-medium text-gray-900 mb-3 mt-6">2.1 Phishing Detection Disclaimer</h3>
              <p className="text-gray-700 mb-4">
                <strong>Important:</strong> No system can detect all phishing attacks. While we employ advanced detection technologies and continuously improve our service, phishing detection is not guaranteed. The Service is provided as a security tool to assist in identifying potential threats, but it cannot and does not guarantee complete protection against all phishing attempts, email-based attacks, or security threats.
              </p>
              <p className="text-gray-700 mb-4">
                You acknowledge and agree that you assume all risks associated with missed detections, false negatives, and any security incidents that may occur despite the use of our Service. Numenor Security shall not be liable for any damages resulting from phishing attacks, including those that were not detected by our Service.
              </p>
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
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Email Monitoring, Data Processing, and Privacy</h2>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">4.1 Email Permission and Authorization</h3>
              <p className="text-gray-700 mb-4">
                Our service requires explicit permission from email recipients before monitoring their email accounts. We will send formal permission requests and only monitor emails after receiving explicit consent.
              </p>
              <p className="text-gray-700 mb-4">
                You represent and warrant that you have the legal authority and all necessary consents, permissions, and authorizations to allow Numenor Security to process email data on behalf of your organization and the email account holders you designate. This includes compliance with all applicable privacy laws, employment agreements, and organizational policies.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">4.2 Data Processing and Purpose Limitation</h3>
              <p className="text-gray-700 mb-4">
                We process email data solely for the purpose of phishing detection and security monitoring. We do not use your data for marketing, advertising, or any other purposes without your explicit consent. Numenor Security accesses only the minimum amount of data necessary to provide the Service, including email headers, metadata, links, attachments, and content required for threat analysis.
              </p>
              <p className="text-gray-700 mb-4">
                We do not access, read, or process email content beyond what is strictly necessary for phishing detection and security monitoring purposes. All data processing is performed in accordance with our Privacy Policy and applicable data protection laws.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">4.3 Data Retention</h3>
              <p className="text-gray-700 mb-4">
                We retain email logs, metadata, security alerts, and related data only for as long as necessary to provide the Service and maintain security records. Retention periods may vary based on the type of data and legal requirements. You may request deletion of your data at any time by contacting us at legal@numenorsecurity.com. Upon termination of your account, we will delete or anonymize your data in accordance with our data retention policies, subject to any legal obligations to retain certain information.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Service Availability, Modifications, and Support</h2>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">5.1 Service Availability</h3>
              <p className="text-gray-700 mb-4">
                While we strive to maintain high service availability, we do not guarantee uninterrupted access to our service. We provide support during business hours and will make reasonable efforts to resolve issues promptly.
              </p>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">5.2 Service Modifications</h3>
              <p className="text-gray-700 mb-4">
                We reserve the right to modify, update, add, or remove features, functionality, or aspects of the Service at any time, with or without notice. We may also temporarily suspend or discontinue certain features for maintenance, updates, or other operational reasons. For material changes that significantly affect the Service's functionality or your use of it, we will provide reasonable notice when possible. Continued use of the Service after such modifications constitutes acceptance of the changes.
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
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Acceptable Use and Prohibited Activities</h2>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">8.1 Acceptable Use for Email Monitoring</h3>
              <p className="text-gray-700 mb-4">
                You may only use the Service to monitor email accounts for which you have proper authorization and consent. Specifically:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>You must only monitor authorized business email accounts</li>
                <li>You must not monitor personal email inboxes without explicit consent</li>
                <li>You must obtain all required consents, permissions, and authorizations before monitoring any email account</li>
                <li>You must comply with all applicable privacy laws, employment agreements, and organizational policies</li>
                <li>You must ensure that email account holders are aware of and have consented to monitoring</li>
              </ul>
              
              <h3 className="text-xl font-medium text-gray-900 mb-3">8.2 Prohibited Uses</h3>
              <p className="text-gray-700 mb-4">
                You agree not to use the Service for any unlawful purpose or in any way that could damage, disable, overburden, or impair the Service. Prohibited activities include:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Violating any applicable laws, regulations, or third-party rights</li>
                <li>Monitoring emails without proper authorization or consent</li>
                <li>Monitoring personal email accounts without explicit consent</li>
                <li>Transmitting malicious code, viruses, or harmful content</li>
                <li>Attempting to gain unauthorized access to our systems, networks, or other users' accounts</li>
                <li>Circumventing or attempting to circumvent any security measures, authentication systems, or access controls</li>
                <li>Unauthorized scanning, probing, or testing of vulnerabilities in our systems</li>
                <li>Interfering with or disrupting the Service, servers, or networks connected to the Service</li>
                <li>Using the Service for any illegal activity or to facilitate illegal activities</li>
                <li>Impersonating any person or entity or falsely stating or misrepresenting your affiliation with any person or entity</li>
                <li>Collecting or harvesting information about other users without their consent</li>
                <li>Using automated systems or bots to access the Service in a manner that sends more requests than a human could reasonably produce</li>
              </ul>
              <p className="text-gray-700 mb-4">
                Violation of these prohibitions may result in immediate termination of your account and may subject you to legal liability.
              </p>
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
                In no event shall Numenor Security, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your use of the Service.
              </p>
              <p className="text-gray-700 mb-4">
                Our total liability to you for any claims arising from or related to the Service shall not exceed the amount you paid us in the 12 months preceding the claim.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. No Warranty / As-Is Service</h2>
              <p className="text-gray-700 mb-4">
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR COURSE OF PERFORMANCE.
              </p>
              <p className="text-gray-700 mb-4">
                Numenor Security does not warrant that:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>The Service will be uninterrupted, secure, or error-free</li>
                <li>Defects or errors will be corrected</li>
                <li>The Service is free of viruses or other harmful components</li>
                <li>The results obtained from using the Service will be accurate, reliable, or complete</li>
                <li>The Service will meet your specific requirements or expectations</li>
              </ul>
              <p className="text-gray-700 mb-4">
                You acknowledge that the Service may have interruptions, errors, limitations, or may not detect all security threats. Some jurisdictions do not allow the exclusion of implied warranties, so some of the above exclusions may not apply to you.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Indemnification</h2>
              <p className="text-gray-700 mb-4">
                You agree to indemnify, defend, and hold harmless Numenor Security, its affiliates, officers, directors, employees, agents, and suppliers from and against any and all claims, damages, obligations, losses, liabilities, costs, debts, and expenses (including but not limited to attorney's fees) arising from:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Your use of or access to the Service</li>
                <li>Your violation of these Terms and Conditions</li>
                <li>Your violation of any third-party right, including without limitation any privacy right, intellectual property right, or other proprietary right</li>
                <li>Unauthorized email monitoring or processing of email data without proper authorization or consent</li>
                <li>Your improper use of the Service or violation of applicable laws or regulations</li>
                <li>Any data privacy violations, including violations of privacy laws, employment agreements, or organizational policies</li>
                <li>Any claims by third parties, including email account holders, arising from your use of the Service</li>
              </ul>
              <p className="text-gray-700 mb-4">
                This indemnification obligation will survive termination of these Terms and your use of the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Termination</h2>
              <p className="text-gray-700 mb-4">
                We may terminate or suspend your account and bar access to the Service immediately, without prior notice or liability, under our sole discretion, for any reason whatsoever, including without limitation if you breach these Terms. Upon termination, your right to use the Service will immediately cease.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">14. Governing Law</h2>
              <p className="text-gray-700 mb-4">
                These Terms and Conditions shall be interpreted and governed by the laws of the Province of Ontario, Canada, without regard to its conflict of law provisions. Any disputes arising from or relating to these Terms or the Service shall be subject to the exclusive jurisdiction of the courts of Ontario, Canada.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">15. Changes to Terms</h2>
              <p className="text-gray-700 mb-4">
                We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion. Continued use of the Service after any such changes constitutes your acceptance of the new Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">16. Contact Information</h2>
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
