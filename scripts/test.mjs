import { readFileSync } from "node:fs";

const requiredFiles = [
  "README.md",
  "backend/app/api/routers/chat.py",
  "backend/app/api/routers/ingest.py",
  "backend/app/api/routers/library.py",
  "backend/app/api/routers/search.py",
  "frontend/app/(app)/chat/page.tsx",
  "frontend/app/(app)/library/page.tsx",
  "frontend/app/(app)/upload/page.tsx",
  "frontend/app/(app)/admin/page.tsx",
];

for (const file of requiredFiles) {
  readFileSync(file, "utf8");
}

console.log("Required project files are present and readable.");
