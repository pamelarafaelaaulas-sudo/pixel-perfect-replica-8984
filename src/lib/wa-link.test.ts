import { describe, expect, it } from "vitest";
import { generalMessageText, waLink } from "./reminders";

describe("waLink", () => {
  it("uses digits only and encodes the text", () => {
    expect(waLink("+55 67 99287-0578", "Oi, tudo?")).toBe("https://wa.me/5567992870578?text=Oi%2C%20tudo%3F");
  });
});

describe("free broadcast note", () => {
  it("keeps paragraphs and signs with the current teacher, without an individual recipient", () => {
    expect(generalMessageText("  Tragam o banner.\nAté quinta!  ", "Ana")).toBe(
      "Olá, turma! A professora Ana deixou um recado sobre o projeto científico no FECITI Flow:\n\nTragam o banner.\nAté quinta!",
    );
  });
});
