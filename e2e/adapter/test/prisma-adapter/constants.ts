export type Dialect = "sqlite" | "postgresql" | "mysql";

export const DATABASE_URLS: Record<Dialect, string> = {
	sqlite: "file:./dev.db",
	postgresql:
		process.env.BA_PRISMA_POSTGRES_URL ??
		"postgres://user:password@localhost:5434/better_auth",
	mysql:
		process.env.BA_PRISMA_MYSQL_URL ??
		"mysql://user:password@localhost:3308/better_auth",
};
