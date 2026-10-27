export type EmailTone = "brand" | "success" | "warning" | "danger";

/** The pieces every email is made of; `renderEmail` turns them into HTML and plain text. Values are raw text. */
export interface EmailLayout {
  /** Inbox preview line. */
  preheader: string;
  badge: { label: string; tone: EmailTone };
  title: string;
  paragraphs: string[];
  /** Grey box, e.g. the event and the order. */
  panel?: { heading: string; rows: [label: string, value: string][] };
  /** Line items, e.g. one per ticket. */
  items?: { title: string; subtitle: string; aside: string }[];
  total?: { label: string; value: string };
  cta?: { label: string; url: string };
  /** Why the recipient got it. */
  footer: string;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface EmailAttachment {
  filename: string;
  /** Base64. */
  content: string;
}

export interface EmailMessage extends EmailContent {
  to: string;
  attachments?: EmailAttachment[];
}
