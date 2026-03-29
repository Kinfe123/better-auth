import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { init } from "./init";

describe("init (with raw sqlite runtime)", () => {
	const database = new DatabaseSync(":memory:");

	it("should initialize with the Farming ORM bridge", async () => {
		const res = await init({
			baseURL: "http://localhost:3000",
			database,
		});

		expect(res.adapter.id).toBe("orm-sql");
		expect(res.adapter.options?.adapterConfig?.adapterId).toBe("orm-sql");
	});

	it("should support runMigrations with raw sqlite", async () => {
		const res = await init({
			baseURL: "http://localhost:3000",
			database,
		});

		expect(res.runMigrations).toBeDefined();
		expect(typeof res.runMigrations).toBe("function");
		await expect(res.runMigrations()).resolves.not.toThrow();
	});

	it("should detect the normalized sqlite runtime from database instance", async () => {
		const res = await init({
			baseURL: "http://localhost:3000",
			database,
		});

		expect(res.adapter.options?.adapterConfig).toBeDefined();
		expect(res.adapter.options?.adapterConfig?.adapterId).toBe("orm-sql");
		expect(res.adapter.options?.adapterConfig?.adapterName).toBe(
			"Farming ORM (sql/sqlite)",
		);
	});

	it("should throw an error if the base url does not include http or https as the protocol", async () => {
		await expect(
			init({ database, baseURL: "localhost:6969" }),
		).rejects.toThrowError(
			`Invalid base URL: localhost:6969. URL must include 'http://' or 'https://'`,
		);
	});

	it("should throw an error if the base url does not include http or https as the protocol", async () => {
		await expect(
			init({ database, baseURL: "ws://localhost:6969" }),
		).rejects.toThrowError(
			`Invalid base URL: ws://localhost:6969. URL must include 'http://' or 'https://'`,
		);
	});
});
