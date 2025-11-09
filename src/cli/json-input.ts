import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ServerToolInfo } from '../runtime.js';

/**
 * Parse a JSON value from various input sources
 * Supports:
 * - Inline JSON: '{"key": "value"}'
 * - File: @filename.json
 * - Stdin: -
 * - Empty string: '' (returns undefined)
 * - Otherwise: Try to parse as JSON
 */
export async function parseJsonValue(value: string | undefined): Promise<unknown> {
  if (value === undefined || value === '') {
    return undefined;
  }

  // Stdin
  if (value === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const content = Buffer.concat(chunks).toString('utf-8').trim();
    return JSON.parse(content);
  }

  // File
  if (value.startsWith('@')) {
    const filePath = value.slice(1);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content.trim());
  }

  // Inline JSON
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(
      `Invalid JSON: ${(error as Error).message}\n` +
      `Supported formats:\n` +
      `  - Inline JSON: '{"key": "value"}'\n` +
      `  - File: @filename.json\n` +
      `  - Stdin: -`
    );
  }
}

/**
 * Open an editor for the user to input tool arguments
 * Generates a template from the tool schema with helpful comments
 */
export async function openEditorForArgs(
  toolSchema: ServerToolInfo
): Promise<Record<string, unknown>> {
  const template = generateTemplateFromSchema(toolSchema.inputSchema);

  const tmpDir = path.join(os.tmpdir(), 'craft-cli');
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `craft-${toolSchema.name}-${Date.now()}.json`);

  await fs.writeFile(tmpFile, template, 'utf-8');

  const editor = process.env.EDITOR || process.env.VISUAL || 'nano';

  return new Promise((resolve, reject) => {
    const child = spawn(editor, [tmpFile], { stdio: 'inherit' });

    child.on('exit', async (code) => {
      if (code !== 0) {
        await fs.unlink(tmpFile).catch(() => {});
        reject(new Error(`Editor exited with code ${code}`));
        return;
      }

      try {
        const content = await fs.readFile(tmpFile, 'utf-8');
        await fs.unlink(tmpFile).catch(() => {});

        // Remove comments (lines starting with //)
        const jsonContent = content
          .split('\n')
          .filter(line => !line.trim().startsWith('//'))
          .join('\n');

        resolve(JSON.parse(jsonContent));
      } catch (error) {
        await fs.unlink(tmpFile).catch(() => {});
        reject(error);
      }
    });

    child.on('error', async (error) => {
      await fs.unlink(tmpFile).catch(() => {});
      reject(error);
    });
  });
}

/**
 * Generate a JSON template from a JSON schema
 * Includes helpful comments for each property
 */
export function generateTemplateFromSchema(schema: unknown): string {
  if (!schema || typeof schema !== 'object') {
    return '{}';
  }

  const schemaObj = schema as {
    properties?: Record<string, unknown>;
    required?: string[];
    type?: string;
  };

  const properties = schemaObj.properties || {};
  const required = schemaObj.required || [];

  const lines: string[] = ['{'];
  const keys = Object.keys(properties);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!key) continue;

    const prop = properties[key] as {
      description?: string;
      type?: string;
      items?: unknown;
      properties?: unknown;
      default?: unknown;
    };
    const isRequired = required.includes(key);
    const desc = prop?.description || '';
    const isLastKey = i === keys.length - 1;

    // Add comment
    if (desc) {
      lines.push(`  // ${isRequired ? 'REQUIRED' : 'OPTIONAL'}: ${desc}`);
    } else {
      lines.push(`  // ${isRequired ? 'REQUIRED' : 'OPTIONAL'}`);
    }

    // Add property with example value
    const example = generateExampleValue(prop);
    const exampleStr = JSON.stringify(example, null, 2);

    // Indent multiline values
    const indentedExample = exampleStr
      .split('\n')
      .map((line, idx) => (idx === 0 ? line : `  ${line}`))
      .join('\n');

    const comma = isLastKey ? '' : ',';
    lines.push(`  "${key}": ${indentedExample}${comma}`);

    if (!isLastKey) {
      lines.push('');
    }
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate an example value for a JSON schema property
 */
function generateExampleValue(prop: unknown): unknown {
  if (!prop || typeof prop !== 'object') {
    return null;
  }

  const propObj = prop as {
    type?: string;
    default?: unknown;
    items?: unknown;
    properties?: unknown;
    enum?: unknown[];
  };

  // Use default if available
  if ('default' in propObj) {
    return propObj.default;
  }

  // Use enum if available
  if (propObj.enum && Array.isArray(propObj.enum) && propObj.enum.length > 0) {
    return propObj.enum[0];
  }

  // Generate based on type
  switch (propObj.type) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      if (propObj.items) {
        return [generateExampleValue(propObj.items)];
      }
      return [];
    case 'object':
      if (propObj.properties) {
        const obj: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(propObj.properties)) {
          obj[key] = generateExampleValue(value);
        }
        return obj;
      }
      return {};
    case 'null':
      return null;
    default:
      return null;
  }
}
