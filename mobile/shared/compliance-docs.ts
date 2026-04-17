export interface DocSection {
  heading: string;
  body: string;
}

export interface DocContent {
  title: string;
  preamble: string;
  sections: DocSection[];
}

export interface ComplianceDoc {
  name: string;
  status: "Signed" | "Pending" | "Expired";
  date?: string;
}

export const DOC_NAMES = [
  "Passport",
  "Travel Insurance",
  "Behavioural Agreement",
  "Code of Conduct Review",
  "Risk Assessment",
] as const;

export type DocName = (typeof DOC_NAMES)[number];

export const DEFAULT_DOCS: ComplianceDoc[] = DOC_NAMES.map((name) => ({
  name,
  status: "Pending" as const,
}));

export const COMPLIANCE_DOC_CONTENT: Record<string, DocContent> = {
  Passport: {
    title: "Passport Verification Declaration",
    preamble:
      "This declaration confirms that the traveller\u2019s passport details have been verified and are valid for all planned travel destinations.",
    sections: [
      {
        heading: "1. Validity Confirmation",
        body: "I confirm that my passport is valid for a minimum of six (6) months beyond the planned return date of any trip I am assigned to. I understand that entry requirements vary by destination and that it is my responsibility to ensure my travel documents meet all applicable requirements.",
      },
      {
        heading: "2. Accuracy of Information",
        body: "I confirm that all passport details provided to DAF Adventures are accurate and match the information printed in my passport exactly. Any discrepancies in name, date of birth, or passport number may result in denied boarding or entry refusal.",
      },
      {
        heading: "3. Notification of Changes",
        body: "I agree to notify the HR department immediately if my passport is lost, stolen, damaged, or renewed. I understand that failure to provide updated passport information may impact my eligibility for upcoming travel assignments.",
      },
      {
        heading: "4. Data Handling",
        body: "I consent to DAF Adventures storing a copy of my passport details securely for the purpose of booking travel, arranging visas, and complying with destination entry requirements. This data will be handled in accordance with GDPR and the company\u2019s data protection policy.",
      },
    ],
  },

  "Travel Insurance": {
    title: "Travel Insurance Acknowledgement",
    preamble:
      "This document confirms the traveller\u2019s understanding of the company travel insurance policy and their obligations while travelling on company business.",
    sections: [
      {
        heading: "1. Coverage Overview",
        body: "DAF Adventures provides comprehensive travel insurance for all company-sponsored trips. Coverage includes medical expenses up to \u00a35,000,000, trip cancellation, baggage loss up to \u00a33,000, personal liability, and emergency repatriation. Coverage is activated upon departure and ceases upon return to the UK.",
      },
      {
        heading: "2. Pre-existing Conditions",
        body: "I confirm that I have disclosed any pre-existing medical conditions that may affect my travel insurance coverage. I understand that failure to disclose relevant conditions may result in claims being denied. If my medical circumstances change before travel, I agree to notify HR immediately.",
      },
      {
        heading: "3. Traveller Responsibilities",
        body: "I agree to act responsibly while travelling and to follow all safety guidance provided by trip leaders and local authorities. I understand that insurance coverage may be voided if injury or loss results from reckless behaviour, intoxication, or participation in activities not covered by the policy.",
      },
      {
        heading: "4. Claims Process",
        body: "In the event of a claim, I will notify the HR department within 48 hours of the incident and provide all required documentation including police reports, medical certificates, and receipts. I understand that late reporting may affect the outcome of my claim.",
      },
    ],
  },

  "Behavioural Agreement": {
    title: "Professional Conduct & Behavioural Agreement",
    preamble:
      "This agreement sets out the expected standards of professional conduct for all DAF Adventures team members while representing the company during business travel, FAM trips, and client events.",
    sections: [
      {
        heading: "1. Professional Representation",
        body: "I understand that while travelling on company business, I am a representative of DAF Adventures at all times. I agree to conduct myself professionally, treat all colleagues, clients, suppliers, and local communities with respect, and uphold the company\u2019s reputation in all interactions.",
      },
      {
        heading: "2. Alcohol & Substance Policy",
        body: "I acknowledge that while moderate social drinking may be appropriate in certain business settings, excessive alcohol consumption or the use of illegal substances during company travel is strictly prohibited. Any breach of this policy may result in immediate removal from the trip and disciplinary action.",
      },
      {
        heading: "3. Cultural Sensitivity",
        body: "I agree to respect local customs, dress codes, and cultural practices at all destinations. I will follow any cultural briefings provided before travel and act with sensitivity when visiting religious sites, local communities, or culturally significant locations.",
      },
      {
        heading: "4. Social Media & Confidentiality",
        body: "I agree to follow the company\u2019s social media policy when posting content related to company trips. I will not share confidential pricing, supplier agreements, or client information on any platform. All photography and video content shared publicly must be approved by the marketing team.",
      },
      {
        heading: "5. Consequences of Breach",
        body: "I understand that any breach of this behavioural agreement may result in disciplinary action, which could include formal warnings, removal from current or future trips, or termination of employment depending on the severity of the breach.",
      },
    ],
  },

  "Code of Conduct Review": {
    title: "Annual Code of Conduct Review",
    preamble:
      "All DAF Adventures team members are required to review and acknowledge the company Code of Conduct annually. This ensures ongoing awareness of professional standards and regulatory obligations.",
    sections: [
      {
        heading: "1. Anti-Bribery & Corruption",
        body: "I confirm that I have read and understood the company\u2019s anti-bribery and corruption policy. I will not offer, promise, give, request, or accept any bribe or facilitation payment in connection with my work.",
      },
      {
        heading: "2. Equal Opportunities & Inclusion",
        body: "I acknowledge DAF Adventures\u2019 commitment to equality, diversity, and inclusion in the workplace and during travel. I will treat all colleagues and stakeholders fairly regardless of age, disability, gender, race, religion, sexual orientation, or any other protected characteristic.",
      },
      {
        heading: "3. Health & Safety",
        body: "I agree to comply with all health and safety procedures during company travel. I will attend safety briefings, follow emergency procedures, use safety equipment where provided, and report any hazards or near-misses to the trip leader immediately.",
      },
      {
        heading: "4. Whistleblowing",
        body: "I am aware of the company\u2019s whistleblowing policy and understand that I can report concerns about illegal or unethical behaviour confidentially without fear of retaliation.",
      },
    ],
  },

  "Risk Assessment": {
    title: "Travel Risk Assessment Acknowledgement",
    preamble:
      "This document confirms that the traveller has reviewed the risk assessment for their assigned destination(s) and understands the identified risks and mitigation measures.",
    sections: [
      {
        heading: "1. Destination Risk Review",
        body: "I confirm that I have reviewed the destination risk assessment provided by the operations team, including FCDO travel advice, health risks, security considerations, and any destination-specific warnings.",
      },
      {
        heading: "2. Health Precautions",
        body: "I confirm that I have obtained or am in the process of obtaining all recommended vaccinations and health precautions for my assigned destination(s). I have reviewed the health advisory and understand any medication requirements.",
      },
      {
        heading: "3. Emergency Procedures",
        body: "I have noted the emergency contact details for my destination, including the local emergency services number, the nearest British Embassy or Consulate, the company 24-hour emergency line, and the travel insurance emergency assistance number.",
      },
      {
        heading: "4. Personal Responsibility",
        body: "I agree to exercise reasonable caution while at the destination, avoid high-risk areas identified in the risk assessment, keep my personal belongings secure, and maintain communication with the trip leader.",
      },
    ],
  },
};
