import { describe, expect, it } from "vitest";
import { DASHBOARD_PANEL_IDS, DEFAULT_LAYOUT, isDefaultLayout, layoutColumns, moveItem, normalizeLayout, normalizeStartPage } from "../dashboard-layout";

const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe("normalizeLayout", () => {
  it("returns the default layout for null, undefined and garbage", () => {
    for (const raw of [null, undefined, 42, "score", {}, { id: "score" }, true]) {
      expect(normalizeLayout(raw)).toEqual(DEFAULT_LAYOUT);
    }
  });

  it("keeps every panel exactly once, in default order by default", () => {
    const l = normalizeLayout([]);
    expect(ids(l)).toEqual([...DASHBOARD_PANEL_IDS]);
    expect(l.every((x) => x.hidden === false)).toBe(true);
  });

  it("respects stored order and hidden flags, appending missing panels visible", () => {
    const l = normalizeLayout([
      { id: "goals", hidden: false },
      { id: "score", hidden: true },
    ]);
    expect(ids(l)).toEqual(["goals", "score", "tasks", "habits", "inbox", "quickActions", "week", "upcoming"]);
    expect(l[1].hidden).toBe(true);
    expect(l.slice(2).every((x) => !x.hidden)).toBe(true);
  });

  it("drops unknown ids, malformed entries and duplicates (first wins)", () => {
    const l = normalizeLayout([{ id: "nope" }, null, 7, { hidden: true }, { id: "week", hidden: true }, { id: "week", hidden: false }, "tasks", "tasks"]);
    expect(ids(l).slice(0, 2)).toEqual(["week", "tasks"]);
    expect(l[0].hidden).toBe(true);
    expect(l.length).toBe(DASHBOARD_PANEL_IDS.length);
    expect(new Set(ids(l)).size).toBe(l.length);
  });

  it("only treats hidden === true as hidden", () => {
    const l = normalizeLayout([{ id: "score", hidden: "yes" }, { id: "tasks", hidden: 1 }]);
    expect(l[0].hidden).toBe(false);
    expect(l[1].hidden).toBe(false);
  });

  it("does not return the frozen default objects", () => {
    const l = normalizeLayout(null);
    l[0].hidden = true;
    expect(DEFAULT_LAYOUT[0].hidden).toBe(false);
  });
});

describe("layoutColumns", () => {
  it("splits visible panels by column in layout order", () => {
    const l = normalizeLayout([
      { id: "upcoming", hidden: false },
      { id: "tasks", hidden: false },
      { id: "habits", hidden: true },
      { id: "score", hidden: false },
    ]);
    const c = layoutColumns(l);
    expect(c.main).toEqual(["tasks", "score", "week"]);
    expect(c.side).toEqual(["upcoming", "inbox", "quickActions"]);
    expect(c.full).toEqual(["goals"]);
  });
});

describe("moveItem", () => {
  it("swaps with the neighbour and ignores out-of-range moves", () => {
    const l = normalizeLayout(null);
    expect(ids(moveItem(l, 1, -1)).slice(0, 2)).toEqual(["tasks", "score"]);
    expect(moveItem(l, 0, -1)).toBe(l);
    expect(moveItem(l, l.length - 1, 1)).toBe(l);
    expect(ids(l)[0]).toBe("score");
  });
});

describe("helpers", () => {
  it("detects the default layout", () => {
    expect(isDefaultLayout(normalizeLayout(null))).toBe(true);
    expect(isDefaultLayout(moveItem(normalizeLayout(null), 0, 1))).toBe(false);
  });

  it("normalizes the start page", () => {
    expect(normalizeStartPage("/my-day")).toBe("/my-day");
    expect(normalizeStartPage("/dashboard")).toBe("/dashboard");
    expect(normalizeStartPage("https://evil.example")).toBe("/dashboard");
    expect(normalizeStartPage(null)).toBe("/dashboard");
  });
});
