// Minimal RFC 5545 (iCalendar) VEVENT builder — just enough for a one-off,
// non-recurring meeting invite attached to an email. Hand-rolled rather than
// pulling in a library: the format needed here is small and fixed (no
// recurrence rules, no timezone database, no multi-event calendars).

function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// Escapes characters RFC 5545 §3.3.11 requires escaping in TEXT values.
// Order matters — backslash first, or the escapes below would double-escape.
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Lines longer than 75 octets must be "folded" with a CRLF + leading space
// per RFC 5545 §3.1 — most calendar clients are lenient, but some strict
// parsers (older Outlook) reject unfolded long lines.
function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

export interface IcsAttendee {
  email: string;
  name?: string;
}

export interface IcsInviteOptions {
  /** Stable unique identifier for this event — reuse the same uid across
   * reschedules of the same meeting so calendar apps update in place. */
  uid: string;
  summary: string;
  description?: string;
  /** Meeting link or physical location — omitted from the invite if not provided. */
  location?: string | null;
  startTime: Date;
  endTime: Date;
  organizerEmail: string;
  organizerName?: string;
  /** One or more guests — e.g. the candidate and the interviewer. Each
   * becomes its own ATTENDEE line, which is what Gmail/Outlook list under
   * "Guests" on the rendered invite card. */
  attendees: IcsAttendee[];
}

/** Builds a METHOD:REQUEST VCALENDAR — the form calendar apps recognize as an actual invite to add, not just a plain attachment. */
export function buildIcsInvite(options: IcsInviteOptions): string {
  const now = toIcsUtc(new Date());
  const organizerCn = options.organizerName
    ? `;CN=${escapeIcsText(options.organizerName)}`
    : "";
  const attendeeLines = options.attendees.map((attendee) => {
    const attendeeCn = attendee.name
      ? `;CN=${escapeIcsText(attendee.name)}`
      : "";
    return `ATTENDEE${attendeeCn};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee.email}`;
  });

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Praesto//Interview Scheduling//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${options.uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${toIcsUtc(options.startTime)}`,
    `DTEND:${toIcsUtc(options.endTime)}`,
    `SUMMARY:${escapeIcsText(options.summary)}`,
    ...(options.description
      ? [`DESCRIPTION:${escapeIcsText(options.description)}`]
      : []),
    ...(options.location
      ? [`LOCATION:${escapeIcsText(options.location)}`]
      : []),
    `ORGANIZER${organizerCn}:mailto:${options.organizerEmail}`,
    ...attendeeLines,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
