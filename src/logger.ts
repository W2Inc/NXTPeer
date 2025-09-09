//=============================================================================
// W2Wizard, 2018-2023
// See README and LICENSE files for details.
//=============================================================================

import { context } from ".";
import { color, stderr, stdout } from "bun";

//=============================================================================

namespace Logger {
	const RESET = "\x1b[0m";
	const LEVELS = ["debug", "info", "warn", "error"] as const;
	const LEVEL = (Bun.env["LOG_LEVEL"]?.toLowerCase() as Level) ?? LEVELS["0"];
	type Level = (typeof LEVELS)[number];

	const DateTime = {
		format: () => {
			const now = new Date();
			const day = now.getDate();
			const month = now.getMonth() + 1; // Months are 0-indexed
			const year = now.getFullYear();
			const hour = now.getHours().toString().padStart(2, '0');
			const minute = now.getMinutes().toString().padStart(2, '0');
			const second = now.getSeconds().toString().padStart(2, '0');

			return `${day}/${month}/${year} @ ${hour}:${minute}:${second}`;
		}
	};

	const enabled = (lvl: Level) => LEVELS.indexOf(lvl) >= LEVELS.indexOf(LEVEL);

	function log(
		lvl: Level,
		code: string,
		std: typeof stdout | typeof stderr,
		...args: any[]
	) {
		if (!enabled(lvl)) return;
		const argz = args
			.map((arg) =>
				typeof arg === "object" && arg !== null
					? JSON.stringify(arg, null, 2)
					: String(arg)
			)
			.join(" ");

		const now = DateTime.format();
		const log = lvl.toUpperCase().slice(0, 3);
		const requestId = context.getStore()?.id;

		const isTerminal = process.stdout.isTTY;
		const colorCode = isTerminal ? color(code, "ansi") : "";
		const resetCode = isTerminal ? RESET : "";

		std.write(
			`${colorCode}[${now}] [${log}]${
				requestId ? `: [${requestId}]` : ""
			}: ${argz}${resetCode}\n`
		);
	}

	export const dbg = (...args: any[]) =>
		log("debug", "#9b59b6", stdout, ...args);
	export const inf = (...args: any[]) =>
		log("info", "#2ecc71", stdout, ...args);
	export const wrn = (...args: any[]) =>
		log("warn", "#f39c12", stderr, ...args);
	export const err = (...args: any[]) =>
		log("error", "#e74c3c", stderr, ...args);
}

export default Logger;
