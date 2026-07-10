import os from "node:os";
import path from "node:path";

process.env.AUDIT_LOG_DIR = path.join(os.tmpdir(), "crm_audit_smoke");

const { app } = await import("../../src/server.js");

const server = app.listen(0, async () => {
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    if (!healthRes.ok) throw new Error("Health check failed");

    const chatRes = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "1" })
    });

    if (!chatRes.ok) throw new Error(`Chat API failed with status ${chatRes.status}`);
    const json = await chatRes.json();

    if (
      typeof json.reply !== "string" ||
      !Array.isArray(json.sources) ||
      typeof json.context !== "object"
    ) {
      throw new Error("Chat API contract violated: missing reply, sources, or context");
    }

    console.log(
      JSON.stringify(
        { status: "success", tests: ["health", "chat"], message: "Smoke test passed" },
        null,
        2
      )
    );
    server.close();
  } catch (err) {
    console.error(err);
    server.close(() => {
      process.exit(1);
    });
  }
});
