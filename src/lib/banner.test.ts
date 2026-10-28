import { describe, expect, it } from "vitest";
import { bannerBrief, bannerProgress, DEFAULT_BANNER_SECTIONS } from "./banner";

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

describe("banner progress of each group", () => {
  const templateUrl = "https://www.canva.com/design/DAGmodelo1/view";
  it("follows link → file → delivery", () => {
    expect(bannerProgress({ templateUrl, canvaUrl: null, filePath: null, delivered: false })).toBe("sem_inicio");
    expect(bannerProgress({ templateUrl, canvaUrl: "https://www.canva.com/design/DAGmodelo1/edit", filePath: null, delivered: false })).toBe(
      "link_do_modelo",
    );
    expect(bannerProgress({ templateUrl, canvaUrl: "https://www.canva.com/design/DAGgrupo/edit", filePath: null, delivered: false })).toBe(
      "editando",
    );
    expect(bannerProgress({ templateUrl, canvaUrl: "https://www.canva.com/design/DAGgrupo/edit", filePath: "g/b.pdf", delivered: false })).toBe(
      "arquivo_enviado",
    );
    expect(bannerProgress({ templateUrl, canvaUrl: "https://www.canva.com/design/DAGgrupo/edit", filePath: "g/b.pdf", delivered: true })).toBe(
      "entregue",
    );
  });
});
