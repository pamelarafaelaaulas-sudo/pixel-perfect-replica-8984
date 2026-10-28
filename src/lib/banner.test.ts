import { describe, expect, it } from "vitest";
import { bannerBrief, DEFAULT_BANNER_SECTIONS } from "./banner";

describe("banner template for the group", () => {
  it("is ready for the group only with a Canva template link", () => {
    expect(bannerBrief({ banner_template_url: null }).ready).toBe(false);
    expect(bannerBrief({ banner_template_url: "https://drive.google.com/x" }).ready).toBe(false);
    expect(bannerBrief({ banner_template_url: "https://www.canva.com/design/DAG1/view?mode=preview" }).ready).toBe(true);
  });

  it("uses the default sections and size when the teacher left them blank", () => {
    const b = bannerBrief({ banner_sections: [], banner_size: "  " });
    expect(b.sections).toEqual([...DEFAULT_BANNER_SECTIONS]);
    expect(b.size).toBe("90 × 120 cm");
  });

  it("keeps the teacher's own sections, in her order", () => {
    expect(bannerBrief({ banner_sections: ["Título", " ", "QR code do vídeo"] }).sections).toEqual([
      "Título",
      "QR code do vídeo",
    ]);
  });
});
