import { buildIcsInvite } from "../ics";

// RFC 5545 §3.1 unfolding: a CRLF immediately followed by a single space is
// a line continuation, not a real line break — reverse it before asserting
// on logical (as opposed to wire) line content.
const unfold = (ics: string): string => ics.replace(/\r\n /g, "");

const baseOptions = {
  uid: "interview-app-1-round-1@praesto.in",
  summary: "Interview: Jordan Candidate — Round 1",
  description: "Interviewer: Alice",
  location: "https://meet.google.com/abc-defg-hij",
  startTime: new Date("2026-06-25T15:00:00.000Z"),
  endTime: new Date("2026-06-25T16:00:00.000Z"),
  organizerEmail: "hr@praesto.in",
  organizerName: "Acme Corp",
  attendees: [{ email: "jordan@candidate.example", name: "Jordan Candidate" }],
};

describe("buildIcsInvite", () => {
  it("produces a well-formed VCALENDAR/VEVENT with the required fields", () => {
    const ics = buildIcsInvite(baseOptions);
    const logical = unfold(ics);
    expect(logical).toContain("BEGIN:VCALENDAR");
    expect(logical).toContain("VERSION:2.0");
    expect(logical).toContain("METHOD:REQUEST");
    expect(logical).toContain("BEGIN:VEVENT");
    expect(logical).toContain(`UID:${baseOptions.uid}`);
    expect(logical).toContain("DTSTART:20260625T150000Z");
    expect(logical).toContain("DTEND:20260625T160000Z");
    expect(logical).toContain("SUMMARY:Interview: Jordan Candidate — Round 1");
    expect(logical).toContain("LOCATION:https://meet.google.com/abc-defg-hij");
    expect(logical).toContain("ORGANIZER;CN=Acme Corp:mailto:hr@praesto.in");
    expect(logical).toContain(
      "ATTENDEE;CN=Jordan Candidate;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:jordan@candidate.example",
    );
    expect(logical).toContain("STATUS:CONFIRMED");
    expect(logical).toContain("END:VEVENT");
    expect(logical).toContain("END:VCALENDAR");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("uses CRLF line endings throughout", () => {
    const ics = buildIcsInvite(baseOptions);
    expect(ics).toMatch(/\r\n/);
    // No bare LF without a preceding CR anywhere in the output.
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("omits LOCATION and DESCRIPTION when not provided", () => {
    const ics = buildIcsInvite({
      ...baseOptions,
      location: null,
      description: undefined,
    });
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("escapes commas, semicolons, backslashes, and newlines in text fields per RFC 5545", () => {
    const ics = buildIcsInvite({
      ...baseOptions,
      summary: "Interview; Round 1, Final — a\\b",
      description: "Line one\nLine two",
    });
    const logical = unfold(ics);
    expect(logical).toContain("SUMMARY:Interview\\; Round 1\\, Final — a\\\\b");
    expect(logical).toContain("DESCRIPTION:Line one\\nLine two");
  });

  it("folds lines longer than 75 octets with a CRLF + leading space continuation", () => {
    const longSummary =
      "This is a deliberately very long interview summary line that exceeds the seventy five octet limit RFC 5545 imposes on unfolded content lines";
    const ics = buildIcsInvite({ ...baseOptions, summary: longSummary });
    const summaryLineStart = ics.indexOf("SUMMARY:");
    const nextCrlf = ics.indexOf("\r\n", summaryLineStart);
    const firstPhysicalLine = ics.slice(summaryLineStart, nextCrlf);
    expect(firstPhysicalLine.length).toBeLessThanOrEqual(75);
    // The continuation line must start with a single space per RFC 5545 §3.1.
    const afterFold = ics.slice(nextCrlf + 2);
    expect(afterFold.startsWith(" ")).toBe(true);
  });

  it("omits the CN parameter when organizerName/attendee name aren't provided", () => {
    const ics = buildIcsInvite({
      ...baseOptions,
      organizerName: undefined,
      attendees: [{ email: "jordan@candidate.example" }],
    });
    const logical = unfold(ics);
    expect(logical).toContain("ORGANIZER:mailto:hr@praesto.in");
    expect(logical).toContain(
      "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:jordan@candidate.example",
    );
  });

  it("emits one ATTENDEE line per guest, e.g. the candidate and the interviewer", () => {
    const ics = buildIcsInvite({
      ...baseOptions,
      attendees: [
        { email: "jordan@candidate.example", name: "Jordan Candidate" },
        { email: "interviewer@acme.example", name: "Alice Interviewer" },
      ],
    });
    const logical = unfold(ics);
    expect(logical).toContain(
      "ATTENDEE;CN=Jordan Candidate;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:jordan@candidate.example",
    );
    expect(logical).toContain(
      "ATTENDEE;CN=Alice Interviewer;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:interviewer@acme.example",
    );
  });
});
