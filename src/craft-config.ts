/**
 * Craft MCP connection management
 *
 * Manages user's Craft MCP connections in ~/.craft/config.json
 */

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

const CONFIG_DIR = path.join(os.homedir(), '.craft');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

/**
 * Load Craft config from ~/.craft/config.json
 * Returns empty config if file doesn't exist
 */
export async function loadCraftConfig(): Promise<CraftConfig> {
  try {
    const content = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return { connections: [] };
    }
    throw error;
  }
}

/**
 * Save Craft config to ~/.craft/config.json
 */
export async function saveCraftConfig(config: CraftConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Auto-discover connection type by connecting and inspecting tools
 */
async function discoverConnectionType(url: string): Promise<CraftConnectionType | undefined> {
  try {
    // Create ephemeral server definition
    const serverDef: ServerDefinition = {
      name: `__temp_discovery_${Date.now()}`,
      command: {
        kind: 'http' as const,
        url: new URL(url),
      },
    };

    // Create temporary runtime
    const runtime = await createRuntime({
      servers: [serverDef],
    });

    try {
      // List tools without auto-authorization to avoid OAuth prompts
      const tools = await runtime.listTools(serverDef.name, {
        autoAuthorize: false,
      });

      // Infer type based on available tools
      // Daily notes servers expose "connection_time_get" - docs don't
      const toolNames = tools.map((t) => t.name);

      const hasConnectionTimeGet = toolNames.includes('connection_time_get');

      if (hasConnectionTimeGet) {
        return 'daily-notes';
      } else if (toolNames.length > 0) {
        // If it has tools but not connection_time_get, it's a doc server
        return 'doc';
      }

      return undefined;
    } finally {
      await runtime.close();
    }
  } catch (error) {
    // If we can't connect or discover, return undefined
    // Connection might require OAuth or be temporarily unavailable
    console.warn(`Warning: Could not auto-discover type for ${url}: ${error}`);
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
  // Validate URL
  validateCraftUrl(url);

  const config = await loadCraftConfig();

  // Check if connection already exists
  if (config.connections.some((c) => c.name === name)) {
    throw new Error(`Connection '${name}' already exists`);
  }

  // Auto-discover type
  console.log(`Discovering connection type for ${name}...`);
  const type = await discoverConnectionType(url);
  if (type) {
    console.log(`✓ Detected type: ${type}`);
  } else {
    console.log(`⚠ Could not auto-detect type`);
  }

  // Add connection
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

  await saveCraftConfig(config);
  console.log(`✓ Added connection '${name}'${config.defaultConnection === name ? ' (default)' : ''}`);
}

/**
 * Remove a connection
 */
export async function removeConnection(name: string): Promise<void> {
  const config = await loadCraftConfig();

  const index = config.connections.findIndex((c) => c.name === name);
  if (index === -1) {
    throw new Error(`Connection '${name}' not found`);
  }

  config.connections.splice(index, 1);

  // Update default if needed
  if (config.defaultConnection === name) {
    config.defaultConnection = config.connections[0]?.name;
  }

  await saveCraftConfig(config);
  console.log(`✓ Removed connection '${name}'`);
}

/**
 * List all connections
 */
export async function listConnections(): Promise<void> {
  const config = await loadCraftConfig();

  if (config.connections.length === 0) {
    console.log('No connections configured.');
    console.log('\nAdd a connection with:');
    console.log('  craft add <name> <url>');
    return;
  }

  console.log('Craft MCP Connections:\n');

  for (const conn of config.connections) {
    const isDefault = conn.name === config.defaultConnection;
    const prefix = isDefault ? '→' : ' ';
    const type = conn.type ? `[${conn.type}]` : '[unknown]';

    console.log(`${prefix} ${conn.name} ${type}`);
    console.log(`    ${conn.url}`);
    if (conn.description) {
      console.log(`    ${conn.description}`);
    }
    console.log();
  }

  if (config.defaultConnection) {
    console.log(`Default: ${config.defaultConnection}`);
  }
}

/**
 * Set default connection
 */
export async function useConnection(name: string): Promise<void> {
  const config = await loadCraftConfig();

  const connection = config.connections.find((c) => c.name === name);
  if (!connection) {
    throw new Error(`Connection '${name}' not found`);
  }

  config.defaultConnection = name;
  await saveCraftConfig(config);
  console.log(`✓ Set '${name}' as default connection`);
}

/**
 * Get default connection
 */
export async function getDefaultConnection(): Promise<CraftConnection | null> {
  const config = await loadCraftConfig();

  if (!config.defaultConnection) {
    return null;
  }

  return config.connections.find((c) => c.name === config.defaultConnection) ?? null;
}

/**
 * Get connection by name
 */
export async function getConnection(name: string): Promise<CraftConnection> {
  const config = await loadCraftConfig();

  const connection = config.connections.find((c) => c.name === name);
  if (!connection) {
    throw new Error(`Connection '${name}' not found`);
  }

  return connection;
}

/**
 * Resolve connection name or use default
 */
export async function resolveConnection(nameOrDefault?: string): Promise<CraftConnection> {
  if (nameOrDefault) {
    return getConnection(nameOrDefault);
  }

  const defaultConn = await getDefaultConnection();
  if (!defaultConn) {
    throw new Error(
      'No default connection set. Use: craft use <name> or specify connection explicitly.'
    );
  }

  return defaultConn;
}
