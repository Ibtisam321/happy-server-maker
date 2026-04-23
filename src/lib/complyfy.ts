// Complyfy policy generation, scoring & recommendation engine.

export interface FormData {
  company: string;
  email: string;
  website: string;
  ico: string;
  dpo: string;
  dataTypes: string[];
  purpose: string;
  purposeExtra: string;
  legal: string;
  legitExplain: string;
  specialCategoryBasis: string;
  thirdParties: string[];
  transfersOutsideUK: string;
  cookies: string;
  retention: string;
  securityMeasures: string;
  childrenData: string;
  automatedDecisions: string;
  policyUpdateMethod: string;
  additionalInfo: string;
}

export type RiskTag = { label: string; type: "good" | "warn" | "bad" };

export interface ScoreResult {
  score: number;
  risks: RiskTag[];
  positives: RiskTag[];
  riskLevel: "low" | "medium" | "high";
  recommendations: string[];
}

export function calculateScore(d: FormData): ScoreResult {
  let score = 100;
  const risks: RiskTag[] = [];
  const positives: RiskTag[] = [];
  const recommendations: string[] = [];

  // ── Risk-based deductions ──────────────────────────────────────────
  if (d.dataTypes.some((t) => t.includes("Special category"))) {
    score -= 20;
    risks.push({ label: "Sensitive data collected (-20) — ensure safeguards are in place", type: "bad" });
    recommendations.push(
      "You process special category data — conduct a Data Protection Impact Assessment (DPIA) under UK GDPR Article 35, and document an explicit Article 9 lawful basis.",
    );
  }
  if (d.dataTypes.some((t) => t.includes("Payment"))) {
    score -= 10;
    risks.push({ label: "Payment data — ensure PCI-DSS", type: "warn" });
    recommendations.push(
      "Ensure your payment processor is PCI-DSS compliant and that card data never touches your own servers.",
    );
  }
  if (d.cookies === "marketing" || d.cookies === "all") {
    score -= 10;
    risks.push({ label: "Marketing cookies (-10) — consent required", type: "warn" });
    recommendations.push(
      "Implement a PECR-compliant cookie banner with granular opt-in for marketing cookies and an easy way to withdraw consent.",
    );
  } else if (d.cookies === "analytics") {
    recommendations.push(
      "Analytics cookies still need explicit consent under PECR — make sure your cookie banner blocks them by default.",
    );
  }
  if (d.retention === "Over 6 years (legal / financial records)") {
    score -= 15;
    risks.push({ label: "Long retention period (-15) — justify under storage limitation", type: "warn" });
    recommendations.push(
      "Document why you retain data over 6 years (e.g. HMRC requirements) to satisfy the storage limitation principle.",
    );
  }
  if (!d.legal || !d.legal.trim()) {
    score -= 30;
    risks.push({ label: "No legal basis selected (-30) — UK GDPR requires one", type: "bad" });
    recommendations.push(
      "Select one of the six UK GDPR Article 6 lawful bases — processing without a valid legal basis is unlawful.",
    );
  }
  // Third-party sharing without an explanation note in additionalInfo / securityMeasures
  const sharesWithThirdParties = d.thirdParties.some((t) => !t.startsWith("No third parties"));
  if (sharesWithThirdParties && !d.additionalInfo.trim() && !d.securityMeasures.trim()) {
    score -= 10;
    risks.push({ label: "Third-party sharing without explanation (-10)", type: "warn" });
    recommendations.push(
      "Document why each third party receives data and what safeguards apply — add details in the 'Additional information' or 'Security measures' fields.",
    );
  }
  if (d.thirdParties.some((t) => t.includes("Advertising"))) {
    score -= 10;
    risks.push({ label: "Ad networks — review data sharing", type: "warn" });
    recommendations.push(
      "Sign a Data Processing Agreement with each advertising network and disclose the categories of data shared.",
    );
  }
  if (d.transfersOutsideUK === "unsure") {
    score -= 5;
    risks.push({ label: "International transfers unclear", type: "warn" });
    recommendations.push(
      "Audit your processors and confirm whether data leaves the UK; document an adequacy decision or Standard Contractual Clauses for any transfers.",
    );
  }
  if (d.automatedDecisions === "automated") {
    score -= 10;
    risks.push({ label: "Automated decisions — Article 22 applies", type: "bad" });
    recommendations.push(
      "Provide users with a human-review pathway for any automated decisions that significantly affect them (UK GDPR Article 22).",
    );
  }
  if (d.childrenData === "yes") {
    score -= 10;
    risks.push({ label: "Children's data — AADC applies", type: "bad" });
    recommendations.push(
      "Comply with the ICO's Age Appropriate Design Code: verify parental consent and apply high-privacy defaults for under-13s.",
    );
  }

  // ── Missing-explanation deductions ────────────────────────────────
  if (d.legal === "Legitimate interests" && !d.legitExplain.trim()) {
    score -= 10;
    risks.push({ label: "Missing legitimate interest explanation (-10)", type: "bad" });
    recommendations.push(
      "Document your Legitimate Interests Assessment (LIA) — purpose, necessity, and balancing test against individual rights.",
    );
  }
  if (!d.securityMeasures.trim()) {
    score -= 5;
    risks.push({ label: "Security measures not documented (-5)", type: "warn" });
    recommendations.push(
      "Document your technical and organisational security measures — encryption, access controls, MFA, staff training and breach response.",
    );
  }
  if (!d.ico) {
    recommendations.push(
      "Most UK businesses processing personal data must register with the ICO and pay the data protection fee.",
    );
  }
  if (!d.dpo && d.dataTypes.some((t) => t.includes("Special category"))) {
    recommendations.push(
      "Processing special category data at scale typically requires appointing a Data Protection Officer (UK GDPR Article 37).",
    );
  }

  // ── Positives ─────────────────────────────────────────────────────
  if (d.ico) positives.push({ label: "ICO registered ✓", type: "good" });
  if (d.dpo) positives.push({ label: "DPO named ✓", type: "good" });
  if (d.securityMeasures) positives.push({ label: "Security documented ✓", type: "good" });

  const finalScore = Math.max(score, 10);
  const riskLevel: ScoreResult["riskLevel"] =
    finalScore >= 80 ? "low" : finalScore >= 60 ? "medium" : "high";

  // Always-relevant baseline recommendations
  recommendations.push(
    "Maintain a Record of Processing Activities (ROPA) under UK GDPR Article 30 — even small businesses benefit from this.",
  );
  recommendations.push(
    "Establish a documented data breach response plan: ICO must be notified within 72 hours of a notifiable breach.",
  );

  return { score: finalScore, risks, positives, riskLevel, recommendations };
}

const GDPR_PRINCIPLES_TEXT = `The seven UK GDPR principles guide all our processing:

  1. Lawfulness, fairness and transparency — we process data on a clear lawful basis and tell you what we do.
  2. Purpose limitation — we collect data only for the specified purposes set out below.
  3. Data minimisation — we collect only what is necessary for those purposes.
  4. Accuracy — we keep your data up to date and correct it on request.
  5. Storage limitation — we retain data only for as long as needed.
  6. Integrity and confidentiality — we protect data with appropriate technical and organisational measures.
  7. Accountability — we document our compliance and can demonstrate it on request.`;

export function generatePolicy(d: FormData, score?: ScoreResult): string {
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const transferText: Record<string, string> = {
    no: "All personal data is stored and processed within the United Kingdom.",
    adequacy:
      "Some data may be transferred to countries with UK adequacy decisions, including countries in the EEA and the US under the UK-US Data Bridge.",
    safeguards:
      "Some data may be transferred outside the UK with appropriate safeguards in place, such as UK-approved Standard Contractual Clauses (SCCs).",
    unsure:
      "Some third-party processors may store data outside the UK. We are reviewing our international transfer mechanisms and will update this policy accordingly.",
  };

  const cookieText: Record<string, string> = {
    none: "This website does not use cookies.",
    essential:
      "We use essential cookies only. These are strictly necessary for the website to function and do not require your consent under PECR.",
    analytics:
      "We use essential and analytics/performance cookies. Under the Privacy and Electronic Communications Regulations (PECR), non-essential cookies require your explicit consent before being placed. Analytics cookies help us understand how visitors use our site so we can improve our service. You can withdraw or change your consent at any time via our cookie settings.",
    marketing:
      "We use essential and marketing/targeting cookies to deliver relevant advertisements. Under the Privacy and Electronic Communications Regulations (PECR), non-essential cookies require your explicit, informed consent before being placed. You can withdraw consent at any time via our cookie settings.",
    all: "We use essential, analytics, and marketing cookies. Essential cookies are necessary for the site to function. Under the Privacy and Electronic Communications Regulations (PECR), all non-essential cookies (analytics and marketing) require your explicit, informed consent before being placed, managed via our cookie banner. You can withdraw or change your consent at any time.",
  };

  const automatedText: Record<string, string> = {
    no: "We do not carry out any automated decision-making or profiling using your personal data.",
    profiling:
      "We carry out profiling for analytical purposes (e.g. understanding usage patterns). This does not result in automated decisions that significantly affect you.",
    automated:
      "We carry out automated decision-making that may significantly affect you. Under UK GDPR Article 22 you have the right to request human review, express your point of view, and contest any automated decision. Please contact us to exercise this right.",
  };

  const childrenText: Record<string, string> = {
    no: "Our services are not directed at children under 13. We do not knowingly collect personal data from children.",
    yes: "Where we collect data from children under 13, we obtain verifiable parental or guardian consent, in line with the UK GDPR and the Age Appropriate Design Code (AADC).",
    restricted:
      "Our services are intended for users aged 18 and over. We do not knowingly collect personal data from minors.",
  };

  const recsBlock =
    score && score.recommendations.length > 0
      ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nINTERNAL COMPLIANCE RECOMMENDATIONS\n(For your records — not for publication)\n\n${score.recommendations.map((r, i) => `  ${i + 1}. ${r}`).join("\n")}\n`
      : "";

  return `PRIVACY POLICY
Last updated: ${date}${d.website ? "\nWebsite: " + d.website : ""}${d.ico ? "\nICO Registration: " + d.ico : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. WHO WE ARE

${d.company} ("we", "us", "our") is the data controller for your personal data.

Contact: ${d.email}${d.dpo ? "\nData Protection Officer: " + d.dpo : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. OUR DATA PROTECTION PRINCIPLES

${GDPR_PRINCIPLES_TEXT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. WHAT DATA WE COLLECT

${d.dataTypes.map((t) => "  • " + t).join("\n")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. WHY WE COLLECT YOUR DATA (PURPOSE OF PROCESSING)

Under UK GDPR we must clearly explain the specific purpose for which we use your personal data. We collect and process your data for the following purposes:

  • ${d.purpose}${d.purposeExtra ? "\n  • " + d.purposeExtra : ""}

We will not use your personal data for any new, incompatible purpose without first informing you and, where required, obtaining your consent.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. LEGAL BASIS FOR PROCESSING

Under UK GDPR Article 6, every processing activity must have one of six lawful bases:

  1. Consent — you have given clear consent for a specific purpose
  2. Contract — processing is necessary to perform a contract with you
  3. Legal obligation — processing is required to comply with the law
  4. Vital interests — processing is necessary to protect someone's life
  5. Public task — processing is necessary for a task in the public interest
  6. Legitimate interests — processing is necessary for our (or a third party's) legitimate interests, balanced against your rights

Our lawful basis for processing your personal data is:

  ${d.legal}${
    d.legal === "Legitimate interests"
      ? "\n\nOur legitimate interest, and the balancing test we have carried out:\n  " + (d.legitExplain || "(not provided)")
      : ""
  }${d.specialCategoryBasis ? "\n\nSpecial category data (Article 9): " + d.specialCategoryBasis : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6. WHO WE SHARE YOUR DATA WITH (THIRD-PARTY SHARING)

We share your personal data only with the following categories of third-party processors, each engaged under a written data processing agreement:

${d.thirdParties.map((t) => "  • " + t).join("\n")}

We require all third-party processors to comply with UK data protection law. We do not sell your personal data.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

7. INTERNATIONAL DATA TRANSFERS

${transferText[d.transfersOutsideUK] || ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

8. COOKIES AND TRACKING

${cookieText[d.cookies] || ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

9. HOW LONG WE KEEP YOUR DATA

We retain personal data for: ${d.retention}.

After this period, data will be securely deleted or anonymised unless retention is required for legal reasons.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

10. HOW WE PROTECT YOUR DATA

${d.securityMeasures || "We implement appropriate technical and organisational measures to protect personal data against unauthorised access, alteration, disclosure, or destruction, including access controls, secure connections (TLS), and regular security reviews."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

11. AUTOMATED DECISION-MAKING

${automatedText[d.automatedDecisions] || ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

12. CHILDREN'S DATA

${childrenText[d.childrenData] || ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

13. YOUR RIGHTS UNDER UK GDPR (IN PLAIN ENGLISH)

You have the following rights regarding your personal data:

  • Right of access — you can ask us for a copy of the personal data we hold about you
  • Right to rectification — you can ask us to correct any data that is wrong or incomplete
  • Right to erasure ("right to be forgotten") — you can ask us to delete your personal data
  • Right to restrict processing — you can ask us to pause or limit how we use your data
  • Right to object — you can object to us using your data, especially for direct marketing or where we rely on legitimate interests
  • Right to data portability — you can ask us to provide your data in a portable format so you can move it to another service
  • Right to withdraw consent — where we rely on consent, you can withdraw it at any time
  • Rights regarding automated decisions — you can request human review of automated decisions that significantly affect you

To exercise any of these rights, contact: ${d.email}
We will respond within one calendar month.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

14. HOW TO COMPLAIN

You have the right to lodge a complaint with the UK supervisory authority — the Information Commissioner's Office (ICO) — if you believe we have not handled your personal data in accordance with the law:

  Information Commissioner's Office
  Website: ico.org.uk
  Phone:   0303 123 1113
  Post:    Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF

We would welcome the opportunity to resolve any concerns directly — please contact us first at ${d.email} so we can try to put things right.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

15. CHANGES TO THIS POLICY

When we update this policy we will: ${d.policyUpdateMethod}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

16. APPLICABLE LAW

This policy complies with:
  • UK General Data Protection Regulation (UK GDPR)
  • Data Protection Act 2018
  • Privacy and Electronic Communications Regulations (PECR)
${d.additionalInfo ? "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n17. ADDITIONAL INFORMATION\n\n" + d.additionalInfo + "\n" : ""}${recsBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
© ${new Date().getFullYear()} ${d.company}. All rights reserved.`;
}

export const STEP_NAMES = [
  "Company info",
  "Data collection",
  "Legal basis",
  "Third parties",
  "Cookies & retention",
  "Final details",
];
export const TOTAL_STEPS = 6;

export const emptyForm = (): FormData => ({
  company: "",
  email: "",
  website: "",
  ico: "",
  dpo: "",
  dataTypes: [],
  purpose: "Order fulfilment and delivery",
  purposeExtra: "",
  legal: "Consent",
  legitExplain: "",
  specialCategoryBasis: "",
  thirdParties: [],
  transfersOutsideUK: "no",
  cookies: "none",
  retention: "Up to 12 months",
  securityMeasures: "",
  childrenData: "no",
  automatedDecisions: "no",
  policyUpdateMethod: "Email notification to registered users",
  additionalInfo: "",
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateStep(step: number, d: FormData): string | null {
  if (step === 1) {
    if (!d.company.trim()) return "Please enter your company name.";
    if (!EMAIL_RE.test(d.email.trim())) return "Please enter a valid email address.";
  }
  if (step === 2) {
    if (d.dataTypes.length === 0) return "Please select at least one type of data you collect.";
  }
  if (step === 3) {
    if (d.legal === "Legitimate interests" && !d.legitExplain.trim()) {
      return "Please describe your legitimate interest (required).";
    }
  }
  if (step === 4) {
    if (d.thirdParties.length === 0)
      return "Select at least one third-party option (or 'No third parties').";
  }
  if (step === 6) {
    if (!d.company.trim() || !EMAIL_RE.test(d.email.trim()))
      return "Company and a valid email are required.";
    if (d.dataTypes.length === 0) return "Select at least one data type.";
    if (d.thirdParties.length === 0)
      return "Select at least one third-party option (or 'No third parties').";
    if (d.legal === "Legitimate interests" && !d.legitExplain.trim())
      return "Describe your legitimate interest.";
  }
  return null;
}

/* ─────────────────────────  GDPR TOOLBOX  ───────────────────────── */

export interface ToolboxEntry {
  term: string;
  short: string;
  detail: string;
}

export const TOOLBOX: ToolboxEntry[] = [
  {
    term: "Personal data",
    short: "Any info that identifies a person.",
    detail:
      "Personal data is any information relating to an identified or identifiable individual — name, email, IP address, photos, even an order number tied to a customer. If it can single someone out, it counts.",
  },
  {
    term: "Legal basis",
    short: "Your justification for using data.",
    detail:
      "Under UK GDPR Article 6, every processing activity needs one of six lawful bases: Consent, Contract, Legal obligation, Vital interests, Public task, or Legitimate interests. Pick the one that best fits why you collect each type of data.",
  },
  {
    term: "Legitimate interests",
    short: "Useful but requires a balancing test.",
    detail:
      "You can rely on Legitimate Interests if you have a real business need that isn't outweighed by the user's rights. You must document a Legitimate Interests Assessment (LIA) covering purpose, necessity and balance.",
  },
  {
    term: "Cookies & PECR",
    short: "Non-essential cookies need consent.",
    detail:
      "PECR (Privacy and Electronic Communications Regulations) requires explicit, informed consent before setting any non-essential cookie — analytics and marketing included. A pre-ticked box is not consent.",
  },
  {
    term: "Data retention",
    short: "Keep data only as long as needed.",
    detail:
      "The storage limitation principle means you must define how long you keep each category of data and delete or anonymise it afterwards. Keep records of why each retention period is justified.",
  },
  {
    term: "Special category data",
    short: "Sensitive data — extra protection.",
    detail:
      "Health, ethnicity, religion, sexuality, biometrics and political opinions need an Article 9 condition on top of your Article 6 lawful basis. Processing this at scale usually triggers a DPIA.",
  },
  {
    term: "DPIA",
    short: "Risk assessment for high-risk processing.",
    detail:
      "A Data Protection Impact Assessment is mandatory under Article 35 when processing is likely to result in high risk to individuals — e.g. large-scale profiling, sensitive data, or new tech.",
  },
  {
    term: "ICO",
    short: "The UK's data protection regulator.",
    detail:
      "The Information Commissioner's Office enforces UK data protection law. Most data-processing businesses must register and pay the data protection fee, and breaches must be reported within 72 hours.",
  },
];
