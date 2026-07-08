#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const args = {
    labels: "",
    repo: "",
    bodyFile: "",
    dryRun: false,
    publish: false,
    draftDir: "issue-drafts"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--title") args.title = argv[++index];
    else if (arg === "--body-file") args.bodyFile = argv[++index];
    else if (arg === "--labels") args.labels = argv[++index];
    else if (arg === "--repo") args.repo = argv[++index];
    else if (arg === "--draft-dir") args.draftDir = argv[++index];
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--publish") args.publish = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.title) throw new Error("Missing required --title");
  if (!args.bodyFile) throw new Error("Missing required --body-file");
  if (!fs.existsSync(args.bodyFile)) throw new Error(`Body file not found: ${args.bodyFile}`);
  return args;
}

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8"
  });
}

function detectRepo() {
  const remote = run("git", ["remote", "get-url", "origin"]);
  if (remote.status !== 0) return "";
  const value = remote.stdout.trim();

  const httpsMatch = value.match(/github\.com[:/](.+?)(?:\.git)?$/i);
  if (!httpsMatch) return "";
  return httpsMatch[1].replace(/\.git$/i, "");
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function writeDraft({ title, body, labels, draftDir }) {
  fs.mkdirSync(draftDir, { recursive: true });
  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(title)}.md`;
  const filePath = path.join(draftDir, fileName);
  const content = [
    `# ${title}`,
    "",
    labels ? `Labels: ${labels}` : "Labels:",
    "",
    body.trim(),
    ""
  ].join("\n");
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const body = fs.readFileSync(args.bodyFile, "utf8");
  const repo = args.repo || detectRepo();

  if (!args.publish || args.dryRun) {
    const draft = writeDraft({ ...args, body });
    console.log(JSON.stringify({ status: "drafted", path: draft, repo: repo || null }, null, 2));
    return;
  }

  if (!repo) {
    const draft = writeDraft({ ...args, body });
    console.log(
      JSON.stringify(
        {
          status: "drafted",
          reason: "No GitHub origin remote detected",
          path: draft
        },
        null,
        2
      )
    );
    return;
  }

  const ghCheck = run("gh", ["auth", "status"]);
  if (ghCheck.status !== 0) {
    const draft = writeDraft({ ...args, body });
    console.log(
      JSON.stringify(
        {
          status: "drafted",
          reason: "GitHub CLI is unavailable or unauthenticated",
          path: draft
        },
        null,
        2
      )
    );
    return;
  }

  const commandArgs = ["issue", "create", "--repo", repo, "--title", args.title, "--body", body];
  if (args.labels) commandArgs.push("--label", args.labels);

  const result = run("gh", commandArgs);
  if (result.status !== 0) {
    const draft = writeDraft({ ...args, body });
    console.log(
      JSON.stringify(
        {
          status: "drafted",
          reason: "gh issue create failed",
          stderr: result.stderr.trim(),
          path: draft
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({ status: "published", url: result.stdout.trim(), repo }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
