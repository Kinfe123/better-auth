import {
	detectDatabaseRuntime,
	inspectDatabaseRuntime,
	type DatabaseRuntimeDetectionReport,
	type DetectedDatabaseRuntime,
} from "@farming-labs/orm";
import type { BetterAuthOptions } from "@better-auth/core";

export type ResolvedBetterAuthDatabaseRuntime =
	DetectedDatabaseRuntime<NonNullable<BetterAuthOptions["database"]>>;

export function resolveDatabaseRuntime(
	database: BetterAuthOptions["database"],
): ResolvedBetterAuthDatabaseRuntime | null {
	if (!database || typeof database === "function") {
		return null;
	}

	return detectDatabaseRuntime(
		database as NonNullable<BetterAuthOptions["database"]>,
	) as ResolvedBetterAuthDatabaseRuntime | null;
}

export function inspectResolvedDatabaseRuntime(
	database: BetterAuthOptions["database"],
): DatabaseRuntimeDetectionReport<NonNullable<BetterAuthOptions["database"]>> | null {
	if (!database || typeof database === "function") {
		return null;
	}

	return inspectDatabaseRuntime(
		database as NonNullable<BetterAuthOptions["database"]>,
	) as DatabaseRuntimeDetectionReport<
		NonNullable<BetterAuthOptions["database"]>
	>;
}
