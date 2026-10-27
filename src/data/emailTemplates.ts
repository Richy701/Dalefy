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
    body: `Your itinerary for {{tripName}} is ready.

Open your itinerary below to review the schedule, travel arrangements and organiser details. You can view it in your browser or join the trip in the Dalefy app using the PIN in this email.

If anything needs clarifying before you travel, please get in touch.

We look forward to welcoming you.`,
  },
  {
    id: "reminder",
    label: "Pre-Departure Reminder",
    subject: "Reminder: {{tripName}} - {{dates}}",
    body: `Your trip to {{destination}} is coming up. Please take a moment to review your itinerary and check the latest timings before departure.

Before you travel:
• Check your passport meets your destination's validity requirements
• Confirm any visa and entry requirements that apply to you
• Keep your travel insurance details and booking confirmations handy
• Review your meeting points, transfers and organiser contact details

If you have a question or a change to your plans, please get in touch before departure.

We look forward to seeing you.`,
  },
  {
    id: "dresscode",
    label: "Dress Code Notice",
    subject: "Dress Code - {{tripName}}",
    body: `As you prepare for {{tripName}}, please check your itinerary for any dress requirements at hosted events, restaurants and activities.

Choose clothing and footwear suited to the weather and the activities planned. Where a venue or host has a specific dress code, follow the guidance in your itinerary.

If you are unsure what to bring, please contact your organiser before you travel.`,
  },
  {
    id: "update",
    label: "Itinerary Update",
    subject: "Updated Itinerary: {{tripName}}",
    body: `There is an update to your itinerary for {{tripName}}.

Please open the itinerary below and check the latest timings, locations and travel arrangements before your next activity.

If you have any questions about the updates, please get in touch.`,
  },
  {
    id: "custom",
    label: "Custom Message",
    subject: "{{tripName}}",
    body: "",
  },
];
