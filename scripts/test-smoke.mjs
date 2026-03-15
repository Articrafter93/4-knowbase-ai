import { readFileSync } from "node:fs";

const smokeChecks = [
  { file: "frontend/app/(app)/chat/page.tsx", pattern: "Open linked chunk" },
  { file: "frontend/app/(app)/upload/page.tsx", pattern: "Create a note" },
  { file: "backend/app/api/routers/ingest.py", pattern: '"/note"' },
  { file: "backend/app/api/routers/library.py", pattern: '"/documents/{document_id}/chunks"' },
  { file: "backend/app/api/routers/search.py", pattern: "tags: list[str]" },
];

for (const check of smokeChecks) {
  const content = readFileSync(check.file, "utf8");
  if (!content.includes(check.pattern)) {
    throw new Error(`Smoke check failed for ${check.file}: missing pattern "${check.pattern}"`);
  }
}

console.log("Smoke checks passed.");
