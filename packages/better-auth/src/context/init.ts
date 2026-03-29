import { BetterAuthError } from "@better-auth/core/error";
import { getKyselyDatabaseType } from "@better-auth/kysely-adapter";
import { getAdapter } from "../db/adapter-kysely";
import { getMigrations } from "../db/get-migration";
import { pushBetterAuthDatabaseSchema } from "../db/orm-adapter";
import { resolveDatabaseRuntime } from "../db/runtime-detection";
import type { BetterAuthOptions } from "../types";
import { createAuthContext } from "./create-context";

export const init = async (options: BetterAuthOptions) => {
	const adapter = await getAdapter(options);
	const runtime = resolveDatabaseRuntime(options.database);

	// Get database type using Kysely's dialect detection
	const getDatabaseType = (database: BetterAuthOptions["database"]) =>
		runtime?.dialect || runtime?.kind || getKyselyDatabaseType(database) || "unknown";

	// Use base context creation
	const ctx = await createAuthContext(adapter, options, getDatabaseType);

	// Add runMigrations with Kysely support
	ctx.runMigrations = async function () {
		if (runtime) {
			await pushBetterAuthDatabaseSchema(options);
			return;
		}
		// only run migrations if database is provided and it's not an adapter
		if (!options.database || "updateMany" in options.database) {
			throw new BetterAuthError(
				"Database is not provided or it's an adapter. Migrations are only supported with a database instance.",
			);
		}
		const { runMigrations } = await getMigrations(options);
		await runMigrations();
	};

	return ctx;
};
