/**
 * Validates that a URL is a valid Craft MCP endpoint
 * @param url - The URL to validate
 * @throws Error if URL is not a valid Craft MCP URL
 */
export function validateCraftUrl(url: string): void {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new Error(
      `Invalid URL: ${url}\n` +
      `Please provide a valid HTTPS URL to a Craft MCP endpoint.`
    );
  }

  // Check protocol is HTTPS
  if (parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Invalid protocol: ${parsedUrl.protocol}\n` +
      `Craft MCP URLs must use HTTPS protocol.\n` +
      `Example: https://mcp.craft.do/links/YOUR_LINK_ID/mcp`
    );
  }

  // Check hostname ends with 'craft.do'
  if (!parsedUrl.hostname.endsWith('craft.do')) {
    throw new Error(
      `Invalid hostname: ${parsedUrl.hostname}\n` +
      `Craft MCP URLs must be hosted on craft.do domain.\n` +
      `Example: https://mcp.craft.do/links/YOUR_LINK_ID/mcp`
    );
  }

  // Check path includes '/mcp'
  if (!parsedUrl.pathname.includes('/mcp')) {
    throw new Error(
      `Invalid path: ${parsedUrl.pathname}\n` +
      `Craft MCP URLs must include '/mcp' in the path.\n` +
      `Example: https://mcp.craft.do/links/YOUR_LINK_ID/mcp`
    );
  }
}
