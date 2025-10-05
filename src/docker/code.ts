// ============================================================================
// Copyright (C) 2024-2025 W2Inc
// See README in the root of the project for license details.
// ============================================================================

import path from "node:path";
import { mkdir } from "node:fs/promises";
import Logger from "../logger";
import { tmpdir } from "node:os";
import { Docker } from "./api";
import { $, type PathLike } from "bun";

//=============================================================================

const filename = "main";
export interface Payload {
	args?: string[];
	code: string;
	flags?: string;
	lang: "c"; // File extension
}

//=============================================================================

/**
 * Run a compile container to produce an executable out of the source code.
 * @param workDir The working directory containing the source file
 * @param sourceFileName The source file name (without path)
 * @param data Payload containing compilation options
 * @returns The executable name
 */
async function compile(
	workDir: string,
	sourceFileName: string,
	data: Payload
): Promise<string> {
	const flags = data.flags ?? "";
	const executableName = Bun.randomUUIDv7("base64url");
	const container = new Docker.Container({
		...Docker.PAYLOAD,
		Image: "gcc:latest",
		Cmd: ["gcc", "-o", executableName, sourceFileName],
		WorkingDir: "/workspace",
		HostConfig: {
			AutoRemove: true,
			Memory: 50 * 1024 * 1024,
			MemorySwap: -1,
			Privileged: false,
			CpusetCpus: "0",
			Binds: [`${workDir}:/workspace:rw`],
		},
	});

	await container.start();
	const logs = await container.logs();
	const exit = await container.wait();

	if (exit !== 0) {
		Logger.err("Compilation failed:", Docker.read(logs));
		throw new Error("Failed to compile");
	}

	return executableName;
}

/**
 * Execute the compiled program in a distroless container
 * @param workDir The working directory containing the executable
 * @param executableName The name of the executable to run
 * @param data Payload containing runtime options
 * @returns Response with container logs
 */
async function exec(workDir: string, executableName: string, data: Payload) {
	const args = data.args ?? [];
	const cmdWithArgs = [`./${executableName}`, ...args];

	const container = new Docker.Container({
		...Docker.PAYLOAD,
		Image: "gcr.io/distroless/cc:latest",
		Cmd: cmdWithArgs,
		WorkingDir: "/workspace",
		HostConfig: {
			AutoRemove: false,
			Memory: 50 * 1024 * 1024,
			MemorySwap: -1,
			Privileged: false,
			CpusetCpus: "0",
			Binds: [`${workDir}:/workspace:ro`],
		},
	});

	await container.start();
	const logs = await container.logs();
	const exitCode = await container.wait();

	// Return logs with appropriate status code based on program exit code
	return new Response(Docker.read(logs), {
		status: exitCode === 0 ? 200 : 422,
	});
}

//=============================================================================

export default async function code(data: Payload) {
	Logger.inf(`Running code with distroless container...`);

	// Only support C language for now
	if (data.lang !== "c") {
		return new Response("Only C language is currently supported", {
			status: 501,
		});
	}

	try {
		// Create a temporary directory with unique ID
		const id = Bun.randomUUIDv7("base64url");
		const workDir = path.join(tmpdir(), id);
		await mkdir(workDir, { recursive: true });

		// Write source code to file
		const sourceFileName = `${filename}.${data.lang}`;
		const sourceFilePath = path.join(workDir, sourceFileName);
		await Bun.write(Bun.file(sourceFilePath), data.code);

		Logger.dbg(`Source written to ${sourceFilePath}`);

		// Compile the code
		const executableName = await compile(workDir, sourceFileName, data);
		Logger.dbg(`Compilation successful, executable: ${executableName}`);

		// Execute the compiled code
		const response = await exec(workDir, executableName, data);
		const cleanup = await $`rm -rf ${workDir}`;
		if (cleanup.exitCode !== 0) {
			Logger.err(`Failed to clean up directory: ${workDir}`, cleanup.stderr);
		}

		return response;
	} catch (error) {
		Logger.err("Error processing code execution:", error);
		return new Response(
			error instanceof Error ? error.message : "Unknown error",
			{ status: 500 }
		);
	}
}
