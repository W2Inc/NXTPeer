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

class CompilationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CompilationError";
	}
}

class ExecutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExecutionError";
	}
}

//=============================================================================

/**
 * Run a compile container to produce an executable out of the source code.
 * @param workDir The working directory containing the source file
 * @param sourceFile The source file name (without path)
 * @param data Payload containing compilation options
 * @returns The executable name
 */
async function compile(workDir: string, sourceFile: string, data: Payload) {
	const flags = data.flags?.split(' ') ?? ["-Wall", "-Wextra"];
	const executableName = Bun.randomUUIDv7("base64url");
	const container = new Docker.Container({
		...Docker.PAYLOAD,
		Image: "gcc:latest",
		Cmd: ["gcc", ...flags, "-o", executableName, sourceFile],
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
	const logs = Docker.read(await container.logs());
	const exit = await container.wait();

	if (exit !== 0) {
		Logger.wrn("Compilation failed", logs);
		throw new CompilationError(logs);
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
	const logs = Docker.read(await container.logs());
	const exit = await container.wait();
	if (exit !== 0) {
		Logger.wrn("Execution failed");
		throw new ExecutionError(logs);
	}

	return logs;
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
		const id = Bun.randomUUIDv7("base64url");
		const workDir = path.join(tmpdir(), id);
		await mkdir(workDir, { recursive: true });

		const sourceFileName = `${filename}.${data.lang}`;
		const sourceFilePath = path.join(workDir, sourceFileName);
		await Bun.write(Bun.file(sourceFilePath), data.code);
		Logger.dbg(`Source written to ${sourceFilePath}`);

		const executableName = await compile(workDir, sourceFileName, data);
		Logger.dbg(`Compilation successful, executable: ${executableName}`);

		const output = await exec(workDir, executableName, data);
		const cleanup = await $`rm -rf ${workDir}`;
		if (cleanup.exitCode !== 0) {
			Logger.err(`Failed to clean up directory: ${workDir}`, cleanup.stderr);
		}

		return new Response(output, { status: 200 });
	} catch (error) {
		if (error instanceof CompilationError) {
			const msg = `[Compilation Error]\n${error.message}`;
			return new Response(msg, { status: 422 });
		} else if (error instanceof ExecutionError) {
			const msg = `[Execution Error]\n${error.message}`;
			return new Response(msg, { status: 422 });
		}

		Logger.err("Unknown error during code execution:", error);
		return new Response('Unknown Error', { status: 500 });
	}
}
