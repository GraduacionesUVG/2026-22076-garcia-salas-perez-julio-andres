import JSZip from "jszip";
import { PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import {
  assertDocxArchive,
  assertDownload,
  assertPdfDocument,
  extractDocxText,
  extractPdfText,
  inspectZipArchive,
} from "@/__tests__/backend/binary-assertions";

function responseStub(options: {
  status?: number;
  headers?: Record<string, string>;
  body?: Buffer;
}) {
  return {
    status: () => options.status ?? 200,
    headers: () => options.headers ?? {},
    body: async () => options.body ?? Buffer.alloc(0),
  };
}

async function minimalDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types />");
  zip.file("_rels/.rels", "<Relationships />");
  zip.file(
    "word/document.xml",
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      "<w:body><w:p><w:r><w:t>DOCX_SENTINEL &amp; hierarchy</w:t></w:r>",
      "<w:r><w:tab/><w:t>child</w:t><w:br/><w:t>line</w:t></w:r></w:p></w:body>",
      "</w:document>",
    ].join("")
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function onePagePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([200, 200]).drawText("PDF_SENTINEL hierarchy", { font });
  return Buffer.from(await pdf.save());
}

async function zipOf(entries: Record<string, Buffer | string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, value] of Object.entries(entries)) zip.file(name, value);
  return zip.generateAsync({ type: "nodebuffer" });
}

function replaceAscii(source: Buffer, from: string, to: string): Buffer {
  expect(Buffer.byteLength(from)).toBe(Buffer.byteLength(to));
  const result = Buffer.from(source);
  const needle = Buffer.from(from, "ascii");
  const replacement = Buffer.from(to, "ascii");
  let offset = 0;
  let replacements = 0;

  while ((offset = result.indexOf(needle, offset)) !== -1) {
    replacement.copy(result, offset);
    offset += replacement.length;
    replacements += 1;
  }

  expect(replacements).toBeGreaterThanOrEqual(2);
  return result;
}

describe("binary download assertions", () => {
  it("returns a non-empty body after exact filename, MIME, cache, and signature checks", async () => {
    const body = Buffer.from("%PDF-content", "ascii");
    const response = responseStub({
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="report.pdf"',
        "cache-control": "no-store",
      },
      body,
    });

    await expect(
      assertDownload(response, {
        filename: "report.pdf",
        contentType: "application/pdf",
        signature: "%PDF-",
      })
    ).resolves.toEqual(body);
  });

  it("rejects empty, mislabeled, cacheable, and incorrectly signed downloads", async () => {
    const validHeaders = {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="report.pdf"',
      "cache-control": "no-store",
    };

    await expect(
      assertDownload(responseStub({ headers: validHeaders }), {
        filename: "report.pdf",
        contentType: "application/pdf",
        signature: "%PDF-",
      })
    ).rejects.toThrow("non-empty");
    await expect(
      assertDownload(
        responseStub({
          headers: { ...validHeaders, "content-type": "application/octet-stream" },
          body: Buffer.from("%PDF-x"),
        }),
        { filename: "report.pdf", contentType: "application/pdf" }
      )
    ).rejects.toThrow("application/pdf");
    await expect(
      assertDownload(
        responseStub({
          headers: { ...validHeaders, "cache-control": "public" },
          body: Buffer.from("%PDF-x"),
        }),
        { filename: "report.pdf", contentType: "application/pdf" }
      )
    ).rejects.toThrow("no-store");
    await expect(
      assertDownload(responseStub({ headers: validHeaders, body: Buffer.from("not-pdf") }), {
        filename: "report.pdf",
        contentType: "application/pdf",
        signature: "%PDF-",
      })
    ).rejects.toThrow("signature");
  });
});

describe("DOCX and PDF assertions", () => {
  it.each<[string, Buffer]>([
    ["literal bytes", Buffer.from([0x28, 0x80, 0x91, 0x92, 0x93, 0x94, 0x96, 0x97, 0x99, 0x85, 0x9c, 0xa0, 0xe9, 0xff, 0x29])],
    ["octal escapes", Buffer.from("(\\200\\221\\222\\223\\224\\226\\227\\231\\205\\234\\240\\351\\777)", "ascii")],
    ["hex bytes", Buffer.from("<8091929394969799859ca0e9ff>", "ascii")],
  ])("decodes WinAnsi punctuation from independent %s without depending on Node's ICU version", async (_label, operand) => {
    const pdf = await PDFDocument.create();
    const latin = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([200, 200]);
    page.node.setFontDictionary(PDFName.of("Latin"), latin.ref);
    page.node.set(PDFName.of("Contents"), pdf.context.register(pdf.context.stream(Buffer.concat([
      Buffer.from("BT /Latin 12 Tf ", "ascii"), operand,
      Buffer.from(" Tj ET", "ascii"),
    ]))));
    expect(await extractPdfText(Buffer.from(await pdf.save()))).toBe("€‘’“”–—™…œ\u00a0éÿ");
  });

  it("decodes an independent Unicode CMap and joins adjacent mixed-font runs", async () => {
    const pdf = await PDFDocument.create();
    const latin = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([200, 200]);
    // Hand-authored glyph IDs deliberately differ from Unicode code points.
    const cmap = pdf.context.register(pdf.context.stream(
      "3 beginbfchar\n<0001> <65E5>\n<0002> <672C>\n<0003> <D83CDF3F>\nendbfchar"
    ));
    const customFont = pdf.context.register(pdf.context.obj({
      Type: "Font", Subtype: "Type0", BaseFont: "IndependentTestFont",
      Encoding: "Identity-H", ToUnicode: cmap,
    }));
    page.node.setFontDictionary(PDFName.of("Latin"), latin.ref);
    page.node.setFontDictionary(PDFName.of("Unicode"), customFont);
    page.node.set(PDFName.of("Contents"), pdf.context.register(pdf.context.stream(
      "BT /Latin 12 Tf (Evidence ) Tj /Unicode 12 Tf <000100020003> Tj /Latin 12 Tf ( end) Tj ET"
    )));
    expect(await extractPdfText(Buffer.from(await pdf.save()))).toBe("Evidence 日本🌿 end");
  });

  it("unzips a DOCX and requires its content types, root relationships, and document XML", async () => {
    await expect(assertDocxArchive(await minimalDocx())).resolves.toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
    ]);

    await expect(
      assertDocxArchive(await zipOf({ "[Content_Types].xml": "<Types />" }))
    ).rejects.toThrow("Missing DOCX member");
  });

  it("parses a PDF and reports a nonzero page count", async () => {
    await expect(assertPdfDocument(await onePagePdf())).resolves.toEqual({
      pageCount: 1,
    });
    await expect(assertPdfDocument(Buffer.from("%PDF-invalid"))).rejects.toThrow(
      "parseable PDF"
    );
  });

  it("extracts semantic text from DOCX XML and decoded PDF content streams", async () => {
    await expect(extractDocxText(await minimalDocx())).resolves.toContain(
      "DOCX_SENTINEL & hierarchy"
    );
    await expect(extractDocxText(await minimalDocx())).resolves.toContain(
      "child\nline"
    );
    await expect(extractPdfText(await onePagePdf())).resolves.toContain(
      "PDF_SENTINEL hierarchy"
    );
  });
});

describe("ZIP archive assertions", () => {
  it("requires exact members and validates every nested markdown, DOCX, and PDF", async () => {
    const members = ["report.md", "report.docx", "report.pdf"];
    const archive = await zipOf({
      "report.md": "# Report\n\nSENTINEL",
      "report.docx": await minimalDocx(),
      "report.pdf": await onePagePdf(),
    });

    const inspected = await inspectZipArchive(archive, members);
    expect(inspected.members).toEqual([...members].sort());
    expect(inspected.markdown.get("report.md")).toContain("SENTINEL");
    expect(inspected.docxText.get("report.docx")).toContain("DOCX_SENTINEL");
    expect(inspected.pdfText.get("report.pdf")).toContain("PDF_SENTINEL");
    expect(inspected.pdfPages.get("report.pdf")).toBe(1);
  });

  it("rejects missing, extra, traversal, duplicate, and invalid nested members", async () => {
    const simple = await zipOf({ "report.md": "# Report" });
    await expect(inspectZipArchive(simple, ["missing.md"])).rejects.toThrow(
      "ZIP members"
    );

    const directoryZip = new JSZip();
    directoryZip.folder("extra");
    directoryZip.file("report.md", "# Report");
    const directory = await directoryZip.generateAsync({ type: "nodebuffer" });
    await expect(
      inspectZipArchive(directory, ["report.md"])
    ).rejects.toThrow("ZIP members");

    const traversal = await zipOf({ "../escape.md": "no" });
    await expect(
      inspectZipArchive(traversal, ["../escape.md"])
    ).rejects.toThrow("unsafe ZIP member");

    const duplicateSource = await zipOf({ "a.txt": "one", "b.txt": "two" });
    const duplicate = replaceAscii(duplicateSource, "b.txt", "a.txt");
    await expect(inspectZipArchive(duplicate, ["a.txt"])).rejects.toThrow(
      "Duplicate ZIP member"
    );

    const invalidPdf = await zipOf({ "report.pdf": "%PDF-invalid" });
    await expect(
      inspectZipArchive(invalidPdf, ["report.pdf"])
    ).rejects.toThrow("parseable PDF");

    const invalidDocx = await zipOf({ "report.docx": "PK-not-a-docx" });
    await expect(
      inspectZipArchive(invalidDocx, ["report.docx"])
    ).rejects.toThrow();

    const emptyMarkdown = await zipOf({ "report.md": "" });
    await expect(
      inspectZipArchive(emptyMarkdown, ["report.md"])
    ).rejects.toThrow("non-empty markdown");
  });
});
