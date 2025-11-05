import type { Runtime } from "./runtime.js";
import { createServerProxy } from "./server-proxy.js";
import type { CallResult } from "./result-utils.js";

export interface GetDocsArgs {
	libraryName?: string;
	libraryId?: string;
	docArgs?: Record<string, unknown>;
}

function extractFirstLibraryId(result: CallResult): string | null {
	const json = result.json<
		|
			{ candidates?: Array<{ context7CompatibleLibraryID?: string }> }
		|
			{ results?: Array<{ id?: string }> }
	>();
	if (json) {
		if (Array.isArray((json as { candidates?: unknown }).candidates)) {
			for (const candidate of (json as {
				candidates: Array<{ context7CompatibleLibraryID?: string }>;
			}).candidates) {
				if (candidate?.context7CompatibleLibraryID) {
					return candidate.context7CompatibleLibraryID;
				}
			}
		}
		if (Array.isArray((json as { results?: unknown }).results)) {
			for (const candidate of (json as { results: Array<{ id?: string }> }).results) {
				if (candidate?.id) {
					return candidate.id;
				}
			}
		}
	}

	const text = result.text();
	if (!text) return null;
	const match = text.match(/Context7-compatible library ID:\s*([^\s]+)/);
	return match?.[1] ?? null;
}

export function createContext7Client(runtime: Runtime): Record<string, unknown> {
	const proxy = createServerProxy(runtime, "context7") as Record<string, unknown>;

	const resolveLibraryId = proxy.resolveLibraryId as (
		args: unknown,
	) => Promise<CallResult>;
	const getLibraryDocs = proxy.getLibraryDocs as (
		args: unknown,
	) => Promise<CallResult>;

	const getDocs = async (input: string | GetDocsArgs): Promise<CallResult> => {
		const { libraryName, libraryId: providedId, docArgs } =
			typeof input === "string"
				? { libraryName: input, libraryId: undefined, docArgs: undefined }
				: input;

		let libraryId = providedId;
		if (!libraryId) {
			if (!libraryName) {
				throw new Error("libraryName is required when libraryId is not provided");
			}
			const resolved = await resolveLibraryId({ libraryName });
			libraryId = extractFirstLibraryId(resolved);
			if (!libraryId) {
				throw new Error(
					`Unable to resolve Context7 library ID for "${libraryName}"`,
				);
			}
		}

		const args: Record<string, unknown> = {
			context7CompatibleLibraryID: libraryId,
			...(docArgs ?? {}),
		};
		return getLibraryDocs(args);
	};

	return {
		...proxy,
		getDocs,
		resolveLibraryId,
		getLibraryDocs,
	};
}
