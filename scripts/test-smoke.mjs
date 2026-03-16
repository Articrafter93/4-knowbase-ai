const API_BASE = process.env.SMOKE_API_BASE || "http://localhost:8000";
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 120000;

function fail(message) {
  console.error(`Smoke check failed: ${message}`);
  process.exit(1);
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body, text };
}

function buildAuthHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function parseSseEvents(payload) {
  const events = [];
  for (const line of String(payload).split("\n")) {
    if (!line.startsWith("data: ")) {
      continue;
    }
    const jsonPart = line.slice(6).trim();
    if (!jsonPart) {
      continue;
    }
    try {
      events.push(JSON.parse(jsonPart));
    } catch {
      // ignore malformed SSE lines
    }
  }
  return events;
}

async function pollJob(token, jobId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { response, body } = await fetchJson(`/api/v1/ingest/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      fail(`unable to poll job status (${response.status})`);
    }
    if (body?.status === "completed") {
      return body;
    }
    if (body?.status === "failed") {
      fail(`ingestion job failed: ${body?.error_message || "unknown error"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  fail("ingestion job timeout");
}

async function main() {
  const runId = `${Date.now()}`;
  const email = `smoke.${runId}@gmail.com`;
  const password = "Knowbase#2026!";
  const fullName = "Smoke Runner";
  const noteTitle = `Smoke Note ${runId}`;
  const noteContent =
    `Smoke run ${runId}. Critical fact: Helix Budget 2026 approved amount is 1.2M COP. Token ${runId}.`;

  const health = await fetchJson("/health");
  if (health.response.status !== 200) {
    fail(`/health returned ${health.response.status}`);
  }

  const register = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, full_name: fullName, password }),
  });
  if (register.response.status !== 201) {
    fail(`/auth/register returned ${register.response.status}`);
  }
  const token = register.body?.access_token;
  if (!token) {
    fail("missing access token after register");
  }

  const ingest = await fetchJson("/api/v1/ingest/note", {
    method: "POST",
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      title: noteTitle,
      content: noteContent,
      tags: ["smoke", "e2e", "helix"],
    }),
  });
  if (ingest.response.status !== 202) {
    fail(`/ingest/note returned ${ingest.response.status}`);
  }
  const documentId = ingest.body?.document_id;
  const jobId = ingest.body?.job_id;
  if (!documentId || !jobId) {
    fail("ingest response missing document_id/job_id");
  }

  const job = await pollJob(token, jobId);

  const docs = await fetchJson("/api/v1/library/documents", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!docs.response.ok || !Array.isArray(docs.body)) {
    fail("unable to list library documents");
  }
  const ingestedDoc = docs.body.find((doc) => doc.id === documentId);
  if (!ingestedDoc) {
    fail("ingested document not visible in library");
  }

  const chat = await fetchJson("/api/v1/chat/", {
    method: "POST",
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      query: "What is the approved amount for Helix Budget 2026? Cite source.",
      top_k: 5,
    }),
  });
  if (!chat.response.ok) {
    fail(`/chat returned ${chat.response.status}`);
  }
  const events = parseSseEvents(chat.text);
  const citationsEvent = events.find((event) => event.type === "citations");
  const citations = Array.isArray(citationsEvent?.content) ? citationsEvent.content : [];
  if (citations.length === 0) {
    fail("chat response has no citations");
  }
  const firstCitation = citations[0];
  if (!firstCitation.document_id || !firstCitation.chunk_id) {
    fail("citation missing source link fields");
  }

  console.log(`Health: ${health.response.status}`);
  console.log(`Ingest: ${ingest.response.status}`);
  console.log(`Job: ${job.status}`);
  console.log(`Library document visible: ${documentId}`);
  console.log(
    `Chat citation: marker=${firstCitation.marker} document_id=${firstCitation.document_id} chunk_id=${firstCitation.chunk_id}`,
  );
  console.log("Smoke checks passed.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
