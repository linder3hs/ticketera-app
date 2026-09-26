// @vitest-environment node
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./require-approved-spec.mjs", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "spec-gate-"));
mkdirSync(join(root, "docs/specs"), { recursive: true });
writeFileSync(join(root, "docs/specs/draft.md"), "# Draft\n\nEstado: borrador\n");
writeFileSync(join(root, "docs/specs/ok.md"), "# Ok\n\nEstado: aprobada\n");

function run(tool_input) {
  return spawnSync("node", [script], {
    input: JSON.stringify({ tool_name: "Agent", tool_input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  }).status;
}

describe("require-approved-spec hook", () => {
  it("ignora otros subagentes", () => expect(run({ subagent_type: "reviewer", prompt: "x" })).toBe(0));
  it("bloquea developer sin spec", () => expect(run({ subagent_type: "developer", prompt: "haz algo" })).toBe(2));
  it("bloquea spec inexistente", () => expect(run({ subagent_type: "developer", prompt: "docs/specs/nope.md" })).toBe(2));
  it("bloquea spec en borrador", () =>
    expect(run({ subagent_type: "developer", prompt: "T1 de docs/specs/draft.md" })).toBe(2));
  it("permite spec aprobada", () => expect(run({ subagent_type: "developer", prompt: "T1 de docs/specs/ok.md" })).toBe(0));
  it("bloquea si alguna spec no está aprobada", () =>
    expect(run({ subagent_type: "developer", prompt: "docs/specs/ok.md y docs/specs/draft.md" })).toBe(2));
});
