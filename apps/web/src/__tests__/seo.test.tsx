import {
  PUBLIC_PAGES,
  SITE_URL,
  applyPageMeta,
  isIndexable,
  normalizePath,
} from "@next/app/seo";
import { router } from "@next/app/router";

const head = () => ({
  title: document.title,
  canonical:
    document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.href ?? null,
  robots:
    document.head
      .querySelector('meta[name="robots"]')
      ?.getAttribute("content") ?? null,
  description:
    document.head
      .querySelector('meta[name="description"]')
      ?.getAttribute("content") ?? null,
});

describe("search metadata", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.title = "";
  });

  it("gives each public page its own title, description and canonical URL", () => {
    applyPageMeta("/privacy-policy/");
    expect(head()).toEqual({
      title: PUBLIC_PAGES["/privacy-policy"].title,
      canonical: `${SITE_URL}/privacy-policy`,
      robots: null,
      description: PUBLIC_PAGES["/privacy-policy"].description,
    });
    applyPageMeta("/");
    expect(head().canonical).toBe(`${SITE_URL}/`);
  });

  it("marks signed-in pages noindex and drops the public canonical", () => {
    applyPageMeta("/");
    applyPageMeta("/employee-management/asha");
    expect(head()).toMatchObject({
      canonical: null,
      robots: "noindex",
      description: null,
    });
    // Back to a public page: indexable again.
    applyPageMeta("/terms-of-use");
    expect(head().robots).toBeNull();
  });

  it("keeps organisations' careers pages indexable", () => {
    expect(isIndexable("/careers/halcyon")).toBe(true);
    applyPageMeta("/careers/halcyon");
    expect(head()).toMatchObject({
      robots: null,
      canonical: `${SITE_URL}/careers/halcyon`,
    });
  });

  it("titles stay unique and descriptions fit a results snippet", () => {
    const pages = Object.values(PUBLIC_PAGES);
    expect(new Set(pages.map((p) => p.title)).size).toBe(pages.length);
    for (const p of pages) {
      expect(p.title.length).toBeLessThanOrEqual(60);
      expect(p.description.length).toBeLessThanOrEqual(170);
    }
  });

  it("every public page is a real top-level route", () => {
    const top = router.routes[0].children!.map((r) => r.path);
    for (const path of Object.keys(PUBLIC_PAGES))
      expect(top).toContain(normalizePath(path));
  });
});

describe("landing page outline", () => {
  it("has one descriptive H1, and footer labels and slide captions aren't headings", async () => {
    const { render } = await import("@testing-library/react");
    const { MemoryRouter } = await import("react-router-dom");
    const { UserContext } = await import("@web/app/providers/UserContext");
    const { default: Landing } = await import("@next/features/landing/Landing");
    const { container } = render(
      <MemoryRouter>
        <UserContext.Provider
          value={{ user: null, setUser: () => {}, handleLogout: () => {} }}
        >
          <Landing />
        </UserContext.Provider>
      </MemoryRouter>,
    );
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toMatch(/HRMS software/i);
    expect(container.querySelector("footer h2, footer h3")).toBeNull();
    // Headings never skip a level.
    let last = 1;
    for (const h of container.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      const level = Number(h.tagName[1]);
      expect(level).toBeLessThanOrEqual(last + 1);
      last = level;
    }
  });
});
