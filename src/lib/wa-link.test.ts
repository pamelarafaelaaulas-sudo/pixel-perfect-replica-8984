import { describe, expect, it } from "vitest";
import { waLink } from "./reminders";

describe("waLink", () => {
  it("uses digits only and encodes the text", () => {
    expect(waLink("+55 67 99287-0578", "Oi, tudo?")).toBe("https://wa.me/5567992870578?text=Oi%2C%20tudo%3F");
  });
});
