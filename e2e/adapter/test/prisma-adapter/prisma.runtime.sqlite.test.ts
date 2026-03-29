import { fileURLToPath } from "node:url";
import type { BetterAuthOptions } from "@better-auth/core";
import {
	authFlowTestSuite,
	getNormalTestSuiteTests,
	normalTestSuite,
	numberIdTestSuite,
	testAdapter,
	transactionsTestSuite,
	uuidTestSuite,
} from "@better-auth/test-utils/adapter";
import {
	destroyPrismaClient,
	getPrismaClient,
	incrementMigrationCount,
} from "./get-prisma-client";
import {
	createBetterAuthDatabaseAdapterFactory,
} from "../../../../packages/better-auth/src/db/orm-adapter";
import { generateAuthConfigFile } from "./generate-auth-config";
import { generatePrismaSchema } from "./generate-prisma-schema";
import { pushPrismaSchema } from "./push-prisma-schema";

const dialect = "sqlite";
const workspaceName = "sqlite-runtime";
const databaseUrl = `file:${fileURLToPath(new URL("./runtime-dev.db", import.meta.url))}`;
const disableJoinTests = Object.fromEntries(
	Object.keys(getNormalTestSuiteTests({} as any))
		.filter((testName) => testName.includes("join"))
		.map((testName) => [testName, true]),
);

const { execute } = await testAdapter({
	adapter: async () => {
		const db = await getPrismaClient(dialect, {
			workspaceName,
			databaseUrl,
		});
		return createBetterAuthDatabaseAdapterFactory(
			db as BetterAuthOptions["database"],
		);
	},
	runMigrations: async (options: BetterAuthOptions) => {
		const db = await getPrismaClient(dialect, {
			workspaceName,
			databaseUrl,
		});
		const migrationCount = incrementMigrationCount(workspaceName);
		await generateAuthConfigFile(options);
		await generatePrismaSchema(
			options,
			db as any,
			migrationCount,
			dialect,
			workspaceName,
		);
		await destroyPrismaClient({
			migrationCount: migrationCount - 1,
			dialect,
			workspaceName,
		});
		await pushPrismaSchema(dialect, options, workspaceName, databaseUrl);
	},
	tests: [
		normalTestSuite({
			disableTests: disableJoinTests,
		}),
		transactionsTestSuite(),
		authFlowTestSuite(),
		numberIdTestSuite({
			disableTests: disableJoinTests,
		}),
		uuidTestSuite({
			disableTests: disableJoinTests,
		}),
	],
	prefixTests: `${dialect}-runtime`,
});

execute();
