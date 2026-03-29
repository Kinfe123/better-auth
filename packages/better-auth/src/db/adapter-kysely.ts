import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
import { getBaseAdapter } from "./adapter-base";
import { resolveDatabaseRuntime } from "./runtime-detection";

export async function getAdapter(
	options: BetterAuthOptions,
): Promise<DBAdapter<BetterAuthOptions>> {
	return getBaseAdapter(options, async (opts) => {
		if (resolveDatabaseRuntime(opts.database)) {
			const { createBetterAuthDatabaseAdapter } = await import("./orm-adapter");
			return createBetterAuthDatabaseAdapter(opts);
		}

		const { createKyselyAdapter } = await import("../adapters/kysely-adapter");
		const { kysely, databaseType, transaction } =
			await createKyselyAdapter(opts);
		if (!kysely) {
			throw new BetterAuthError("Failed to initialize database adapter");
		}
		const { kyselyAdapter } = await import("../adapters/kysely-adapter");
		return kyselyAdapter(kysely, {
			type: databaseType || "sqlite",
			debugLogs:
				opts.database && "debugLogs" in opts.database
					? opts.database.debugLogs
					: false,
			transaction: transaction,
		})(opts);
	});
}
