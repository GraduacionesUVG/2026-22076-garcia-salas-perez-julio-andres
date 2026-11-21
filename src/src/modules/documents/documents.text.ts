const PREVIEW_LENGTH = 220;

export function normalizeDocumentContent(content: string) {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export function getDocumentContentPreview(content: string) {
  const normalized = normalizeDocumentContent(content).replace(/\s+/g, " ");

  if (normalized.length <= PREVIEW_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, PREVIEW_LENGTH).trim()}...`;
}

export function getChangedDocumentFields(params: {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {
  const { before, after } = params;

  const fields = [
    "title",
    "content",
    "document_type",
    "source_id",
    "participant_id",
    "interview_date",
    "field_date",
    "location",
    "language",
    "notes",
    "metadata",
    "status",
  ];

  return fields.filter((field) => {
    return JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null);
  });
}