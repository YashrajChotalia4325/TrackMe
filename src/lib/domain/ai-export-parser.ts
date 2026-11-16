/**
 * ChatGPT / Claude data-export parser.
 *
 * Pure and framework-free: it runs in the browser so the raw export (message
 * text included) never leaves the user's device. Only per-day aggregates —
 * counts and conversation titles — are produced for the server.
 *
 * ChatGPT `conversations.json`:
 *   [{ title, create_time (epoch s), update_time,
 *      mapping: { [id]: { message: { author: { role }, create_time, content, metadata? } | null } } }]
 * Claude `conversations.json`:
 *   [{ uuid, name, created_at (ISO), updated_at,
 *      chat_messages: [{ sender: "human" | "assistant", created_at (ISO), text }] }]
 */
import { TZDate } from "@date-fns/tz";

export const AI_PROVIDERS = ["CHATGPT", "CLAUDE"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_META: Record<AiProvider, { label: string; color: string }> = {
  CHATGPT: { label: "ChatGPT", color: "#5EE6C8" },
  CLAUDE: { label: "Claude", color: "#FF9F43" },
};

export const MAX_TITLES_PER_DAY = 25;
export const MAX_TITLE_LENGTH = 120;
/** Upper bound on days per import (≈ 8 years of daily use). */
export const MAX_IMPORT_DAYS = 3000;

export interface AiDayAggregate {
  /** YYYY-MM-DD in the requested time zone */
  date: string;
  /** Distinct conversations with at least one user message that day */
  conversations: number;
  /** User / human messages sent that day */
  messages: number;
  /** Distinct titles of those conversations (≤ 25, each ≤ 120 chars) */
  titles: string[];
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function looksLikeChatGpt(c: unknown): boolean {
  return isObj(c) && isObj(c.mapping);
}

function looksLikeClaude(c: unknown): boolean {
  return isObj(c) && Array.isArray(c.chat_messages);
}

/** Which export a parsed `conversations.json` came from, or null when unrecognised. */
export function detectFormat(json: unknown): AiProvider | null {
  if (!Array.isArray(json)) return null;
  // Sample the first few objects; one malformed entry shouldn't hide the format.
  let gpt = 0;
  let claude = 0;
  let seen = 0;
  for (const c of json) {
    if (!isObj(c)) continue;
    if (looksLikeChatGpt(c)) gpt++;
    else if (looksLikeClaude(c)) claude++;
    if (++seen >= 20) break;
  }
  if (gpt === 0 && claude === 0) return null;
  return gpt >= claude ? "CHATGPT" : "CLAUDE";
}

/**
 * A friendly explanation for a JSON file that isn't a recognised
 * conversations.json (e.g. user.json, projects.json, an empty export).
 */
export function explainUnrecognized(json: unknown): string {
  const pick = "Unzip the export and choose the file named conversations.json.";
  if (Array.isArray(json)) {
    if (json.length === 0) return "This file has no conversations in it. If you just started using the assistant, there's nothing to import yet.";
    const first = json.find(isObj);
    if (first && "conversation_id" in first) return `This is another file from your ChatGPT export (shared links or feedback), not the conversations themselves. ${pick}`;
    if (first && "docs" in first && "uuid" in first) return `This looks like projects.json from a Claude export. ${pick}`;
    if (first && ("email_address" in first || "email" in first)) return `This looks like your account file. ${pick}`;
    return `This doesn't look like a ChatGPT or Claude conversations.json. ${pick}`;
  }
  if (isObj(json) && ("email" in json || "email_address" in json || "phone_number" in json)) return `This looks like your account file (user.json). ${pick}`;
  return `This doesn't look like a ChatGPT or Claude conversations.json. ${pick}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

function validTimeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** Epoch milliseconds → YYYY-MM-DD in `tz`, or null for an unusable instant. */
function dayIn(ms: number | null, tz: string): string | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  const d = new TZDate(ms, tz);
  const y = d.getFullYear();
  if (!Number.isFinite(y) || y < 2000 || y > 9999) return null;
  return `${y}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function epochSecondsToMs(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  // Exports use epoch seconds; tolerate a value that is already in milliseconds.
  return n > 1e11 ? n : n * 1000;
}

function isoToMs(v: unknown): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  // Claude exports use microsecond precision ("…T10:00:00.123456Z"). The spec'd
  // Date.parse format only allows milliseconds, and not every browser engine
  // accepts the extra digits, so trim the fraction to 3 digits first.
  const s = v.trim().replace(/(T\d{2}:\d{2}:\d{2}\.\d{3})\d+/, "$1");
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

/** Control characters (incl. NUL, which PostgreSQL text columns reject). */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/** Collapse whitespace and cap at 120 chars (UTF-16 units, matching server validation). */
export function cleanTitle(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.length <= MAX_TITLE_LENGTH) return t;
  let cut = t.slice(0, MAX_TITLE_LENGTH - 1);
  // Don't leave half of a surrogate pair (emoji) dangling.
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Default names the apps give untitled chats — not useful as topics. */
const PLACEHOLDER_TITLES = new Set(["new chat", "new conversation", "untitled", "untitled conversation"]);

function topicTitle(v: unknown): string | null {
  const t = cleanTitle(v);
  return t && !PLACEHOLDER_TITLES.has(t.toLowerCase()) ? t : null;
}

interface Conversation {
  title: string | null;
  /** Timestamps (ms) of each user message; null when the message has none. */
  userMessageTimes: (number | null)[];
  fallbackMs: number | null;
}

function chatGptConversation(c: Obj): Conversation | null {
  if (!isObj(c.mapping)) return null;
  const fallbackMs = epochSecondsToMs(c.create_time) ?? epochSecondsToMs(c.update_time);
  const times: (number | null)[] = [];
  for (const node of Object.values(c.mapping)) {
    if (!isObj(node) || !isObj(node.message)) continue;
    const m = node.message;
    if (!isObj(m.author) || m.author.role !== "user") continue;
    // Custom-instruction context and other hidden turns aren't messages the user sent.
    if (isObj(m.metadata) && m.metadata.is_visually_hidden_from_conversation === true) continue;
    if (isObj(m.content) && m.content.content_type === "user_editable_context") continue;
    times.push(epochSecondsToMs(m.create_time));
  }
  return { title: topicTitle(c.title), userMessageTimes: times, fallbackMs };
}

function claudeConversation(c: Obj): Conversation | null {
  if (!Array.isArray(c.chat_messages)) return null;
  const fallbackMs = isoToMs(c.created_at) ?? isoToMs(c.updated_at);
  const times: (number | null)[] = [];
  for (const m of c.chat_messages) {
    if (!isObj(m) || m.sender !== "human") continue;
    times.push(isoToMs(m.created_at));
  }
  return { title: topicTitle(c.name), userMessageTimes: times, fallbackMs };
}

/**
 * Per-day usage aggregates for a parsed `conversations.json`, sorted by date.
 * Malformed conversations and messages without any usable timestamp are skipped.
 * Message text is never read.
 */
export function aggregateByDay(json: unknown, provider: AiProvider, timeZone: string): AiDayAggregate[] {
  if (!Array.isArray(json)) return [];
  const tz = validTimeZone(timeZone);
  const days = new Map<string, { conversations: number; messages: number; titles: string[]; titleSet: Set<string> }>();

  for (const raw of json) {
    if (!isObj(raw)) continue;
    const conv = provider === "CHATGPT" ? chatGptConversation(raw) : claudeConversation(raw);
    if (!conv || conv.userMessageTimes.length === 0) continue;

    const perDay = new Map<string, number>();
    for (const t of conv.userMessageTimes) {
      // A missing or unusable message time falls back to the conversation's creation time.
      const date = dayIn(t, tz) ?? dayIn(conv.fallbackMs, tz);
      if (!date) continue;
      perDay.set(date, (perDay.get(date) ?? 0) + 1);
    }

    for (const [date, count] of perDay) {
      let day = days.get(date);
      if (!day) {
        day = { conversations: 0, messages: 0, titles: [], titleSet: new Set() };
        days.set(date, day);
      }
      day.conversations += 1;
      day.messages += count;
      if (conv.title && day.titles.length < MAX_TITLES_PER_DAY && !day.titleSet.has(conv.title)) {
        day.titleSet.add(conv.title);
        day.titles.push(conv.title);
      }
    }
  }

  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, d]) => ({ date, conversations: d.conversations, messages: d.messages, titles: d.titles }));
}

export interface AiImportSummary {
  from: string | null;
  to: string | null;
  activeDays: number;
  conversations: number;
  messages: number;
}

/** Totals for an import preview. `conversations` sums daily counts (a chat spanning two days counts twice). */
export function summarize(days: AiDayAggregate[]): AiImportSummary {
  let conversations = 0;
  let messages = 0;
  for (const d of days) {
    conversations += d.conversations;
    messages += d.messages;
  }
  return { from: days[0]?.date ?? null, to: days[days.length - 1]?.date ?? null, activeDays: days.length, conversations, messages };
}

export interface AiUploadChunk {
  days: AiDayAggregate[];
  /** Replace window for this chunk; chunks' windows are contiguous and cover [first day, last day]. */
  range: { from: string; to: string };
}

const nextDay = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

/**
 * Split sorted day aggregates into upload chunks that each stay under
 * `maxBytes` of UTF-8 JSON (titles may be non-ASCII, so UTF-16 length is not
 * enough) and `maxDays` days. Each chunk's range starts the day after the
 * previous chunk ended, so re-imports replace every day in the export window.
 */
export function chunkForUpload(days: AiDayAggregate[], maxBytes = 500_000, maxDays = 1000): AiUploadChunk[] {
  const enc = new TextEncoder();
  const out: AiUploadChunk[] = [];
  let cur: AiDayAggregate[] = [];
  let size = 0;
  let from = days[0]?.date ?? "";
  const flush = () => {
    if (cur.length === 0) return;
    const to = cur[cur.length - 1].date;
    out.push({ days: cur, range: { from, to } });
    from = nextDay(to);
    cur = [];
    size = 0;
  };
  for (const d of days) {
    const s = enc.encode(JSON.stringify(d)).length + 1;
    if (cur.length > 0 && (size + s > maxBytes || cur.length >= maxDays)) flush();
    cur.push(d);
    size += s;
  }
  flush();
  return out;
}
