const mockEventsInsert = jest.fn();
const mockSetCredentials = jest.fn();

jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: mockSetCredentials,
      })),
    },
    calendar: jest.fn(() => ({
      events: { insert: mockEventsInsert },
    })),
  },
}));

jest.mock("@hrms/crypto", () => ({
  aesDecrypt: jest.fn((v: string) => `decrypted:${v}`),
}));

const originalFetch = global.fetch;

import { aesDecrypt } from "@hrms/crypto";
import {
  getCalendarAuthUrl,
  exchangeCalendarCode,
  createInterviewMeetEvent,
} from "../services/googleCalendar";

describe("googleCalendar service (per-user OAuth)", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    process.env = {
      ...OLD_ENV,
      GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_CALENDAR_CALLBACK_URL:
        "https://api.praesto.cloud/api/auth/google-calendar/callback",
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
    global.fetch = originalFetch;
  });

  describe("getCalendarAuthUrl", () => {
    it("builds the Google authorize URL with the calendar scope, offline access, and forced consent", () => {
      const url = getCalendarAuthUrl("signed-state-token");
      expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(url).toContain("client_id=client-id.apps.googleusercontent.com");
      expect(url).toContain(
        "scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events",
      );
      expect(url).toContain("access_type=offline");
      expect(url).toContain("prompt=consent");
      expect(url).toContain("state=signed-state-token");
    });
  });

  describe("exchangeCalendarCode", () => {
    it("exchanges the authorization code for a refresh token", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ refresh_token: "rt-123" }),
      });
      const token = await exchangeCalendarCode("auth-code");
      expect(token).toBe("rt-123");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/token",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("throws when Google doesn't return a refresh token", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });
      await expect(exchangeCalendarCode("auth-code")).rejects.toThrow(
        /did not return a refresh token/,
      );
    });

    it("throws with the response body when the token endpoint errors", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        text: async () => "invalid_grant",
      });
      await expect(exchangeCalendarCode("bad-code")).rejects.toThrow(
        /invalid_grant/,
      );
    });
  });

  describe("createInterviewMeetEvent", () => {
    it("decrypts the refresh token, refreshes an access token, and creates a Calendar event with a Meet link", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "fresh-access-token" }),
      });
      mockEventsInsert.mockResolvedValue({
        data: {
          hangoutLink: "https://meet.google.com/abc-defg-hij",
          id: "evt-1",
        },
      });

      const result = await createInterviewMeetEvent({
        encryptedRefreshToken: "enc-rt",
        summary: "Interview: Jordan — Round 1",
        startTime: new Date("2026-06-25T15:00:00.000Z"),
        endTime: new Date("2026-06-25T16:00:00.000Z"),
        attendeeEmails: ["jordan@candidate.example"],
      });

      expect(aesDecrypt).toHaveBeenCalledWith("enc-rt");
      expect(mockSetCredentials).toHaveBeenCalledWith({
        access_token: "fresh-access-token",
      });
      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          conferenceDataVersion: 1,
          // Google itself emails every attendee its own native invitation —
          // scheduleMeetEventAndNotifyCandidate in recruitment.ts skips
          // sending our own copy whenever a real event was created here.
          sendUpdates: "all",
          requestBody: expect.objectContaining({
            attendees: [{ email: "jordan@candidate.example" }],
            conferenceData: expect.objectContaining({
              createRequest: expect.objectContaining({
                conferenceSolutionKey: { type: "hangoutsMeet" },
              }),
            }),
          }),
        }),
      );
      expect(result).toEqual({
        meetLink: "https://meet.google.com/abc-defg-hij",
        eventId: "evt-1",
      });
    });

    it("throws when the token refresh fails", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        text: async () => "invalid_grant",
      });
      await expect(
        createInterviewMeetEvent({
          encryptedRefreshToken: "enc-rt",
          summary: "Interview",
          startTime: new Date(),
          endTime: new Date(),
          attendeeEmails: [],
        }),
      ).rejects.toThrow(/token refresh failed/);
    });

    it("throws when the Calendar API doesn't return a Meet link", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "fresh-access-token" }),
      });
      mockEventsInsert.mockResolvedValue({ data: { id: "evt-1" } });

      await expect(
        createInterviewMeetEvent({
          encryptedRefreshToken: "enc-rt",
          summary: "Interview",
          startTime: new Date(),
          endTime: new Date(),
          attendeeEmails: [],
        }),
      ).rejects.toThrow(/did not return a Meet link/);
    });
  });
});
