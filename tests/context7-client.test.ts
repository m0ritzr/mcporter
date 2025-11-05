import { describe, expect, it, vi } from "vitest";
import type { CallResult } from "../src/result-utils.js";
import { createContext7Client } from "../src/context7-client.js";
import type { Runtime, ServerToolInfo } from "../src/runtime";

function createRuntimeMock(
	responses: Array<unknown>,
	tools: ServerToolInfo[],
): Runtime {
	let callIndex = 0;
	return {
		listServers: vi.fn(),
		getDefinitions: vi.fn(),
		getDefinition: vi.fn(),
		listTools: vi.fn(async () => tools),
		callTool: vi.fn(async () => responses[callIndex++]),
		listResources: vi.fn(),
		connect: vi.fn(),
		close: vi.fn(),
	} as unknown as Runtime;
}

describe("createContext7Client", () => {
	it("fetches docs using resolved library id", async () => {
		const runtime = createRuntimeMock(
			[
				{
					content: [
						{
							type: "text",
							text: "Context7-compatible library ID: /ids/react",
						},
					],
				},
				{ content: [{ type: "markdown", text: "# Hello" }] },
			],
			[
				{ name: "resolve-library-id", inputSchema: { type: "object" } },
				{ name: "get-library-docs", inputSchema: { type: "object" } },
			],
		);

		const client = createContext7Client(runtime);
		const result = (await (
			client.getDocs as (name: string) => Promise<CallResult>
		)("react")) as CallResult;

		expect(result.markdown()).toBe("# Hello");
	});

	it("allows skipping resolve with explicit library id", async () => {
		const runtime = createRuntimeMock(
			[{ content: [{ type: "markdown", text: "# Hello" }] }],
			[{ name: "get-library-docs", inputSchema: { type: "object" } }],
		);

		const client = createContext7Client(runtime);
		const result = (await (
			client.getDocs as (args: { libraryId: string }) => Promise<CallResult>
		)({ libraryId: "/ids/react" })) as CallResult;

		expect(result.markdown()).toBe("# Hello");
	});
});
