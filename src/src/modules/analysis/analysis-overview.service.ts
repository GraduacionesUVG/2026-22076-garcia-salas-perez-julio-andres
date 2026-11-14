import { z } from "zod";
import {
  AnalysisOverviewRepo,
  type AnalysisCodeSummaryRow,
  type CodingSegmentSourceRow,
  type DashboardCodeRow,
  type DocumentPreviewRow,
  type ParticipantPreviewRow,
  type SegmentCodeAssignmentRow,
  type SegmentPreviewRow,
  type UncodedSegmentRow,
} from "./analysis-overview.repo";

function parseIntegerQuery(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed)) return fallback;

  return parsed;
}

export const OverviewLimitOffsetQuerySchema = z
  .object({
    limit: z.preprocess(
      (value) => parseIntegerQuery(value, 100),
      z.number().int().min(1).max(200).default(100)
    ),
    offset: z.preprocess(
      (value) => parseIntegerQuery(value, 0),
      z.number().int().min(0).default(0)
    ),
  })
  .strict();

export type OverviewLimitOffsetQuery = z.infer<
  typeof OverviewLimitOffsetQuerySchema
>;

function emptyStringToUndefined(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  return trimmed || undefined;
}

export const CodingSegmentsQuerySchema = z
  .object({
    status: z.enum(["all", "uncoded", "coded"]).default("all"),
    search: z.preprocess(
      emptyStringToUndefined,
      z.string().max(120).optional()
    ),
    document_id: z.preprocess(
      emptyStringToUndefined,
      z.string().uuid().optional()
    ),
    limit: z.preprocess(
      (value) => parseIntegerQuery(value, 100),
      z.number().int().min(1).max(200).default(100)
    ),
    offset: z.preprocess(
      (value) => parseIntegerQuery(value, 0),
      z.number().int().min(0).default(0)
    ),
  })
  .strict();

export type CodingSegmentsQuery = z.infer<typeof CodingSegmentsQuerySchema>;

const DASHBOARD_CODES_QUERY = { limit: 200, offset: 0 };
const DASHBOARD_UNCODED_QUERY = { limit: 8, offset: 0 };
const DASHBOARD_RELATIONSHIPS_QUERY = { limit: 50, offset: 0 };
const DASHBOARD_DOCUMENT_PATTERNS_QUERY = { limit: 20, offset: 0 };
const GROUP_ATTRIBUTE_PRIORITY = [
  "sample_group",
  "participant_type",
  "community",
  "age_range",
  "gender_identity",
];

function buildRelationshipCounts(assignments: SegmentCodeAssignmentRow[]) {
  const codesBySegment = new Map<string, Set<string>>();

  assignments.forEach((assignment) => {
    if (!codesBySegment.has(assignment.segment_id)) {
      codesBySegment.set(assignment.segment_id, new Set());
    }

    codesBySegment.get(assignment.segment_id)?.add(assignment.code_id);
  });

  const relationshipCounts = new Map<
    string,
    {
      source_code_id: string;
      target_code_id: string;
      shared_segment_count: number;
      segment_ids: Set<string>;
    }
  >();

  codesBySegment.forEach((codeSet, codeSetSegmentId) => {
    const codeIds = Array.from(codeSet).sort();

    for (let sourceIndex = 0; sourceIndex < codeIds.length; sourceIndex += 1) {
      for (
        let targetIndex = sourceIndex + 1;
        targetIndex < codeIds.length;
        targetIndex += 1
      ) {
        const source_code_id = codeIds[sourceIndex];
        const target_code_id = codeIds[targetIndex];
        const key = `${source_code_id}:${target_code_id}`;
        const current =
          relationshipCounts.get(key) ?? {
            source_code_id,
            target_code_id,
            shared_segment_count: 0,
            segment_ids: new Set<string>(),
          };

        current.shared_segment_count += 1;
        current.segment_ids.add(String(codeSetSegmentId));
        relationshipCounts.set(key, current);
      }
    }
  });

  return relationshipCounts;
}

function buildRelationshipRows(params: {
  assignments: SegmentCodeAssignmentRow[];
  segments: SegmentPreviewRow[];
  documents: DocumentPreviewRow[];
  codes: AnalysisCodeSummaryRow[];
  query: OverviewLimitOffsetQuery;
}) {
  const { assignments, segments, documents, codes, query } = params;
  const codesById = new Map(codes.map((code) => [code.id, code]));
  const visibleAssignments = assignments.filter((assignment) =>
    codesById.has(assignment.code_id)
  );
  const relationshipCounts = buildRelationshipCounts(visibleAssignments);
  const sortedRelationships = Array.from(relationshipCounts.values())
    .sort((a, b) => b.shared_segment_count - a.shared_segment_count)
    .slice(query.offset, query.offset + query.limit);
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]));
  const documentsById = new Map(
    documents.map((document) => [document.id, document])
  );
  const codeIdsBySegment = new Map<string, string[]>();

  visibleAssignments.forEach((assignment) => {
    const codeIds = codeIdsBySegment.get(assignment.segment_id) ?? [];
    if (!codeIds.includes(assignment.code_id)) codeIds.push(assignment.code_id);
    codeIdsBySegment.set(assignment.segment_id, codeIds);
  });

  return sortedRelationships.map((relationship) => ({
    source_code_id: relationship.source_code_id,
    target_code_id: relationship.target_code_id,
    shared_segment_count: relationship.shared_segment_count,
    segment_ids: Array.from(relationship.segment_ids),
    segments: Array.from(relationship.segment_ids)
      .map((segmentId) => segmentsById.get(segmentId))
      .filter((segment) => Boolean(segment))
      .map((segment) => {
        const document = documentsById.get(segment!.document_id);

        return {
          segment_id: segment!.id,
          document_id: segment!.document_id,
          document_title: document?.title ?? "Documento",
          document_type: document?.document_type ?? "",
          code_ids: codeIdsBySegment.get(segment!.id) ?? [],
          codes: (codeIdsBySegment.get(segment!.id) ?? [])
            .map((codeId) => codesById.get(codeId))
            .filter((code): code is AnalysisCodeSummaryRow => Boolean(code)),
          selected_text: segment!.selected_text,
          start_char: segment!.start_char,
          end_char: segment!.end_char,
        };
      }),
  }));
}

function buildDocumentPatternRows(params: {
  assignments: SegmentCodeAssignmentRow[];
  segments: SegmentPreviewRow[];
  documents: DocumentPreviewRow[];
  participants: ParticipantPreviewRow[];
  codes: AnalysisCodeSummaryRow[];
  query: OverviewLimitOffsetQuery;
}) {
  const { assignments, segments, documents, participants, codes, query } = params;
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]));
  const documentsById = new Map(
    documents.map((document) => [document.id, document])
  );
  const participantsById = new Map(
    participants.map((participant) => [participant.id, participant])
  );
  const codesById = new Map(codes.map((code) => [code.id, code]));
  const codeIdsBySegment = new Map<string, string[]>();
  const uniqueAssignments = new Map<string, SegmentCodeAssignmentRow>();
  for (const assignment of assignments) {
    if (!codesById.has(assignment.code_id)) continue;
    const key = JSON.stringify([assignment.segment_id, assignment.code_id]);
    const existing = uniqueAssignments.get(key);
    uniqueAssignments.set(key, {
      ...assignment,
      is_quote: Boolean(existing?.is_quote || assignment.is_quote),
    });
  }
  const visibleAssignments = Array.from(uniqueAssignments.values());

  visibleAssignments.forEach((assignment) => {
    const codeIds = codeIdsBySegment.get(assignment.segment_id) ?? [];
    if (!codeIds.includes(assignment.code_id)) codeIds.push(assignment.code_id);
    codeIdsBySegment.set(assignment.segment_id, codeIds);
  });
  const codeDocumentCounts = new Map<
    string,
    Map<
      string,
      {
        document_id: string;
        document_title: string;
        document_type: string;
        participant_id: string | null;
        participant_label: string;
        segment_count: number;
        quote_count: number;
        segments: {
          segment_id: string;
          code_ids: string[];
          codes: AnalysisCodeSummaryRow[];
          selected_text: string;
          start_char: number;
          end_char: number;
          is_quote: boolean;
        }[];
      }
    >
  >();

  visibleAssignments.forEach((assignment) => {
    const segment = segmentsById.get(assignment.segment_id);
    if (!segment) return;

    const document = documentsById.get(segment.document_id);
    const documentsForCode =
      codeDocumentCounts.get(assignment.code_id) ??
      new Map<
        string,
        {
          document_id: string;
          document_title: string;
          document_type: string;
          participant_id: string | null;
          participant_label: string;
          segment_count: number;
          quote_count: number;
          segments: {
            segment_id: string;
            code_ids: string[];
            codes: AnalysisCodeSummaryRow[];
            selected_text: string;
            start_char: number;
            end_char: number;
            is_quote: boolean;
          }[];
        }
      >();
    const current =
      documentsForCode.get(segment.document_id) ?? {
        document_id: segment.document_id,
        document_title: document?.title ?? "Documento",
        document_type: document?.document_type ?? "",
        participant_id: document?.participant_id ?? null,
        participant_label: document?.participant_id
          ? participantsById.get(document.participant_id)?.display_name ||
            participantsById.get(document.participant_id)?.alias ||
            "Participante"
          : "Sin participante",
        segment_count: 0,
        quote_count: 0,
        segments: [],
      };

    current.segment_count += 1;
    if (assignment.is_quote) current.quote_count += 1;
    current.segments.push({
      segment_id: segment.id,
      code_ids: codeIdsBySegment.get(segment.id) ?? [],
      codes: (codeIdsBySegment.get(segment.id) ?? [])
        .map((codeId) => codesById.get(codeId))
        .filter((code): code is AnalysisCodeSummaryRow => Boolean(code)),
      selected_text: segment.selected_text,
      start_char: segment.start_char,
      end_char: segment.end_char,
      is_quote: Boolean(assignment.is_quote),
    });

    documentsForCode.set(segment.document_id, current);
    codeDocumentCounts.set(assignment.code_id, documentsForCode);
  });

  const patterns = Array.from(codeDocumentCounts.entries())
    .map(([code_id, documentsForCode]) => {
      const documentRows = Array.from(documentsForCode.values()).sort(
        (a, b) => b.segment_count - a.segment_count
      );

      return {
        code_id,
        document_count: documentRows.length,
        total_segments: documentRows.reduce(
          (sum, document) => sum + document.segment_count,
          0
        ),
        quote_count: documentRows.reduce(
          (sum, document) => sum + document.quote_count,
          0
        ),
        documents: documentRows,
      };
    })
    .sort(
      (a, b) =>
        b.document_count - a.document_count ||
        b.total_segments - a.total_segments
    )
    .slice(query.offset, query.offset + query.limit);

  return {
    documents: documents.map((document) => {
      const participant = document.participant_id
        ? participantsById.get(document.participant_id)
        : null;

      return {
        ...document,
        participant_label:
          participant?.display_name || participant?.alias || "Sin participante",
        participant_attributes: participant?.attributes ?? {},
      };
    }),
    patterns,
  };
}

function normalizeAttributeValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

function sortCodeIds(
  codeIds: string[],
  codesById: Map<string, AnalysisCodeSummaryRow>
) {
  return [...new Set(codeIds)].sort((a, b) => {
    const codeA = codesById.get(a);
    const codeB = codesById.get(b);

    return (
      (codeA?.position ?? Number.MAX_SAFE_INTEGER) -
        (codeB?.position ?? Number.MAX_SAFE_INTEGER) ||
      (codeA?.name ?? a).localeCompare(codeB?.name ?? b, "es")
    );
  });
}

export function buildCodingSegmentQueue(params: {
  segments: CodingSegmentSourceRow[];
  assignments: SegmentCodeAssignmentRow[];
  documents: DocumentPreviewRow[];
  participants: ParticipantPreviewRow[];
  codes: AnalysisCodeSummaryRow[];
  query: CodingSegmentsQuery;
}) {
  const { segments, assignments, documents, participants, codes, query } = params;
  const codeIdsBySegment = new Map<string, Set<string>>();

  assignments.forEach((assignment) => {
    const current =
      codeIdsBySegment.get(assignment.segment_id) ?? new Set<string>();
    current.add(assignment.code_id);
    codeIdsBySegment.set(assignment.segment_id, current);
  });

  const documentsById = new Map(
    documents.map((document) => [document.id, document])
  );
  const participantsById = new Map(
    participants.map((participant) => [participant.id, participant])
  );
  const codesById = new Map(codes.map((code) => [code.id, code]));

  const rows = segments.map((segment) => {
    const document = documentsById.get(segment.document_id);
    const participant = document?.participant_id
      ? participantsById.get(document.participant_id)
      : null;
    const codeIds = sortCodeIds(
      Array.from(codeIdsBySegment.get(segment.id) ?? []),
      codesById
    );

    return {
      ...segment,
      document_title: document?.title ?? "Documento",
      document_type: document?.document_type ?? "",
      participant_id: document?.participant_id ?? null,
      participant_label:
        participant?.display_name ||
        participant?.alias ||
        (document?.participant_id ? "Participante" : "Sin participante"),
      code_count: codeIds.length,
      code_ids: codeIds,
      codes: codeIds
        .map((codeId) => codesById.get(codeId))
        .filter((code): code is AnalysisCodeSummaryRow => Boolean(code)),
      is_coded: codeIds.length > 0,
    };
  });

  const counts = rows.reduce(
    (summary, row) => {
      summary.all += 1;
      if (row.is_coded) summary.coded += 1;
      else summary.uncoded += 1;
      return summary;
    },
    { all: 0, coded: 0, uncoded: 0 }
  );
  const search = normalizeSearchText(query.search);
  const filteredRows = rows.filter((row) => {
    if (query.status === "coded" && !row.is_coded) return false;
    if (query.status === "uncoded" && row.is_coded) return false;
    if (query.document_id && row.document_id !== query.document_id) return false;

    if (!search) return true;

    return normalizeSearchText(
      [
        row.note,
        row.selected_text,
        row.document_title,
        row.participant_label,
        row.codes.map((code) => code.name),
      ].join(" ")
    ).includes(search);
  });

  return {
    segments: filteredRows.slice(query.offset, query.offset + query.limit),
    total: filteredRows.length,
    counts,
  };
}

function getParticipantGroupValue(
  participant: ParticipantPreviewRow | null,
  document: DocumentPreviewRow | undefined
) {
  if (participant) {
    for (const attribute of GROUP_ATTRIBUTE_PRIORITY) {
      const value = normalizeAttributeValue(participant.attributes?.[attribute]);

      if (value) {
        return {
          attribute,
          key: value,
          label: value,
        };
      }
    }

    const participantLabel = participant.display_name || participant.alias;

    return {
      attribute: "participant",
      key: participant.id,
      label: participantLabel,
    };
  }

  return {
    attribute: "document_type",
    key: document?.document_type || "sin_contexto",
    label: document?.document_type || "Sin contexto",
  };
}

function buildGroupComparisonRows(params: {
  assignments: SegmentCodeAssignmentRow[];
  segments: SegmentPreviewRow[];
  documents: DocumentPreviewRow[];
  participants: ParticipantPreviewRow[];
  codes: DashboardCodeRow[];
}) {
  const { assignments, segments, documents, participants, codes } = params;
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]));
  const documentsById = new Map(
    documents.map((document) => [document.id, document])
  );
  const participantsById = new Map(
    participants.map((participant) => [participant.id, participant])
  );
  const codesById = new Map(codes.map((code) => [code.id, code]));
  const groupsByKey = new Map<
    string,
    {
      key: string;
      label: string;
      attribute: string;
      participant_ids: Set<string>;
      document_ids: Set<string>;
      segment_count: number;
    }
  >();
  const countsByCodeId = new Map<string, Map<string, number>>();

  for (const assignment of assignments) {
    const segment = segmentsById.get(assignment.segment_id);
    if (!segment) continue;

    const document = documentsById.get(segment.document_id);
    const participant = document?.participant_id
      ? participantsById.get(document.participant_id) ?? null
      : null;
    const group = getParticipantGroupValue(participant, document);
    const currentGroup =
      groupsByKey.get(group.key) ??
      {
        key: group.key,
        label: group.label,
        attribute: group.attribute,
        participant_ids: new Set<string>(),
        document_ids: new Set<string>(),
        segment_count: 0,
      };

    if (participant?.id) currentGroup.participant_ids.add(participant.id);
    if (document?.id) currentGroup.document_ids.add(document.id);
    currentGroup.segment_count += 1;
    groupsByKey.set(group.key, currentGroup);

    const codeCounts = countsByCodeId.get(assignment.code_id) ?? new Map();
    codeCounts.set(group.key, (codeCounts.get(group.key) ?? 0) + 1);
    countsByCodeId.set(assignment.code_id, codeCounts);
  }

  const groups = Array.from(groupsByKey.values())
    .sort((a, b) => b.segment_count - a.segment_count)
    .slice(0, 8)
    .map((group) => ({
      key: group.key,
      label: group.label,
      attribute: group.attribute,
      participant_count: group.participant_ids.size,
      document_count: group.document_ids.size,
      segment_count: group.segment_count,
    }));
  const groupKeys = new Set(groups.map((group) => group.key));
  const rows = Array.from(countsByCodeId.entries())
    .map(([codeId, counts]) => {
      const code = codesById.get(codeId);
      const visibleCounts = Object.fromEntries(
        Array.from(counts.entries()).filter(([key]) => groupKeys.has(key))
      );
      const total_segments = Object.values(visibleCounts).reduce(
        (sum, value) => sum + Number(value),
        0
      );

      return {
        code_id: codeId,
        code_name: code?.name ?? "Codigo",
        color: code?.color ?? "#0f766e",
        total_segments,
        counts: visibleCounts,
      };
    })
    .filter((row) => row.total_segments > 0)
    .sort((a, b) => b.total_segments - a.total_segments || a.code_name.localeCompare(b.code_name))
    .slice(0, 10);

  return {
    attribute: groups[0]?.attribute ?? "sample_group",
    groups,
    rows,
  };
}

function buildCodeUsageStatsFromSnapshot(params: {
  codes: DashboardCodeRow[];
  assignments: SegmentCodeAssignmentRow[];
  query: OverviewLimitOffsetQuery;
}) {
  const { codes, assignments, query } = params;
  const countsByCodeId = new Map<
    string,
    { coded_segments_count: number; quotes_count: number }
  >();

  assignments.forEach((assignment) => {
    const current =
      countsByCodeId.get(assignment.code_id) ?? {
        coded_segments_count: 0,
        quotes_count: 0,
      };

    current.coded_segments_count += 1;
    if (assignment.is_quote) current.quotes_count += 1;
    countsByCodeId.set(assignment.code_id, current);
  });

  return codes
    .map((code) => {
      const counts =
        countsByCodeId.get(code.id) ?? {
          coded_segments_count: 0,
          quotes_count: 0,
        };

      return {
        project_id: code.project_id,
        code_id: code.id,
        parent_code_id: code.parent_code_id,
        name: code.name,
        description: code.description,
        definition: code.definition,
        color: code.color,
        position: code.position,
        coded_segments_count: counts.coded_segments_count,
        quotes_count: counts.quotes_count,
        last_coded_at: null,
      };
    })
    .sort(
      (a, b) =>
        b.coded_segments_count - a.coded_segments_count ||
        b.quotes_count - a.quotes_count ||
        a.position - b.position ||
        a.name.localeCompare(b.name)
    )
    .slice(query.offset, query.offset + query.limit);
}

function pendingDocumentIds(segments: UncodedSegmentRow[]) {
  return [...new Set(segments.map(segment => segment.document_id).filter((id): id is string => typeof id === "string" && Boolean(id)))];
}

function withPendingContext(segments: UncodedSegmentRow[], documents: DocumentPreviewRow[], participants: ParticipantPreviewRow[]) {
  const documentsById = new Map(documents.map(document => [document.id, document]));
  const participantsById = new Map(participants.map(participant => [participant.id, participant]));
  return segments.map(segment => {
    const document = documentsById.get(String(segment.document_id ?? ""));
    const participant = document?.participant_id ? participantsById.get(document.participant_id) : null;
    return {
      ...segment,
      document_title: document?.title?.trim() || "Documento no disponible",
      document_type: document?.document_type ?? "",
      participant_id: document?.participant_id ?? null,
      participant_label: participant?.display_name?.trim() || participant?.alias?.trim() || "Sin participante",
    };
  });
}

export class AnalysisOverviewService {
  constructor(private readonly repo: AnalysisOverviewRepo) {}

  async getOverview(projectId: string) {
    return this.repo.getOverview(projectId);
  }

  async getCodeUsageStats(projectId: string, query: OverviewLimitOffsetQuery) {
    return this.repo.getCodeUsageStats(projectId, query);
  }

  async getUncodedSegments(projectId: string, query: OverviewLimitOffsetQuery) {
    const segments = await this.repo.getUncodedSegments(projectId, query);
    if (!segments.length) return [];
    const documents = await this.repo.getDocumentsByIds(projectId, pendingDocumentIds(segments));
    const participantIds = [...new Set(documents.map(document => document.participant_id).filter((id): id is string => Boolean(id)))];
    const participants = participantIds.length ? await this.repo.getParticipantsByIds(projectId, participantIds) : [];
    return withPendingContext(segments, documents, participants);
  }

  async getCodingSegments(projectId: string, query: CodingSegmentsQuery) {
    const [segments, assignments] = await Promise.all([
      this.repo.listSegmentsForCoding(projectId),
      this.repo.getSegmentCodeAssignments(projectId),
    ]);
    const documents = await this.repo.getDocumentsByIds(
      projectId,
      Array.from(new Set(segments.map((segment) => segment.document_id)))
    );
    const codeIds = Array.from(
      new Set(assignments.map((assignment) => assignment.code_id))
    );
    const [participants, codes] = await Promise.all([
      this.repo.getParticipantsByIds(
        projectId,
        Array.from(
          new Set(
            documents
              .map((document) => document.participant_id)
              .filter((participantId): participantId is string =>
                Boolean(participantId)
              )
          )
        )
      ),
      // Pending evidence never renders code metadata, so avoid an extra
      // Supabase round trip for that tab unless a search needs code names.
      query.status === "uncoded" && !query.search
        ? Promise.resolve([])
        : this.repo.getCodesByIds(projectId, codeIds),
    ]);

    return buildCodingSegmentQueue({
      segments,
      assignments,
      documents,
      participants,
      codes,
      query,
    });
  }

  async getCodeRelationships(projectId: string, query: OverviewLimitOffsetQuery) {
    const assignments = await this.repo.getSegmentCodeAssignments(projectId);
    const relationshipCounts = buildRelationshipCounts(assignments);
    const segmentIds = Array.from(
      new Set(
        Array.from(relationshipCounts.values()).flatMap((relationship) =>
          Array.from(relationship.segment_ids)
        )
      )
    );
    const segments = await this.repo.getSegmentsByIds(projectId, segmentIds);
    const documents = await this.repo.getDocumentsByIds(
      projectId,
      Array.from(new Set(segments.map((segment) => segment.document_id)))
    );
    const codes = await this.repo.getCodesByIds(
      projectId,
      Array.from(new Set(assignments.map((assignment) => assignment.code_id)))
    );

    return buildRelationshipRows({
      assignments,
      segments,
      documents,
      codes,
      query,
    });
  }

  async getDocumentPatterns(projectId: string, query: OverviewLimitOffsetQuery) {
    const assignments = await this.repo.getSegmentCodeAssignments(projectId);
    const segmentIds = Array.from(
      new Set(assignments.map((assignment) => assignment.segment_id))
    );
    const segments = await this.repo.getSegmentsByIds(projectId, segmentIds);
    const documents = await this.repo.getDocumentsByIds(
      projectId,
      Array.from(new Set(segments.map((segment) => segment.document_id)))
    );
    const participants = await this.repo.getParticipantsByIds(
      projectId,
      Array.from(
        new Set(
          documents
            .map((document) => document.participant_id)
            .filter((participantId) => Boolean(participantId))
        )
      ) as string[]
    );
    const codes = await this.repo.getCodesByIds(
      projectId,
      Array.from(new Set(assignments.map((assignment) => assignment.code_id)))
    );

    return buildDocumentPatternRows({
      assignments,
      segments,
      documents,
      participants,
      codes,
      query,
    });
  }

  async getDashboardSnapshot(projectId: string) {
    const [overview, codes, uncodedSegments, insights, assignments] =
      await Promise.all([
        this.repo.getOverview(projectId),
        this.repo.listCodesForDashboard(projectId, DASHBOARD_CODES_QUERY),
        this.repo.getUncodedSegments(projectId, DASHBOARD_UNCODED_QUERY),
        this.repo.getInsightsForDashboard(projectId),
        this.repo.getSegmentCodeAssignments(projectId),
      ]);
    const segmentIds = Array.from(
      new Set(assignments.map((assignment) => assignment.segment_id))
    );
    const segments = await this.repo.getSegmentsByIds(projectId, segmentIds);
    const codedDocumentIds = new Set(segments.map(segment => segment.document_id));
    const contextDocuments = await this.repo.getDocumentsByIds(
      projectId,
      [...new Set([...codedDocumentIds, ...pendingDocumentIds(uncodedSegments)])]
    );
    // Pending context must not add uncoded-only documents to the pattern charts.
    const documents = contextDocuments.filter(document => codedDocumentIds.has(document.id));
    const participants = await this.repo.getParticipantsByIds(
      projectId,
      Array.from(
        new Set(
          contextDocuments
            .map((document) => document.participant_id)
            .filter((participantId) => Boolean(participantId))
        )
      ) as string[]
    );
    const codesForSegments = await this.repo.getCodesByIds(
      projectId,
      Array.from(new Set(assignments.map((assignment) => assignment.code_id)))
    );

    return {
      overview,
      stats: buildCodeUsageStatsFromSnapshot({
        codes,
        assignments,
        query: { limit: 8, offset: 0 },
      }),
      codes,
      uncodedSegments: withPendingContext(uncodedSegments, contextDocuments, participants),
      insights,
      relationships: buildRelationshipRows({
        assignments,
        segments,
        documents,
        codes: codesForSegments,
        query: DASHBOARD_RELATIONSHIPS_QUERY,
      }),
      documentPatterns: buildDocumentPatternRows({
        assignments,
        segments,
        documents,
        participants,
        codes: codesForSegments,
        query: DASHBOARD_DOCUMENT_PATTERNS_QUERY,
      }),
      groupComparisons: buildGroupComparisonRows({
        assignments,
        segments,
        documents,
        participants,
        codes,
      }),
    };
  }
}
