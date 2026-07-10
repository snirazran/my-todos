import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/legal/LegalPage';

const lastUpdated = 'July 10, 2026';

const sections: LegalSection[] = [
  {
    title: '1. Agreement to these Terms',
    body: [
      'Frogress is operated by Snir Azran, a sole proprietor based in Israel ("Frogress", "we", "us", or "our"). These Terms of Service govern your access to and use of Frogress, including the web app, mobile app, features, content, and related services. By creating an account, signing in, or using Frogress, you agree to these Terms.',
      'If you use Frogress for an organization or another person, you confirm that you have authority to accept these Terms for them.',
    ],
  },
  {
    title: '2. The Frogress service',
    body: [
      'Frogress is a playful task, habit, quest, focus timer, and rewards app. You can create tasks, plan work, complete quests, customize your frog, invite friends, and optionally connect supported integrations such as Google sign-in, Google Calendar, and notifications.',
      'We may update, add, remove, limit, or change features from time to time, including free and paid features.',
    ],
  },
  {
    title: '3. Accounts and eligibility',
    body: [
      'You are responsible for the accuracy of the information you provide and for keeping your account secure. Notify us promptly if you believe your account has been accessed without permission.',
      'Frogress is not intended for children under 13. If you are under the age of majority where you live, you may use Frogress only with permission from a parent or guardian.',
    ],
  },
  {
    title: '4. Your content and data',
    body: [
      'You keep ownership of the tasks, notes, checklists, tags, names, profile details, calendar-derived tasks, and other content you add to Frogress.',
      'You grant Frogress a limited permission to host, store, process, display, and transmit your content only as needed to provide, maintain, protect, and improve the service.',
      'Do not upload or share content that is unlawful, harmful, infringing, abusive, or that violates someone else\'s privacy or rights.',
    ],
  },
  {
    title: '5. Acceptable use',
    body: [
      'You may not misuse Frogress, interfere with the service, attempt to access accounts or systems without authorization, reverse engineer protected parts of the service, bypass limits or security controls, or use Frogress to break the law.',
      'You may not use automated scraping, excessive requests, or abusive behavior that harms the service or other users.',
    ],
  },
  {
    title: '6. Third-party services',
    body: [
      'Some features depend on third-party services, such as Firebase authentication and messaging, Google sign-in, Google Calendar, Apple or Google device services, hosting providers, email clients, and payment or app-store providers if paid features are offered.',
      'Third-party services are governed by their own terms and privacy practices. Frogress is not responsible for third-party services that we do not control.',
    ],
  },
  {
    title: '7. Paid features and subscriptions',
    body: [
      'Frogress offers an optional paid subscription called Frogress Plus. Current plans, prices, and included features are listed on our pricing page at frogress.com/pricing and at the point of purchase. Plans may include a free trial; if you do not cancel before the trial ends, the subscription begins and you will be charged.',
      'Frogress may also offer one-time consumable fly packs. The amount and price shown at checkout apply to that purchase. A completed pack purchase adds the stated virtual currency to your Frogress account; it does not create a subscription or recurring charge.',
      'Subscriptions renew automatically at the end of each billing period until cancelled. You can cancel at any time, and cancellation takes effect at the end of the current billing period, so you keep Plus access until then. Deleting the app or your account does not by itself cancel a subscription.',
      'Purchases made on our website are processed by Paddle.com, acting as our merchant of record and reseller; Paddle\'s checkout terms apply to those purchases. Purchases made inside the mobile apps are processed by the Apple App Store or Google Play under their terms, and those subscriptions are managed and cancelled through your store account.',
      'We may change subscription prices or features. If a price change affects an active subscription, we will give notice as required by the applicable store or payment provider, and you can cancel before the change takes effect. Refunds are handled as described in our Refund Policy at frogress.com/refund-policy.',
      'Frogress may also offer optional rewarded advertisements that let you earn in-app bonuses, such as doubling a reward, by choosing to watch an ad. Watching ads is always optional. Virtual items, currency (such as flies), and cosmetics have no real-world monetary value, cannot be exchanged for cash, and may be modified as part of changes to the service.',
    ],
  },
  {
    title: '8. Service availability',
    body: [
      'We work to keep Frogress available and reliable, but we do not guarantee that the service will be uninterrupted, error-free, or available on every device or in every location.',
      'Frogress is provided for personal productivity and habit support. It is not a medical, legal, financial, emergency, or professional advice service.',
    ],
  },
  {
    title: '9. Termination',
    body: [
      'You may stop using Frogress at any time. We may suspend or terminate access if you violate these Terms, create risk for other users, or use the service in a way that may harm Frogress.',
      'Sections that by their nature should survive termination, including ownership, disclaimers, limitations of liability, and dispute-related provisions, will continue to apply.',
    ],
  },
  {
    title: '10. Disclaimers and limitation of liability',
    body: [
      'Frogress is provided "as is" and "as available" to the fullest extent permitted by law. We disclaim warranties of merchantability, fitness for a particular purpose, and non-infringement where permitted.',
      'To the fullest extent permitted by law, Frogress and its operators will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, lost data, or service interruption.',
    ],
  },
  {
    title: '11. Governing law',
    body: [
      'These Terms are governed by the laws of the State of Israel, without regard to conflict-of-law rules, and disputes will be resolved in the competent courts of Israel, except where the mandatory consumer protection law of your country of residence gives you additional rights or a different forum.',
    ],
  },
  {
    title: '12. Changes to these Terms',
    body: [
      'We may update these Terms from time to time. When we make material changes, we will take reasonable steps to notify users, such as updating the date on this page or providing an in-app notice.',
      'Your continued use of Frogress after updated Terms become effective means you accept the updated Terms.',
    ],
  },
  {
    title: '13. Contact',
    body: [
      'Frogress is operated by Snir Azran. Questions about these Terms can be sent to support@frogress.com.',
    ],
  },
];

export const metadata: Metadata = {
  title: 'Terms of Service | Frogress',
  description: 'Terms of Service for Frogress.',
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      description="Please read these terms before using Frogress. They explain the rules for using the app, your responsibilities, and how the service is provided."
      lastUpdated={lastUpdated}
      sections={sections}
    />
  );
}
