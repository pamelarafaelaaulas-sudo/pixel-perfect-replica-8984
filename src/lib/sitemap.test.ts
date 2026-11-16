import { describe, expect, it } from "vitest";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { sitemapStaticPaths, sitemapXML } from "./sitemap";

describe("public sitemap", () => {
  it("includes home but excludes authentication, reset and private descendants", () => {
    const root = createRootRoute({ staticData: { sitemap: false } });
    const home = createRoute({ getParentRoute: () => root, path: "/", staticData: { sitemap: true } });
    const auth = createRoute({ getParentRoute: () => root, path: "auth", staticData: { sitemap: false } });
    const reset = createRoute({ getParentRoute: () => root, path: "reset-password", staticData: { sitemap: false } });
    const privateLayout = createRoute({ getParentRoute: () => root, id: "private", staticData: { sitemap: "exclude-subtree" } });
    const student = createRoute({ getParentRoute: () => privateLayout, path: "aluno", staticData: { sitemap: true } });
    const router = createRouter({ routeTree: root.addChildren([home, auth, reset, privateLayout.addChildren([student])]) });
    expect(sitemapStaticPaths(router)).toEqual(["/"]);
  });
  it("uses the published origin and omits unsupported lastmod timestamps", () => {
    const xml = sitemapXML("https://fecitiflow.lovable.app", [{ path: "/" }]);
    expect(xml).toContain("<loc>https://fecitiflow.lovable.app/</loc>");
    expect(xml).not.toContain("<lastmod>");
  });
});
