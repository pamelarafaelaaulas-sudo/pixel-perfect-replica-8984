import { ABNT, cmToTwip } from "./abnt-doc";
import type { EthicsDoc } from "./ethics";

/** Builds a printable .docx for a TCLE or image-authorization form (docx loaded on demand). */
export async function buildEthicsDocx(doc: EthicsDoc): Promise<Blob> {
  const { AlignmentType, Document, Packer, Paragraph, TextRun } = await import("docx");
  const size = ABNT.bodyPt * 2;
  const run = (text: string, bold = false) => new TextRun({ text, font: ABNT.font, size, bold });
  const spacing = { line: 360, before: 0, after: 160 };

  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [run(doc.title, true)] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [run(doc.subtitle)] }),
    ...doc.paragraphs.map((p) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing, children: [run(p)] })),
    ...doc.signatures.flatMap((s) => [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 720, after: 0 }, children: [run("________________________________________")] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(s)] }),
    ]),
  ];

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: cmToTwip(ABNT.page.widthCm), height: cmToTwip(ABNT.page.heightCm) },
            margin: {
              top: cmToTwip(ABNT.marginsCm.top),
              left: cmToTwip(ABNT.marginsCm.left),
              bottom: cmToTwip(ABNT.marginsCm.bottom),
              right: cmToTwip(ABNT.marginsCm.right),
            },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(document);
}
