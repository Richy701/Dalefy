/**
 * Pre-written email message templates for the Send Invite modal.
 * Variables like {{tripName}}, {{dates}}, etc. are replaced at render time.
 */

export interface EmailTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "invite",
    label: "Trip Invitation",
    subject: "Your Itinerary: {{tripName}}",
    body: `I hope you are all looking forward to your forthcoming trip, {{tripName}}.

Your live itinerary details are available on the {{brandName}} app and also the web version.

First, open the app link below to view on your mobile or click 'View Itinerary' for the web version. Please let me know if you have any issues viewing it.

Have a great trip!`,
  },
  {
    id: "reminder",
    label: "Pre-Departure Reminder",
    subject: "Reminder: {{tripName}} - {{dates}}",
    body: `Just a friendly reminder that {{tripName}} is coming up soon!

Trip dates: {{dates}}
Destination: {{destination}}

Please make sure you have:
• Valid passport (with at least 6 months validity)
• Any required visas or travel documents
• Travel insurance details
• Copies of your booking confirmations

Your full itinerary is available via the link below. If you have any questions or need to make changes, please don't hesitate to reach out.

Looking forward to a great trip!`,
  },
  {
    id: "dresscode",
    label: "Dress Code Notice",
    subject: "Dress Code - {{tripName}}",
    body: `Please remember to follow the appropriate dress code for all flights and hosted events on the itinerary:

Smart Casual, smart trainers are ok but no ripped jeans. Gentlemen must wear a collared shirt or polo shirt for flights.

For evening events, please dress smart casual or as specified in your itinerary.

If you have any questions about what's appropriate, please don't hesitate to ask.`,
  },
  {
    id: "update",
    label: "Itinerary Update",
    subject: "Updated Itinerary: {{tripName}}",
    body: `Your itinerary for {{tripName}} has been updated with some changes.

Please review the latest version via the link below to see what's new. Key changes have been highlighted in the itinerary.

If you have any questions about the updates, please get in touch.`,
  },
  {
    id: "custom",
    label: "Custom Message",
    subject: "{{tripName}}",
    body: "",
  },
];
