export interface Task9Response {
  status(): number;
  headers(): Record<string, string>;
  body(): Promise<Buffer>;
}

type OptionalFixture = { cleanup(): Promise<void> };
type OptionalDisposable = { dispose(): Promise<void> };

interface PersistedSegment {
  start_char: number;
  end_char: number;
  selected_text: string;
}

function header(response: Task9Response, name: string): string {
  const headers = response.headers();
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase()
  );
  return entry?.[1] ?? "";
}

export async function readJsonObject(
  response: Task9Response
): Promise<Record<string, unknown>> {
  const contentType = header(response, "content-type");
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new Error(`Expected application/json response, received ${contentType || "none"}`);
  }

  const source = (await response.body()).toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Expected valid JSON response body");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object response body");
  }
  return parsed as Record<string, unknown>;
}

export async function readUtf8Download(
  response: Task9Response,
  expectedFilename: string
): Promise<{ bytes: Buffer; text: string }> {
  if (response.status() !== 200) {
    throw new Error(`Expected download status 200, received ${response.status()}`);
  }

  const contentType = header(response, "content-type").toLowerCase();
  if (contentType !== "text/plain; charset=utf-8") {
    throw new Error(
      `Expected text/plain; charset=utf-8 response, received ${contentType || "none"}`
    );
  }

  const disposition = header(response, "content-disposition");
  const expectedDisposition = `attachment; filename="${expectedFilename}"`;
  if (disposition !== expectedDisposition) {
    throw new Error(
      `Expected Content-Disposition ${expectedDisposition}, received ${disposition || "none"}`
    );
  }

  const bytes = await response.body();
  if (bytes.length === 0) throw new Error("Expected a non-empty text download");

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Expected download body to contain valid UTF-8");
  }

  return { bytes, text };
}

export function materializeRoute(
  template: string,
  params: Record<string, string>
): string {
  const names = Array.from(template.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/gu), (match) => match[1]);
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

export function documentEditPreservesSegmentIntegrity(options: {
  editStatus: number;
  documentContent?: string;
  segmentReadStatus?: number;
  segment?: PersistedSegment;
}): boolean {
  if (options.editStatus === 409) return true;
  if (options.editStatus < 200 || options.editStatus >= 300) return false;
  if (options.segmentReadStatus === 404) return true;
  if (
    options.segmentReadStatus !== 200 ||
    options.documentContent === undefined ||
    !options.segment
  ) {
    return false;
  }

  const { start_char, end_char, selected_text } = options.segment;
  return options.documentContent.slice(start_char, end_char) === selected_text;
}

export async function closeTask9Resources<TSessions>(options: {
  fixture?: OptionalFixture;
  anonymous?: OptionalDisposable;
  sessions?: TSessions;
  closeSessions?: (sessions: TSessions) => Promise<void>;
}): Promise<void> {
  const failures: unknown[] = [];

  try {
    await options.fixture?.cleanup();
  } catch (error) {
    failures.push(error);
  }

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
    throw new AggregateError(failures, "Task 9 resource teardown failed");
  }
}
