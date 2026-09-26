// PreToolUse (Agent): bloquea lanzar `developer` si la spec referenciada no tiene `Estado: aprobada`.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const { subagent_type, prompt = "" } = input.tool_input ?? {};
if (subagent_type !== "developer") process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
const specs = [...new Set(prompt.match(/docs\/specs\/[\w.-]+\.md/g) ?? [])];

function block(reason) {
  process.stderr.write(
    `BLOQUEADO: ${reason} El agente developer solo trabaja con una spec aprobada por un humano ("Estado: aprobada").\n`,
  );
  process.exit(2);
}

if (specs.length === 0) block("el prompt no referencia ninguna spec docs/specs/<slug>.md.");

for (const spec of specs) {
  const file = resolve(root, spec);
  if (!existsSync(file)) block(`${spec} no existe.`);
  if (!/^Estado:\s*aprobada\s*$/m.test(readFileSync(file, "utf8"))) block(`${spec} no está aprobada.`);
}
