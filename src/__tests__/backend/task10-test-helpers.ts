export interface SegmentSelection {
  start_char: number;
  end_char: number;
  selected_text: string;
}

export function codeFixtureData(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    description: "QA code description",
    definition: "QA code definition",
    inclusion_criteria: "QA inclusion criteria",
    exclusion_criteria: "QA exclusion criteria",
    ...overrides,
  };
}

export function task10Route(
  template: string,
  params: Record<string, string>
): string {
  const names = Array.from(
    template.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/gu),
    (match) => match[1]
  );
  const declared = new Set(names);

  for (const name of names) {
    if (!Object.hasOwn(params, name)) throw new Error(`Missing route param: ${name}`);
  }
  for (const name of Object.keys(params)) {
    if (!declared.has(name)) throw new Error(`Unexpected route param: ${name}`);
  }

  return template.replace(/:([A-Za-z][A-Za-z0-9_]*)/gu, (_token, name: string) =>
    encodeURIComponent(params[name]!)
  );
}

export async function closeTask10Resources<TSessions>(options: {
  anonymous?: { dispose(): Promise<void> };
  sessions?: TSessions;
  closeSessions?: (sessions: TSessions) => Promise<void>;
}): Promise<void> {
  const failures: unknown[] = [];

  try {
    await options.anonymous?.dispose();
  } catch (error) {
    failures.push(error);
  }

  if (options.sessions) {
    if (!options.closeSessions) {
      failures.push(new Error("closeSessions is required when sessions exist"));
    } else {
      try {
        await options.closeSessions(options.sessions);
      } catch (error) {
        failures.push(error);
      }
    }
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "Task 10 resource teardown failed");
  }
}

export function segmentSelection(
  content: string,
  selectedText: string,
  occurrence = 0
): SegmentSelection {
  const normalizedContent = content.replace(/\r\n?/g, "\n");
  const normalizedSelection = selectedText.replace(/\r\n?/g, "\n");
  let start = -1;
  let fromIndex = 0;

  if (normalizedSelection.length > 0 && occurrence >= 0) {
    for (let index = 0; index <= occurrence; index += 1) {
      start = normalizedContent.indexOf(normalizedSelection, fromIndex);
      if (start === -1) break;
      fromIndex = start + normalizedSelection.length;
    }
  }

  if (start === -1) {
    throw new Error("Selection is not present in normalized content");
  }

  return {
    start_char: start,
    end_char: start + normalizedSelection.length,
    selected_text: normalizedSelection,
  };
}

export function classifyOneWinnerRace(
  statuses: readonly number[],
  successStatus: number,
  conflictStatus: number
): { winnerIndex: number; conflictIndex: number } {
  if (
    statuses.length !== 2 ||
    statuses.filter((status) => status === successStatus).length !== 1 ||
    statuses.filter((status) => status === conflictStatus).length !== 1
  ) {
    throw new Error("Expected exactly one success and one conflict");
  }

  return {
    winnerIndex: statuses.indexOf(successStatus),
    conflictIndex: statuses.indexOf(conflictStatus),
  };
}

export function codeDeletionPreservesReferenceIntegrity(options: {
  deleteStatus: number;
  targetCodeId?: string;
  targetCodeActive?: boolean;
  activeChildren?: ReadonlyArray<{ parent_code_id: string | null }>;
  activeAssignments?: ReadonlyArray<{ code_id: string }>;
}): boolean {
  if (options.deleteStatus === 409) return true;
  if (options.deleteStatus < 200 || options.deleteStatus >= 300) return false;
  if (options.targetCodeActive) return true;

  const targetCodeId = options.targetCodeId;
  if (!targetCodeId) {
    return (
      (options.activeChildren?.length ?? 0) === 0 &&
      (options.activeAssignments?.length ?? 0) === 0
    );
  }

  return (
    !(options.activeChildren ?? []).some(
      (child) => child.parent_code_id === targetCodeId
    ) &&
    !(options.activeAssignments ?? []).some(
      (assignment) => assignment.code_id === targetCodeId
    )
  );
}

export function hasAcyclicParentGraph(
  nodes: ReadonlyArray<{ id: string; parent_code_id: string | null }>
): boolean {
  const parentById = new Map(nodes.map((node) => [node.id, node.parent_code_id]));

  for (const node of nodes) {
    const path = new Set<string>();
    let currentId: string | null = node.id;

    while (currentId && parentById.has(currentId)) {
      if (path.has(currentId)) return false;
      path.add(currentId);
      currentId = parentById.get(currentId) ?? null;
    }
  }

  return true;
}
