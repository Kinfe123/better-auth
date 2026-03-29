import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import type { BetterAuthOptions } from "@better-auth/core";
import type { Dialect } from "./constants";
import { DATABASE_URLS } from "./constants";

// Cache previously generated client directories per schema content,
// so we can copy instead of running `prisma generate` again.
const lastGeneratedDir = new Map<string, string>();

function resolvePrismaCli() {
	const require = createRequire(import.meta.url);
	return join(
		dirname(require.resolve("prisma/package.json")),
		"build",
		"index.js",
	);
}

function getSqliteFilePath(databaseUrl: string, cwd: string) {
	const filePath = databaseUrl.replace(/^file:/, "");
	return filePath.startsWith("/") ? filePath : join(cwd, filePath);
}

async function resetSqliteDatabase(
	options: BetterAuthOptions,
	cwd: string,
	databaseUrl: string,
) {
	const dbPath = getSqliteFilePath(databaseUrl, cwd);
	try {
		fs.unlinkSync(dbPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
	}

	const [{ getMigrations }, { default: Database }] = await Promise.all([
		import("better-auth/db/migration"),
		import("better-sqlite3"),
	]);
	const database = new Database(dbPath);

	try {
		const { runMigrations } = await getMigrations({
			...options,
			database,
		});
		await runMigrations();
	} finally {
		database.close();
	}
}

export async function pushPrismaSchema(
	dialect: Dialect,
	options?: BetterAuthOptions,
	configName = dialect,
	databaseUrl = DATABASE_URLS[dialect],
) {
	const cwd = import.meta.dirname;
	const cli = `${process.execPath} ${resolvePrismaCli()}`;
	const configFileName = `prisma-config-${configName}.ts`;
	const configPath = join(cwd, configFileName);

	// Write a per-dialect prisma config file (Prisma v7 requires datasource url here)
	fs.writeFileSync(
		configPath,
		`import { defineConfig } from "prisma/config";
export default defineConfig({
	schema: "./schema-${configName}.prisma",
	datasource: { url: "${databaseUrl}" },
});
`,
		"utf-8",
	);

	const schemaPath = join(cwd, `schema-${configName}.prisma`);
	const schemaContent = fs.readFileSync(schemaPath, "utf-8");
	// Strip the output path (changes each iteration) for cache key comparison
	const schemaKey = schemaContent.replace(/\s*output\s*=\s*"[^"]*"\n?/, "");

	const outputMatch = schemaContent.match(/output\s*=\s*"([^"]*)"/);
	const outputDir = outputMatch ? join(cwd, outputMatch[1]) : null;

	try {
		if (dialect === "sqlite") {
			if (!options) {
				throw new Error(
					"SQLite Prisma schema setup requires Better Auth options.",
				);
			}
			await resetSqliteDatabase(options, cwd, databaseUrl);
		} else {
			execSync(
				`${cli} db push --force-reset --accept-data-loss --config ${configFileName}`,
				{
					stdio: "pipe",
					cwd,
					env: {
						...process.env,
						// Prisma v7 blocks --force-reset when it detects an AI agent; this env var grants consent.
						PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION:
							"I am running tests in a local development environment",
					},
				},
			);
		}

		if (outputDir) {
			const prevDir = lastGeneratedDir.get(schemaKey);
			if (prevDir && fs.existsSync(prevDir)) {
				fs.cpSync(prevDir, outputDir, { recursive: true });
			} else {
				execSync(`${cli} generate --config ${basename(configPath)}`, {
					stdio: "pipe",
					cwd,
				});
				lastGeneratedDir.set(schemaKey, outputDir);
			}
		}
	} catch (error) {
		const err = error as { stdout?: Buffer; stderr?: Buffer };
		console.error(
			`[pushPrismaSchema] failed for ${dialect}:`,
			err.stdout?.toString() || "",
			err.stderr?.toString() || "",
		);
		throw error;
	} finally {
		try {
			fs.unlinkSync(configPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
		}
	}
}
