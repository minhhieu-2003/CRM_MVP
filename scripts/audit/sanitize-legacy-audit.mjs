import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { z } from "zod";
import { resolveAuditCorrelationKey } from "../../src/services/auditCorrelation.js";
import { sanitizePersistedAuditEntry } from "../../src/services/auditLogger.js";

const optionsSchema = z
  .object({
    input: z.string().trim().min(1),
    output: z.string().trim().min(1).optional(),
    apply: z.boolean()
  })
  .strict()
  .superRefine((options, context) => {
    if (options.apply && !options.output) {
      context.addIssue({
        code: "custom",
        path: ["output"],
        message: "--output is required with --apply."
      });
    }
    if (!options.apply && options.output) {
      context.addIssue({
        code: "custom",
        path: ["output"],
        message: "--output is accepted only with --apply."
      });
    }
  });

function usage() {
  return [
    "Usage:",
    "  npm run audit:sanitize-legacy -- --input <audit.log>",
    "  npm run audit:sanitize-legacy -- --input <audit.log> --apply --output <new-file>",
    "",
    "Dry-run is the default. --apply never overwrites or replaces the input file."
  ].join("\n");
}

function parseArguments(argv) {
  const values = { input: path.join("logs", "audit.log"), apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") return { help: true };
    if (argument === "--apply") {
      values.apply = true;
      continue;
    }
    if (argument === "--input" || argument === "--output") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a path.`);
      }
      values[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error("Unknown migration argument.");
  }
  return optionsSchema.parse(values);
}

async function scanAuditFile(inputPath, onSanitizedLine) {
  const input = fs.createReadStream(inputPath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let records = 0;
  let invalidRecords = 0;

  for await (const line of lines) {
    if (!line.trim()) continue;
    let sanitized;
    try {
      sanitized = sanitizePersistedAuditEntry(JSON.parse(line));
    } catch {
      invalidRecords += 1;
      continue;
    }
    records += 1;
    await onSanitizedLine?.(`${JSON.stringify(sanitized)}\n`);
  }

  return { records, invalidRecords };
}

async function writeNewSanitizedFile(inputPath, outputPath) {
  const output = await fs.promises.open(outputPath, "wx", 0o600);
  let completed = false;
  try {
    const result = await scanAuditFile(inputPath, async (line) => {
      await output.write(line, null, "utf8");
    });
    if (result.invalidRecords > 0) {
      throw new Error(
        `Migration stopped because ${result.invalidRecords} invalid NDJSON record(s) were found.`
      );
    }
    await output.sync();
    completed = true;
    return result;
  } finally {
    try {
      await output.close();
    } finally {
      if (!completed) {
        try {
          await fs.promises.unlink(outputPath);
        } catch {
          // The exclusive output was never created or has already been removed.
        }
      }
    }
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  resolveAuditCorrelationKey({ ...process.env, AUTH_ENABLED: "true" });
  const inputPath = path.resolve(options.input);
  const inputStats = fs.statSync(inputPath);
  if (!inputStats.isFile()) throw new Error("--input must identify an existing file.");

  if (!options.apply) {
    const result = await scanAuditFile(inputPath);
    if (result.invalidRecords > 0) {
      throw new Error(
        `Dry-run stopped because ${result.invalidRecords} invalid NDJSON record(s) were found.`
      );
    }
    console.log(`Dry-run passed: ${result.records} record(s) can be sanitized.`);
    console.log("No file was written. Re-run with --apply and a new --output path after approval.");
    return;
  }

  const outputPath = path.resolve(options.output);
  if (inputPath === outputPath) {
    throw new Error("--output must differ from --input; in-place migration is not allowed.");
  }
  const result = await writeNewSanitizedFile(inputPath, outputPath);
  console.log(`Wrote ${result.records} sanitized record(s) to a new file.`);
  console.log("The input file was not modified. Review the new file before any manual cutover.");
}

main().catch((error) => {
  const message = error instanceof z.ZodError ? "Invalid migration options." : error.message;
  console.error(`Audit migration failed: ${message}`);
  process.exitCode = 1;
});
