/**
 * KidSchedule – Legal Content Engine
 *
 * Manages versioned Terms of Service and Privacy Policy content.
 * Designed for:
 * - Version tracking and effective dates
 * - Structured content with plain-English summaries
 * - GDPR, COPPA, and CCPA compliance
 * - Type-safe content rendering
 */

import type { LegalDocument, LegalSection, LegalVersion } from "@/types";

// ─── Version Registry ──────────────────────────────────────────────────────────

/**
 * All published versions of legal documents.
 * Latest version is always the last item in each array.
 */
export const LEGAL_VERSIONS: Record<"terms" | "privacy", LegalVersion[]> = {
  terms: [
    {
      version: "1.0",
      effectiveDate: "2023-10-24",
      description: "Initial Terms of Service",
    },
  ],
  privacy: [
    {
      version: "1.0",
      effectiveDate: "2023-10-24",
      description: "Initial Privacy Policy",
    },
  ],
};

// ─── Terms of Service Content ──────────────────────────────────────────────────

const TERMS_SECTIONS: LegalSection[] = [
  {
    id: "introduction",
    title: "Introduction",
    icon: "description",
    summary:
      "By using KidSchedule, you agree to these rules. We are a tool to help co-parents communicate and organize, not a legal advisor.",
    content: `
      <p class="mb-4">
        KidSchedule ("we," "our," or "us") provides a digital platform designed to facilitate communication, 
        scheduling, and expense management for co-parents. By accessing or using our services, you agree to 
        be bound by these Terms.
      </p>
      <p class="mb-4">
        If you do not agree to these terms, please do not use our services. We reserve the right to modify 
        these terms at any time, and we will notify you of significant changes via email or platform notification.
      </p>
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Who May Use Our Service</h3>
      <p class="mb-4">
        KidSchedule is intended for use by:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Parents or legal guardians managing custody arrangements</li>
        <li>Authorized family members designated by parents</li>
        <li>Legal representatives acting on behalf of parents</li>
      </ul>
      <p>
        You must be at least 18 years old to create an account. Children's information may be added to the 
        platform by parents or guardians, as described in our Child Privacy section.
      </p>
    `,
  },
  {
    id: "account-security",
    title: "Account & Security",
    icon: "lock",
    summary:
      "You are responsible for keeping your password secure and for all activity under your account.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Account Creation</h3>
      <p class="mb-4">
        To use KidSchedule, you must create an account by providing accurate and complete information, including:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Your full legal name</li>
        <li>A valid email address</li>
        <li>Phone number for two-factor authentication</li>
        <li>Strong password meeting our security requirements</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Account Security</h3>
      <p class="mb-4">
        You are solely responsible for maintaining the confidentiality of your account credentials. You agree to:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Use a strong, unique password</li>
        <li>Enable two-factor authentication when available</li>
        <li>Notify us immediately of any unauthorized access</li>
        <li>Not share your credentials with anyone</li>
      </ul>
      
      <div class="bg-amber-50 dark:bg-amber-900/10 border-l-4 border-amber-500 p-4 my-4 rounded-r-lg">
        <p class="text-sm text-amber-900 dark:text-amber-200">
          <strong>Important:</strong> You are liable for all activities conducted through your account, 
          even if unauthorized. We recommend reviewing your security settings regularly.
        </p>
      </div>
    `,
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use",
    icon: "policy",
    summary:
      "Use KidSchedule respectfully. Harassment, threats, or illegal activity will result in account termination.",
    content: `
      <p class="mb-4">
        KidSchedule is designed to facilitate productive co-parenting. You agree not to:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Harass or threaten</strong> other users through messages or any platform feature</li>
        <li><strong>Share false information</strong> or impersonate another person</li>
        <li><strong>Use the platform for illegal purposes</strong> or to violate court orders</li>
        <li><strong>Attempt to hack</strong> or breach security measures</li>
        <li><strong>Upload malware</strong> or harmful code</li>
        <li><strong>Scrape or data mine</strong> content from the platform</li>
        <li><strong>Share credentials</strong> or allow unauthorized access</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Content Standards</h3>
      <p class="mb-4">
        All content you share (messages, photos, notes) must:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Be truthful and accurate</li>
        <li>Respect the privacy of children</li>
        <li>Comply with applicable laws and court orders</li>
        <li>Avoid defamatory or abusive language</li>
      </ul>
      
      <p class="mb-4">
        We reserve the right to remove content or suspend accounts that violate these standards without prior notice.
      </p>
    `,
  },
  {
    id: "service-availability",
    title: "Service Availability",
    icon: "cloud_sync",
    summary:
      "We strive for 99.9% uptime but cannot guarantee uninterrupted service. Scheduled maintenance will be announced.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Uptime Commitment</h3>
      <p class="mb-4">
        We aim to provide reliable service with 99.9% monthly uptime. However, we do not guarantee 
        uninterrupted or error-free operation.
      </p>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Maintenance Windows</h3>
      <p class="mb-4">
        Scheduled maintenance will be announced at least 48 hours in advance via:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Email notification to your registered address</li>
        <li>In-app banner notification</li>
        <li>Status page updates</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Service Changes</h3>
      <p class="mb-4">
        We may modify, suspend, or discontinue any feature or service at any time. Major changes 
        affecting core functionality will be communicated with 30 days' notice.
      </p>
    `,
  },
  {
    id: "fees-payments",
    title: "Fees & Payments",
    icon: "payments",
    summary:
      "Subscription fees are billed monthly or annually. Cancellations take effect at the end of the billing period.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Subscription Plans</h3>
      <p class="mb-4">
        KidSchedule offers multiple subscription tiers. Current pricing is available at 
        <a href="/" class="text-primary hover:underline">kidschedule.com</a>.
      </p>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Billing</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Recurring Charges:</strong> Subscriptions auto-renew until canceled</li>
        <li><strong>Payment Methods:</strong> Credit card, debit card, or authorized payment processors</li>
        <li><strong>Tax:</strong> Applicable sales tax will be added to your subscription</li>
        <li><strong>Price Changes:</strong> We will notify you 30 days before any price increase</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Cancellation & Refunds</h3>
      <p class="mb-4">
        You may cancel your subscription at any time. Access continues until the end of your current billing period. 
        No refunds are provided for partial billing periods except as required by law.
      </p>
    `,
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    icon: "copyright",
    summary:
      "We own the platform. You own your content. By using KidSchedule, you grant us a license to operate the service.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Our Rights</h3>
      <p class="mb-4">
        KidSchedule, including all software, design, text, graphics, and trademarks, is owned by 
        KidSchedule Inc. and protected by copyright, trademark, and other intellectual property laws.
      </p>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Your Content</h3>
      <p class="mb-4">
        You retain all rights to content you upload (messages, photos, documents). By uploading content, you grant us:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>A non-exclusive license to store, transmit, and display your content</li>
        <li>Rights to process content for service operation (e.g., Tone Check AI)</li>
        <li>Permission to create backups and redundant copies for reliability</li>
      </ul>
      <p class="mb-4">
        This license terminates when you delete content, subject to technical retention periods (typically 30 days).
      </p>
    `,
  },
  {
    id: "limitation-liability",
    title: "Limitation of Liability",
    icon: "warning",
    summary:
      "We provide the platform as-is. We are not liable for decisions you make using our service or for indirect damages.",
    content: `
      <div class="bg-red-50 dark:bg-red-900/10 border-l-4 border-red-500 p-4 mb-6 rounded-r-lg">
        <p class="text-sm text-red-900 dark:text-red-200 font-bold mb-2">
          IMPORTANT LEGAL DISCLAIMER
        </p>
        <p class="text-sm text-red-900 dark:text-red-200">
          KidSchedule is a communication and organization tool. We do not provide legal advice, 
          mental health services, or mediation services. Consult appropriate professionals for such needs.
        </p>
      </div>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">No Warranty</h3>
      <p class="mb-4">
        THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING 
        WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
      </p>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Limitation of Liability</h3>
      <p class="mb-4">
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, KIDSCHEDULE SHALL NOT BE LIABLE FOR:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Indirect, incidental, consequential, or punitive damages</li>
        <li>Loss of profits, data, or goodwill</li>
        <li>Service interruptions or errors</li>
        <li>Third-party actions or content</li>
      </ul>
      <p class="mb-4">
        Our total liability to you shall not exceed the amount you paid us in the 12 months preceding the claim.
      </p>
    `,
  },
  {
    id: "dispute-resolution",
    title: "Dispute Resolution",
    icon: "gavel",
    summary:
      "Disputes are resolved through binding arbitration, not court litigation. Class actions are waived.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Informal Resolution</h3>
      <p class="mb-4">
        If you have a dispute with KidSchedule, please contact us at 
        <a href="mailto:legal@kidschedule.com" class="text-primary hover:underline">legal@kidschedule.com</a> 
        and allow 30 days for resolution before pursuing formal action.
      </p>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Binding Arbitration</h3>
      <p class="mb-4">
        Any dispute not resolved informally shall be settled by binding arbitration under the rules of the 
        American Arbitration Association. Arbitration will be conducted in San Francisco, California, or 
        remotely via video conference.
      </p>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Class Action Waiver</h3>
      <p class="mb-4">
        YOU AGREE THAT DISPUTES WILL BE RESOLVED ON AN INDIVIDUAL BASIS. YOU WAIVE ANY RIGHT TO PARTICIPATE 
        IN CLASS ACTIONS OR CLASS-WIDE ARBITRATION.
      </p>
      
      <p class="text-sm text-slate-600 dark:text-slate-400 mt-4">
        Some jurisdictions do not allow certain limitations, so these may not apply to you.
      </p>
    `,
  },
  {
    id: "governing-law",
    title: "Governing Law",
    icon: "account_balance",
    summary:
      "These terms are governed by California law. Venue for any disputes is San Francisco, California.",
    content: `
      <p class="mb-4">
        These Terms shall be governed by and construed in accordance with the laws of the State of California, 
        without regard to its conflict of law provisions.
      </p>
      <p class="mb-4">
        You agree to submit to the exclusive jurisdiction of the state and federal courts located in 
        San Francisco County, California for resolution of any disputes not subject to arbitration.
      </p>
    `,
  },
  {
    id: "termination",
    title: "Termination",
    icon: "logout",
    summary:
      "You can close your account anytime. We may suspend accounts that violate these terms.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Your Right to Terminate</h3>
      <p class="mb-4">
        You may terminate your account at any time through account settings or by contacting support. 
        Upon termination:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Your access to the service will end</li>
        <li>Subscription billing will cease after the current period</li>
        <li>Your data will be deleted per our retention policy (typically 90 days)</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Our Right to Terminate</h3>
      <p class="mb-4">
        We may suspend or terminate your account immediately if you:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Violate these Terms of Service</li>
        <li>Engage in fraudulent or illegal activity</li>
        <li>Fail to pay subscription fees</li>
        <li>Pose a security or legal risk to other users</li>
      </ul>
    `,
  },
  {
    id: "changes-to-terms",
    title: "Changes to These Terms",
    icon: "update",
    summary:
      "We may update these terms. Material changes will be communicated 30 days in advance.",
    content: `
      <p class="mb-4">
        We reserve the right to modify these Terms at any time. When we make material changes, we will:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Email you at your registered address</li>
        <li>Display a prominent notice in the application</li>
        <li>Update the "Last Updated" date at the top of this page</li>
      </ul>
      <p class="mb-4">
        Your continued use of KidSchedule after changes take effect constitutes acceptance of the new terms. 
        If you disagree with changes, you must stop using the service and close your account.
      </p>
    `,
  },
  {
    id: "contact",
    title: "Contact Information",
    icon: "contact_support",
    summary:
      "Questions about these terms? Contact us at legal@kidschedule.com or by mail.",
    content: `
      <p class="mb-4">
        If you have questions about these Terms of Service, please contact us:
      </p>
      <div class="bg-slate-50 dark:bg-slate-800 p-6 rounded-lg space-y-3">
        <div class="flex items-start gap-3">
          <span class="material-symbols-outlined text-primary mt-0.5">mail</span>
          <div>
            <p class="font-semibold text-slate-900 dark:text-white">Email</p>
            <a href="mailto:legal@kidschedule.com" class="text-primary hover:underline">legal@kidschedule.com</a>
          </div>
        </div>
        <div class="flex items-start gap-3">
          <span class="material-symbols-outlined text-primary mt-0.5">location_on</span>
          <div>
            <p class="font-semibold text-slate-900 dark:text-white">Mailing Address</p>
            <p class="text-slate-600 dark:text-slate-400">
              KidSchedule Inc.<br />
              Legal Department<br />
              123 Harmony Way, Suite 400<br />
              San Francisco, CA 94105
            </p>
          </div>
        </div>
      </div>
    `,
  },
];

// ─── Privacy Policy Content ────────────────────────────────────────────────────

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: "introduction",
    title: "Introduction",
    icon: "description",
    summary:
      "This policy explains what data we collect, why we collect it, and how you can control your information.",
    content: `
      <p class="mb-4">
        KidSchedule Inc. ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy 
        explains how we collect, use, disclose, and safeguard your information when you use our co-parenting platform.
      </p>
      <p class="mb-4">
        By using KidSchedule, you consent to the data practices described in this policy. If you do not agree, 
        please do not use our services.
      </p>
      <p class="mb-4">
        This policy complies with:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary">
        <li><strong>GDPR:</strong> General Data Protection Regulation (EU)</li>
        <li><strong>CCPA:</strong> California Consumer Privacy Act</li>
        <li><strong>COPPA:</strong> Children's Online Privacy Protection Act</li>
        <li><strong>PIPEDA:</strong> Personal Information Protection and Electronic Documents Act (Canada)</li>
      </ul>
    `,
  },
  {
    id: "data-isolation",
    title: "Data Isolation & Security",
    icon: "dns",
    summary:
      "Your data is private. We keep your information separate from other users and use strong encryption to protect it.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Logical Isolation</h3>
      <p class="mb-4">
        We employ strict logical isolation for each family unit's data. Your messages, calendar events, 
        and financial records are stored in a manner that prevents unauthorized access from other users or external parties.
      </p>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Encryption</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Encryption at Rest:</strong> All sensitive data is encrypted using AES-256 standards when stored in our databases</li>
        <li><strong>Encryption in Transit:</strong> All data transmitted between your device and our servers is protected via TLS 1.3</li>
        <li><strong>Key Management:</strong> Encryption keys are managed through industry-standard key management services with regular rotation</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Access Controls</h3>
      <p class="mb-4">
        Only authorized personnel with a specific business need can access system-level data, subject to:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary">
        <li>Multi-factor authentication requirements</li>
        <li>Role-based access controls</li>
        <li>Comprehensive audit logging</li>
        <li>Regular access reviews</li>
      </ul>
    `,
  },
  {
    id: "data-collection",
    title: "Data Collection",
    icon: "database",
    summary:
      "We collect information you provide, usage data, and device information to operate the service.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Information You Provide</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Account Information:</strong> Name, email, phone number, password</li>
        <li><strong>Profile Data:</strong> Avatar photo, timezone, communication preferences</li>
        <li><strong>Family Information:</strong> Children's names and birthdates, custody schedule details</li>
        <li><strong>Communication Content:</strong> Messages, notes, change requests</li>
        <li><strong>Financial Data:</strong> Expense records, payment information (processed by third-party processors)</li>
        <li><strong>Calendar Data:</strong> Events, appointments, transitions</li>
        <li><strong>Photos & Documents:</strong> Moment photos, uploaded documents</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Automatically Collected Data</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Usage Data:</strong> Features accessed, time spent, interaction patterns</li>
        <li><strong>Device Information:</strong> Browser type, operating system, IP address</li>
        <li><strong>Log Data:</strong> Access times, error logs, API requests</li>
        <li><strong>Cookies:</strong> Session tokens, preferences, analytics (see Cookie Policy)</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Partner Data</h3>
      <p class="mb-4">
        If you connect third-party services (Google Calendar, payment processors), we receive limited data 
        necessary for integration, subject to those services' privacy policies.
      </p>
    `,
  },
  {
    id: "data-usage",
    title: "How We Use Your Data",
    icon: "settings",
    summary:
      "We use your data to provide the service, improve features, communicate with you, and ensure safety.",
    content: `
      <p class="mb-4">
        We use collected information for the following purposes:
      </p>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Service Operation</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Create and manage your account</li>
        <li>Display calendar and schedule information</li>
        <li>Facilitate communication between co-parents</li>
        <li>Process payments and expense tracking</li>
        <li>Send notifications and reminders</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Service Improvement</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Analyze usage patterns to improve features</li>
        <li>Train AI models for Tone Check (anonymized data only)</li>
        <li>Troubleshoot technical issues</li>
        <li>Conduct user research and surveys (with consent)</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Communication</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Send transactional emails (receipts, password resets)</li>
        <li>Provide customer support</li>
        <li>Send security alerts</li>
        <li>Marketing communications (opt-in only)</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Safety & Compliance</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Prevent fraud and abuse</li>
        <li>Enforce our Terms of Service</li>
        <li>Comply with legal obligations</li>
        <li>Protect user safety (flagging threatening language)</li>
      </ul>
    `,
  },
  {
    id: "consent-handling",
    title: "Consent Handling",
    icon: "check_circle",
    summary:
      "You control your data. You can withdraw consent for certain features at any time, though this may limit functionality.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Legal Basis for Processing</h3>
      <p class="mb-4">
        We process your personal data based on:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Contract:</strong> Necessary to provide the service you signed up for</li>
        <li><strong>Consent:</strong> For optional features like AI Tone Check, marketing emails</li>
        <li><strong>Legitimate Interest:</strong> To improve service, prevent fraud, ensure security</li>
        <li><strong>Legal Obligation:</strong> To comply with laws and legal requests</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Managing Consent</h3>
      <p class="mb-4">
        You can withdraw consent for specific data processing activities at any time through:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Account Settings:</strong> Privacy & Data section</li>
        <li><strong>Email Links:</strong> Unsubscribe from marketing emails</li>
        <li><strong>Support Request:</strong> Contact privacy@kidschedule.com</li>
      </ul>
      
      <div class="bg-amber-50 dark:bg-amber-900/10 border-l-4 border-amber-500 p-4 my-4 rounded-r-lg">
        <p class="text-sm text-amber-900 dark:text-amber-200">
          <strong>Note:</strong> Withdrawing consent for essential processing (e.g., account management) 
          may prevent us from providing the service.
        </p>
      </div>
    `,
  },
  {
    id: "ai-mediation",
    title: "AI Mediation Policy",
    icon: "psychology",
    summary:
      "Our Tone Check™ feature uses AI to suggest kinder language. It is automated and does not mean a human is reading your messages.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">How Tone Check Works</h3>
      <p class="mb-4">
        KidSchedule utilizes artificial intelligence to provide "Tone Check" features aimed at reducing 
        conflict in communication. When enabled:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Your draft messages are analyzed by automated algorithms</li>
        <li>The AI suggests alternative phrasing if potentially inflammatory language is detected</li>
        <li>Analysis happens in real-time before you send the message</li>
        <li>No human moderators read your messages unless a safety violation is flagged</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Data Privacy</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Anonymization:</strong> AI training uses anonymized, aggregated data only</li>
        <li><strong>No Third-Party Sharing:</strong> Message content is not shared with AI vendors</li>
        <li><strong>Opt-Out Available:</strong> Disable Tone Check in account settings at any time</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Important Limitations</h3>
      <div class="bg-blue-50 dark:bg-blue-900/10 border-l-4 border-blue-500 p-4 my-4 rounded-r-lg">
        <ul class="list-disc pl-5 space-y-2 text-sm text-blue-900 dark:text-blue-200">
          <li>AI suggestions are recommendations only—you retain full editorial control</li>
          <li>Tone Check does not constitute legal advice or mediation services</li>
          <li>AI may make mistakes; review all suggestions carefully</li>
          <li>Suggestions are not binding and do not affect legal proceedings</li>
        </ul>
      </div>
    `,
  },
  {
    id: "child-privacy",
    title: "Child Privacy (COPPA Compliance)",
    icon: "child_care",
    summary:
      "We do not knowingly collect data from children. Parents control what information about children is shared.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">COPPA Compliance</h3>
      <p class="mb-4">
        KidSchedule complies with the Children's Online Privacy Protection Act (COPPA). We do not knowingly 
        collect personal information from children under 13 without verifiable parental consent.
      </p>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">What Parents Can Share</h3>
      <p class="mb-4">
        Parents and legal guardians may provide:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Child's first name and last initial</li>
        <li>Date of birth (for age calculations only)</li>
        <li>School information (for event scheduling)</li>
        <li>Photos (stored with strict access controls)</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Protections in Place</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>No Child Accounts:</strong> Children cannot create accounts or access the platform</li>
        <li><strong>Limited Data:</strong> We only collect information necessary for scheduling</li>
        <li><strong>No Third-Party Sharing:</strong> Child data is never sold or shared with advertisers</li>
        <li><strong>Parent Control:</strong> Parents can view, edit, or delete child information at any time</li>
        <li><strong>Privacy by Default:</strong> Child photos are private to the family unit only</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Data Deletion</h3>
      <p class="mb-4">
        Parents may request deletion of child information at any time by contacting 
        <a href="mailto:privacy@kidschedule.com" class="text-primary hover:underline">privacy@kidschedule.com</a>. 
        We will comply within 30 days.
      </p>
    `,
  },
  {
    id: "data-sharing",
    title: "Data Sharing & Disclosure",
    icon: "share",
    summary:
      "We do not sell your data. We share only with service providers, legal authorities when required, and between co-parents.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">We Do Not Sell Your Data</h3>
      <p class="mb-4">
        KidSchedule does not sell, rent, or trade your personal information to third parties for their marketing purposes.
      </p>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Authorized Sharing</h3>
      <p class="mb-4">
        We may share your information in the following circumstances:
      </p>
      
      <h4 class="text-base font-bold text-slate-900 dark:text-white mt-4 mb-2">Within Your Family Unit</h4>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Calendar events, messages, and expenses are visible to both co-parents in your family unit</li>
        <li>You control what is shared through privacy settings</li>
      </ul>
      
      <h4 class="text-base font-bold text-slate-900 dark:text-white mt-4 mb-2">Service Providers</h4>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Cloud Hosting:</strong> AWS, Google Cloud (infrastructure)</li>
        <li><strong>Payment Processing:</strong> Stripe (credit card processing)</li>
        <li><strong>Email Delivery:</strong> SendGrid, AWS SES (transactional emails)</li>
        <li><strong>SMS Delivery:</strong> Twilio (verification codes)</li>
        <li><strong>Analytics:</strong> Privacy-focused analytics (no PII shared)</li>
      </ul>
      <p class="mb-4 text-sm text-slate-600 dark:text-slate-400">
        All service providers are contractually obligated to protect your data and use it only for specified purposes.
      </p>
      
      <h4 class="text-base font-bold text-slate-900 dark:text-white mt-4 mb-2">Legal Requirements</h4>
      <p class="mb-4">
        We may disclose your information if required by law or in good faith belief that disclosure is necessary to:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Comply with legal process (subpoena, court order)</li>
        <li>Enforce our Terms of Service</li>
        <li>Protect rights, property, or safety of KidSchedule, users, or the public</li>
        <li>Prevent fraud or security threats</li>
      </ul>
      
      <h4 class="text-base font-bold text-slate-900 dark:text-white mt-4 mb-2">Business Transfers</h4>
      <p class="mb-4">
        If KidSchedule is involved in a merger, acquisition, or asset sale, your information may be transferred. 
        We will notify you before your information becomes subject to a different privacy policy.
      </p>
    `,
  },
  {
    id: "data-retention",
    title: "Data Retention",
    icon: "schedule",
    summary:
      "We keep your data while your account is active and for 90 days after closure. Some data may be retained longer for legal reasons.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Active Accounts</h3>
      <p class="mb-4">
        While your account is active, we retain your data to provide the service.
      </p>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">After Account Closure</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>90-Day Grace Period:</strong> Most data is kept for 90 days to allow account recovery</li>
        <li><strong>Permanent Deletion:</strong> After 90 days, personal data is permanently deleted</li>
        <li><strong>Anonymized Analytics:</strong> Aggregated, anonymized usage data may be retained indefinitely for service improvement</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Legal Hold</h3>
      <p class="mb-4">
        We may retain data longer if required to:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Comply with legal obligations (e.g., tax records for 7 years)</li>
        <li>Resolve disputes or enforce agreements</li>
        <li>Prevent fraud or abuse</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Backups</h3>
      <p class="mb-4">
        Deleted data may persist in encrypted backups for up to 30 days after deletion, but it cannot be restored 
        or accessed during this period.
      </p>
    `,
  },
  {
    id: "your-rights",
    title: "Your Privacy Rights",
    icon: "verified_user",
    summary:
      "You can access, correct, export, or delete your data. You can also object to processing or restrict certain uses.",
    content: `
      <p class="mb-4">
        Depending on your location, you have the following rights regarding your personal data:
      </p>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Access & Portability</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Access:</strong> Request a copy of all personal data we hold about you</li>
        <li><strong>Portability:</strong> Receive your data in a machine-readable format (JSON export)</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Correction & Deletion</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Correction:</strong> Update inaccurate information via account settings or support</li>
        <li><strong>Deletion:</strong> Request deletion of your account and associated data</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Control & Objection</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Opt-Out:</strong> Unsubscribe from marketing communications</li>
        <li><strong>Restrict Processing:</strong> Limit how we use your data in certain circumstances</li>
        <li><strong>Object:</strong> Object to processing based on legitimate interest</li>
        <li><strong>Withdraw Consent:</strong> Opt out of optional features like Tone Check</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">How to Exercise Your Rights</h3>
      <p class="mb-4">
        To exercise any of these rights, contact us at:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Email:</strong> <a href="mailto:privacy@kidschedule.com" class="text-primary hover:underline">privacy@kidschedule.com</a></li>
        <li><strong>Account Settings:</strong> Privacy & Data section</li>
        <li><strong>Phone:</strong> +1 (415) 555-0100 (Monday-Friday, 9 AM - 5 PM PT)</li>
      </ul>
      <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">
        We will respond to verified requests within 30 days (45 days for complex requests).
      </p>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Right to Complain</h3>
      <p class="mb-4">
        If you believe we have not adequately addressed your privacy concerns, you have the right to lodge a 
        complaint with your local data protection authority:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary text-sm">
        <li><strong>EU:</strong> Your national Data Protection Authority</li>
        <li><strong>California:</strong> California Attorney General's Office</li>
        <li><strong>Canada:</strong> Office of the Privacy Commissioner of Canada</li>
      </ul>
    `,
  },
  {
    id: "international-transfers",
    title: "International Data Transfers",
    icon: "public",
    summary:
      "Your data may be transferred to and processed in countries outside your own, with appropriate safeguards in place.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Data Processing Locations</h3>
      <p class="mb-4">
        KidSchedule operates globally. Your data may be transferred to and processed in:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>United States (primary data centers)</li>
        <li>European Union (for EU users)</li>
        <li>Other regions where our service providers operate</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Safeguards</h3>
      <p class="mb-4">
        When transferring data internationally, we ensure adequate protection through:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Standard Contractual Clauses:</strong> EU-approved data transfer agreements</li>
        <li><strong>Data Processing Agreements:</strong> Contracts with all service providers</li>
        <li><strong>Privacy Shield (where available):</strong> Compliance with applicable frameworks</li>
        <li><strong>Encryption:</strong> All data encrypted in transit and at rest</li>
      </ul>
    `,
  },
  {
    id: "third-party",
    title: "Third-Party Integrations",
    icon: "hub",
    summary:
      "Optional integrations with Google Calendar and payment processors are governed by their privacy policies. You can disconnect anytime.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Available Integrations</h3>
      <p class="mb-4">
        KidSchedule offers optional integrations with third-party services:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Google Calendar:</strong> Sync custody events to your calendar</li>
        <li><strong>Apple Calendar:</strong> Subscribe to custody schedule</li>
        <li><strong>Payment Processors:</strong> Stripe for subscription billing</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Data Sharing</h3>
      <p class="mb-4">
        When you enable an integration, we share only the minimum data necessary:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Calendar Sync:</strong> Event titles, times, and descriptions only</li>
        <li><strong>Payment Processing:</strong> Billing name, email, and payment method (Stripe handles card data)</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Third-Party Privacy Policies</h3>
      <p class="mb-4">
        Your use of integrated services is subject to their own privacy policies:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4 text-sm">
        <li><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Google Privacy Policy</a></li>
        <li><a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Stripe Privacy Policy</a></li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Disconnecting Integrations</h3>
      <p class="mb-4">
        You can disconnect any integration at any time through account settings. Disconnecting stops data sharing 
        immediately, but data already shared with the third party remains subject to their retention policies.
      </p>
    `,
  },
  {
    id: "cookies",
    title: "Cookies & Tracking",
    icon: "cookie",
    summary:
      "We use essential cookies for authentication and optional analytics cookies to improve the service.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Types of Cookies We Use</h3>
      
      <h4 class="text-base font-bold text-slate-900 dark:text-white mt-4 mb-2">Essential Cookies (Required)</h4>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Authentication:</strong> Keep you logged in securely</li>
        <li><strong>Session Management:</strong> Maintain your session state</li>
        <li><strong>Security:</strong> CSRF protection, fraud prevention</li>
      </ul>
      
      <h4 class="text-base font-bold text-slate-900 dark:text-white mt-4 mb-2">Functional Cookies (Optional)</h4>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Preferences:</strong> Remember your theme, language, and display settings</li>
        <li><strong>UI State:</strong> Collapsed sidebar, last viewed page</li>
      </ul>
      
      <h4 class="text-base font-bold text-slate-900 dark:text-white mt-4 mb-2">Analytics Cookies (Opt-In)</h4>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Usage Analytics:</strong> Privacy-focused analytics (no PII collected)</li>
        <li><strong>Performance Monitoring:</strong> Page load times, error rates</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Managing Cookies</h3>
      <p class="mb-4">
        You can control cookies through:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Cookie Banner:</strong> Manage preferences on first visit</li>
        <li><strong>Account Settings:</strong> Privacy & Cookies section</li>
        <li><strong>Browser Settings:</strong> Block or delete cookies (may affect functionality)</li>
      </ul>
      
      <p class="text-sm text-slate-600 dark:text-slate-400 mt-4">
        Note: Disabling essential cookies will prevent you from using KidSchedule.
      </p>
    `,
  },
  {
    id: "security-practices",
    title: "Security Practices",
    icon: "security",
    summary:
      "We use industry-standard security measures, but no system is 100% secure. Report security concerns immediately.",
    content: `
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-3">Technical Safeguards</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Encryption:</strong> AES-256 at rest, TLS 1.3 in transit</li>
        <li><strong>Access Controls:</strong> Role-based access, multi-factor authentication</li>
        <li><strong>Network Security:</strong> Firewalls, intrusion detection, DDoS protection</li>
        <li><strong>Secure Development:</strong> Code reviews, dependency scanning, penetration testing</li>
        <li><strong>Audit Logging:</strong> Comprehensive logs for security monitoring</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Organizational Measures</h3>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li><strong>Background Checks:</strong> All employees with data access</li>
        <li><strong>Security Training:</strong> Annual training for all staff</li>
        <li><strong>Incident Response:</strong> Documented procedures for breaches</li>
        <li><strong>Third-Party Audits:</strong> Annual security assessments</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Breach Notification</h3>
      <p class="mb-4">
        In the event of a data breach affecting your personal information, we will:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Notify affected users within 72 hours of discovery</li>
        <li>Describe the nature of the breach and data affected</li>
        <li>Provide recommended actions to protect yourself</li>
        <li>Report to relevant authorities as required by law</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Report Security Issues</h3>
      <p class="mb-4">
        If you discover a security vulnerability, please report it to:
      </p>
      <p class="font-mono text-sm bg-slate-100 dark:bg-slate-800 p-3 rounded">
        <a href="mailto:security@kidschedule.com" class="text-primary hover:underline">security@kidschedule.com</a>
      </p>
      <p class="text-sm text-slate-600 dark:text-slate-400 mt-2">
        We maintain a responsible disclosure program and will acknowledge security reports within 48 hours.
      </p>
    `,
  },
  {
    id: "privacy-changes",
    title: "Changes to This Policy",
    icon: "update",
    summary:
      "We may update this policy. Material changes will be communicated 30 days in advance.",
    content: `
      <p class="mb-4">
        We may update this Privacy Policy from time to time to reflect changes in our practices, 
        technology, legal requirements, or other factors.
      </p>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Notification of Changes</h3>
      <p class="mb-4">
        When we make material changes, we will:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary mb-4">
        <li>Email you at your registered address at least 30 days before changes take effect</li>
        <li>Display a prominent notice in the application</li>
        <li>Update the "Last Updated" date at the top of this page</li>
        <li>Maintain an archive of previous versions for reference</li>
      </ul>
      
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mt-6 mb-3">Your Acceptance</h3>
      <p class="mb-4">
        Your continued use of KidSchedule after changes take effect constitutes acceptance of the updated policy. 
        If you disagree with changes, you may:
      </p>
      <ul class="list-disc pl-5 space-y-2 marker:text-primary">
        <li>Adjust your privacy settings</li>
        <li>Export your data</li>
        <li>Close your account before changes take effect</li>
      </ul>
    `,
  },
  {
    id: "contact",
    title: "Contact Information",
    icon: "contact_support",
    summary:
      "Questions about privacy? Contact our Data Protection Officer or use the information below.",
    content: `
      <p class="mb-4">
        If you have questions about this Privacy Policy or our data practices, please contact us:
      </p>
      
      <div class="bg-slate-50 dark:bg-slate-800 p-6 rounded-lg space-y-4">
        <div class="flex items-start gap-3">
          <span class="material-symbols-outlined text-primary mt-0.5">person</span>
          <div>
            <p class="font-semibold text-slate-900 dark:text-white">Data Protection Officer</p>
            <p class="text-slate-600 dark:text-slate-400 text-sm">Jane Martinez, CIPP/US</p>
          </div>
        </div>
        
        <div class="flex items-start gap-3">
          <span class="material-symbols-outlined text-primary mt-0.5">mail</span>
          <div>
            <p class="font-semibold text-slate-900 dark:text-white">Email</p>
            <a href="mailto:privacy@kidschedule.com" class="text-primary hover:underline">privacy@kidschedule.com</a>
          </div>
        </div>
        
        <div class="flex items-start gap-3">
          <span class="material-symbols-outlined text-primary mt-0.5">phone</span>
          <div>
            <p class="font-semibold text-slate-900 dark:text-white">Phone</p>
            <p class="text-slate-600 dark:text-slate-400">+1 (415) 555-0100</p>
            <p class="text-slate-500 dark:text-slate-500 text-xs">Monday-Friday, 9 AM - 5 PM PT</p>
          </div>
        </div>
        
        <div class="flex items-start gap-3">
          <span class="material-symbols-outlined text-primary mt-0.5">location_on</span>
          <div>
            <p class="font-semibold text-slate-900 dark:text-white">Mailing Address</p>
            <p class="text-slate-600 dark:text-slate-400">
              KidSchedule Inc.<br />
              Data Protection Officer<br />
              123 Harmony Way, Suite 400<br />
              San Francisco, CA 94105<br />
              United States
            </p>
          </div>
        </div>
      </div>
      
      <p class="text-sm text-slate-600 dark:text-slate-400 mt-6">
        For general support inquiries, visit our <a href="/help" class="text-primary hover:underline">Help Center</a> 
        or email <a href="mailto:support@kidschedule.com" class="text-primary hover:underline">support@kidschedule.com</a>.
      </p>
    `,
  },
];

// ─── Legal Engine API ──────────────────────────────────────────────────────────

export class LegalEngine {
  /**
   * Get the latest version of Terms of Service
   */
  static getTermsOfService(): LegalDocument {
    return {
      type: "terms",
      version: LEGAL_VERSIONS.terms[LEGAL_VERSIONS.terms.length - 1],
      sections: TERMS_SECTIONS,
    };
  }

  /**
   * Get the latest version of Privacy Policy
   */
  static getPrivacyPolicy(): LegalDocument {
    return {
      type: "privacy",
      version: LEGAL_VERSIONS.privacy[LEGAL_VERSIONS.privacy.length - 1],
      sections: PRIVACY_SECTIONS,
    };
  }

  /**
   * Get both documents as a combined legal page
   */
  static getCombinedLegalDocuments(): {
    terms: LegalDocument;
    privacy: LegalDocument;
    effectiveDate: string;
  } {
    const terms = this.getTermsOfService();
    const privacy = this.getPrivacyPolicy();

    return {
      terms,
      privacy,
      effectiveDate: terms.version.effectiveDate, // Use same date for combined view
    };
  }

  /**
   * Get a specific version of a document (for historical reference)
   */
  static getDocumentVersion(
    type: "terms" | "privacy",
    version: string
  ): LegalVersion | null {
    const versions = LEGAL_VERSIONS[type];
    return versions.find((v) => v.version === version) || null;
  }

  /**
   * Get all available versions for a document type
   */
  static getVersionHistory(type: "terms" | "privacy"): LegalVersion[] {
    return LEGAL_VERSIONS[type];
  }
}
