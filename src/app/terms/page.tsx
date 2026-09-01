import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/legal/LegalPage';

const lastUpdated = 'September 1, 2026';

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
      'You must be at least 13 years old to create an account or use Frogress. If you are under the age of majority where you live, you may use Frogress only with permission from a parent or guardian.',
      'We may suspend or close an account if we learn that the account holder is under 13.',
    ],
  },
  {
    title: '4. Your content and data',
    body: [
      'You keep ownership of the tasks, notes, checklists, tags, names, profile details, calendar-derived tasks, and other content you add to Frogress.',
      'You grant Frogress a limited permission to host, store, process, display, and transmit your content only as needed to provide, maintain, protect, and improve the service, and to transmit it to any third-party application you choose to connect.',
      'Do not upload or share content that is unlawful, harmful, infringing, abusive, or that violates someone else\'s privacy or rights.',
      'Some things you choose are visible to other people, including your display name, your frog\'s outfit, and the name you enter for the Fly Snack leaderboard. Do not use a name that is offensive, or that impersonates another person or organization. We screen these names automatically and may change or remove any name that breaks these Terms. You can report a name or another user to help@frogress.com.',
    ],
  },
  {
    title: '5. Acceptable use',
    body: [
      'You may not misuse Frogress, interfere with the service, attempt to access accounts or systems without authorization, reverse engineer protected parts of the service, bypass limits or security controls, or use Frogress to break the law.',
      'You may not use automated scraping, excessive requests, or abusive behavior that harms the service or other users.',
      'Access keys and assistant connections are for your own account. Do not share, publish, sell, or resell them, or use them to give another person access to your account. We may rate-limit, suspend, or revoke a connection that generates excessive requests, degrades the service, or is used to create or complete tasks automatically in order to farm rewards.',
    ],
  },
  {
    title: '6. Third-party services',
    body: [
      'Some features depend on third-party services, such as Firebase authentication and messaging, Google sign-in, Google Calendar, Apple or Google device services, hosting providers, email clients, and payment or app-store providers if paid features are offered.',
      'If you connect an AI assistant to Frogress, that assistant is a third-party service governed by its own terms and privacy practices. You are responsible for the applications you authorize and for what they do with your task data.',
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
      'Fly packs are digital content delivered immediately. Where you have a statutory right of withdrawal or cancellation, such as the 14-day right in the EU, the UK, or under Israeli consumer protection law, you ask us to begin delivery as soon as you complete the purchase. You keep that right for flies you have not yet spent; once flies have been spent in the app, that portion of the purchase can no longer be withdrawn. Our Refund Policy explains how to make a request.',
      'Frogress may also offer optional rewarded advertisements that let you earn in-app bonuses, such as doubling a reward, by choosing to watch an ad. Watching ads is always optional.',
    ],
  },
  {
    title: '8. Flies, cosmetics, and other virtual items',
    body: [
      'Frogress uses an in-app currency called flies, which you earn by using the app and may also buy in fly packs, and cosmetic items such as frog outfits and backgrounds. Flies and cosmetics are a personal, limited, non-transferable licence to use them inside Frogress. They are not your property, not money, not a stored-value or payment instrument, and not a deposit.',
      'Flies and cosmetics have no real-world monetary value. They cannot be exchanged for cash, transferred or sold to other users, or used outside Frogress. The prices shown in the app are in flies; the real-money price of any purchase is always shown before you pay for it.',
      'We may change how flies are earned, what they cost, the daily limits that apply, and which cosmetics are available, including adding, retiring, or rotating items. We will not remove flies or items you already hold except where they were obtained through error, a fault in the service, or a breach of these Terms, or where we are required to by law.',
      'Some content, including seasons and limited-time items, is available only for a stated period. Rewards you have not claimed when that period ends, and premium-only rewards for periods during which you did not hold an active Frogress Plus subscription, are no longer available.',
      'If your account is closed by you or by us, any remaining flies and cosmetics are lost and are not refunded or exchanged for money, except where refundable under our Refund Policy or required by applicable law.',
    ],
  },
  {
    title: '9. Randomized rewards',
    body: [
      'Some Frogress rewards are randomized. Gift boxes contain a cosmetic item selected at random from a stated set, and trade-ups exchange several cosmetics you own for one randomly selected item of a higher rarity.',
      'The probability of receiving each rarity, and the number of openings after which a higher rarity is guaranteed, are published in the app and shown before you open a gift box or start a trade-up. Gift boxes can be obtained by playing and by spending flies, which can be bought.',
      'Randomized rewards only ever produce cosmetic items for use inside Frogress. They are not a game of chance for money or money\'s worth, there is no cash prize, and nothing you receive can be cashed out, sold, or traded outside the app. Where the law in your country restricts randomized virtual items, these features may be limited or unavailable.',
    ],
  },
  {
    title: '10. Fair use of the rewards economy',
    body: [
      'Flies are meant to reward real use of Frogress. A daily limit applies to how many flies any account can earn from completing tasks, and similar limits may apply to other reward sources. Work you do beyond the limit still counts toward streaks, quests, and seasons; it just stops paying flies for that day.',
      'You may not create tasks, checklists, accounts, or friend connections for the purpose of generating flies or rewards, use automation to complete tasks, or otherwise manipulate the rewards system. If we detect this, we may reduce or pause reward earning on the account, suspend gift drops, trade-ups, or friend rewards, and reverse flies and items obtained this way. These measures may be applied automatically and are lifted once normal use resumes.',
      'If you believe a limit has been applied to your account in error, contact us at help@frogress.com and we will review it.',
    ],
  },
  {
    title: '11. Service availability',
    body: [
      'We work to keep Frogress available and reliable, but we do not guarantee that the service will be uninterrupted, error-free, or available on every device or in every location.',
      'Frogress is provided for personal productivity and habit support. It is not a medical, legal, financial, emergency, or professional advice service.',
    ],
  },
  {
    title: '12. Termination',
    body: [
      'You may stop using Frogress at any time. We may suspend or terminate access if you violate these Terms, create risk for other users, or use the service in a way that may harm Frogress.',
      'Sections that by their nature should survive termination, including ownership, disclaimers, limitations of liability, and dispute-related provisions, will continue to apply.',
    ],
  },
  {
    title: '13. Disclaimers and limitation of liability',
    body: [
      'Frogress is provided "as is" and "as available" to the fullest extent permitted by law. We disclaim warranties of merchantability, fitness for a particular purpose, and non-infringement where permitted.',
      'To the fullest extent permitted by law, Frogress and its operators will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, lost data, or service interruption.',
    ],
  },
  {
    title: '14. Governing law',
    body: [
      'These Terms are governed by the laws of the State of Israel, without regard to conflict-of-law rules, and disputes will be resolved in the competent courts of Israel, except where the mandatory consumer protection law of your country of residence gives you additional rights or a different forum.',
    ],
  },
  {
    title: '15. Changes to these Terms',
    body: [
      'We may update these Terms from time to time. When we make material changes, we will take reasonable steps to notify users, such as updating the date on this page or providing an in-app notice.',
      'Your continued use of Frogress after updated Terms become effective means you accept the updated Terms.',
    ],
  },
  {
    title: '16. Contact',
    body: [
      'Frogress is operated by Snir Azran. Questions about these Terms can be sent to help@frogress.com.',
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
