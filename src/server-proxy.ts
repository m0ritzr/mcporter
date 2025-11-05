import { createCallResult } from "./result-utils.js";
import type {
	CallOptions,
	ListToolsOptions,
	Runtime,
	ServerToolInfo,
} from "./runtime.js";

type ToolCallOptions = CallOptions & { args?: unknown };
type ToolArguments = CallOptions["args"];

type ServerProxy = {
	call(
		toolName: string,
		options?: ToolCallOptions,
	): Promise<ReturnType<typeof createCallResult>>;
	listTools(options?: ListToolsOptions): Promise<ServerToolInfo[]>;
};

type ToolSchemaInfo = {
	schema: Record<string, unknown>;
	orderedKeys: string[];
	requiredKeys: string[];
	propertySet: Set<string>;
};

function defaultToolNameMapper(propertyKey: string | symbol): string {
	if (typeof propertyKey !== "string") {
		throw new TypeError("Tool name must be a string when using server proxy.");
	}
	return propertyKey
		.replace(/_/g, "-")
		.replace(/([a-z\d])([A-Z])/g, "$1-$2")
		.toLowerCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createToolSchemaInfo(schemaRaw: unknown): ToolSchemaInfo | undefined {
	if (!schemaRaw || typeof schemaRaw !== "object") {
		return undefined;
	}
	const schema = schemaRaw as Record<string, unknown>;
	const propertiesRaw = schema.properties;
	const propertyKeys =
		propertiesRaw && typeof propertiesRaw === "object"
			? Object.keys(propertiesRaw as Record<string, unknown>)
			: [];
	const requiredKeys = Array.isArray(schema.required)
		? (schema.required as string[])
		: [];
	const orderedKeys: string[] = [];
	const seen = new Set<string>();

	for (const key of requiredKeys) {
		if (typeof key === "string" && !seen.has(key)) {
			orderedKeys.push(key);
			seen.add(key);
		}
	}

	for (const key of propertyKeys) {
		if (!seen.has(key)) {
			orderedKeys.push(key);
			seen.add(key);
		}
	}

	return {
		schema,
		orderedKeys,
		requiredKeys,
		propertySet: new Set([...propertyKeys, ...requiredKeys]),
	};
}

function applyDefaults(
	meta: ToolSchemaInfo,
	args?: ToolArguments,
): ToolArguments {
	const propertiesRaw = meta.schema.properties;
	if (!propertiesRaw || typeof propertiesRaw !== "object") {
		return args;
	}

	const result: Record<string, unknown> = isPlainObject(args)
		? { ...(args as Record<string, unknown>) }
		: {};

	for (const [key, value] of Object.entries(
		propertiesRaw as Record<string, unknown>,
	)) {
		if (
			value &&
			typeof value === "object" &&
			"default" in (value as Record<string, unknown>) &&
			result[key] === undefined
		) {
			result[key] = (value as Record<string, unknown>).default as unknown;
		}
	}

	if (Object.keys(result).length === 0 && !isPlainObject(args)) {
		return args;
	}

	return result as ToolArguments;
}

function validateRequired(meta: ToolSchemaInfo, args?: ToolArguments): void {
	if (meta.requiredKeys.length === 0) {
		return;
	}
	if (!isPlainObject(args)) {
		throw new Error(
			`Missing required arguments: ${meta.requiredKeys.join(", ")}`,
		);
	}
	const missing = meta.requiredKeys.filter(
		(key) => (args as Record<string, unknown>)[key] === undefined,
	);
	if (missing.length > 0) {
		throw new Error(`Missing required arguments: ${missing.join(", ")}`);
	}
}

export function createServerProxy(
	runtime: Runtime,
	serverName: string,
	mapPropertyToTool: (
		property: string | symbol,
	) => string = defaultToolNameMapper,
): ServerProxy {
	const toolSchemaCache = new Map<string, ToolSchemaInfo>();
	let schemaFetch: Promise<void> | null = null;

	async function ensureMetadata(
		toolName: string,
	): Promise<ToolSchemaInfo | undefined> {
		if (toolSchemaCache.has(toolName)) {
			return toolSchemaCache.get(toolName);
		}

		if (!schemaFetch) {
			schemaFetch = runtime
				.listTools(serverName, { includeSchema: true })
				.then((tools) => {
					for (const tool of tools) {
						const info = createToolSchemaInfo(tool.inputSchema);
						if (!info) {
							continue;
						}
						toolSchemaCache.set(tool.name, info);
						const normalized = mapPropertyToTool(tool.name);
						toolSchemaCache.set(normalized, info);
					}
				})
				.catch((error) => {
					schemaFetch = null;
					throw error;
				});
		}

		await schemaFetch;
		return toolSchemaCache.get(toolName);
	}

	const base: ServerProxy = {
		call: async (toolName: string, options?: ToolCallOptions) => {
			const result = await runtime.callTool(
				serverName,
				toolName,
				options ?? {},
			);
			return createCallResult(result);
		},
		listTools: (options) => runtime.listTools(serverName, options),
	};

	return new Proxy(base as ServerProxy & Record<string | symbol, unknown>, {
		get(target, property, receiver) {
			if (Reflect.has(target, property)) {
				return Reflect.get(target, property, receiver);
			}

			const toolName = mapPropertyToTool(property);

			return async (...callArgs: unknown[]) => {
				let schemaInfo: ToolSchemaInfo | undefined;
				try {
					schemaInfo = await ensureMetadata(toolName);
				} catch {
					schemaInfo = undefined;
				}

				const positional: unknown[] = [];
				const argsAccumulator: Record<string, unknown> = {};
				const optionsAccumulator: ToolCallOptions = {};

				for (const arg of callArgs) {
					if (isPlainObject(arg)) {
						const keys = Object.keys(arg);
						const treatAsArgs =
							schemaInfo &&
							keys.length > 0 &&
							keys.every((key) => schemaInfo!.propertySet.has(key));

						if (treatAsArgs) {
							Object.assign(argsAccumulator, arg as Record<string, unknown>);
						} else {
							Object.assign(optionsAccumulator, arg as ToolCallOptions);
						}
					} else {
						positional.push(arg);
					}
				}

				const explicitArgs = optionsAccumulator.args as
					| ToolArguments
					| undefined;
				if (explicitArgs !== undefined) {
					delete (optionsAccumulator as Record<string, unknown>).args;
				}

				const finalOptions: ToolCallOptions = { ...optionsAccumulator };
				let combinedArgs: ToolArguments | undefined = explicitArgs;

				if (schemaInfo) {
					if (positional.length > schemaInfo.orderedKeys.length) {
						throw new Error(
							`Too many positional arguments for tool "${toolName}"`,
						);
					}

					if (positional.length > 0) {
						const baseArgs = isPlainObject(combinedArgs)
							? { ...(combinedArgs as Record<string, unknown>) }
							: {};
						positional.forEach((value, idx) => {
							const key = schemaInfo!.orderedKeys[idx];
							if (key) {
								baseArgs[key] = value;
							}
						});
						combinedArgs = baseArgs as ToolArguments;
					}

					if (Object.keys(argsAccumulator).length > 0) {
						const baseArgs = isPlainObject(combinedArgs)
							? { ...(combinedArgs as Record<string, unknown>) }
							: {};
						Object.assign(baseArgs, argsAccumulator);
						combinedArgs = baseArgs as ToolArguments;
					}

					if (combinedArgs !== undefined) {
						combinedArgs = applyDefaults(schemaInfo, combinedArgs);
						finalOptions.args = combinedArgs;
					} else {
						const defaults = applyDefaults(schemaInfo, undefined);
						if (isPlainObject(defaults) && Object.keys(defaults).length > 0) {
							finalOptions.args = defaults;
						}
					}

					validateRequired(schemaInfo, finalOptions.args as ToolArguments);
				} else {
					if (positional.length > 0 && combinedArgs === undefined) {
						combinedArgs = (
							positional.length === 1
								? positional[0]
								: (positional as unknown[])
						) as ToolArguments;
					}

					if (Object.keys(argsAccumulator).length > 0) {
						const baseArgs = isPlainObject(combinedArgs)
							? { ...(combinedArgs as Record<string, unknown>) }
							: {};
						Object.assign(baseArgs, argsAccumulator);
						combinedArgs = baseArgs as ToolArguments;
					}

					if (combinedArgs !== undefined) {
						finalOptions.args = combinedArgs;
					}
				}

				const result = await runtime.callTool(
					serverName,
					toolName,
					finalOptions,
				);
				return createCallResult(result);
			};
		},
	});
}
