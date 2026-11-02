import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { permissionStructure } from "@web/assets/data/permissionStructure";
import { Platform, SCOPE_MATRIX } from "@next/features/landing/Platform";

// The landing page's permissions matrix claims which scopes each permission
// can be granted at; it must say what the role editor actually offers.
describe("landing platform chapter", () => {
  it("matches the permission catalog's scopes", () => {
    const catalog = permissionStructure as Record<
      string,
      { actions: Record<string, string[]> }
    >;
    for (const row of SCOPE_MATRIX) {
      const [module, action] = row.perm.split(":");
      expect(catalog[module]?.actions[action]).toEqual(row.scopes);
    }
  });

  it("prerenders every section without a browser", () => {
    const html = renderToString(
      <MemoryRouter>
        <Platform />
      </MemoryRouter>,
    );
    for (const id of [
      "attendance-rules",
      "settings",
      "permissions",
      "policies",
      "reports",
      "notifications",
    ])
      expect(html).toContain(`id="${id}"`);
    expect(html).toContain("Require punching in at the office");
  });
});
