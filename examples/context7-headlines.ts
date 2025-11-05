#!/usr/bin/env tsx

/**
 * Example: fetch the README for a React-adjacent package from Context7
 * and print only the markdown headlines.
 */

import { createContext7Client, createRuntime, type CallResult } from "../src/index.js";

async function main(): Promise<void> {
	const runtime = await createRuntime();
	try {
		const context7 = createContext7Client(runtime);
		const docs = await (context7.getDocs as (name: string) => Promise<CallResult>)(
			"react",
		);

		const markdown = docs.markdown() ?? docs.text() ?? "";
		const headlines = markdown
			.split("\n")
			.filter((line) => /^#+\s/.test(line))
			.join("\n");

		console.log("# Headlines for React");
		console.log(headlines || "(no headlines found)");
	} finally {
		await runtime.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
