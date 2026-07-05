import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/legal/LegalPage';

const lastUpdated = 'July 5, 2026';

const sections: LegalSection[] = [
  {
    title: '1. Overview',
    body: [
      'Frogress is operated by Snir Azran, a sole proprietor based in Israel ("we", "us"). This Refund Policy applies to purchases of Frogress Plus and any other paid Frogress features. Where you bought your subscription determines who processes your payment and how refunds work: purchases made on our website are processed by our merchant of record, purchases made inside the iOS app are processed by Apple, and purchases made inside the Android app are processed by Google Play.',
      'Nothing in this policy limits any non-waivable rights you have under applicable consumer protection law, including the Israeli Consumer Protection Law and, where applicable, EU consumer rights.',
    ],
  },
  {
    title: '2. Purchases made on our website',
    body: [
      'Web purchases are processed by Paddle.com, our merchant of record. Paddle handles checkout, billing, taxes, and receipts for these purchases.',
      'If you are not happy with Frogress Plus, you can request a full refund within 14 days of your initial purchase, no questions asked. To request a refund, email support@frogress.com from the email you purchased with, or reply to your Paddle receipt email, and include your order number if you have it.',
      'Renewal charges can also be refunded if you contact us within 14 days of the renewal date. Approved refunds are returned to your original payment method, typically within 5 to 10 business days depending on your bank. When a refund is issued, your Plus access ends.',
    ],
  },
  {
    title: '3. Purchases made through the Apple App Store',
    body: [
      'Subscriptions purchased inside the iOS app are billed by Apple, and under Apple\'s rules only Apple can issue refunds for them.',
      'To request a refund, go to reportaproblem.apple.com, sign in with your Apple ID, and select the Frogress Plus purchase, or request a refund through your device\'s subscription settings. Apple decides these requests under its own policies. If you have trouble, contact us at support@frogress.com and we will do our best to help.',
    ],
  },
  {
    title: '4. Purchases made through Google Play',
    body: [
      'Subscriptions purchased inside the Android app are billed by Google Play. You can request a refund through the Google Play Store app or at play.google.com under Order history.',
      'Google decides refund requests made after its initial refund window under its own policies. If Google directs you to the developer or you have trouble, contact us at support@frogress.com and we will review your request under the same 14-day standard described above.',
    ],
  },
  {
    title: '5. Free trials',
    body: [
      'Frogress Plus plans may include a free trial, such as 7 days on the yearly plan or 3 days on the monthly plan. You will not be charged if you cancel before the trial ends.',
      'If you forget to cancel and are charged right after a trial ends, contact us within 14 days of the charge and we will refund web purchases in full. For App Store and Google Play charges, please use the store refund process described above.',
    ],
  },
  {
    title: '6. Cancelling your subscription',
    body: [
      'Cancelling stops future charges and is different from a refund. When you cancel, your Plus access continues until the end of the period you already paid for.',
      'Web purchases can be cancelled from the subscription management link in your Paddle receipt email or by emailing support@frogress.com. App Store purchases are cancelled in your device\'s subscription settings, and Google Play purchases are cancelled in the Play Store\'s subscriptions section. Deleting the app does not cancel a subscription.',
    ],
  },
  {
    title: '7. Contact',
    body: [
      'Questions about refunds or cancellations can be sent to support@frogress.com. Please include the email address you purchased with and, for web purchases, your Paddle order number so we can find your purchase quickly.',
    ],
  },
];

export const metadata: Metadata = {
  title: 'Refund Policy | Frogress',
  description:
    'How refunds and cancellations work for Frogress Plus purchases made on the web, the App Store, and Google Play.',
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund Policy"
      description="How refunds and cancellations work for Frogress Plus, including purchases made on the web, through the Apple App Store, and through Google Play."
      lastUpdated={lastUpdated}
      sections={sections}
    />
  );
}
