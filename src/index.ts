//=============================================================================
// W2Wizard, 2018-2023
// See README and LICENSE files for details.
//=============================================================================

import { sql } from "bun";
import Logger from "./logger";
import { AsyncLocalStorage } from "node:async_hooks";
import repository from "./docker/remote";
import code, { type Payload } from "./docker/code";

//=============================================================================

export const context = new AsyncLocalStorage<{ id?: string }>();
export const dev = Bun.env.MODE === "development";

export async function ensure<T, E = Error>(
	promise: Promise<T>
): Promise<[T, null] | [null, E]> {
	try {
		const result = await promise;
		return [result, null];
	} catch (error) {
		return [null, error as E];
	}
}

//=============================================================================

if (import.meta.main) {
	try {
		Logger.inf("Connecting to database...");
		await sql.connect();
	} catch (error) {
		Logger.err("Database connection failed: check '.env' variables:", error);
		process.exit(1);
	}

	Logger.inf("Database connected.");
	await sql`PRAGMA journal_mode = WAL`;
	await sql`PRAGMA journal_size_limit = 67108864`; // 64MB
	await sql`PRAGMA mmap_size = 134217728`; // 128MB
	await sql`PRAGMA cache_size = 2000`;
	await sql`PRAGMA busy_timeout = 5000`;

	//=============================================================================

	const server = Bun.serve({
		development: dev,
		routes: {
			"/evaluate/code": {
				async POST(req, srv) {
					const form = await req.formData();
					const source = form.get("code")?.toString();
					const lang = form.get("lang")?.toString() as Payload['lang'];
					if (!lang || !source) {
						return new Response(null, { status: 400 });
					}

					return code({
						lang,
						flags: form.get('flags')?.toString(),
						args: form.getAll('args').map((v) => v.toString()),
						code: source
					});
				},
			},
			"/evaluate/git/:project": {
				async POST(req, srv) {
					const requestId = Bun.randomUUIDv7("base64url");
					Logger.dbg(`Evaluate: ${req.params.project}`);
					const [form, error] = await ensure(req.formData());
					if (error) {
						return new Response(null, {
							status: 400,
							headers: {
								"Content-Type": "application/json",
								Accept: "multipart/form-data",
							},
						});
					}

					const remote = form.get("remote")?.toString();
					const branch = form.get("branch")?.toString();
					if (!remote || !branch) {
						return new Response(null, { status: 400 });
					}

					const aborted = new Promise<never>((_, reject) => {
						Logger.dbg("Setting up abort listener...");
						req.signal.addEventListener("abort", () => {
							Logger.dbg("Request aborted by client");
							return reject(new Error("aborted"));
						});
					});

					const response = new Promise<Response>(async (resolve, reject) => {
						Logger.dbg("Spawning worker...");
						const [r, e] = await ensure(repository(req.params.project, {
							remote,
							branch,
							commit: form.get("commit")?.toString()
						}));

						return e ? reject(e) : resolve(r);
					});

					try {
						// Set up the context with the ID
						context.enterWith({ id: requestId });
						return await Promise.race([response, aborted]);
					} catch (e) {
						return new Response(null, { status: 500 });
					}
				},
			},
		},
	});

	Logger.inf(`Server started on http://localhost:${server.port}/`);
}
