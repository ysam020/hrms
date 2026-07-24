import { google } from "googleapis";
import { aesDecrypt } from "@hrms/crypto";

// "Connect Google Calendar" consent flow — deliberately separate from the
// login OAuth flow (googleAuthRedirect/googleAuthCallback in handlers/auth.ts)
// even though it reuses the same GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET client:
// logging in shouldn't suddenly ask every user for calendar access. Only a
// recruiter/HR user who explicitly connects gets interview events (with a
// real Meet link) created on their own calendar via their own refresh token
// — per-user by design, never a shared/tenant-level identity (a domain-wide
// delegation model was tried and reverted: most tenants aren't on Google
// Workspace at all, which delegation requires, and even for those that are,
// "whoever set up the tenant" isn't necessarily who's scheduling interviews).
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function getCalendarAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const callbackUrl = process.env.GOOGLE_CALENDAR_CALLBACK_URL;
  return (
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${encodeURIComponent(clientId!)}` +
    `&redirect_uri=${encodeURIComponent(callbackUrl!)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(CALENDAR_SCOPE)}` +
    `&access_type=offline` +
    // Google only re-issues a refresh_token on the FIRST consent unless the
    // caller forces a fresh consent screen — without this, a user
    // reconnecting after e.g. revoking access would silently get no
    // refresh_token back and exchangeCalendarCode() would fail.
    `&prompt=consent` +
    `&state=${encodeURIComponent(state)}`
  );
}

export async function exchangeCalendarCode(code: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_CALENDAR_CALLBACK_URL!,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar token exchange failed: ${err}`);
  }
  const data = (await res.json()) as { refresh_token?: string };
  if (!data.refresh_token) {
    throw new Error("Google did not return a refresh token — try reconnecting");
  }
  return data.refresh_token;
}

async function getFreshAccessToken(
  encryptedRefreshToken: string,
): Promise<string> {
  const refreshToken = aesDecrypt(encryptedRefreshToken);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar token refresh failed: ${err}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function insertMeetEvent(
  auth: InstanceType<typeof google.auth.OAuth2>,
  options: {
    summary: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    attendeeEmails: string[];
  },
): Promise<{ meetLink: string; eventId: string }> {
  const calendar = google.calendar({ version: "v3", auth });
  const requestId = `interview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const res = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    // Let Google Calendar send its own native invitation to every attendee.
    // That email comes from Google's own infrastructure — richer than
    // anything we can build ourselves (RSVP buttons that sync back to this
    // event, native Meet card, "other events that day", etc.) — but its
    // sender shows the connected user's own Google identity, not tenant
    // branding. scheduleMeetEventAndNotifyCandidate() only sends our own
    // tenant-branded email as a fallback when there's no real Calendar
    // event for Google to notify from (a manually pasted meetLink).
    sendUpdates: "all",
    requestBody: {
      summary: options.summary,
      description: options.description,
      start: { dateTime: options.startTime.toISOString() },
      end: { dateTime: options.endTime.toISOString() },
      attendees: options.attendeeEmails.map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  const meetLink = res.data.hangoutLink;
  if (!meetLink) {
    throw new Error(
      "Google Calendar did not return a Meet link for the created event",
    );
  }
  return { meetLink, eventId: res.data.id! };
}

export async function createInterviewMeetEvent(options: {
  encryptedRefreshToken: string;
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendeeEmails: string[];
}): Promise<{ meetLink: string; eventId: string }> {
  const accessToken = await getFreshAccessToken(options.encryptedRefreshToken);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return insertMeetEvent(oauth2Client, options);
}
