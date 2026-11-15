import { describe, expect, it } from "vitest";
import { classifyEmail, cleanCompanyName, decodeEntities, extractDate, extractTime, guessCompany, insightEventType, parseFrom } from "../email-classifier";

const RECEIVED = "2026-11-15";
const c = (from: string, subject: string, snippet = "") => classifyEmail({ from, subject, snippet, receivedDate: RECEIVED });

describe("classifyEmail — campus placements & internships", () => {
  it("detects an interview invite from a company domain with date", () => {
    const r = c('"Razorpay Talent Team" <talent@razorpay.com>', "Interview Invitation: SDE Intern - Razorpay", "Hi Yash, we would like to invite you for a technical interview on 24 Nov at 3:00 PM IST.");
    expect(r).toEqual({ kind: "INTERVIEW", company: "Razorpay", suggestedDate: "2026-11-24" });
  });

  it("detects an online assessment sent via HackerRank, company from subject", () => {
    const r = c("HackerRank <support@hackerrank.com>", "Online assessment from Zeta | Software Engineer Intern", "You have been invited to take the Zeta coding test. The test link is valid till 20/11/2026.");
    expect(r?.kind).toBe("ASSESSMENT");
    expect(r?.company).toBe("Zeta");
    expect(r?.suggestedDate).toBe("2026-11-20");
  });

  it("detects placement-cell drive emails as interviews with the drive company", () => {
    const r = c('"Training & Placement Cell" <placements@coep.ac.in>', "Infosys Campus Drive - Shortlisted students for interview", "Dear students, the following students are shortlisted for the Infosys interview on 24th November 2026 at Seminar Hall.");
    expect(r).toEqual({ kind: "INTERVIEW", company: "Infosys", suggestedDate: "2026-11-24" });
  });

  it("detects rejections, even when the subject is neutral", () => {
    const r = c('"Swiggy Careers" <no-reply@hire.lever.co>', "Update on your application", "Thank you for your interest in Swiggy. Unfortunately, we will not be moving forward with your application at this time.");
    expect(r?.kind).toBe("REJECTION");
    expect(r?.company).toBe("Swiggy");
    expect(r?.suggestedDate).toBeUndefined();
  });

  it("detects 'regret to inform' rejections", () => {
    expect(c("hr@tcs.com", "TCS NQT result", "We regret to inform you that you have not been selected.")?.kind).toBe("REJECTION");
  });

  it("does not treat a rescheduled interview as a rejection", () => {
    const r = c("recruiting@flipkart.com", "Interview rescheduled", "Unfortunately, the interviewer is unavailable, so your interview has been rescheduled to 26 Nov.");
    expect(r?.kind).toBe("INTERVIEW");
    expect(r?.suggestedDate).toBe("2026-11-26");
  });

  it("detects offers", () => {
    expect(c('"Zomato HR" <hr@zomato.com>', "Offer Letter - Product Analyst Intern", "Congratulations! Please find attached your offer letter.")).toMatchObject({ kind: "OFFER", company: "Zomato" });
    expect(c("campus@goldmansachs.com", "Congratulations Yash!", "We are pleased to extend a pre-placement offer (PPO) to you.")?.kind).toBe("OFFER");
  });

  it("does not mistake 'selected for the next round' for an offer", () => {
    expect(c("careers@deloitte.com", "Congratulations! You have been selected for the next round", "Your interview is scheduled tomorrow.")).toEqual({ kind: "INTERVIEW", company: "Deloitte", suggestedDate: "2026-11-16" });
  });

  it("detects application acknowledgements", () => {
    const r = c('"Microsoft Recruiting" <noreply@microsoft.com>', "Thank you for applying to Microsoft", "We have received your application for Software Engineering Intern.");
    expect(r?.kind).toBe("APPLICATION");
    expect(r?.company).toBe("Microsoft");
    expect(r?.suggestedDate).toBeUndefined();
  });

  it("names the employer for LinkedIn 'application sent' emails", () => {
    const r = c('"LinkedIn" <jobs-noreply@linkedin.com>', "Yash, your application was sent to Groww", "Your application was sent to Groww. Here's what happens next.");
    expect(r).toEqual({ kind: "APPLICATION", company: "Groww" });
  });

  it("uses the Greenhouse display name, not the ATS", () => {
    expect(c('"PhonePe Hiring Team" <no-reply@us.greenhouse-mail.io>', "Your application for Backend Intern", "Thanks for applying")).toMatchObject({ kind: "APPLICATION", company: "PhonePe" });
  });

  it("ignores personal mailboxes as company names", () => {
    const r = c('"Priya Sharma" <priya.sharma92@gmail.com>', "Interview slot confirmation", "Your interview is confirmed for 25/11/2026 at 11 am.");
    expect(r).toEqual({ kind: "INTERVIEW", suggestedDate: "2026-11-25" });
  });

  it("classifies college exam and assignment mail", () => {
    expect(c('"Exam Cell" <exam@mitwpu.edu.in>', "End-Sem Examination Timetable - Nov 2026", "The end semester exams will begin on 1st December.")).toEqual({ kind: "COLLEGE", suggestedDate: "2026-12-01" });
    expect(c("prof.kulkarni@pccoepune.ac.in", "DBMS assignment 3 - submission deadline", "Submit by 22/11/2026 on Moodle.")).toEqual({ kind: "DEADLINE", suggestedDate: "2026-11-22" });
    expect(c("hod.comp@sppu.ac.in", "Internal assessment marks", "Internal assessment marks for semester V are uploaded.")?.kind).toBe("COLLEGE");
  });

  it("returns null for non-actionable mail", () => {
    expect(c("newsletter@medium.com", "Top stories for you", "Why remote work is here to stay")).toBeNull();
    expect(c("offers@amazon.in", "Special offer just for you", "Limited time deal on headphones")).toBeNull();
    expect(c("someone@example.com", "", "")).toBeNull();
  });

  it("decodes HTML entities in snippets", () => {
    expect(c("talent@cred.club", "Next steps", "We&#39;d like to schedule your interview on Nov 30.")).toEqual({ kind: "INTERVIEW", company: "Cred", suggestedDate: "2026-11-30" });
  });
});

describe("date extraction", () => {
  it("parses day-month forms and infers the year", () => {
    expect(extractDate("on 24 Nov", RECEIVED)).toBe("2026-11-24");
    expect(extractDate("on 24th November", RECEIVED)).toBe("2026-11-24");
    expect(extractDate("24-Nov-2026", RECEIVED)).toBe("2026-11-24");
    expect(extractDate("on 5 Jan", RECEIVED)).toBe("2027-01-05");
  });
  it("parses month-day forms", () => {
    expect(extractDate("November 24", RECEIVED)).toBe("2026-11-24");
    expect(extractDate("Dec 3rd, 2026", RECEIVED)).toBe("2026-12-03");
  });
  it("parses numeric dates day-first", () => {
    expect(extractDate("24/11/2026", RECEIVED)).toBe("2026-11-24");
    expect(extractDate("03.12.26", RECEIVED)).toBe("2026-12-03");
    expect(extractDate("2026-11-28", RECEIVED)).toBe("2026-11-28");
    expect(extractDate("11/24/2026", RECEIVED)).toBe("2026-11-24"); // month-first only when day-first is impossible
  });
  it("handles relative words", () => {
    expect(extractDate("your test is tomorrow", RECEIVED)).toBe("2026-11-16");
    expect(extractDate("day after tomorrow", RECEIVED)).toBe("2026-11-17");
  });
  it("ignores dates that are not near the email (past rounds, birthdays, far-off years)", () => {
    expect(extractDate("Following your interview on 2 Oct, we'd like to schedule the next round", RECEIVED)).toBeUndefined();
    expect(extractDate("DOB 12/03/2004 · test on 24/11/2026", RECEIVED)).toBe("2026-11-24");
    expect(extractDate("Batch of 2030 — 01-06-2030", RECEIVED)).toBeUndefined();
  });
  it("rejects invalid or absent dates", () => {
    expect(extractDate("31/02/2026", RECEIVED)).toBeUndefined();
    expect(extractDate("May 2026 batch", RECEIVED)).toBeUndefined();
    expect(extractDate("no date here", RECEIVED)).toBeUndefined();
  });
});

describe("helpers", () => {
  it("extracts times", () => {
    expect(extractTime("at 3:00 PM IST")).toBe(15 * 60);
    expect(extractTime("10.30 am")).toBe(10 * 60 + 30);
    expect(extractTime("12 pm")).toBe(12 * 60);
    expect(extractTime("from 14:00 hrs")).toBe(14 * 60);
    expect(extractTime("Amazon interview")).toBeUndefined();
  });
  it("parses From headers", () => {
    expect(parseFrom('"Acme HR" <hr@acme.co.in>')).toEqual({ name: "Acme HR", email: "hr@acme.co.in", domain: "acme.co.in" });
    expect(parseFrom("plain@example.com")).toEqual({ name: "", email: "plain@example.com", domain: "example.com" });
  });
  it("guesses companies from domains", () => {
    expect(guessCompany("noreply@careers.infosys.com", "x")).toBe("Infosys");
    expect(guessCompany("hr@zeta.co.in", "x")).toBe("Zeta");
    expect(guessCompany("campus@tcs.com", "x")).toBe("TCS");
    expect(guessCompany("razorpay@myworkday.com", "x")).toBe("Razorpay");
  });
  it("cleans company display names", () => {
    expect(cleanCompanyName("Accenture India Recruiting Team")).toBe("Accenture");
    expect(cleanCompanyName("HR")).toBe("");
  });
  it("decodes entities", () => {
    expect(decodeEntities("Tom &amp; Jerry&#39;s &quot;deal&quot;")).toBe(`Tom & Jerry's "deal"`);
    // Malformed numeric entities must not throw (it would abort the whole Gmail sync).
    expect(decodeEntities("bad &#99999999; and &#x110000; ok &#x2014;")).toBe("bad &#99999999; and &#x110000; ok —");
  });
  it("maps kinds to event types", () => {
    expect(insightEventType("INTERVIEW", "x")).toBe("INTERVIEW");
    expect(insightEventType("DEADLINE", "x")).toBe("ASSIGNMENT");
    expect(insightEventType("COLLEGE", "End-sem exam timetable")).toBe("EXAM");
    expect(insightEventType("ASSESSMENT", "x")).toBe("OTHER");
  });
});
