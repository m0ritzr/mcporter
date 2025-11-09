/**
 * Craft MCP URL validation
 */

export function validateCraftUrl(url: string): void {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Must be from craft.do domain
  if (!parsed.hostname.endsWith('craft.do')) {
    throw new Error(
      `Invalid Craft MCP URL. Must be from craft.do domain, got: ${parsed.hostname}`
    );
  }

  // Must include /mcp in path
  if (!parsed.pathname.includes('/mcp')) {
    throw new Error(
      `Invalid Craft MCP URL. Path must include /mcp, got: ${parsed.pathname}`
    );
  }

  // Must use HTTPS
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `Invalid Craft MCP URL. Must use HTTPS, got: ${parsed.protocol}`
    );
  }
}
