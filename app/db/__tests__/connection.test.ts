import type { PoolClient } from "pg";

const mockOn = jest.fn();
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockEnd = jest.fn();

jest.mock("pg", () => {
  return {
    Pool: jest.fn().mockImplementation(() => ({
      on: mockOn,
      query: mockQuery,
      connect: mockConnect,
      end: mockEnd,
    })),
  };
});

jest.mock("../config.ts", () => ({
  getDatabaseConfig: jest.fn().mockReturnValue({
    host: "localhost",
    port: 5432,
    database: "testdb",
    user: "testuser",
    password: "secret",
    ssl: false,
  }),
}));

jest.mock("../../api/services/logger.ts", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {
  throw new Error("exit called");
});

let getPool: any;
let query: any;
let getClient: any;
let closePool: any;

beforeEach(() => {
  jest.resetModules();
  ({ getPool, query, getClient, closePool } = require("../connection.ts"));

  mockOn.mockClear();
  mockQuery.mockClear();
  mockConnect.mockClear();
  mockEnd.mockClear();
});

describe("getPool()", () => {
  it("creates a new pool with correct config", () => {
    const pool = getPool();

    const { Pool } = require("pg");

    expect(Pool).toHaveBeenCalledTimes(1);
    expect(Pool).toHaveBeenCalledWith({
      host: "localhost",
      port: 5432,
      database: "testdb",
      user: "testuser",
      password: "secret",
      ssl: false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    expect(pool).toBeDefined();
  });

  it("returns the same pool on subsequent calls", () => {
    const p1 = getPool();
    const p2 = getPool();
    expect(p1).toBe(p2);
  });

  it("registers an error handler", () => {
    getPool();
    expect(mockOn).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("error handler logs and exits", () => {
    getPool();

    const handler = mockOn.mock.calls[0][1]; // extract callback
    const testError = new Error("pool failure");

    expect(() => handler(testError)).toThrow("exit called");

    const { logger } = require("../../api/services/logger.ts");

    expect(logger.error).toHaveBeenCalledWith(
      "Unexpected error on idle client",
      { operation: "database-pool-error" },
      testError
    );

    expect(exitSpy).toHaveBeenCalledWith(-1);
  });
});

describe("query()", () => {
  it("returns query results", async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

    const result = await query("SELECT 1");

    expect(mockQuery).toHaveBeenCalledWith("SELECT 1", undefined);
    expect(result.rows[0].id).toBe(1);
  });

  it("logs error and rethrows", async () => {
    const testError = new Error("db broke");
    mockQuery.mockRejectedValue(testError);

    const { logger } = require("../../api/services/logger.ts");

    await expect(query("SELECT * FROM bigTable")).rejects.toThrow("db broke");

    expect(logger.error).toHaveBeenCalledWith(
      "Database query error",
      expect.objectContaining({
        operation: "database-query",
        metadata: {
          query: "SELECT * FROM bigTable",
        },
      }),
      testError
    );
  });

  it("truncates long queries in logs", async () => {
    const longQuery = "A".repeat(150);
    const error = new Error("fail");

    mockQuery.mockRejectedValue(error);

    const { logger } = require("../../api/services/logger.ts");

    await expect(query(longQuery)).rejects.toThrow();

    expect(logger.error.mock.calls[0][1].metadata.query.length).toBe(103);
    expect(logger.error.mock.calls[0][1].metadata.query.endsWith("...")).toBe(true);
  });
});

describe("getClient()", () => {
  it("returns pool.connect()", async () => {
    const fakeClient = {} as PoolClient;
    mockConnect.mockResolvedValue(fakeClient);

    const client = await getClient();

    expect(mockConnect).toHaveBeenCalled();
    expect(client).toBe(fakeClient);
  });
});

describe("closePool()", () => {
  it("calls pool.end() and resets pool", async () => {
    getPool();
    await closePool();

    expect(mockEnd).toHaveBeenCalled();
    expect(getPool()).toBeDefined(); // new pool created after closing
  });
});