type CleanupFixture = { cleanup(): Promise<void> };

export async function cleanupTask11Fixtures(
  primary: CleanupFixture | undefined,
  foreign: CleanupFixture | undefined
): Promise<void> {
  const failures: unknown[] = [];

  for (const fixture of [primary, foreign]) {
    try {
      await fixture?.cleanup();
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "Task 11 project fixture cleanup failed");
  }
}
