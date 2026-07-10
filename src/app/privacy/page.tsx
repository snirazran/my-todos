import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/legal/LegalPage';

const lastUpdated = 'July 9, 2026';

const sections: LegalSection[] = [
  {
    title: '1. Overview',
    body: [
      'This Privacy Policy explains how Frogress collects, uses, shares, and protects information when you use our web app, mobile app, and related services. Frogress is operated by Snir Azran, a sole proprietor based in Israel, who is responsible for the information described in this policy.',
      'Frogress is designed as a task, focus, habit, quest, and rewards app. The information we collect is used to run those features, keep your account synced, send reminders you enable, provide support, and improve the product.',
    ],
  },
  {
    title: '2. Information you provide',
    body: [
      'Account information may include your name, email address, phone number if provided, authentication identifiers, frog name, birthday or age range if provided, onboarding responses, profile preferences, and account status.',
      'Product content may include tasks, task notes, checklists, tags, reminders, repeat settings, completion history, focus timer activity, quest progress, rewards, wardrobe inventory, cosmetics, friend codes, friend requests, buddy tasks, and invite activity.',
      'Support information may include messages you send to us and technical details that your email app includes when you contact support.',
    ],
  },
  {
    title: '3. Information collected automatically',
    body: [
      'We may collect technical information such as device type, operating system, browser or app version, timezone, notification token, crash or error logs, IP address, usage events, and basic diagnostics needed to operate and protect Frogress.',
      'We use cookies, local storage, and similar technologies for authentication, session management, theme or app preferences, sign-in flows, and app functionality.',
    ],
  },
  {
    title: '4. Connected services',
    body: [
      'If you sign in with Google, we receive information needed to authenticate your account, such as your account identifier, name, and email address.',
      'If you connect Google Calendar, Frogress syncs in two directions. Reading: we access events on your calendar — titles, descriptions, dates and times, recurrence rules, reminder settings, and event identifiers — so they can appear as tasks in Frogress. Writing: we export your Frogress tasks as events into a separate "Frogress" calendar that the app creates in your Google account; we do not write into your own calendars. To keep the sync reliable we store event identifiers, sync tokens, and an encrypted authorization token.',
      'If you enable notifications, Frogress stores device notification tokens, timezone, and notification preferences so we can send task reminders, timer alerts, and app notifications you request.',
    ],
  },
  {
    title: '5. Google user data and Limited Use',
    body: [
      "Frogress's use and transfer to any other application of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements (developers.google.com/terms/api-services-user-data-policy).",
      'We use Google Calendar data only to provide the calendar sync features you see in the app. We do not use Google user data for advertising, do not sell it, and do not transfer it to third parties except as needed to provide the sync itself (for example, our hosting and database providers), to comply with applicable law, or as part of a merger or acquisition with notice to you. Humans do not read this data except with your explicit permission for support, where required for security or abuse investigations, or where required by law.',
      'You can disconnect Google Calendar at any time in Frogress settings or by revoking access at myaccount.google.com/permissions. When you disconnect through the app, Frogress deletes the "Frogress" calendar it created in your Google account, along with the stored sync tokens and authorization token. Tasks previously imported from your calendar remain in your Frogress account as ordinary tasks, and you can delete them like any other task or request full deletion of your data at support@frogress.com.',
    ],
  },
  {
    title: '6. Payments and subscriptions',
    body: [
      'If you subscribe to Frogress Plus, your payment is processed by a payment provider, not by us: Paddle.com for purchases made on our website (acting as merchant of record), Apple for purchases in the iOS app, and Google Play for purchases in the Android app. We never receive or store your full card details.',
      'These providers share limited information with us and our subscription platform, RevenueCat, such as a purchase identifier, product, price, currency, country, subscription status, and renewal or expiration dates. We use this to activate and manage your Plus access, prevent fraud and abuse, provide support, and understand aggregate revenue.',
      'Paddle, Apple, Google, and RevenueCat process your information under their own privacy policies.',
    ],
  },
  {
    title: '7. Advertising',
    body: [
      'The Frogress mobile apps show optional rewarded video ads through Google AdMob, for example when you choose to watch an ad to double a reward. Ads are never shown without you choosing to watch one.',
      "To deliver and measure ads, Google may collect device information such as your device advertising identifier, IP address, general location, and ad interaction data, under Google's privacy policy. On iOS, ads use the advertising identifier only if you allow tracking in the App Tracking Transparency prompt; if you decline, ads are still available but are not personalized using that identifier.",
      'You can limit ad personalization in your device settings (iOS: Settings > Privacy & Security > Tracking; Android: Settings > Google > Ads). Frogress Plus subscribers do not need to watch ads, because Plus doubles rewards automatically.',
    ],
  },
  {
    title: '8. How we use information',
    body: [
      'We use information to create and secure accounts, sync tasks across devices, operate task boards and planners, run quests and rewards, save wardrobe and frog customization, support friend and buddy features, send reminders, process support requests, and maintain app reliability.',
      'We may also use information to prevent abuse, debug errors, analyze aggregate product performance, improve features, and comply with legal obligations.',
    ],
  },
  {
    title: '9. How we share information',
    body: [
      'We share information with service providers that help operate Frogress, such as hosting, database, authentication, notification, analytics or diagnostics, email, app-store, payment, subscription-management, and advertising providers as described in this policy.',
      'We share information with connected services when you choose to use them, such as Google sign-in or Google Calendar. We may also share information if required by law, to protect rights and safety, or as part of a merger, acquisition, financing, or sale of assets.',
      'We do not publish your private tasks, notes, calendar details, or account content for other users unless you choose to share through a feature such as friends, buddy tasks, invites, or support.',
    ],
  },
  {
    title: '10. Retention',
    body: [
      'We keep information for as long as needed to provide Frogress, maintain your account, resolve disputes, enforce our terms, comply with legal obligations, and maintain security.',
      'Some information may remain in backups, logs, or records for a limited period after deletion before it is removed or anonymized according to our normal retention practices.',
    ],
  },
  {
    title: '11. Your choices',
    body: [
      'You can update many account and app preferences in Frogress. You can disable notifications in app settings, browser settings, or device settings. You can disconnect Google Calendar through Frogress or your Google account settings.',
      'You may request access, correction, deletion, or export of your personal information by contacting support@frogress.com. We may need to verify your identity before completing certain requests.',
    ],
  },
  {
    title: '12. Security',
    body: [
      'We use reasonable technical and organizational safeguards designed to protect information. No system is perfectly secure, and we cannot guarantee absolute security.',
      'You can help protect your account by using secure sign-in methods, keeping your devices safe, and contacting us if you suspect unauthorized access.',
    ],
  },
  {
    title: '13. Children',
    body: [
      'Frogress is not intended for children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided personal information, contact us so we can take appropriate action.',
    ],
  },
  {
    title: '14. International use',
    body: [
      'Frogress may be operated and processed in countries other than where you live. By using Frogress, you understand that your information may be transferred to and processed in those locations, subject to applicable law.',
    ],
  },
  {
    title: '15. Changes to this Policy',
    body: [
      'We may update this Privacy Policy from time to time. When we make material changes, we will take reasonable steps to notify users, such as updating the date on this page or providing an in-app notice.',
    ],
  },
  {
    title: '16. Contact',
    body: [
      'Questions or requests about privacy can be sent to support@frogress.com.',
    ],
  },
];

export const metadata: Metadata = {
  title: 'Privacy Policy | Frogress',
  description: 'Privacy Policy for Frogress.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="This policy explains what information Frogress collects, how it is used, and the choices you have."
      lastUpdated={lastUpdated}
      sections={sections}
    />
  );
}
