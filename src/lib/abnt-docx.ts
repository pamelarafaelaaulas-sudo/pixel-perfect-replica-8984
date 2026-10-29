import { ABNT, alinea, cmToTwip, type AbntModel } from "./abnt-doc";

const PLACEHOLDER = "[Parte ainda não escrita]";

/** Builds the ABNT-formatted .docx in the browser (docx loaded on demand). */
export async function buildProjectDocx(model: AbntModel): Promise<Blob> {
  const { AlignmentType, Document, Header, LineRuleType, Packer, PageNumber, Paragraph, TextRun } = await import("docx");

  const size = ABNT.bodyPt * 2;
  const single = { line: 240, lineRule: LineRuleType.AUTO };
  const oneAndHalf = { line: Math.round(240 * ABNT.bodyLineSpacing), lineRule: LineRuleType.AUTO };
  const lineHeight = 276; // ~one single 12pt line, for vertical placement on cover pages

  const run = (text: string, o: { bold?: boolean; italics?: boolean } = {}) =>
    new TextRun({ text, font: ABNT.font, size, ...o });

  const centered = (text: string, o: { bold?: boolean; before?: number; after?: number } = {}) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { ...single, before: o.before ?? 0, after: o.after ?? 0 },
      children: [run(text, { bold: o.bold ?? false })],
    });

  const body = (text: string) =>
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { firstLine: cmToTwip(ABNT.firstLineIndentCm) },
      spacing: { ...oneAndHalf, before: 0, after: 0 },
      children: [run(text)],
    });

  const placeholder = () =>
    new Paragraph({
      indent: { firstLine: cmToTwip(ABNT.firstLineIndentCm) },
      spacing: { ...oneAndHalf },
      children: [run(PLACEHOLDER, { italics: true })],
    });

  const page = {
    size: { width: cmToTwip(ABNT.page.widthCm), height: cmToTwip(ABNT.page.heightCm) },
    margin: {
      top: cmToTwip(ABNT.marginsCm.top),
      left: cmToTwip(ABNT.marginsCm.left),
      bottom: cmToTwip(ABNT.marginsCm.bottom),
      right: cmToTwip(ABNT.marginsCm.right),
      header: cmToTwip(ABNT.headerCm),
      footer: cmToTwip(1),
    },
  };

  /* ---------- Capa (not counted) ---------- */
  const c = model.cover;
  const cover = [
    centered(c.institution || " ", { bold: true }),
    ...c.authors.map((a, i) => centered(a, { before: i === 0 ? lineHeight * 4 : 0 })),
    centered(c.title, { bold: true, before: lineHeight * 12 - c.authors.length * lineHeight }),
    ...(c.code ? [centered(c.code, { before: lineHeight * 2 })] : []),
    centered(c.place || " ", { before: lineHeight * 19 }),
    centered(c.year),
  ];

  /* ---------- Folha de rosto + Resumo (counted, number hidden) ---------- */
  const t = model.titlePage;
  const titlePage = [
    ...t.authors.map((a) => centered(a)),
    centered(t.title, { bold: true, before: lineHeight * (12 - t.authors.length) }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: cmToTwip(ABNT.natureIndentCm) },
      spacing: { ...single, before: lineHeight * 3 },
      children: [run(t.nature)],
    }),
    centered(t.place || " ", { before: lineHeight * 18 }),
    centered(t.year),
  ];

  const abstract = !model.abstract ? [] : [
    new Paragraph({
      pageBreakBefore: true,
      alignment: AlignmentType.CENTER,
      spacing: { ...oneAndHalf, after: 360 },
      children: [run("RESUMO", { bold: true })],
    }),
    ...(model.abstract!.paragraphs.length
      ? model.abstract!.paragraphs.map(
          (p) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { ...single }, children: [run(p)] }),
        )
      : [new Paragraph({ spacing: single, children: [run(PLACEHOLDER, { italics: true })] })]),
    new Paragraph({
      spacing: { ...single, before: 360 },
      children: [
        run("Palavras-chave: ", { bold: true }),
        run(model.abstract!.keywords.length ? `${model.abstract!.keywords.join("; ")}.` : PLACEHOLDER),
      ],
    }),
  ];

  /* ---------- Textual part (page number top-right) ---------- */
  const text: InstanceType<typeof Paragraph>[] = [];
  model.sections.forEach((s, i) => {
    text.push(
      new Paragraph({
        pageBreakBefore: model.breakSections && s.level === 1 && i > 0,
        spacing: { ...oneAndHalf, before: s.level === 2 || (!model.breakSections && i > 0) ? 360 : 0, after: 360 },
        keepNext: true,
        children: [run(`${s.number} ${s.title}`, { bold: s.level === 1 })],
      }),
    );
    if (s.items) {
      if (s.items.length === 0) text.push(placeholder());
      s.items.forEach((item, k) =>
        text.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: cmToTwip(ABNT.firstLineIndentCm) },
            spacing: { ...oneAndHalf },
            children: [run(`${alinea(k)} ${item}`)],
          }),
        ),
      );
    } else if (s.paragraphs.length) {
      s.paragraphs.forEach((p) => text.push(body(p)));
    } else if (s.number !== "2") {
      text.push(placeholder());
    }
  });

  text.push(
    new Paragraph({
      pageBreakBefore: true,
      alignment: AlignmentType.CENTER,
      spacing: { ...oneAndHalf, after: 360 },
      children: [run("REFERÊNCIAS", { bold: true })],
    }),
    ...(model.references.length
      ? model.references.map(
          (r) => new Paragraph({ alignment: AlignmentType.LEFT, spacing: { ...single, after: 240 }, children: [run(r)] }),
        )
      : [new Paragraph({ spacing: single, children: [run(PLACEHOLDER, { italics: true })] })]),
  );

  const pageNumberHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ children: [PageNumber.CURRENT], font: ABNT.font, size: ABNT.smallPt * 2 })],
      }),
    ],
  });

  const doc = new Document({
    creator: "PamLab",
    title: model.cover.title,
    styles: { default: { document: { run: { font: ABNT.font, size } } } },
    sections: [
      { properties: { page }, children: cover },
      { properties: { page: { ...page, pageNumbers: { start: 1 } } }, children: [...titlePage, ...abstract] },
      { properties: { page }, headers: { default: pageNumberHeader }, children: text },
    ],
  });

  return Packer.toBlob(doc);
}
