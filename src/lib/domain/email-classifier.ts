/**
 * Deterministic classifier for career / college emails. It only ever sees the
 * sender, subject and Gmail's short snippet (never the body) and returns null
 * unless it is reasonably sure the email is something worth acting on.
 */
import { addDays, isISODate, type ISODate } from "../time";

export const INSIGHT_KINDS = ["INTERVIEW", "ASSESSMENT", "OFFER", "REJECTION", "APPLICATION", "COLLEGE", "DEADLINE"] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export interface EmailClassification {
  kind: InsightKind;
  company?: string;
  suggestedDate?: ISODate;
}

export interface EmailInput {
  /** Raw From header, e.g. `"Razorpay Hiring" <no-reply@greenhouse.io>` */
  from: string;
  subject: string;
  snippet?: string | null;
  /** Local date (user's time zone) the email arrived — anchor for "tomorrow". */
  receivedDate: ISODate;
}

/** UI + action metadata per kind. `status` is the JobApplication status it implies. */
export const INSIGHT_KIND_META: Record<InsightKind, { label: string; status: "INTERVIEW" | "ASSESSMENT" | "OFFER" | "REJECTED" | "APPLIED" | null; eventType: string; tone: "accent" | "success" | "warning" | "muted" }> = {
  INTERVIEW: { label: "Interview", status: "INTERVIEW", eventType: "INTERVIEW", tone: "accent" },
  ASSESSMENT: { label: "Assessment", status: "ASSESSMENT", eventType: "OTHER", tone: "accent" },
  OFFER: { label: "Offer", status: "OFFER", eventType: "OTHER", tone: "success" },
  REJECTION: { label: "Update", status: "REJECTED", eventType: "OTHER", tone: "muted" },
  APPLICATION: { label: "Application", status: "APPLIED", eventType: "OTHER", tone: "muted" },
  COLLEGE: { label: "College", status: null, eventType: "EXAM", tone: "warning" },
  DEADLINE: { label: "Deadline", status: null, eventType: "ASSIGNMENT", tone: "warning" },
};

/** Event type to create when an insight is added to the calendar. */
export function insightEventType(kind: InsightKind, subject: string): "INTERVIEW" | "EXAM" | "ASSIGNMENT" | "OTHER" {
  if (kind === "INTERVIEW") return "INTERVIEW";
  if (kind === "DEADLINE") return "ASSIGNMENT";
  if (kind === "COLLEGE") {
    if (/\b(exam|examination|viva|test|quiz|practical)\b/i.test(subject)) return "EXAM";
    if (/\b(assignment|submission|project|report|journal)\b/i.test(subject)) return "ASSIGNMENT";
    return "OTHER";
  }
  return "OTHER";
}

// ── Text helpers ──

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#34": '"' };

/** Gmail snippets are HTML-escaped; decode the common entities. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      const c = code.toLowerCase();
      if (ENTITIES[c]) return ENTITIES[c];
      if (c.startsWith("#")) {
        const cp = c.startsWith("#x") ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
        // Out-of-range code points would make fromCodePoint throw and abort the whole sync.
        return Number.isInteger(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      }
      return m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a From header into display name and address. */
export function parseFrom(from: string): { name: string; email: string; domain: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  const name = (m ? m[1] : "").trim();
  const email = (m ? m[2] : from).trim().toLowerCase();
  const domain = email.includes("@") ? email.split("@").pop()!.replace(/[>\s]/g, "") : "";
  return { name, email, domain };
}

// ── Sender knowledge ──

const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.in",
  "ymail.com",
  "icloud.com",
  "me.com",
  "rediffmail.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "zoho.com",
]);

/** Applicant-tracking systems, job boards and assessment platforms that send on behalf of employers. */
const PLATFORM_DOMAINS = [
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "myworkday.com",
  "myworkdayjobs.com",
  "workday.com",
  "smartrecruiters.com",
  "icims.com",
  "ashbyhq.com",
  "successfactors.com",
  "successfactors.eu",
  "taleo.net",
  "jobvite.com",
  "workable.com",
  "recruitee.com",
  "breezy.hr",
  "bamboohr.com",
  "zohorecruit.com",
  "zohorecruit.in",
  "freshteam.com",
  "keka.com",
  "darwinbox.in",
  "darwinbox.com",
  "hackerrank.com",
  "hackerearth.com",
  "codility.com",
  "codesignal.com",
  "mettl.com",
  "mercer-mettl.com",
  "amcat.in",
  "aspiringminds.com",
  "shl.com",
  "talview.com",
  "hirepro.in",
  "joinsuperset.com",
  "superset.com",
  "unstop.com",
  "dare2compete.com",
  "naukri.com",
  "naukrimail.com",
  "linkedin.com",
  "internshala.com",
  "instahyre.com",
  "wellfound.com",
  "angellist.com",
  "indeed.com",
  "indeedemail.com",
  "foundit.in",
  "monsterindia.com",
  "iimjobs.com",
  "hirist.com",
  "hirist.tech",
  "cutshort.io",
  "glassdoor.com",
  "apna.co",
  "calendly.com",
];

const PLATFORM_NAMES = /^(greenhouse|lever|workday|smartrecruiters|icims|ashby|successfactors|taleo|jobvite|workable|hackerrank|hackerearth|codility|codesignal|mettl|mercer\s*\|?\s*mettl|amcat|shl|talview|hirepro|superset|unstop|naukri(\.com)?|linkedin|linkedin jobs|internshala|instahyre|wellfound|indeed|foundit|iimjobs|hirist|cutshort|glassdoor|calendly|no-?reply|noreply|notifications?|careers?|jobs?|recruit(ing|ment)?|hr|talent acquisition|hiring team)$/i;

const MULTI_PART_TLDS = new Set(["co.in", "co.uk", "com.au", "org.in", "net.in", "firm.in", "gen.in", "ind.in", "ac.in", "edu.in", "gov.in", "res.in", "co.jp", "com.sg", "co.nz"]);

function isPlatformDomain(domain: string): boolean {
  return PLATFORM_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** College / university senders: .edu, .ac.in, .edu.in, .ac.uk etc. */
export function isAcademicDomain(domain: string): boolean {
  return /(^|\.)(edu|ac\.[a-z]{2}|edu\.[a-z]{2})$/.test(domain);
}

function registrableLabel(domain: string): string {
  const parts = domain.split(".").filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo) && parts.length >= 3) return parts[parts.length - 3];
  return parts[parts.length - 2];
}

function prettyLabel(label: string): string {
  const clean = label.replace(/[-_]+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= 3 && !clean.includes(" ")) return clean.toUpperCase();
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

const NAME_NOISE =
  /\b(via\s+\w+|university recruiting|campus recruiting|campus hiring|campus relations|early careers?|talent acquisition|talent team|recruiting team|recruitment team|hiring team|people team|hr team|recruiting|recruitment|recruiter|careers?|jobs|hiring|talent|team|hr|no-?reply|noreply|notifications?|india|pvt\.?|private|ltd\.?|limited|inc\.?|llp|technologies)\b/gi;

/** Strip "Recruiting", "Careers", "via Greenhouse", "Pvt Ltd"… from a display name. */
export function cleanCompanyName(name: string): string {
  const out = name
    .replace(/["']/g, "")
    .replace(/\s+(at|@|from)\s+/gi, " ")
    .replace(NAME_NOISE, " ")
    .replace(/[|•·:,\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out.length >= 2 && out.length <= 60 ? out : "";
}

/** Company named in a subject, e.g. "Infosys Campus Drive", "Interview with Razorpay", "Your application was sent to Zepto". */
export function companyFromSubject(subject: string): string | undefined {
  const s = subject.replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, "").trim();
  const patterns = [
    /^([A-Z][\w&.'\- ]{1,40}?)\s+(?:campus|placement|recruitment|hiring|pool campus|off[- ]campus|on[- ]campus)\s+drive\b/i,
    /\b(?:campus|placement|recruitment|hiring)\s+drive\s*(?:[:\-–|]|by|for|of)\s*([A-Z][\w&.'\- ]{1,40}?)(?=\s*(?:[-–|:(,]|$|\s+for\b|\s+on\b|\s+\d))/i,
    /\b(?:interview|assessment|online test|coding test|offer)\s+(?:with|from|at)\s+([A-Z][\w&.'\- ]{1,40}?)(?=\s*(?:[-–|:(,!.]|$|\s+for\b|\s+on\b))/i,
    /\b(?:application (?:was )?sent to|applying to|applied to|application to|applying at)\s+([A-Z][\w&.'\- ]{1,40}?)(?=\s*(?:[-–|:(,!.]|$|\s+for\b))/i,
    /\b(?:applying for|application for)\s+.{1,60}?\s+at\s+([A-Z][\w&.'\- ]{1,40}?)(?=\s*(?:[-–|:(,!.]|$))/i,
  ];
  for (const p of patterns) {
    const m = p.exec(s);
    if (m) {
      const c = cleanCompanyName(m[1]);
      if (c && !PLATFORM_NAMES.test(c) && !/^(the|your|our|a|an)$/i.test(c)) return c;
    }
  }
  return undefined;
}

/**
 * Guess the company: a hiring platform's display name ("Razorpay Hiring Team"
 * via Greenhouse), else the employer's own domain, else the subject. Personal
 * mailboxes (gmail/outlook) and colleges don't name a company.
 */
export function guessCompany(from: string, subject: string): string | undefined {
  const { name, email, domain } = parseFrom(from);
  if (!domain || isAcademicDomain(domain)) return companyFromSubject(subject);
  if (PERSONAL_DOMAINS.has(domain)) return companyFromSubject(subject);
  if (isPlatformDomain(domain)) {
    const display = cleanCompanyName(name);
    if (display && !PLATFORM_NAMES.test(display) && !PLATFORM_NAMES.test(name.trim())) return display;
    const fromSubject = companyFromSubject(subject);
    if (fromSubject) return fromSubject;
    // Workday sends from <tenant>@myworkday.com
    const local = email.split("@")[0];
    if (/myworkday/.test(domain) && local && !/^(no-?reply|donotreply|notifications?)$/.test(local)) return prettyLabel(local);
    return undefined;
  }
  const label = registrableLabel(domain);
  const display = cleanCompanyName(name);
  if (display && label && display.toLowerCase().replace(/[^a-z0-9]/g, "").includes(label.toLowerCase().replace(/[^a-z0-9]/g, ""))) return display;
  return prettyLabel(label) || companyFromSubject(subject);
}

// ── Kind detection ──

const REJECTION = [
  /\bregret to inform\b/i,
  /\bnot (?:been )?(?:selected|shortlisted)\b/i,
  /\bwon't be (?:moving|proceeding|progressing) (?:forward|ahead|further)\b/i,
  /\bnot (?:be )?(?:moving|proceeding|progressing) (?:forward|ahead|further)\b/i,
  /\bdecided (?:not to (?:move|proceed|progress)|to (?:move|go) forward with other)/i,
  /\b(?:move|moving|go|going) (?:forward|ahead) with other candidates\b/i,
  /\bunable to (?:offer you|move forward|proceed with your)\b/i,
  /\bno longer (?:being )?considered\b/i,
  /\b(?:position|role) has (?:now )?been filled\b/i,
  /\bnot (?:a )?(?:right )?(?:fit|match) (?:for|at) this time\b/i,
];

const UNFORTUNATELY = /\bunfortunately\b/i;
const UNFORTUNATELY_CONTEXT = /\b(application|candidature|candidacy|profile|selected|shortlisted|proceed|forward|position|role|opportunit(?:y|ies)|other candidates)\b/i;

const OFFER_STRONG = [
  /\boffer letter\b/i,
  /\b(?:job|internship|employment|pre[- ]placement|full[- ]time|final) offer\b/i,
  /\bPPO\b/,
  /\bpleased to (?:offer|extend)\b/i,
  /\boffer of (?:employment|internship)\b/i,
  /\bletter of intent\b/i,
];
const OFFER_WEAK = [/\b(?:you have been|you've been|you are|you're|have been) (?:selected|hired)\b/i, /\bcongratulations\b.{0,80}\b(?:selected|hired)\b/i];
/** "Selected for the next round" is progress, not an offer. */
const NEXT_STAGE = /\b(?:selected|shortlisted|qualified|cleared)\b.{0,30}\b(?:round|interview|test|assessment|stage|gd|group discussion|process)\b/i;

function isOffer(text: string): boolean {
  if (/\b(?:special|limited[- ]time|exclusive|festive) offer\b/i.test(text)) return false;
  if (OFFER_STRONG.some((r) => r.test(text))) return true;
  return OFFER_WEAK.some((r) => r.test(text)) && !NEXT_STAGE.test(text);
}

const KIND_PATTERNS: { kind: InsightKind; re: RegExp }[] = [
  { kind: "ASSESSMENT", re: /\b(online (?:test|assessment)|coding (?:test|challenge|round|assessment)|aptitude (?:test|round)|technical (?:test|assessment)|(?<!internal )assessment|hackerrank|hackerearth|codility|codesignal|mettl|amcat|test link|OA link|take[- ]home)\b/i },
  { kind: "INTERVIEW", re: /\b(interview|technical round|hr round|managerial round|group discussion|GD round|panel round|shortlisted|next round)\b/i },
  { kind: "APPLICATION", re: /\b(thank(?:s| you) for (?:applying|your application|your interest)|application (?:has been |was )?(?:received|submitted|sent)|received your application|successfully applied|applied successfully|your application (?:to|for|at|with)|application confirmation)\b/i },
];

const DEADLINE_RE = /\b(deadline|due date|due (?:on|by|tomorrow|today)|last date|submit (?:by|before)|submission|extended till|closes on|registration closes)\b/i;
const COLLEGE_RE = /\b(semester|end[- ]sem|mid[- ]sem|internal (?:exam|assessment)|university exam|exam(?:ination)? (?:form|schedule|timetable|fees?)|hall ticket|admit card|viva|practical exam|journal submission|attendance|results? (?:declared|announced)|re-?exam|backlog|assignment)\b/i;

function earliestKind(text: string): InsightKind | null {
  let best: { kind: InsightKind; at: number } | null = null;
  for (const { kind, re } of KIND_PATTERNS) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at)) best = { kind, at: m.index };
  }
  return best?.kind ?? null;
}

function isRejection(text: string): boolean {
  if (REJECTION.some((r) => r.test(text))) return true;
  return UNFORTUNATELY.test(text) && UNFORTUNATELY_CONTEXT.test(text) && !/\breschedul/i.test(text);
}

function detectKind(subject: string, snippet: string, academic: boolean): InsightKind | null {
  const both = `${subject} . ${snippet}`;
  if (isRejection(both)) return "REJECTION";
  if (isOffer(both)) return "OFFER";
  const job = earliestKind(subject) ?? earliestKind(snippet);
  if (academic) {
    // Placement-cell emails about drives are job emails; everything else from college is college.
    if (job && job !== "APPLICATION" && !COLLEGE_RE.test(subject)) return job;
    if (DEADLINE_RE.test(both)) return "DEADLINE";
    if (job === "APPLICATION" || COLLEGE_RE.test(both) || /\b(exam|test|quiz|lab|lecture|class)\b/i.test(both)) return "COLLEGE";
    return job;
  }
  if (job) return job;
  if (COLLEGE_RE.test(both)) return "COLLEGE";
  if (DEADLINE_RE.test(subject)) return "DEADLINE";
  return null;
}

// ── Date extraction ──

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const p2 = (n: number) => String(n).padStart(2, "0");

function makeDate(y: number, m: number, d: number): ISODate | null {
  const s = `${y}-${p2(m)}-${p2(d)}`;
  return isISODate(s) ? s : null;
}

/** How far before / after the received date a parsed date may fall and still be a confident suggestion. */
const DATE_PAST_DAYS = 7;
const DATE_FUTURE_DAYS = 240;

function plausible(date: ISODate, received: ISODate): boolean {
  return date >= addDays(received, -DATE_PAST_DAYS) && date <= addDays(received, DATE_FUTURE_DAYS);
}

/**
 * Year for a day/month without a year: the occurrence not more than a week
 * before the email arrived. A date that would land many months ahead (e.g.
 * "your interview on 2 Oct" in a November email) is a past reference, not a
 * suggestion, so it is dropped.
 */
function inferYear(m: number, d: number, received: ISODate): ISODate | null {
  const y = Number(received.slice(0, 4));
  for (const year of [y, y + 1]) {
    const candidate = makeDate(year, m, d);
    if (candidate && candidate >= addDays(received, -DATE_PAST_DAYS)) return plausible(candidate, received) ? candidate : null;
  }
  return null;
}

function normYear(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

/**
 * The first date the text mentions confidently: "24 Nov", "24th November 2026",
 * "November 24", "24/11/2026" (day-first unless impossible), "2026-11-24",
 * "tomorrow" / "day after tomorrow" (relative to the received date).
 */
export function extractDate(text: string, received: ISODate): ISODate | undefined {
  const t = text.toLowerCase();
  const found: { at: number; date: ISODate }[] = [];
  // Only dates near the email (not birthdays, past rounds or far-off years) count as confident.
  const push = (at: number, date: ISODate | null) => {
    if (date && plausible(date, received)) found.push({ at, date });
  };

  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) push(m.index!, makeDate(Number(m[1]), Number(m[2]), Number(m[3])));

  for (const m of t.matchAll(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})\b/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = normYear(m[3]);
    // Indian convention is day-first; fall back to month-first only when day-first is impossible.
    const dmy = b <= 12 ? makeDate(y, b, a) : null;
    push(m.index!, dmy ?? (a <= 12 ? makeDate(y, a, b) : null));
  }

  const dayMonth = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?[\\s\\-]+${MONTH_RE}\\.?(?:[\\s\\-,]+(\\d{4}))?\\b`, "g");
  for (const m of t.matchAll(dayMonth)) {
    const d = Number(m[1]);
    const mo = MONTHS[m[2]];
    push(m.index!, m[3] ? makeDate(Number(m[3]), mo, d) : inferYear(mo, d, received));
  }

  const monthDay = new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, "g");
  for (const m of t.matchAll(monthDay)) {
    const mo = MONTHS[m[1]];
    const d = Number(m[2]);
    // Skip "may 2026" style (a year, not a day) — the \d{1,2} guard already ensures a day-sized number.
    push(m.index!, m[3] ? makeDate(Number(m[3]), mo, d) : inferYear(mo, d, received));
  }

  const dat = /\bday after tomorrow\b/.exec(t);
  if (dat) push(dat.index, addDays(received, 2));
  else {
    const tm = /\btomorrow\b/.exec(t);
    if (tm) push(tm.index, addDays(received, 1));
  }

  found.sort((a, b) => a.at - b.at);
  return found[0]?.date;
}

/** A clock time mentioned in the text ("at 3 PM", "10:30 am", "14:00 IST") as minutes from midnight. */
export function extractTime(text: string): number | undefined {
  const ampm = /\b(\d{1,2})(?::|\.)?(\d{2})?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/i.exec(text);
  if (ampm) {
    let h = Number(ampm[1]);
    const min = ampm[2] ? Number(ampm[2]) : 0;
    if (h < 1 || h > 12 || min > 59) return undefined;
    const pm = ampm[3].toLowerCase().startsWith("p");
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
    return h * 60 + min;
  }
  const h24 = /\b(?:at|from|by|@)\s*([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:\/|-))/i.exec(text) ?? /\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:hrs|hours|ist)\b/i.exec(text);
  if (h24) return Number(h24[1]) * 60 + Number(h24[2]);
  return undefined;
}

/** Classify an email from its headers + snippet. Returns null when it isn't actionable. */
export function classifyEmail(input: EmailInput): EmailClassification | null {
  const subject = decodeEntities(input.subject ?? "");
  const snippet = decodeEntities(input.snippet ?? "");
  if (!subject && !snippet) return null;
  const { domain } = parseFrom(input.from ?? "");
  const academic = isAcademicDomain(domain);
  const kind = detectKind(subject, snippet, academic);
  if (!kind) return null;

  const out: EmailClassification = { kind };
  if (kind !== "COLLEGE" && kind !== "DEADLINE") {
    const company = guessCompany(input.from ?? "", subject);
    if (company) out.company = company;
  }
  // Dates only matter for things you'd put on a calendar.
  if (kind !== "REJECTION" && kind !== "APPLICATION") {
    const date = extractDate(subject, input.receivedDate) ?? extractDate(snippet, input.receivedDate);
    if (date) out.suggestedDate = date;
  }
  return out;
}

/** The Gmail search used to find candidate emails (headers + snippet only are fetched). */
export const GMAIL_QUERY =
  'newer_than:21d -category:promotions -category:social -in:sent -in:drafts -in:chats (interview OR assessment OR "online test" OR shortlisted OR offer OR "application" OR "thank you for applying" OR rejected OR unfortunately OR exam OR assignment OR deadline OR viva OR submission)';
