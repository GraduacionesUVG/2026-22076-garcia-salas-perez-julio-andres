async function executePhases(phases, start, finish) {
  let failed = 0;
  for (const [label, run] of phases) {
    let code = 1;
    try {
      await start(label);
      const result = await run();
      code = Number.isInteger(result) && result >= 0 ? result : 1;
    } catch (error) {
      console.error(`Backend phase ${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    try { await finish(label, code); } catch (error) { console.error(error); code = 1; }
    if (code !== 0) failed = 1;
  }
  return failed;
}
module.exports = { executePhases };
