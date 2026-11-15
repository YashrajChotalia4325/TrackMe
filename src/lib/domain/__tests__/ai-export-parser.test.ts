import { describe, expect, it } from "vitest";
import { aggregateByDay, chunkForUpload, cleanTitle, detectFormat, explainUnrecognized, summarize, type AiDayAggregate } from "../ai-export-parser";

// Epoch seconds for an instant given in UTC.
const sec = (iso: string) => Date.parse(iso) / 1000;

function gptMsg(role: string, createTime: number | null, extra: Record<string, unknown> = {}) {
  return { message: { author: { role }, create_time: createTime, content: { content_type: "text", parts: ["secret text"] }, ...extra } };
}

const chatgpt = [
  {
    title: "Fix my Prisma migration",
    create_time: sec("2026-11-10T05:00:00Z"),
    update_time: sec("2026-11-10T06:00:00Z"),
    mapping: {
      root: { message: null },
      sys: gptMsg("system", null),
      a: gptMsg("user", sec("2026-11-10T05:00:00Z")),
      b: gptMsg("assistant", sec("2026-11-10T05:00:10Z")),
      c: gptMsg("user", sec("2026-11-10T05:05:00Z")),
      // Hidden custom-instructions turn: not a sent message
      h: gptMsg("user", sec("2026-11-10T05:00:00Z"), { metadata: { is_visually_hidden_from_conversation: true } }),
      // No timestamp → falls back to the conversation's create_time
      d: gptMsg("user", null),
    },
  },
  {
    title: "Fix my Prisma migration", // duplicate title, distinct conversation
    create_time: sec("2026-11-10T09:00:00Z"),
    update_time: null,
    mapping: { a: gptMsg("user", sec("2026-11-10T09:00:00Z")) },
  },
  {
    title: "Assistant only",
    create_time: sec("2026-11-11T09:00:00Z"),
    mapping: { a: gptMsg("assistant", sec("2026-11-11T09:00:00Z")) },
  },
];

const claude = [
  {
    uuid: "c1",
    name: "CAT quant shortcuts",
    created_at: "2026-11-12T10:00:00.000000+00:00",
    updated_at: "2026-11-13T10:00:00Z",
    chat_messages: [
      { sender: "human", created_at: "2026-11-12T10:00:00.000Z", text: "private" },
      { sender: "assistant", created_at: "2026-11-12T10:00:05.000Z", text: "private" },
      { sender: "human", created_at: "2026-11-13T10:00:00.000Z", text: "private" },
      { sender: "human", text: "no timestamp" },
    ],
  },
  { uuid: "c2", name: "", created_at: "2026-11-12T12:00:00Z", chat_messages: [{ sender: "human", created_at: "2026-11-12T12:00:00Z" }] },
  { uuid: "c3", name: "Empty", created_at: "2026-11-12T12:00:00Z", chat_messages: [] },
];

describe("detectFormat", () => {
  it("recognises both exports", () => {
    expect(detectFormat(chatgpt)).toBe("CHATGPT");
    expect(detectFormat(claude)).toBe("CLAUDE");
  });

  it("returns null for anything else", () => {
    expect(detectFormat([])).toBeNull();
    expect(detectFormat({ mapping: {} })).toBeNull();
    expect(detectFormat("conversations")).toBeNull();
    expect(detectFormat(null)).toBeNull();
    expect(detectFormat([{ uuid: "p1", name: "Project", docs: [] }])).toBeNull(); // Claude projects.json
    expect(detectFormat([{ id: "s", conversation_id: "x", title: "t" }])).toBeNull(); // shared_conversations.json
  });

  it("tolerates junk entries before real conversations", () => {
    expect(detectFormat([null, 3, "x", ...claude])).toBe("CLAUDE");
  });
});

describe("explainUnrecognized", () => {
  it("is specific about common wrong files", () => {
    expect(explainUnrecognized([])).toMatch(/no conversations/);
    expect(explainUnrecognized([{ uuid: "p", name: "n", docs: [] }])).toMatch(/projects\.json/);
    expect(explainUnrecognized({ email: "a@b.c" })).toMatch(/account file/);
    expect(explainUnrecognized({ foo: 1 })).toMatch(/conversations\.json/);
  });
});

describe("aggregateByDay — ChatGPT", () => {
  it("counts user messages and distinct conversations per local day", () => {
    const days = aggregateByDay(chatgpt, "CHATGPT", "Asia/Kolkata");
    expect(days).toEqual([{ date: "2026-11-10", conversations: 2, messages: 4, titles: ["Fix my Prisma migration"] }]);
  });

  it("never includes message text", () => {
    expect(JSON.stringify(aggregateByDay(chatgpt, "CHATGPT", "UTC"))).not.toContain("secret");
  });
});

describe("aggregateByDay — Claude", () => {
  it("splits a conversation across days and falls back to created_at", () => {
    const days = aggregateByDay(claude, "CLAUDE", "UTC");
    expect(days).toEqual([
      // c1: 1 timed + 1 fallback message; c2 untitled (no title recorded)
      { date: "2026-11-12", conversations: 2, messages: 3, titles: ["CAT quant shortcuts"] },
      { date: "2026-11-13", conversations: 1, messages: 1, titles: ["CAT quant shortcuts"] },
    ]);
  });
});

describe("aggregateByDay — time zones", () => {
  const late = [
    { uuid: "z", name: "Late night", created_at: "2026-11-14T19:00:00Z", chat_messages: [{ sender: "human", created_at: "2026-11-14T19:00:00Z" }] },
  ];

  it("assigns an instant to the user's local date", () => {
    // 19:00 UTC = 00:30 next day in India
    expect(aggregateByDay(late, "CLAUDE", "Asia/Kolkata")[0].date).toBe("2026-11-15");
    expect(aggregateByDay(late, "CLAUDE", "UTC")[0].date).toBe("2026-11-14");
    expect(aggregateByDay(late, "CLAUDE", "America/Los_Angeles")[0].date).toBe("2026-11-14");
  });

  it("handles the exact local-midnight boundary", () => {
    const at = (iso: string) => [{ title: "t", create_time: sec(iso), mapping: { a: gptMsg("user", sec(iso)) } }];
    // 18:29:59 UTC = 23:59:59 IST; 18:30:00 UTC = 00:00 IST next day
    expect(aggregateByDay(at("2026-11-14T18:29:59Z"), "CHATGPT", "Asia/Kolkata")[0].date).toBe("2026-11-14");
    expect(aggregateByDay(at("2026-11-14T18:30:00Z"), "CHATGPT", "Asia/Kolkata")[0].date).toBe("2026-11-15");
  });

  it("falls back to UTC for an invalid time zone instead of throwing", () => {
    expect(aggregateByDay(late, "CLAUDE", "Not/AZone")[0].date).toBe("2026-11-14");
  });
});

describe("aggregateByDay — malformed input", () => {
  it("returns [] for non-arrays and empty arrays", () => {
    expect(aggregateByDay({}, "CHATGPT", "UTC")).toEqual([]);
    expect(aggregateByDay(null, "CLAUDE", "UTC")).toEqual([]);
    expect(aggregateByDay([], "CLAUDE", "UTC")).toEqual([]);
  });

  it("skips broken conversations and messages without any usable time", () => {
    const messy = [
      null,
      { title: "no mapping" },
      { title: "bad mapping", mapping: "nope" },
      { title: "no times", create_time: null, mapping: { a: gptMsg("user", null) } },
      { title: "bad author", mapping: { a: { message: { author: null, create_time: sec("2026-01-01T00:00:00Z") } } } },
      { title: "ok", create_time: "not a number", mapping: { a: gptMsg("user", sec("2026-01-02T00:00:00Z")), b: { message: "weird" } } },
    ];
    expect(aggregateByDay(messy, "CHATGPT", "UTC")).toEqual([{ date: "2026-01-02", conversations: 1, messages: 1, titles: ["ok"] }]);
  });

  it("ignores ChatGPT data when parsed as Claude (and vice versa)", () => {
    expect(aggregateByDay(chatgpt, "CLAUDE", "UTC")).toEqual([]);
    expect(aggregateByDay(claude, "CHATGPT", "UTC")).toEqual([]);
  });
});

describe("titles", () => {
  it("caps titles per day at 25 and sorts days", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      uuid: `u${i}`,
      name: `Topic ${i}`,
      created_at: i % 2 ? "2026-03-02T08:00:00Z" : "2026-03-01T08:00:00Z",
      chat_messages: [{ sender: "human", created_at: i < 28 ? "2026-03-01T08:00:00Z" : "2026-02-27T08:00:00Z" }],
    }));
    const days = aggregateByDay(many, "CLAUDE", "UTC");
    expect(days.map((d) => d.date)).toEqual(["2026-02-27", "2026-03-01"]);
    expect(days[1].conversations).toBe(28);
    expect(days[1].titles).toHaveLength(25);
  });

  it("truncates to 120 chars and collapses whitespace", () => {
    const t = cleanTitle("a".repeat(200))!;
    expect(t).toHaveLength(120);
    expect(t.endsWith("…")).toBe(true);
    expect(cleanTitle("  hello \n  world ")).toBe("hello world");
    expect(cleanTitle("   ")).toBeNull();
    expect(cleanTitle(42)).toBeNull();
    // Doesn't split an emoji surrogate pair
    const emoji = cleanTitle("x".repeat(118) + "😀😀😀")!;
    expect(emoji.length).toBeLessThanOrEqual(120);
    expect(emoji).not.toMatch(/[\uD800-\uDBFF]…$/);
  });
});

describe("summarize", () => {
  it("totals a preview", () => {
    const s = summarize(aggregateByDay(claude, "CLAUDE", "UTC"));
    expect(s).toEqual({ from: "2026-11-12", to: "2026-11-13", activeDays: 2, conversations: 3, messages: 4 });
    expect(summarize([])).toEqual({ from: null, to: null, activeDays: 0, conversations: 0, messages: 0 });
  });
});

describe("robustness", () => {
  it("falls back to the conversation time when a message time is unusable", () => {
    const conv = [{ title: "t", create_time: sec("2026-05-05T10:00:00Z"), mapping: { a: gptMsg("user", -5), b: gptMsg("user", 12) } }];
    expect(aggregateByDay(conv, "CHATGPT", "UTC")).toEqual([{ date: "2026-05-05", conversations: 1, messages: 2, titles: ["t"] }]);
  });

  it("tolerates millisecond timestamps in a ChatGPT export", () => {
    const ms = Date.parse("2026-05-05T10:00:00Z");
    const conv = [{ title: "t", create_time: ms, mapping: { a: gptMsg("user", ms) } }];
    expect(aggregateByDay(conv, "CHATGPT", "UTC")[0].date).toBe("2026-05-05");
  });

  it("parses Claude's microsecond timestamps with offsets", () => {
    const conv = [
      {
        uuid: "m",
        name: "Micro",
        created_at: "2026-05-05T23:59:59.999999+00:00",
        chat_messages: [
          { sender: "human", created_at: "2026-05-05T18:30:00.123456Z" },
          { sender: "human", created_at: "2026-05-06T00:15:00.5+05:30" },
        ],
      },
    ];
    // 18:30:00.123Z = 00:00 IST on the 6th; 00:15 IST on the 6th
    expect(aggregateByDay(conv, "CLAUDE", "Asia/Kolkata")).toEqual([{ date: "2026-05-06", conversations: 1, messages: 2, titles: ["Micro"] }]);
  });

  it("strips control characters (incl. NUL) from titles", () => {
    expect(cleanTitle("a\u0000b\u0007c")).toBe("a b c");
    expect(cleanTitle("\u0000")).toBeNull();
  });

  it("drops placeholder titles like 'New chat' but still counts the chat", () => {
    const conv = [{ title: "New chat", create_time: sec("2026-05-05T10:00:00Z"), mapping: { a: gptMsg("user", sec("2026-05-05T10:00:00Z")) } }];
    expect(aggregateByDay(conv, "CHATGPT", "UTC")).toEqual([{ date: "2026-05-05", conversations: 1, messages: 1, titles: [] }]);
  });
});

describe("chunkForUpload", () => {
  const day = (date: string, title: string): AiDayAggregate => ({ date, conversations: 1, messages: 1, titles: Array.from({ length: 25 }, (_, i) => `${title} ${i}`) });

  it("returns nothing for no days and one chunk for a small import", () => {
    expect(chunkForUpload([])).toEqual([]);
    const days = [day("2026-01-01", "a"), day("2026-01-05", "b")];
    expect(chunkForUpload(days)).toEqual([{ days, range: { from: "2026-01-01", to: "2026-01-05" } }]);
  });

  it("measures UTF-8 bytes and makes contiguous replace windows", () => {
    // Devanagari is 3 bytes per UTF-16 unit, so a UTF-16 length check would under-count.
    const hindi = "हिंदी".repeat(20);
    const days = ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-04"].map((d) => day(d, hindi));
    const bytes = new TextEncoder().encode(JSON.stringify(days[0])).length;
    const chunks = chunkForUpload(days, bytes * 2 + 2);
    // +2 for the array brackets around the chunk
    for (const c of chunks) expect(new TextEncoder().encode(JSON.stringify(c.days)).length).toBeLessThanOrEqual(bytes * 2 + 2 + 2);
    expect(chunks.map((c) => c.range)).toEqual([
      { from: "2026-02-27", to: "2026-02-28" },
      { from: "2026-03-01", to: "2026-03-04" },
    ]);
    expect(chunks.flatMap((c) => c.days)).toEqual(days);
  });

  it("caps days per chunk", () => {
    const days = ["2026-12-30", "2026-12-31", "2027-01-01"].map((d) => day(d, "x"));
    expect(chunkForUpload(days, 1e9, 2).map((c) => c.range)).toEqual([
      { from: "2026-12-30", to: "2026-12-31" },
      { from: "2027-01-01", to: "2027-01-01" },
    ]);
  });
});
