import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import type { Dialect } from "./constants";
import { DATABASE_URLS } from "./constants";

type PC = InstanceType<typeof PrismaClient>;

async function createAdapter(dialect: Dialect, databaseUrl?: string) {
	if (dialect === "sqlite") {
		const { PrismaBetterSqlite3 } = await import(
			"@prisma/adapter-better-sqlite3"
		);
		return new PrismaBetterSqlite3({
			url: databaseUrl || DATABASE_URLS[dialect],
		});
	}
	if (dialect === "postgresql") {
		const { PrismaPg } = await import("@prisma/adapter-pg");
		return new PrismaPg({
			connectionString: databaseUrl || DATABASE_URLS[dialect],
		});
	}

	const mysqlUrl = new URL(databaseUrl || DATABASE_URLS[dialect]);

	// mysql — use object config instead of URL string to avoid
	// mariadb driver hanging on URL-based connection strings.
	const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
	return new PrismaMariaDb({
		host: mysqlUrl.hostname,
		port: Number(mysqlUrl.port || 3306),
		user: decodeURIComponent(mysqlUrl.username),
		password: decodeURIComponent(mysqlUrl.password),
		database: mysqlUrl.pathname.replace(/^\//, ""),
	});
}

const clientMap = new Map<string, PC>();

function getMigrationCount(workspaceName: string) {
	return migrationCounts.get(workspaceName) ?? 0;
}

const migrationCounts = new Map<string, number>();
export const getPrismaClient = async (
	dialect: Dialect,
	options?: {
		workspaceName?: string;
		databaseUrl?: string;
	},
) => {
	const workspaceName = options?.workspaceName || dialect;
	const migrationCount = getMigrationCount(workspaceName);
	const clientKey = `${workspaceName}-${migrationCount}`;
	if (clientMap.has(clientKey)) {
		return clientMap.get(clientKey) as PC;
	}
	const { PrismaClient } = await import(
		fileURLToPath(
			new URL(
				migrationCount === 0
					? "./.tmp/prisma-client-base/client.ts"
					: `./.tmp/prisma-client-${workspaceName}-${migrationCount}/client.ts`,
				import.meta.url,
			),
		)
	);
	// For migrationCount === 0, @prisma/client is generated from base.prisma (sqlite).
	// Use sqlite adapter regardless of dialect since this client is only used for
	// schema generation, not actual database queries.
	const adapter =
		migrationCount === 0
			? await createAdapter("sqlite", options?.databaseUrl)
			: await createAdapter(dialect, options?.databaseUrl);
	const db = new PrismaClient({ adapter });
	clientMap.set(clientKey, db);
	return db as PC;
};

export const incrementMigrationCount = (workspaceName: string) => {
	const nextValue = getMigrationCount(workspaceName) + 1;
	migrationCounts.set(workspaceName, nextValue);
	return nextValue;
};

export const destroyPrismaClient = ({
	migrationCount,
	dialect,
	workspaceName,
}: {
	migrationCount: number;
	dialect: Dialect;
	workspaceName?: string;
}) => {
	const clientKey = `${workspaceName || dialect}-${migrationCount}`;
	const db = clientMap.get(clientKey);
	if (db) {
		return db.$disconnect().finally(() => {
			clientMap.delete(clientKey);
		});
	}
	clientMap.delete(clientKey);
	return Promise.resolve();
};
