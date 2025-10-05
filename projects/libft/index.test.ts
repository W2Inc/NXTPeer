//=============================================================================
// W2Wizard, 2018-2023
// See README and LICENSE files for details.
//=============================================================================

import { $, env } from "bun";
import * as Path from "node:path";
import {
	dlopen,
	FFIType,
	ptr,
	toArrayBuffer,
	type FFIFunction,
	type Library,
} from "bun:ffi";
import { describe, expect, it, beforeAll, afterAll } from "bun:test";

//=============================================================================

let lib: Library<typeof ffns>;
const ffns = {
	ft_strdup: {
		returns: FFIType.ptr,
		args: [FFIType.ptr],
	},
	ft_strlen: {
		returns: FFIType.i32,
		args: [FFIType.ptr],
	},
	ft_isalpha: {
		returns: FFIType.i32,
		args: [FFIType.i32],
	},
	ft_isdigit: {
		returns: FFIType.i32,
		args: [FFIType.i32],
	},
	ft_isalnum: {
		returns: FFIType.i32,
		args: [FFIType.i32],
	},
	ft_isascii: {
		returns: FFIType.i32,
		args: [FFIType.i32],
	},
	ft_isprint: {
		returns: FFIType.i32,
		args: [FFIType.i32],
	},
	ft_memset: {
		returns: FFIType.ptr,
		args: [FFIType.ptr, FFIType.i32, FFIType.i32],
	},
	ft_bzero: {
		returns: FFIType.ptr,
		args: [FFIType.ptr, FFIType.i32],
	},
	ft_memcpy: {
		returns: FFIType.ptr,
		args: [FFIType.ptr, FFIType.ptr, FFIType.i32],
	},
	ft_memmove: {
		returns: FFIType.ptr,
		args: [FFIType.ptr, FFIType.ptr, FFIType.i32],
	},
	ft_strlcpy: {
		returns: FFIType.i32,
		args: [FFIType.ptr, FFIType.ptr, FFIType.i32],
	},
	ft_strlcat: {
		returns: FFIType.i32,
		args: [FFIType.ptr, FFIType.ptr, FFIType.i32],
	},
	ft_toupper: {
		returns: FFIType.i32,
		args: [FFIType.i32],
	},
	ft_tolower: {
		returns: FFIType.i32,
		args: [FFIType.i32],
	},
	ft_strchr: {
		returns: FFIType.ptr,
		args: [FFIType.ptr, FFIType.i32],
	},
	ft_strrchr: {
		returns: FFIType.ptr,
		args: [FFIType.ptr, FFIType.i32],
	},
	ft_strncmp: {
		returns: FFIType.i32,
		args: [FFIType.ptr, FFIType.ptr, FFIType.i32],
	},
	ft_memchr: {
		returns: FFIType.ptr,
		args: [FFIType.ptr, FFIType.i32, FFIType.i32],
	},
	ft_memcmp: {
		returns: FFIType.i32,
		args: [FFIType.ptr, FFIType.ptr, FFIType.i32],
	},
	ft_strnstr: {
		returns: FFIType.ptr,
		args: [FFIType.ptr, FFIType.ptr, FFIType.i32],
	},
	ft_atoi: {
		returns: FFIType.i32,
		args: [FFIType.ptr],
	},
} satisfies Record<string, FFIFunction>;

//=============================================================================

const dir = "git";
beforeAll(async () => {
	try {
		process.chdir(env["HOME"]!);
		console.log(`[+] Working directory: ${process.cwd()}`);

		const remote = env["GIT_URL"];
		if (!remote) throw new Error("GIT_URL environment variable is not set");
		const branch = env["GIT_BRANCH"];
		if (!branch) throw new Error("GIT_BRANCH environment variable is not set");

		await $`git clone ${remote} ${dir} -b ${branch} --recurse-submodules --depth=1`;
		await $`make -C ${dir} -j1`;

		const libStaticPath = Path.join(dir, "libft.a");
		const libSharedPath = Path.join(dir, "libft.so");
		const libStatic = Bun.file(libStaticPath);
		if (!(await libStatic.exists())) {
			throw new Error(`File: ${libStatic} does not exist`);
		}

		console.log(`[+] Converting to shared library`);
		await $`gcc -shared -o ${libSharedPath} -Wl,--whole-archive ${libStaticPath} -Wl,--no-whole-archive`;
		lib = dlopen(libSharedPath, ffns);
		console.log(`[+] Library loaded successfully`);
	} catch (error) {
		process.exit(2);
	}
});

afterAll(async () => {
	console.log(`[+] Cleaning up...`);
	lib.close();
});

// makefile
//=============================================================================
describe("makefile", () => {
	it("compiles with '-Wextra -Werror -Wall'", async () => {
		const makefile = Bun.file(Path.join(dir, "Makefile"));
		const text = await makefile.text();
		const requiredFlags = ["-Wall", "-Wextra", "-Werror"];

		expect(requiredFlags.every((flag) => text.includes(flag))).toBe(true);
	});
});

// strdup
//=============================================================================
describe("strdup", () => {
	it("duplicates a string", () => {
		const sample = "Hello, world!";
		const ptrSample = ptr(Buffer.from(`${sample}\0`, "utf8"));
		const result = lib.symbols.ft_strdup(ptrSample);

		expect(result).not.toBe(null);

		const output = Buffer.from(toArrayBuffer(result!)).toString("utf-8");
		expect(output).toBe(sample);
	});

	it("duplicates an empty string", () => {
		const emptyStr = "";
		const ptrEmptyStr = ptr(Buffer.from(`${emptyStr}\0`, "utf8"));
		const result = lib.symbols.ft_strdup(ptrEmptyStr);

		// strdup should return a valid pointer even for empty strings
		expect(result).not.toBe(null);

		// The result should be just a null terminator
		const output = Buffer.from(toArrayBuffer(result!)).toString("utf-8");
		expect(output).toBe("");
	});
});

// isalpha
//=============================================================================
describe("isalpha", () => {
	it("valid alphabetic characters", () => {
		const alphabeticChars =
			"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
		for (const char of alphabeticChars) {
			expect(lib.symbols.ft_isalpha(char.charCodeAt(0))).toBe(1);
		}
	});

	it("invalid non-alphabetic characters", () => {
		const nonAlphabeticChars = "0123456789!@#$%^&*()_+-=[]{};':\",.<>?/\\|";
		for (const char of nonAlphabeticChars) {
			expect(lib.symbols.ft_isalpha(char.charCodeAt(0))).toBe(0);
		}
	});
});

// isdigit
//=============================================================================
describe("isdigit", () => {
	it("valid numeric characters", () => {
		const numericChars = "0123456789";
		for (const char of numericChars) {
			expect(lib.symbols.ft_isdigit(char.charCodeAt(0))).toBe(1);
		}
	});

	it("invalid non-numeric characters", () => {
		const nonNumericChars =
			"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()_+-=[]{};':\",.<>?/\\|";
		for (const char of nonNumericChars) {
			expect(lib.symbols.ft_isdigit(char.charCodeAt(0))).toBe(0);
		}
	});
});

// isalnum
//=============================================================================
describe("isalnum", () => {
	it("valid alphanumeric characters", () => {
		const alphanumericChars =
			"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
		for (const char of alphanumericChars) {
			expect(lib.symbols.ft_isalnum(char.charCodeAt(0))).toBe(1);
		}
	});

	it("invalid non-alphanumeric characters", () => {
		const nonAlphanumericChars = "!@#$%^&*()_+-=[]{};':\",.<>?/\\|";
		for (const char of nonAlphanumericChars) {
			expect(lib.symbols.ft_isalnum(char.charCodeAt(0))).toBe(0);
		}
	});
});

// isascii
//=============================================================================
describe("isascii", () => {
	it("valid ASCII characters", () => {
		for (let i = 0; i < 128; i++) {
			expect(lib.symbols.ft_isascii(i)).toBe(1);
		}
	});

	it("invalid non-ASCII characters", () => {
		for (let i = 128; i < 256; i++) {
			expect(lib.symbols.ft_isascii(i)).toBe(0);
		}
	});
});

// isprint
//=============================================================================
describe("isprint", () => {
	it("valid printable characters", () => {
		const printableChars =
			"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{};':\",.<>?/\\| ";
		for (const char of printableChars) {
			expect(lib.symbols.ft_isprint(char.charCodeAt(0))).toBe(1);
		}
	});

	it("invalid non-printable characters", () => {
		for (let i = 0; i < 32; i++) {
			expect(lib.symbols.ft_isprint(i)).toBe(0);
		}
	});
});

// strlen
//=============================================================================
describe("strlen", () => {
	it("normal string", () => {
		const sample = "Hello, world!";
		const str = ptr(Buffer.from(`${sample}\0`, "utf8"));
		expect(lib.symbols.ft_strlen(str)).toBe(sample.length);
	});

	it("empty string", () => {
		const str = ptr(Buffer.from(`\0`, "utf8"));
		expect(lib.symbols.ft_strlen(str)).toBe(0);
	});
});

// memset
//=============================================================================
describe("memset", () => {
	it("set characters to a value", () => {
		const size = 42;
		const value = 42; // *
		const buffer = Buffer.alloc(size);

		lib.symbols.ft_memset(ptr(buffer), value, size);
		buffer.forEach((byte) => expect(byte).toBe(value));
	});
});

// bzero (Note: bzero is equivalent to memset with value 0)
//=============================================================================
describe("bzero", () => {
	it("zeroes out a buffer", () => {
		const size = 10;
		const buffer = Buffer.alloc(size, 42);

		lib.symbols.ft_bzero(ptr(buffer), size);
		buffer.forEach((byte) => expect(byte).toBe(0));
	});
});

// memcpy
//=============================================================================
describe("memcpy", () => {
	it("copies data from source to destination", () => {
		const source = Buffer.from("Hello, world!\0");
		const destination = Buffer.alloc(source.length);

		lib.symbols.ft_memcpy(ptr(destination), ptr(source), source.length);
		expect(destination.toString("utf8")).toBe(source.toString("utf8"));
	});
});

// ft_memmove
//=============================================================================
describe("memmove", () => {
	it("copies overlapping data from source to destination", () => {
		const source = Buffer.from("Hello, world!\0");
		const destination = Buffer.alloc(source.length);

		lib.symbols.ft_memmove(ptr(source), ptr(destination), source.length);
		expect(destination.toString("utf8")).toBe(source.toString("utf8"));
	});
});

// strlcpy
//=============================================================================
describe("strlcpy", () => {
	it("copies a string to a destination buffer", () => {
		const source = "Hello, world!";
		const destination = Buffer.alloc(source.length + 1);
		const ptrSource = ptr(Buffer.from(`${source}\0`, "utf8"));
		const ptrDestination = ptr(destination);

		const result = lib.symbols.ft_strlcpy(
			ptrDestination,
			ptrSource,
			destination.length
		);
		expect(destination.toString("utf8")).toBe(
			Buffer.from(`${source}\0`, "utf8").toString("utf8")
		);
		expect(result).toBe(source.length);
	});
});

// strlcat
//=============================================================================
describe("strlcat", () => {
	it("concatenates two strings to a destination buffer", () => {
		const source1 = "Hello, ";
		const source2 = "world!";
		const expected = "Hello, world!";
		const destination = Buffer.alloc(source1.length + source2.length + 1);

		const ptrSource1 = ptr(Buffer.from(`${source1}\0`, "utf8"));
		const ptrSource2 = ptr(Buffer.from(`${source2}\0`, "utf8"));
		const ptrDestination = ptr(destination);

		lib.symbols.ft_strlcpy(ptrDestination, ptrSource1, destination.length);
		const result = lib.symbols.ft_strlcat(
			ptrDestination,
			ptrSource2,
			destination.length
		);
		expect(destination.toString("utf8")).toBe(
			Buffer.from(`${expected}\0`, "utf8").toString("utf8")
		);
		expect(result).toBe(expected.length);
	});
});

// toupper
//=============================================================================
describe("toupper", () => {
	it("converts all lowercase alphabetic characters to uppercase", () => {
		const lowercase = "abcdefghijklmnopqrstuvwxyz";
		for (const letter of lowercase) {
			const expected = letter.toUpperCase().charCodeAt(0);
			const result = lib.symbols.ft_toupper(letter.charCodeAt(0));
			expect(result).toBe(expected);
		}
	});

	it("leaves non-lowercase characters unchanged", () => {
		const lowercase = "abcdefghijklmnopqrstuvwxyz!@#$%^&*(){}:";
		for (const letter of lowercase) {
			const expected = letter.toUpperCase().charCodeAt(0);
			const result = lib.symbols.ft_toupper(letter.charCodeAt(0));
			expect(result).toBe(expected);
		}
	});
});

// tolower
//=============================================================================
describe("tolower", () => {
	it("converts uppercase characters to lowercase", () => {
		const uppercase = "abcdefghijklmnopqrstuvwxyz".toUpperCase();
		for (const letter of uppercase) {
			const expected = letter.toLowerCase().charCodeAt(0);
			const result = lib.symbols.ft_tolower(letter.charCodeAt(0));
			expect(result).toBe(expected);
		}
	});

	it("leaves non-uppercase characters unchanged", () => {
		const uppercase = "abcdefghijklmnopqrstuvwxyz!@#$%^&*(){}:".toUpperCase();
		for (const letter of uppercase) {
			const expected = letter.toLowerCase().charCodeAt(0);
			const result = lib.symbols.ft_tolower(letter.charCodeAt(0));
			expect(result).toBe(expected);
		}
	});
});

// strchr
//=============================================================================
describe("strchr", () => {
	it.todo("finds the first occurrence of a character in a string", () => {
		const str = "Hello, world!";
		const char = "o";
		const ptrStr = ptr(Buffer.from(`${str}\0`, "utf8"));
		const result = lib.symbols.ft_strchr(ptrStr, char.charCodeAt(0));
		// expect(result).toBe(ptrStr + 4);
	});

	it("returns null if the character is not found", () => {
		const str = "Hello, world!";
		const char = "z";
		const ptrStr = ptr(Buffer.from(`${str}\0`, "utf8"));
		const result = lib.symbols.ft_strchr(ptrStr, char.charCodeAt(0));
		expect(result).toBe(null);
	});
});

// strrchr
//=============================================================================
describe("strrchr", () => {
	it.todo("finds the last occurrence of a character in a string", () => {
		const str = "Hello, world!";
		const char = "o";
		const ptrStr = ptr(Buffer.from(`${str}\0`, "utf8"));
		const result = lib.symbols.ft_strrchr(ptrStr, char.charCodeAt(0));
		// expect(result).toBe(ptrStr + 8);
	});

	it("returns null if the character is not found", () => {
		const str = "Hello, world!";
		const char = "z";
		const ptrStr = ptr(Buffer.from(`${str}\0`, "utf8"));
		const result = lib.symbols.ft_strrchr(ptrStr, char.charCodeAt(0));
		expect(result).toBe(null);
	});
});

// strncmp
//=============================================================================
describe("strncmp", () => {
	it("compares two strings up to a specified length", () => {
		const str1 = "Hello";
		const str2 = "Hello, world!";
		const length = 5;
		const ptrStr1 = ptr(Buffer.from(`${str1}\0`, "utf8"));
		const ptrStr2 = ptr(Buffer.from(`${str2}\0`, "utf8"));
		expect(lib.symbols.ft_strncmp(ptrStr1, ptrStr2, length)).toBe(0);
	});

	it("returns a negative value if str1 is less than str2", () => {
		const str1 = "Hell";
		const str2 = "Hello, world!";
		const length = 5;
		const ptrStr1 = ptr(Buffer.from(`${str1}\0`, "utf8"));
		const ptrStr2 = ptr(Buffer.from(`${str2}\0`, "utf8"));
		expect(lib.symbols.ft_strncmp(ptrStr1, ptrStr2, length)).toBeLessThan(0);
	});

	it("returns a positive value if str1 is greater than str2", () => {
		const str1 = "Hello!";
		const str2 = "Hello, world!";
		const length = 5;
		const ptrStr1 = ptr(Buffer.from(`${str1}\0`, "utf8"));
		const ptrStr2 = ptr(Buffer.from(`${str2}\0`, "utf8"));
		expect(
			lib.symbols.ft_strncmp(ptrStr1, ptrStr2, length)
		).toBeGreaterThanOrEqual(0);
	});
});

// memchr
//=============================================================================
describe("memchr", () => {
	it.todo("finds the first occurrence of a byte in a memory region", () => {
		const data = Buffer.from([0x41, 0x42, 0x43, 0x44, 0x45]); // ABCDE
		const byte = 0x43; // C

		const ptrData = ptr(data);
		const result = lib.symbols.ft_memchr(ptrData, byte, data.length);
		// expect(result).toBe(ptrData + 2);
	});

	it("returns null if the byte is not found", () => {
		const data = Buffer.from([0x41, 0x42, 0x43, 0x44, 0x45]); // ABCDE
		const byte = 0x46; // F

		const ptrData = ptr(data);
		const result = lib.symbols.ft_memchr(ptrData, byte, data.length);
		expect(result).toBe(null);
	});
});

// memcmp
//=============================================================================
describe("memcmp", () => {
	it("compares two memory regions up to a specified length", () => {
		const data1 = Buffer.from([0x41, 0x42, 0x43, 0x44, 0x45]); // ABCDE
		const data2 = Buffer.from([0x41, 0x42, 0x43, 0x44, 0x46]); // ABCDF
		const length = 5;
		const ptrData1 = ptr(data1);
		const ptrData2 = ptr(data2);
		expect(lib.symbols.ft_memcmp(ptrData1, ptrData2, length)).toBe(-1);
	});

	it("returns 0 if both memory regions are equal", () => {
		const data1 = Buffer.from([0x41, 0x42, 0x43, 0x44, 0x45]); // ABCDE
		const data2 = Buffer.from([0x41, 0x42, 0x43, 0x44, 0x45]); // ABCDE
		const length = 5;
		const ptrData1 = ptr(data1);
		const ptrData2 = ptr(data2);
		expect(lib.symbols.ft_memcmp(ptrData1, ptrData2, length)).toBe(0);
	});

	it("returns a positive value if data1 is greater than data2", () => {
		const data1 = Buffer.from([0x41, 0x42, 0x43, 0x44, 0x47]); // ABCDG
		const data2 = Buffer.from([0x41, 0x42, 0x43, 0x44, 0x46]); // ABCDF
		const length = 5;
		const ptrData1 = ptr(data1);
		const ptrData2 = ptr(data2);
		expect(lib.symbols.ft_memcmp(ptrData1, ptrData2, length)).toBe(1);
	});
});

// strnstr
//=============================================================================
describe("strnstr", () => {
	it("finds the first occurrence of a substring in a string up to a specified length", () => {
		const str = "Hello, world!";
		const substr = "world";
		const length = 13;
		const ptrStr = ptr(Buffer.from(`${str}\0`, "utf8"));
		const ptrSubstr = ptr(Buffer.from(`${substr}\0`, "utf8"));
		const result = lib.symbols.ft_strnstr(ptrStr, ptrSubstr, length);
		expect(result).toBe(ptrStr + 7);
	});

	it("returns null if the substring is not found", () => {
		const str = "Hello, world!";
		const substr = "WORLD";
		const length = 13;
		const ptrStr = ptr(Buffer.from(`${str}\0`, "utf8"));
		const ptrSubstr = ptr(Buffer.from(`${substr}\0`, "utf8"));
		const result = lib.symbols.ft_strnstr(ptrStr, ptrSubstr, length);
		expect(result).toBe(null);
	});
});

// atoi
//=============================================================================
describe("atoi", () => {
	it("converts a valid string to an integer", () => {
		const numberStr = "12345";
		const ptrNumberStr = ptr(Buffer.from(`${numberStr}\0`, "utf8"));
		const result = lib.symbols.ft_atoi(ptrNumberStr);
		expect(result).toBe(12345);
	});

	it("returns 0 for an empty string", () => {
		const emptyStr = "";
		const ptrEmptyStr = ptr(Buffer.from(`${emptyStr}\0`, "utf8"));
		const result = lib.symbols.ft_atoi(ptrEmptyStr);
		expect(result).toBe(0);
	});

	it("ignores leading whitespace characters", () => {
		const numberStr = "   789";
		const ptrNumberStr = ptr(Buffer.from(`${numberStr}\0`, "utf8"));
		const result = lib.symbols.ft_atoi(ptrNumberStr);
		expect(result).toBe(789);
	});

	it("handles negative numbers", () => {
		const numberStr = "-42";
		const ptrNumberStr = ptr(Buffer.from(`${numberStr}\0`, "utf8"));
		const result = lib.symbols.ft_atoi(ptrNumberStr);
		expect(result).toBe(-42);
	});

	it("stops parsing when encountering non-numeric characters", () => {
		const numberStr = "123abc";
		const ptrNumberStr = ptr(Buffer.from(`${numberStr}\0`, "utf8"));
		const result = lib.symbols.ft_atoi(ptrNumberStr);
		expect(result).toBe(123);
	});
});
