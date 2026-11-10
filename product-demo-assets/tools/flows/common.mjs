// Helpers shared by the product-demo flows (see ../flows.mjs).

export const side = (p, name) =>
  p.getByRole("navigation").getByRole("link", { name, exact: true });

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The date picker's day cell for `d` ("Thursday, 19 November 2026"). */
export function dayCell(p, d) {
  return p.getByRole("dialog").getByRole("gridcell", {
    name: new RegExp(
      `, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}$`,
    ),
  });
}

/** The first weekday at least `n` days from today (or before, if n < 0). */
export function weekday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const step = n < 0 ? -1 : 1;
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + step);
  return d;
}

/** Pick a date in the picker behind `button`, moving months if needed. */
export async function pickDate(r, button, d) {
  const p = r.page;
  await r.click(button);
  await r.wait(600);
  for (let i = 0; i < 2 && !(await dayCell(p, d).count()); i++) {
    await r.click(
      p
        .getByRole("dialog")
        .getByRole("button", {
          name: d < new Date() ? "Previous month" : "Next month",
        }),
    );
    await r.wait(400);
  }
  await r.click(dayCell(p, d));
  await r.wait(700);
}

/** Open a sidebar group (if collapsed) and follow one of its links. */
export async function nav(r, group, item) {
  const p = r.page;
  const link = side(p, item);
  if (!(await link.isVisible().catch(() => false))) {
    await r.click(
      p
        .getByRole("navigation")
        .getByRole("button", { name: group, exact: true }),
    );
    await r.wait(500);
  }
  await r.click(link);
  await r.wait(1100);
}

/** Open one of the app's Select buttons and choose an option. */
export async function choose(r, button, option) {
  const p = r.page;
  const isLocator = button && typeof button.click === "function";
  await r.click(isLocator ? button : p.getByRole("button", { name: button }));
  await r.wait(500);
  await r.click(p.getByRole("option", { name: option }));
  await r.wait(600);
}

/** Close the open dialog without saving. */
export async function cancelDialog(r) {
  const p = r.page;
  await r.click(p.getByRole("dialog").getByRole("button", { name: "Cancel" }));
  await r.wait(600);
}

export const main = (p) => p.getByRole("main");
