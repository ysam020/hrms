// The product-demo videos, scripted against the real app (see harness.mjs:
// the API is answered by fictional Halcyon Labs fixtures, so nothing real is
// read or changed). The flows live in ./flows/, one file per group of
// modules; this combines them.
//
// rec.chapter(title) marks a chapter; rec.say(en, hi) starts a subtitle cue
// and its narration (narrate.mjs). Both wait until the previous line has been
// spoken in both languages, so each video is paced to its narration. Hindi
// keeps product terms (Attendance, Geofencing, Payroll…) in English, as the
// app shows them; glossary.mjs spells them for the Hindi narrator.
import { START_FLOWS } from "./flows/start.mjs";
import { PEOPLE_FLOWS } from "./flows/people.mjs";
import { WORK_FLOWS } from "./flows/work.mjs";
import { ADMIN_FLOWS } from "./flows/admin.mjs";
import { HIRING_FLOWS } from "./flows/hiring.mjs";

export const FLOWS = {
  ...START_FLOWS,
  ...PEOPLE_FLOWS,
  ...WORK_FLOWS,
  ...HIRING_FLOWS,
  ...ADMIN_FLOWS,
};
