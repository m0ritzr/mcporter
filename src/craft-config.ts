import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRuntime } from './runtime.js';
import type { ServerDefinition } from './config.js';
import { validateCraftUrl } from './craft-validation.js';

export type CraftConnectionType = 'doc' | 'daily-notes';

export interface CraftConnection {
  name: string;
  url: string;
  type?: CraftConnectionType;
  description?: string;
}

export interface CraftConfig {
  connections: CraftConnection[];
  defaultConnection?: string;
}

const CRAFT_CONFIG_DIR = path.join(os.homedir(), '.craft');
const CRAFT_CONFIG_PATH = path.join(CRAFT_CONFIG_DIR, 'config.json');

/**
 * Load Craft config from ~/.craft/config.json
 * Returns empty config if file doesn't exist
 */
export async function loadCraftConfig(): Promise<CraftConfig> {
  try {
    const content = await fs.readFile(CRAFT_CONFIG_PATH, 'utf-8');
    return JSON.parse(content) as CraftConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { connections: [] };
    }
    throw error;
  }
}

/**
 * Save Craft config to ~/.craft/config.json
 */
export async function saveCraftConfig(config: CraftConfig): Promise<void> {
  await fs.mkdir(CRAFT_CONFIG_DIR, { recursive: true });
  const content = JSON.stringify(config, null, 2) + '\n';
  await fs.writeFile(CRAFT_CONFIG_PATH, content, 'utf-8');
}

/**
 * Discover connection type by connecting to the MCP server and inspecting available tools
 */
async function discoverConnectionType(url: string): Promise<CraftConnectionType | undefined> {
  try {
    // Create a temporary server definition
    const tempDefinition: ServerDefinition = {
      name: `temp-${Date.now()}`,
      command: {
        kind: 'http',
        url: new URL(url),
      },
      source: { kind: 'local', path: '<temp>' },
    };

    // Create a temporary runtime with this server
    const runtime = await createRuntime({
      servers: [tempDefinition],
    });

    try {
      // List available tools
      const tools = await runtime.listTools(tempDefinition.name, {
        includeSchema: false,
        autoAuthorize: false,
      });

      // Analyze tool names to determine type
      const toolNames = tools.map(t => t.name);

      // Check for daily-notes specific tools
      const hasDailyNotesTools = toolNames.some(name =>
        name.includes('daily') || name.includes('date')
      );

      // Check for doc-specific tools
      const hasDocTools = toolNames.some(name =>
        name.includes('document') || name.includes('page') || name.includes('collection')
      );

      if (hasDailyNotesTools && !hasDocTools) {
        return 'daily-notes';
      } else if (hasDocTools && !hasDailyNotesTools) {
        return 'doc';
      }

      // If we can't determine, return undefined
      return undefined;
    } finally {
      await runtime.close(tempDefinition.name);
    }
  } catch (error) {
    // If discovery fails, just return undefined
    console.error(`Warning: Could not auto-discover connection type: ${(error as Error).message}`);
    return undefined;
  }
}

/**
 * Add a new Craft connection
 */
export async function addConnection(
  name: string,
  url: string,
  description?: string
): Promise<void> {
  // Validate the URL
  validateCraftUrl(url);

  // Load existing config
  const config = await loadCraftConfig();

  // Check if connection name already exists
  if (config.connections.some(c => c.name === name)) {
    throw new Error(`Connection '${name}' already exists. Use a different name or remove the existing connection first.`);
  }

  // Discover connection type
  console.log(`Discovering connection type for '${name}'...`);
  const type = await discoverConnectionType(url);

  // Add the connection
  const connection: CraftConnection = {
    name,
    url,
    type,
    description,
  };

  config.connections.push(connection);

  // Set as default if it's the first connection
  if (config.connections.length === 1) {
    config.defaultConnection = name;
  }

  // Save config
  await saveCraftConfig(config);

  console.log(`✓ Added connection '${name}'${type ? ` (type: ${type})` : ''}`);
  if (config.defaultConnection === name) {
    console.log(`✓ Set as default connection`);
  }
}

/**
 * Remove a Craft connection
 */
export async function removeConnection(name: string): Promise<void> {
  const config = await loadCraftConfig();

  const index = config.connections.findIndex(c => c.name === name);
  if (index === -1) {
    throw new Error(`Connection '${name}' not found`);
  }

  config.connections.splice(index, 1);

  // Update default if we removed it
  if (config.defaultConnection === name) {
    config.defaultConnection = config.connections.length > 0
      ? config.connections[0]?.name
      : undefined;
  }

  await saveCraftConfig(config);

  console.log(`✓ Removed connection '${name}'`);
  if (config.defaultConnection) {
    console.log(`✓ Default connection is now '${config.defaultConnection}'`);
  }
}

/**
 * List all Craft connections
 */
export async function listConnections(): Promise<void> {
  const config = await loadCraftConfig();

  if (config.connections.length === 0) {
    console.log('No connections configured.');
    console.log('\nAdd a connection with:');
    console.log('  craft add <name> <url>');
    return;
  }

  console.log('Craft Connections:\n');

  for (const conn of config.connections) {
    const isDefault = conn.name === config.defaultConnection;
    const defaultMarker = isDefault ? ' (default)' : '';
    const typeInfo = conn.type ? ` [${conn.type}]` : '';

    console.log(`  ${conn.name}${defaultMarker}${typeInfo}`);
    console.log(`    ${conn.url}`);
    if (conn.description) {
      console.log(`    ${conn.description}`);
    }
    console.log('');
  }
}

/**
 * Set a connection as the default
 */
export async function useConnection(name: string): Promise<void> {
  const config = await loadCraftConfig();

  if (!config.connections.some(c => c.name === name)) {
    throw new Error(`Connection '${name}' not found`);
  }

  config.defaultConnection = name;
  await saveCraftConfig(config);

  console.log(`✓ Set '${name}' as default connection`);
}

/**
 * Get the default connection
 */
export async function getDefaultConnection(): Promise<CraftConnection | null> {
  const config = await loadCraftConfig();

  if (!config.defaultConnection) {
    return null;
  }

  const connection = config.connections.find(c => c.name === config.defaultConnection);
  return connection || null;
}

/**
 * Get a connection by name
 */
export async function getConnection(name: string): Promise<CraftConnection> {
  const config = await loadCraftConfig();

  const connection = config.connections.find(c => c.name === name);
  if (!connection) {
    throw new Error(`Connection '${name}' not found`);
  }

  return connection;
}

/**
 * Resolve a connection name or use the default
 */
export async function resolveConnection(nameOrDefault?: string): Promise<CraftConnection> {
  if (nameOrDefault) {
    return getConnection(nameOrDefault);
  }

  const defaultConn = await getDefaultConnection();
  if (!defaultConn) {
    throw new Error(
      'No default connection set. Use:\n' +
      '  craft use <name>     # Set a default connection\n' +
      '  craft add <name> <url>  # Add a new connection'
    );
  }

  return defaultConn;
}
