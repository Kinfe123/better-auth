import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
	boolean as ormBoolean,
	belongsTo,
	datetime,
	defineSchema,
	hasMany,
	hasOne,
	id as ormId,
	integer,
	json,
	model as ormModel,
	renderDrizzleSchema,
	renderPrismaSchema,
	renderSafeSql,
	string as ormString,
	tableName,
	type AnyFieldBuilder,
	type AnyModelDefinition,
	type NativeRelationLoading,
	type OrmClient,
	type OrmDriverHandle,
	type SchemaDefinition,
	type TableInput,
} from "@farming-labs/orm";
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import {
	pushSchema,
	type CreateDriverFromRuntimeOptions,
} from "@farming-labs/orm-runtime/setup";
import type { BetterAuthOptions } from "@better-auth/core";
import { getAuthTables, type DBFieldAttribute } from "@better-auth/core/db";
import {
	createAdapterFactory,
	type AdapterFactoryCustomizeAdapterCreator,
	type AdapterFactoryOptions,
	type CleanedWhere,
	type CustomAdapter,
	type DBAdapter,
	type DBAdapterInstance,
	type DBAdapterSchemaCreation,
	type JoinConfig,
} from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
import {
	inspectResolvedDatabaseRuntime,
	resolveDatabaseRuntime,
	type ResolvedBetterAuthDatabaseRuntime,
} from "./runtime-detection";

export type NativeJoinSupport = "none" | "partial" | "full";

export interface BetterAuthDatabaseCapabilities {
	numericIds: boolean;
	json: boolean;
	dates: boolean;
	booleans: boolean;
	transactions: boolean;
	joins: NativeJoinSupport;
}

export interface BetterAuthDatabaseBridge {
	capabilities: BetterAuthDatabaseCapabilities;
	create(args: {
		model: string;
		data: Record<string, any>;
		select?: string[];
	}): Promise<Record<string, any>>;
	findOne(args: {
		model: string;
		where?: CleanedWhere[];
		select?: string[];
		sortBy?: { field: string; direction: "asc" | "desc" };
		join?: JoinConfig;
	}): Promise<Record<string, any> | null>;
	findMany(args: {
		model: string;
		where?: CleanedWhere[];
		limit?: number;
		offset?: number;
		sortBy?: { field: string; direction: "asc" | "desc" };
		select?: string[];
		join?: JoinConfig;
	}): Promise<Record<string, any>[]>;
	update(args: {
		model: string;
		where: CleanedWhere[];
		update: Record<string, any>;
		select?: string[];
	}): Promise<Record<string, any> | null>;
	updateMany(args: {
		model: string;
		where: CleanedWhere[];
		update: Record<string, any>;
	}): Promise<number>;
	delete(args: {
		model: string;
		where: CleanedWhere[];
	}): Promise<Record<string, any> | null>;
	deleteMany(args: { model: string; where: CleanedWhere[] }): Promise<number>;
	count(args: { model: string; where?: CleanedWhere[] }): Promise<number>;
	transaction?<T>(run: (db: BetterAuthDatabaseBridge) => Promise<T>): Promise<T>;
}

type BetterAuthOrmSchema = SchemaDefinition<Record<string, AnyModelDefinition>>;
type BetterAuthOrmClient = OrmClient<BetterAuthOrmSchema, OrmDriverHandle>;

type BetterAuthOrmRuntime = {
	schema: BetterAuthOrmSchema;
	orm: BetterAuthOrmClient;
	runtime: ResolvedBetterAuthDatabaseRuntime;
};

type BetterAuthRuntimeSetupOverrides = Pick<
	CreateDriverFromRuntimeOptions<
		BetterAuthOrmSchema,
		NonNullable<BetterAuthOptions["database"]>
	>,
	"databaseName" | "prisma" | "drizzle" | "mongo" | "mongoose"
>;

const execFileAsync = promisify(execFile);

type SortBy = {
	field: string;
	direction: "asc" | "desc";
};

type UnsupportedWhereMode = "all" | "and-only" | "none";

function hasFunction<TName extends string>(
	value: unknown,
	name: TName,
): value is Record<TName, (...args: any[]) => unknown> {
	return !!value && typeof value === "object" && typeof (value as any)[name] === "function";
}

function getUnsupportedRuntimeError(
	runtime: ResolvedBetterAuthDatabaseRuntime,
) {
	if (runtime.kind === "mongo" && runtime.source === "client") {
		return new BetterAuthError(
			'Raw MongoClient instances are not supported yet. Pass `client.db("name")` to `betterAuth({ database })` instead.',
		);
	}

	if (runtime.kind === "prisma" && !runtime.dialect) {
		return new BetterAuthError(
			"Raw Prisma runtime support currently expects sqlite, postgres, or mysql providers.",
		);
	}

	if (
		(runtime.kind === "drizzle" ||
			runtime.kind === "kysely" ||
			runtime.kind === "sql") &&
		!runtime.dialect
	) {
		return new BetterAuthError(
			`Could not determine the SQL dialect for the detected ${runtime.kind} runtime.`,
		);
	}

	return null;
}

function assertSupportedRuntime(runtime: ResolvedBetterAuthDatabaseRuntime) {
	const error = getUnsupportedRuntimeError(runtime);
	if (error) {
		throw error;
	}
}

function runtimeSupportsTransactions(runtime: ResolvedBetterAuthDatabaseRuntime) {
	if (runtime.kind === "prisma") {
		return hasFunction(runtime.client, "$transaction");
	}

	if (runtime.kind === "mongo") {
		return (
			hasFunction(runtime.client, "startSession") ||
			hasFunction((runtime.client as Record<string, unknown> | undefined)?.client, "startSession")
		);
	}

	if (runtime.kind === "mongoose") {
		return hasFunction(runtime.client, "startSession");
	}

	return true;
}

function runtimeSupportsGeneratedNumericIds(
	runtime: ResolvedBetterAuthDatabaseRuntime,
) {
	return runtime.kind !== "mongo" && runtime.kind !== "mongoose";
}

function runtimeSupportsNativeJson(
	runtime: ResolvedBetterAuthDatabaseRuntime,
) {
	if (runtime.kind === "mongo" || runtime.kind === "mongoose") {
		return true;
	}

	return runtime.dialect === "postgres";
}

function runtimeSupportsNativeArrays(
	runtime: ResolvedBetterAuthDatabaseRuntime,
) {
	if (runtime.kind === "mongo" || runtime.kind === "mongoose") {
		return true;
	}

	return runtime.dialect === "postgres";
}

function toJoinSupport(mode: NativeRelationLoading): NativeJoinSupport {
	return mode === "full" ? "full" : "none";
}

function toComparableValue(value: unknown) {
	if (value instanceof Date) {
		return value.getTime();
	}
	return value;
}

function normalizeCaseValue(value: unknown, mode: CleanedWhere["mode"]) {
	if (mode !== "insensitive") {
		return value;
	}
	if (typeof value === "string") {
		return value.toLowerCase();
	}
	if (Array.isArray(value)) {
		return value.map((entry) =>
			typeof entry === "string" ? entry.toLowerCase() : entry,
		);
	}
	return value;
}

function conditionMatches(row: Record<string, any>, condition: CleanedWhere) {
	const rawValue = row[condition.field];
	const value = normalizeCaseValue(rawValue, condition.mode);
	const expected = normalizeCaseValue(condition.value, condition.mode);
	const comparableValue = toComparableValue(value) as any;
	const comparableExpected = toComparableValue(expected) as any;

	switch (condition.operator) {
		case "eq":
			return comparableValue === comparableExpected;
		case "ne":
			return comparableValue !== comparableExpected;
		case "lt":
			return comparableValue < comparableExpected;
		case "lte":
			return comparableValue <= comparableExpected;
		case "gt":
			return comparableValue > comparableExpected;
		case "gte":
			return comparableValue >= comparableExpected;
		case "in":
			return Array.isArray(expected)
				? expected.some(
						(entry) =>
							toComparableValue(entry) === toComparableValue(value),
					)
				: false;
		case "not_in":
			return Array.isArray(expected)
				? expected.every(
						(entry) =>
							toComparableValue(entry) !== toComparableValue(value),
					)
				: true;
		case "contains":
			return typeof value === "string" && typeof expected === "string"
				? value.includes(expected)
				: false;
		case "starts_with":
			return typeof value === "string" && typeof expected === "string"
				? value.startsWith(expected)
				: false;
		case "ends_with":
			return typeof value === "string" && typeof expected === "string"
				? value.endsWith(expected)
				: false;
		default:
			return false;
	}
}

function matchesWhere(row: Record<string, any>, where?: CleanedWhere[]) {
	if (!where || where.length === 0) {
		return true;
	}

	const andConditions = where.filter(
		(condition) => condition.connector === "AND",
	);
	const orConditions = where.filter(
		(condition) => condition.connector === "OR",
	);

	const andMatches = andConditions.every((condition) =>
		conditionMatches(row, condition),
	);
	if (!andMatches) {
		return false;
	}

	if (orConditions.length === 0) {
		return true;
	}

	return orConditions.some((condition) => conditionMatches(row, condition));
}

function sortRows(rows: Record<string, any>[], sortBy?: SortBy) {
	if (!sortBy?.field) {
		return rows;
	}

	return [...rows].sort((left, right) => {
		const a = toComparableValue(left[sortBy.field]);
		const b = toComparableValue(right[sortBy.field]);
		if (a === b) return 0;
		if (a === undefined || a === null) return 1;
		if (b === undefined || b === null) return -1;
		const direction = sortBy.direction === "desc" ? -1 : 1;
		return a > b ? direction : -direction;
	});
}

function isOrmSupportedCondition(condition: CleanedWhere) {
	if (condition.mode === "insensitive") {
		return false;
	}

	return (
		condition.operator === "eq" ||
		condition.operator === "ne" ||
		condition.operator === "lt" ||
		condition.operator === "lte" ||
		condition.operator === "gt" ||
		condition.operator === "gte" ||
		condition.operator === "in" ||
		condition.operator === "not_in" ||
		condition.operator === "contains"
	);
}

function getUnsupportedWhereMode(where?: CleanedWhere[]): UnsupportedWhereMode {
	if (!where?.length) {
		return "none";
	}

	const unsupported = where.filter((condition) => !isOrmSupportedCondition(condition));
	if (unsupported.length === 0) {
		return "none";
	}

	return unsupported.some((condition) => condition.connector === "OR")
		? "all"
		: "and-only";
}

function buildOrmCondition(condition: CleanedWhere) {
	switch (condition.operator) {
		case "eq":
			return {
				[condition.field]: condition.value,
			};
		case "ne":
			return {
				[condition.field]: {
					not: condition.value,
				},
			};
		case "lt":
		case "lte":
		case "gt":
		case "gte":
		case "contains":
		case "in":
			return {
				[condition.field]: {
					[condition.operator]: condition.value,
				},
			};
		case "not_in":
			return {
				NOT: {
					[condition.field]: {
						in: condition.value,
					},
				},
			};
		default:
			return null;
	}
}

function buildOrmWhere(
	where?: CleanedWhere[],
	mode: UnsupportedWhereMode = getUnsupportedWhereMode(where),
) {
	if (!where?.length) {
		return undefined;
	}

	const source =
		mode === "none"
			? where
			: where.filter(
					(condition) =>
						condition.connector === "AND" && isOrmSupportedCondition(condition),
				);

	if (source.length === 0) {
		return undefined;
	}

	const andConditions = source
		.filter((condition) => condition.connector === "AND")
		.map(buildOrmCondition)
		.filter(Boolean);
	const orConditions =
		mode === "none"
			? source
					.filter((condition) => condition.connector === "OR")
					.map(buildOrmCondition)
					.filter(Boolean)
			: [];

	if (orConditions.length === 0) {
		if (andConditions.length === 0) {
			return undefined;
		}
		if (andConditions.length === 1) {
			return andConditions[0];
		}
		return {
			AND: andConditions,
		};
	}

	if (andConditions.length === 0) {
		return {
			OR: orConditions,
		};
	}

	return {
		AND: [...andConditions, { OR: orConditions }],
	};
}

function buildSelectShape(select?: string[]) {
	if (!select?.length) {
		return undefined;
	}

	return Object.fromEntries(select.map((field) => [field, true]));
}

function applySelect(
	row: Record<string, any>,
	select?: string[],
): Record<string, any> {
	if (!select?.length) {
		return row;
	}

	return Object.fromEntries(select.map((field) => [field, row[field]]));
}

function applySelectMany(
	rows: Record<string, any>[],
	select?: string[],
): Record<string, any>[] {
	if (!select?.length) {
		return rows;
	}

	return rows.map((row) => applySelect(row, select));
}

function resolveTableInput(
	modelName: string,
	runtime?: ResolvedBetterAuthDatabaseRuntime | null,
): TableInput {
	if (!modelName.includes(".")) {
		return modelName;
	}

	const [schemaName, tableNameValue, ...rest] = modelName.split(".");
	if (!schemaName || !tableNameValue || rest.length) {
		throw new BetterAuthError(
			`Invalid schema-qualified model name "${modelName}". Expected "schema.table".`,
		);
	}

	if (runtime?.dialect && runtime.dialect !== "postgres") {
		throw new BetterAuthError(
			`Schema-qualified model name "${modelName}" requires a PostgreSQL runtime.`,
		);
	}

	return tableName(tableNameValue, { schema: schemaName });
}

function applyFieldDefault(
	builder: AnyFieldBuilder,
	field: DBFieldAttribute | undefined,
) {
	if (!field || field.defaultValue === undefined) {
		return builder;
	}

	if (typeof field.defaultValue === "function") {
		if (field.type === "date") {
			return builder.defaultNow();
		}
		return builder;
	}

	if (
		field.type === "json" ||
		field.type === "string[]" ||
		field.type === "number[]" ||
		Array.isArray(field.type)
	) {
		return builder;
	}

	return builder.default(field.defaultValue as any);
}

function createFieldBuilder(
	type: DBFieldAttribute | undefined,
	options: {
		useNumberId: boolean;
	},
) {
	const fieldType = type?.type;
	const referencesId = type?.references?.field === "id";

	let builder: AnyFieldBuilder;
	if (fieldType === "number" || (options.useNumberId && referencesId)) {
		builder = integer();
	} else if (fieldType === "boolean") {
		builder = ormBoolean();
	} else if (fieldType === "date") {
		builder = datetime();
	} else if (
		fieldType === "json" ||
		fieldType === "string[]" ||
		fieldType === "number[]" ||
		Array.isArray(fieldType)
	) {
		builder = json();
	} else {
		builder = ormString();
	}

	builder = applyFieldDefault(builder, type);

	if (type?.required === false) {
		builder = builder.nullable();
	}
	if (type?.unique) {
		builder = builder.unique();
	}
	if (type?.fieldName) {
		builder = builder.map(type.fieldName);
	}
	if (type?.references) {
		builder = builder.references(`${type.references.model}.${type.references.field}`);
	}

	return builder;
}

function buildCompoundUniqueConstraints(
	defaultModelName: string,
	table: ReturnType<typeof getAuthTables>[string],
) {
	const uniqueConstraints: string[][] = [];

	if (defaultModelName === "account") {
		const providerIdField = table.fields.providerId
			? table.fields.providerId.fieldName || "providerId"
			: null;
		const accountIdField = table.fields.accountId
			? table.fields.accountId.fieldName || "accountId"
			: null;

		if (providerIdField && accountIdField) {
			uniqueConstraints.push([providerIdField, accountIdField]);
		}
	}

	return uniqueConstraints;
}

function buildIndexConstraints(
	table: ReturnType<typeof getAuthTables>[string],
) {
	return Object.entries(table.fields)
		.filter(([, field]) => field.index)
		.map(([fieldKey, field]) => [field.fieldName || fieldKey]);
}

export function createBetterAuthOrmSchema(
	options: BetterAuthOptions,
	runtime?: ResolvedBetterAuthDatabaseRuntime | null,
): BetterAuthOrmSchema {
	const tables = getAuthTables(options);
	const useNumberId = options.advanced?.database?.generateId === "serial";

	if (useNumberId && runtime && !runtimeSupportsGeneratedNumericIds(runtime)) {
		throw new BetterAuthError(
			`The detected ${runtime.kind} runtime does not support generated numeric ids.`,
		);
	}

	const relations: Record<string, Record<string, any>> = {};
	const models: Record<string, AnyModelDefinition> = {};

	for (const [defaultModelName, table] of Object.entries(tables)) {
		const modelName = table.modelName || defaultModelName;
		relations[modelName] = relations[modelName] ?? {};
	}

	for (const [defaultModelName, table] of Object.entries(tables)) {
		const modelName = table.modelName || defaultModelName;
		for (const [fieldKey, field] of Object.entries(table.fields)) {
			const actualFieldName = field.fieldName || fieldKey;
			if (!field.references?.model) {
				continue;
			}

			const targetModel = field.references.model;
			if (!relations[modelName]![targetModel]) {
				relations[modelName]![targetModel] = belongsTo(targetModel, {
					foreignKey: actualFieldName,
				});
			}

			if (!relations[targetModel]) {
				relations[targetModel] = {};
			}
			if (!relations[targetModel]![modelName]) {
				relations[targetModel]![modelName] = field.unique
					? hasOne(modelName, {
							foreignKey: actualFieldName,
						})
					: hasMany(modelName, {
							foreignKey: actualFieldName,
						});
			}
		}
	}

	for (const [defaultModelName, table] of Object.entries(tables)) {
		const modelName = table.modelName || defaultModelName;
		const fields: Record<string, AnyFieldBuilder> = {};

		fields.id = useNumberId
			? ormId({
					type: "integer",
					generated: "increment",
				})
			: ormId();

		for (const [fieldKey, field] of Object.entries(table.fields)) {
			fields[field.fieldName || fieldKey] = createFieldBuilder(field, {
				useNumberId,
			});
		}

		const unique = buildCompoundUniqueConstraints(defaultModelName, table);
		const indexes = buildIndexConstraints(table);

		models[modelName] = ormModel({
			table: resolveTableInput(modelName, runtime),
			fields,
			relations: relations[modelName] ?? {},
			constraints: {
				unique: unique as [string, ...string[]][],
				indexes: indexes as [string, ...string[]][],
			},
		});
	}

	return defineSchema(models);
}

function getResolvedRuntimeOrThrow(
	database: BetterAuthOptions["database"],
) {
	const runtime = resolveDatabaseRuntime(database);
	if (runtime) {
		assertSupportedRuntime(runtime);
		return runtime;
	}

	const report = inspectResolvedDatabaseRuntime(database);
	if (report) {
		throw new BetterAuthError(
			`${report.summary}${report.hint ? ` ${report.hint}` : ""}`,
		);
	}

	throw new BetterAuthError("Unsupported raw database runtime.");
}

function getRuntimeSetupInput(
	options: BetterAuthOptions,
	runtime: ResolvedBetterAuthDatabaseRuntime,
	overrides?: BetterAuthRuntimeSetupOverrides,
) {
	const prisma =
		runtime.kind === "prisma"
			? {
					...(process.env.DATABASE_URL
						? {
								databaseUrl: process.env.DATABASE_URL,
							}
						: {}),
					...(overrides?.prisma ?? {}),
				}
			: overrides?.prisma;

	return {
		schema: createBetterAuthOrmSchema(options, runtime),
		client: runtime.client,
		runtime,
		dialect: runtime.dialect,
		databaseName: overrides?.databaseName,
		prisma:
			prisma && Object.keys(prisma).length > 0
				? prisma
				: undefined,
		drizzle: overrides?.drizzle,
		mongo: overrides?.mongo,
		mongoose: overrides?.mongoose,
	};
}

function requireSqlDialect(
	runtime: ResolvedBetterAuthDatabaseRuntime,
): "sqlite" | "postgres" | "mysql" {
	if (!runtime.dialect) {
		throw new BetterAuthError(
			`Could not determine the SQL dialect for the detected ${runtime.kind} runtime.`,
		);
	}

	return runtime.dialect;
}

function createSchemaArtifact(
	options: BetterAuthOptions,
	runtime: ResolvedBetterAuthDatabaseRuntime,
	file?: string,
): DBAdapterSchemaCreation {
	const schema = createBetterAuthOrmSchema(options, runtime);

	switch (runtime.kind) {
		case "prisma": {
			const dialect = requireSqlDialect(runtime);
			return {
				code: renderPrismaSchema(schema, {
					provider:
						dialect === "postgres"
							? "postgresql"
							: dialect === "mysql"
								? "mysql"
								: "sqlite",
				}),
				path: file || "prisma/schema.prisma",
			};
		}
		case "drizzle": {
			const dialect = requireSqlDialect(runtime);
			return {
				code: renderDrizzleSchema(schema, {
					dialect:
						dialect === "postgres"
							? "pg"
							: dialect === "mysql"
								? "mysql"
								: "sqlite",
				}),
				path: file || "src/db/schema.ts",
			};
		}
		case "kysely":
		case "sql": {
			return {
				code: renderSafeSql(schema, {
					dialect: requireSqlDialect(runtime),
				}),
				path: file || "better-auth.sql",
			};
		}
		case "mongo":
		case "mongoose":
			throw new BetterAuthError(
				`Schema generation is not supported yet for raw ${runtime.kind} runtimes.`,
			);
	}
}

function withDatabaseEnv(rendered: string) {
	return rendered.replace(/url\s+=\s+.+/, `url      = env("DATABASE_URL")`);
}

async function pushPrismaSchemaWithCli(args: {
	schema: BetterAuthOrmSchema;
	runtime: ResolvedBetterAuthDatabaseRuntime;
	overrides?: BetterAuthRuntimeSetupOverrides;
}) {
	const dialect = requireSqlDialect(args.runtime);
	const databaseUrl =
		args.overrides?.prisma?.databaseUrl ?? process.env.DATABASE_URL;

	if (!databaseUrl) {
		throw new BetterAuthError(
			'Raw Prisma schema push requires a database URL. Set `DATABASE_URL` or pass `prisma.databaseUrl`.',
		);
	}

	const provider =
		dialect === "postgres"
			? "postgresql"
			: dialect === "mysql"
				? "mysql"
				: "sqlite";
	const packageRoot = args.overrides?.prisma?.packageRoot ?? process.cwd();
	const tempDir = await mkdtemp(path.join(tmpdir(), "better-auth-prisma-"));
	const schemaPath = path.join(tempDir, "schema.prisma");

	try {
		await writeFile(
			schemaPath,
			withDatabaseEnv(
				renderPrismaSchema(args.schema, {
					provider,
				}),
			),
			"utf8",
		);
		await execFileAsync(
			"pnpm",
			[
				"exec",
				"prisma",
				"db",
				"push",
				"--schema",
				schemaPath,
				"--url",
				databaseUrl,
			],
			{
				cwd: packageRoot,
				env: {
					...process.env,
					DATABASE_URL: databaseUrl,
				},
			},
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

function assertNoJoins(join?: JoinConfig) {
	if (join && Object.keys(join).length > 0) {
		throw new BetterAuthError(
			"Experimental joins are not supported yet for raw runtime clients.",
		);
	}
}

function createBridgeFromOrm(
	schema: BetterAuthOrmSchema,
	orm: BetterAuthOrmClient,
	allowTransactions = true,
): BetterAuthDatabaseBridge {
	const getClient = (model: string) => {
		const client = (orm as Record<string, any>)[model];
		if (!client) {
			throw new BetterAuthError(
				`Model "${model}" is not available on the Farming ORM bridge.`,
			);
		}
		return client;
	};

	const getDependents = (modelName: string) => {
		return Object.entries(schema.models).flatMap(([candidateModel, definition]) =>
			(Object.entries(definition.fields) as [string, AnyFieldBuilder][])
				.map(([fieldName, builder]) => {
					const reference = builder.config.references;
					if (!reference) {
						return null;
					}

					const [targetModel, targetField] = reference.split(".");
					if (!targetModel || !targetField || targetModel !== modelName) {
						return null;
					}

					return {
						model: candidateModel,
						field: fieldName,
						targetField,
					};
				})
				.filter(
					(
						value,
					): value is {
						model: string;
						field: string;
						targetField: string;
					} => !!value,
				),
		);
	};

	const cascadeDeleteDependents = async (
		currentBridge: BetterAuthDatabaseBridge,
		modelName: string,
		rows: Record<string, any>[],
	) => {
		for (const dependent of getDependents(modelName)) {
			const targetValues = rows
				.map((row) => row[dependent.targetField])
				.filter((value) => value !== undefined && value !== null);

			if (!targetValues.length) {
				continue;
			}

			const dependentRows = await currentBridge.findMany({
				model: dependent.model,
				where: [
					{
						field: dependent.field,
						value: targetValues.length === 1 ? targetValues[0] : targetValues,
						operator: targetValues.length === 1 ? "eq" : "in",
						connector: "AND",
						mode: "sensitive",
					},
				],
			});

			for (const dependentRow of dependentRows) {
				await currentBridge.delete({
					model: dependent.model,
					where: [
						{
							field: "id",
							value: dependentRow.id,
							operator: "eq",
							connector: "AND",
							mode: "sensitive",
						},
					],
				});
			}
		}
	};

	const readRows = async (args: {
		model: string;
		where?: CleanedWhere[];
		select?: string[];
		sortBy?: SortBy;
		offset?: number;
		limit?: number;
		join?: JoinConfig;
	}) => {
		assertNoJoins(args.join);

		const unsupportedWhereMode = getUnsupportedWhereMode(args.where);
		const usePostFilter = unsupportedWhereMode !== "none";
		const rows = (await getClient(args.model).findMany({
			where: buildOrmWhere(args.where, unsupportedWhereMode),
			orderBy: args.sortBy
				? {
						[args.sortBy.field]: args.sortBy.direction,
					}
				: undefined,
			skip: usePostFilter ? undefined : args.offset,
			take: usePostFilter ? undefined : args.limit,
		})) as Record<string, any>[];

		if (!usePostFilter) {
			return applySelectMany(rows, args.select);
		}

		const filtered = sortRows(
			rows.filter((row) => matchesWhere(row, args.where)),
			args.sortBy,
		);
		return applySelectMany(
			filtered.slice(
				args.offset ?? 0,
				args.limit === undefined
					? undefined
					: (args.offset ?? 0) + args.limit,
			),
			args.select,
		);
	};

	const capabilities = orm.$driver.capabilities;
	const bridge: BetterAuthDatabaseBridge = {
		capabilities: {
			numericIds: runtimeSupportsGeneratedNumericIds({
				kind: orm.$driver.kind as ResolvedBetterAuthDatabaseRuntime["kind"],
				client: orm.$driver.client,
				dialect: orm.$driver.dialect as ResolvedBetterAuthDatabaseRuntime["dialect"],
				source: "client",
			} as ResolvedBetterAuthDatabaseRuntime) &&
				capabilities.numericIds === "generated",
			json: capabilities.supportsJSON,
			dates: capabilities.supportsDates,
			booleans: capabilities.supportsBooleans,
			transactions: capabilities.supportsTransactions,
			joins: toJoinSupport(capabilities.nativeRelationLoading),
		},
		async create(args) {
			assertNoJoins();
			const row = (await getClient(args.model).create({
				data: args.data,
			})) as Record<string, any>;
			return applySelect(row, args.select);
		},
		async findOne(args) {
			const rows = await readRows({
				model: args.model,
				where: args.where,
				select: args.select,
				sortBy: args.sortBy,
				limit: 1,
				join: args.join,
			});
			return rows[0] ?? null;
		},
		findMany(args) {
			return readRows({
				model: args.model,
				where: args.where,
				select: args.select,
				sortBy: args.sortBy,
				offset: args.offset,
				limit: args.limit,
				join: args.join,
			});
		},
		async update(args) {
			const current = await bridge.findOne({
				model: args.model,
				where: args.where,
			});
			if (!current) {
				return null;
			}

			const row = (await getClient(args.model).update({
				where: {
					id: current.id,
				},
				data: args.update,
			})) as Record<string, any> | null;
			return row ? applySelect(row, args.select) : null;
		},
		async updateMany(args) {
			if (!args.where?.length) {
				const rows = await bridge.findMany({
					model: args.model,
				});
				if (rows.length === 0) {
					return 0;
				}

				return bridge.transaction
					? bridge.transaction((tx) => tx.updateMany(args))
					: (async () => {
							let updated = 0;
							for (const row of rows) {
								const result = await bridge.update({
									model: args.model,
									where: [
										{
											field: "id",
											value: row.id,
											operator: "eq",
											connector: "AND",
											mode: "sensitive",
										},
									],
									update: args.update,
								});
								if (result) {
									updated++;
								}
							}
							return updated;
						})();
			}

			const unsupportedWhereMode = getUnsupportedWhereMode(args.where);
			if (unsupportedWhereMode === "none") {
				return getClient(args.model).updateMany({
					where: buildOrmWhere(args.where),
					data: args.update,
				});
			}

			const rows = await bridge.findMany({
				model: args.model,
				where: args.where,
			});
			if (rows.length === 0) {
				return 0;
			}

			return bridge.transaction
				? bridge.transaction(async (tx) => {
						let updated = 0;
						for (const row of rows) {
							const result = await tx.update({
								model: args.model,
								where: [
									{
										field: "id",
										value: row.id,
										operator: "eq",
										connector: "AND",
										mode: "sensitive",
									},
								],
								update: args.update,
							});
							if (result) {
								updated++;
							}
						}
						return updated;
					})
				: (async () => {
						let updated = 0;
						for (const row of rows) {
							const result = await bridge.update({
								model: args.model,
								where: [
									{
										field: "id",
										value: row.id,
										operator: "eq",
										connector: "AND",
										mode: "sensitive",
									},
								],
								update: args.update,
							});
							if (result) {
								updated++;
							}
						}
						return updated;
					})();
		},
		async delete(args) {
			if (allowTransactions && bridge.transaction) {
				return bridge.transaction((tx) => tx.delete(args));
			}

			const current = await bridge.findOne({
				model: args.model,
				where: args.where,
			});
			if (!current) {
				return null;
			}

			await cascadeDeleteDependents(bridge, args.model, [current]);

			await getClient(args.model).delete({
				where: {
					id: current.id,
				},
			});
			return current;
		},
		async deleteMany(args) {
			if (allowTransactions && bridge.transaction) {
				return bridge.transaction((tx) => tx.deleteMany(args));
			}

			const rows = await bridge.findMany({
				model: args.model,
				where: args.where,
			});
			if (!rows.length) {
				return 0;
			}

			for (const row of rows) {
				await bridge.delete({
					model: args.model,
					where: [
						{
							field: "id",
							value: row.id,
							operator: "eq",
							connector: "AND",
							mode: "sensitive",
						},
					],
				});
			}

			return rows.length;
		},
		async count(args) {
			const unsupportedWhereMode = getUnsupportedWhereMode(args.where);
			if (unsupportedWhereMode === "none") {
				return getClient(args.model).count({
					where: buildOrmWhere(args.where),
				});
			}

			const rows = await bridge.findMany({
				model: args.model,
				where: args.where,
			});
			return rows.length;
		},
	};

	if (allowTransactions && capabilities.supportsTransactions) {
		bridge.transaction = async <T>(
			run: (db: BetterAuthDatabaseBridge) => Promise<T>,
		) => {
			return orm.transaction(async (tx) => run(createBridgeFromOrm(schema, tx, false)));
		};
	}

	return bridge;
}

export async function createBetterAuthOrm(input: {
	options: BetterAuthOptions;
	runtime?: ResolvedBetterAuthDatabaseRuntime | null;
}): Promise<BetterAuthOrmRuntime> {
	const database = input.options.database;
	const runtime = input.runtime ?? resolveDatabaseRuntime(database);

	if (!runtime) {
		throw getResolvedRuntimeOrThrow(database);
	}

	assertSupportedRuntime(runtime);

	const setupInput = getRuntimeSetupInput(input.options, runtime);
	const orm = (await createOrmFromRuntime(setupInput)) as BetterAuthOrmClient;

	return {
		schema: setupInput.schema,
		runtime,
		orm,
	};
}

export function createBetterAuthDatabaseBridge(
	runtime: BetterAuthOrmRuntime,
): BetterAuthDatabaseBridge {
	return createBridgeFromOrm(runtime.schema, runtime.orm);
}

function createCustomAdapter(args: {
	runtime: ResolvedBetterAuthDatabaseRuntime;
	getBridge: (options: BetterAuthOptions) => Promise<BetterAuthDatabaseBridge>;
}): AdapterFactoryCustomizeAdapterCreator {
	return ({ options }) =>
		({
		async create<T extends Record<string, any>>({
			model,
			data,
			select,
		}: {
			model: string;
			data: T;
			select?: string[];
		}) {
			const bridge = await args.getBridge(options);
			return bridge.create({
				model,
				data,
				select,
			}) as Promise<T>;
		},
		findOne: <T>({
			model,
			where,
			select,
			join,
		}: {
			model: string;
			where: CleanedWhere[];
			select?: string[];
			join?: JoinConfig;
		}) =>
			args
				.getBridge(options)
				.then((bridge) =>
					bridge.findOne({
						model,
						where,
						select,
						join,
					}),
				) as Promise<T | null>,
		findMany: <T>({
			model,
			where,
			limit,
			offset,
			sortBy,
			select,
			join,
		}: {
			model: string;
			where?: CleanedWhere[];
			limit: number;
			offset?: number;
			sortBy?: SortBy;
			select?: string[];
			join?: JoinConfig;
		}) =>
			args
				.getBridge(options)
				.then((bridge) =>
					bridge.findMany({
						model,
						where,
						limit,
						offset,
						sortBy,
						select,
						join,
					}),
				) as Promise<T[]>,
		update: <T>({
			model,
			where,
			update,
		}: {
			model: string;
			where: CleanedWhere[];
			update: T;
		}) =>
			args
				.getBridge(options)
					.then((bridge) =>
						bridge.update({
							model,
							where,
							update: update as Record<string, any>,
						}),
					) as Promise<T | null>,
		updateMany: ({
			model,
			where,
			update,
		}: {
			model: string;
			where: CleanedWhere[];
			update: Record<string, any>;
		}) =>
			args
				.getBridge(options)
				.then((bridge) =>
					bridge.updateMany({
						model,
						where,
						update,
					}),
				),
		delete: async ({
			model,
			where,
		}: {
			model: string;
			where: CleanedWhere[];
		}) => {
			const bridge = await args.getBridge(options);
			await bridge.delete({
				model,
				where,
			});
		},
		deleteMany: ({
			model,
			where,
		}: {
			model: string;
			where: CleanedWhere[];
		}) =>
			args
				.getBridge(options)
				.then((bridge) =>
					bridge.deleteMany({
						model,
						where,
					}),
				),
		count: ({
			model,
			where,
		}: {
			model: string;
			where?: CleanedWhere[];
		}) =>
			args
				.getBridge(options)
				.then((bridge) =>
					bridge.count({
						model,
						where,
					}),
				),
		createSchema: async ({
			file,
		}: {
			file?: string;
			tables: Record<string, any>;
		}) =>
			createSchemaArtifact(options, args.runtime, file),
		options: {
			runtimeKind: args.runtime.kind,
			runtimeDialect: args.runtime.dialect,
			runtimeSource: args.runtime.source,
		},
	}) satisfies CustomAdapter;
}

export async function pushBetterAuthDatabaseSchema(
	options: BetterAuthOptions,
	overrides?: BetterAuthRuntimeSetupOverrides,
): Promise<void> {
	if (!options.database) {
		throw new BetterAuthError(
			"Database is required to push the Farming ORM schema.",
		);
	}

	const runtime = getResolvedRuntimeOrThrow(options.database);
	if (runtime.kind === "prisma") {
		await pushPrismaSchemaWithCli({
			schema: createBetterAuthOrmSchema(options, runtime),
			runtime,
			overrides,
		});
		return;
	}

	await pushSchema(getRuntimeSetupInput(options, runtime, overrides));
}

export function createBetterAuthDatabaseAdapterFactory(
	database: BetterAuthOptions["database"],
): DBAdapterInstance<BetterAuthOptions> {
	const runtime = getResolvedRuntimeOrThrow(database);
	let lazyOptions: BetterAuthOptions | null = null;
	let bridgePromise: Promise<BetterAuthDatabaseBridge> | null = null;
	let adapterOptions: AdapterFactoryOptions | null = null;

	const getBridge = (options: BetterAuthOptions) => {
		lazyOptions = {
			...options,
			database,
		} satisfies BetterAuthOptions;
		bridgePromise ??= createBetterAuthOrm({
			options: lazyOptions,
			runtime,
		}).then(createBetterAuthDatabaseBridge);
		return bridgePromise;
	};

	adapterOptions = {
		config: {
			adapterId: `orm-${runtime.kind}`,
			adapterName: `Farming ORM (${runtime.kind}${runtime.dialect ? `/${runtime.dialect}` : ""})`,
			supportsNumericIds: runtimeSupportsGeneratedNumericIds(runtime),
			supportsUUIDs: false,
			supportsJSON: runtimeSupportsNativeJson(runtime),
			supportsDates: true,
			supportsBooleans: true,
			supportsArrays: runtimeSupportsNativeArrays(runtime),
			transaction: runtimeSupportsTransactions(runtime)
				? async (callback) => {
						const options = lazyOptions;
						if (!options) {
							throw new BetterAuthError(
								"Better Auth options were not initialized before opening a transaction.",
							);
						}

						if (
							runtime.kind === "prisma" &&
							hasFunction(runtime.client, "$transaction")
						) {
							return runtime.client.$transaction(async (txClient) => {
								const txRuntime = {
									...runtime,
									client: txClient as typeof runtime.client,
								} satisfies ResolvedBetterAuthDatabaseRuntime;
								const txOptions = {
									...options,
									database:
										txClient as unknown as NonNullable<BetterAuthOptions["database"]>,
								} satisfies BetterAuthOptions;
								const txBridge = await createBetterAuthOrm({
									options: txOptions,
									runtime: txRuntime,
								}).then(createBetterAuthDatabaseBridge);

								return callback(
									createAdapterFactory({
										config: {
											...adapterOptions!.config,
											transaction: false,
										},
										adapter: createCustomAdapter({
											runtime: txRuntime,
											getBridge: async () => txBridge,
										}),
									})(txOptions),
								);
							});
						}

						const bridge = await getBridge(options);
						if (!bridge.transaction) {
							throw new BetterAuthError(
								`The detected ${runtime.kind} runtime does not expose transactions.`,
							);
						}

						return bridge.transaction(async (txBridge) =>
							callback(
								createAdapterFactory({
									config: {
										...adapterOptions!.config,
										transaction: false,
									},
									adapter: createCustomAdapter({
										runtime,
										getBridge: async () => txBridge,
									}),
								})(options),
							),
						);
					}
				: false,
		},
		adapter: createCustomAdapter({
			runtime,
			getBridge,
		}),
	};

	const adapterFactory = createAdapterFactory(adapterOptions!);

	return (options) => {
		if (options.experimental?.joins) {
			throw new BetterAuthError(
				"Experimental joins are not supported yet for raw runtime clients.",
			);
		}

		const mergedOptions = {
			...options,
			database,
		} satisfies BetterAuthOptions;
		lazyOptions = mergedOptions;
		return adapterFactory(mergedOptions);
	};
}

export async function createBetterAuthDatabaseAdapter(
	options: BetterAuthOptions,
): Promise<DBAdapter<BetterAuthOptions>> {
	if (!options.database) {
		throw new BetterAuthError(
			"Database is required to build the Farming ORM adapter.",
		);
	}

	await createBetterAuthOrm({
		options,
		runtime: resolveDatabaseRuntime(options.database),
	});

	return createBetterAuthDatabaseAdapterFactory(options.database)(options);
}
