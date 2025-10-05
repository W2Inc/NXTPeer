// ============================================================================
// Copyright (C) 2024-2025 W2Inc
// See README in the root of the project for license details.
// ============================================================================

import { sql } from "bun";
import Logger from "../logger";
import { Docker } from "./api";
import type { Project } from "@prisma/client";

//=============================================================================

export interface Remote {
	remote: string | URL;
	branch: string;
	commit?: string;
}

export default async function repository(name: string, data: Remote) {
	const [project] = await sql<Project[]>`
		SELECT * FROM project
		WHERE name = ${name}
	`;

	if (!project || !project.script) {
		Logger.dbg(`Project: '${name}' not found.`);
		return new Response(null, { status: 404 });
	}

	Logger.inf(`Running project: '${name}' on '${data.remote}'`);
	const script = Buffer.from(project.script).toString("base64");
	const container = new Docker.Container({
		...Docker.PAYLOAD,
		Image: "w2inc/runner:latest",
		Env: [
			`GIT_URL=${data.remote}`,
			`GIT_BRANCH=${data.branch}`,
			`GIT_COMMIT=${data.commit ?? ""}`,
		],
		Cmd: [
			"/bin/sh",
			"-c",
			// Pass the script via stdin, then keep container running
			`echo '${script}' | base64 -d > "$HOME/index.test.ts" && cd $HOME && pwd && ls -lah && bun test --timeout 20000;`,
		],
	});

	try {
		await container.start();
		const response = new Response(async function* stream() {
			yield Docker.read(await container.logs());
		});

		const code = await container.wait();
		Logger.inf(`Container exited: ${code}`);

		switch (code) {
			case 0:
				return response;
			case 1:
				return new Response(response.body, { status: 422 });
			case 2:
				return Response.json(new Error('Script failure, please contact staff!'), { status: 500 });
			default:
				throw new Error(`Unexpected exit code: ${code}`);
		}
	} catch (error) {
		Logger.err("Error running container:", error);
		return new Response(null, { status: 500 });
	} finally {
		setTimeout(() => container.remove(), 250);
	}
}
