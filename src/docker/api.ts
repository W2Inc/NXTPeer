// ============================================================================
// Copyright (C) 2024-2025 W2Inc
// See README in the root of the project for license details.
// ============================================================================

import Logger from "../logger";
import createClient, { type FetchResponse } from "openapi-fetch";
import type { operations, paths } from "./engine";

// ============================================================================

export namespace Docker {
	export type Payload =
		operations["ContainerCreate"]["requestBody"]["content"]["application/json"];

	/**
	 * Parse the response buffer from the docker daemon.
	 * ```md
	 * Example response from the docker daemon:
	 * 01 00 00 00 00 00 00 1f 52 6f 73 65 73 20 61 72  65 ...
	 * │  ─────┬── ─────┬─────  R  o  s  e  s     a  r   e ...
	 * │       │        │
	 * └stdout │        │
	 *         │        └─ 0x0000001f = 31 bytes (including the \n at the end)
	 *       unused
	 * ```
	 *
	 * @note Each line is always ending with a newline character.
	 * @see https://ahmet.im/blog/docker-logs-api-binary-format-explained/
	 */
	export function read(buff: ArrayBuffer): string {
		let data = "";
		let offset = 0;
		const buffer = Buffer.from(buff);

		while (offset < buffer.length) {
			const length = buffer.readUInt32BE((offset += 4));
			const line = buffer.subarray((offset += 4), (offset += length));
			const pos = line.indexOf(" ");

			// Some formatting of the timestamp.
			// BUG(W2): Will cause bugs if we request logs without timestamps.
			const message = line.subarray(pos + 1);
			const date = line.subarray(0, pos).subarray(0, 19);
			date.set([32], date.indexOf("T"));

			data += `[${date}] ${message}`;
		}

		return (
			data
				// Regex away all the color codes.
				.replace(/\x1b\[[0-9;]*m|\[\d+m/g, "")
				.replaceAll("(pass)", "(✓)")
				.replaceAll("(fail)", "(✗)")
		);
	}

	/** The docker client used to fetch requests with via unix socket */
	export const socket = createClient<paths>({
		baseUrl: `http://localhost/v${Bun.env.DOCKER_VERSION ?? "1.44"}`,
		fetch: (input) => {
			return Bun.fetch(input, {
				unix: "/var/run/docker.sock",
			});
		},
		headers: {
			Host: "localhost",
			"User-Agent": Bun.env.SERVER ?? "NXTPeer",
		},
	});

	export const PAYLOAD: Omit<Payload, "Env" | "Cmd"> = {
		Image: "w2inc/runner:latest",
		Tty: false,
		NetworkDisabled: false,
		AttachStdin: false,
		AttachStdout: true,
		AttachStderr: true,
		OpenStdin: false,
		StdinOnce: false,
		ArgsEscaped: false,
		HostConfig: {
			AutoRemove: false,
			Memory: 50 * 1024 * 1024,
			MemorySwap: -1,
			Privileged: false,
			CpusetCpus: "0",
		},
		WorkingDir: "/home",
	};

	export class Container {
		public id?: string;
		private payload: Payload;

		constructor(payload: Payload) {
			this.payload = payload;
		}

		/** Start the container */
		public async start() {
			Logger.inf(`Creating container:`, this.payload.Env);
			if (!this.id) {
				const result = await this.verify(
					socket.POST("/containers/create", {
						body: this.payload,
					})
				);

				this.id = result.data["Id"];
			}

			Logger.dbg(this.id);
			await this.verify(
				socket.POST("/containers/{id}/start", {
					params: { path: { id: this.id! } },
				})
			);
		}

		public async logs() {
			if (!this.id) {
				throw new Error("Container not started yet, logs unavailable.");
			}

			const result = await this.verify(
				socket.GET("/containers/{id}/logs", {
					parseAs: "arrayBuffer",
					params: {
						path: { id: this.id },
						query: {
							stdout: true,
							stderr: true,
							timestamps: true,
						},
					},
				})
			);

			return result.data;
		}

		public async wait() {
			if (!this.id) {
				throw new Error("Container not started yet, wait unavailable.");
			}

			const result = await this.verify(
				socket.POST("/containers/{id}/wait", {
					params: { path: { id: this.id! } },
				})
			);

			return result.data["StatusCode"] as Number;
		}

		public async stop() {
			if (!this.id) {
				throw new Error("Container not started yet, stop unavailable.");
			}

			await this.verify(
				socket.POST("/containers/{id}/stop", {
					params: { path: { id: this.id! } },
				})
			);
		}

		public async remove() {
			if (!this.id) {
				throw new Error("Container not started yet, remove unavailable.");
			}

			await this.verify(
				socket.DELETE("/containers/{id}", {
					params: { path: { id: this.id! } },
				})
			);
		}

		/** Verify the response of the socket, they should all work. */
		private async verify<T extends Record<string | number, any>>(
			r: Promise<FetchResponse<T, any, any>>
		) {
			const result = await r;
			const { error, response } = result;
			if (error || !response.ok) {
				Logger.err(
					`Error: ${response.status} => ${response.statusText}`,
					error
				);
				throw new Error("Socket request failed");
			}

			Logger.dbg(
				`Success: ${response.status} => ${response.statusText}`,
				result
			);
			return result;
		}
	}
}
