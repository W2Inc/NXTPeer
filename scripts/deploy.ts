// ============================================================================
// Copyright (C) 2024 W2Wizard
// See README in the root of the project for license details.
// ============================================================================

import { $, sql } from "bun";
import { cwd } from "node:process";
import { opendirSync } from "node:fs";
import type { Project } from "@prisma/client";

// ============================================================================

if (process.argv.includes("--help") || process.argv.includes("-h")) {
	console.log(`
🏗️  Deploy Script

Usage: bun run deploy.ts [options]

Common Options:
	--clean, -c              Dump the entire database first.
	--help, -h               Show this help message

Example:
	bun run deploy.ts --clean
`);
	process.exit(0);
}

if (!process.env["DATABASE_NAME"])
	throw new Error('DATABASE_NAME must be set in your .env');
if (process.argv.includes("--clean") || process.argv.includes("-c")) {
	console.log("Clearing database...");
	await $`rm -rf ./prisma/${process.env["DATABASE_NAME"]}`;
}

await $`bunx prisma migrate deploy`;
console.log('=============')
const dir = opendirSync(`${cwd()}/projects`);
const projects: Project[] = [];

for await (const entry of dir) {
	if (!entry.isDirectory()) continue;

	console.log(`Processing: ${entry.name}`)
	const scriptFile = Bun.file(`${cwd()}/projects/${entry.name}/index.test.ts`);

	if (await scriptFile.exists()) {
		projects.push({
			id: Bun.randomUUIDv7('base64url'),
			active: true,
			name: entry.name,
			script: await scriptFile.bytes()
		});
	}
}

if (projects.length) {
	console.log(`Migrating: ${projects.length} project(s)...`);
	await sql`INSERT INTO project ${sql(projects)}`;
} else {
	console.log('No projects to migrate');
}
