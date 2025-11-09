/**
 * Test script for craft-config.ts
 *
 * Usage: npx tsx test-craft-config.ts
 */

import {
  addConnection,
  removeConnection,
  listConnections,
  useConnection,
  getDefaultConnection,
  getConnection,
  resolveConnection,
  loadCraftConfig,
} from './src/craft-config.js';

async function runTests() {
  console.log('🧪 Testing Craft Config Management\n');

  try {
    // Test 1: Load initial config
    console.log('Test 1: Load config');
    const config = await loadCraftConfig();
    console.log('✓ Config loaded:', config);
    console.log();

    // Test 2: Add connection (will fail without real Craft URL, but we can test validation)
    console.log('Test 2: Test URL validation');
    try {
      await addConnection('test', 'http://invalid.com/mcp', 'Test connection');
      console.log('✗ Should have failed validation');
    } catch (error: any) {
      console.log('✓ URL validation works:', error.message);
    }
    console.log();

    // Test 3: List connections
    console.log('Test 3: List connections');
    await listConnections();
    console.log();

    // Test 4: Test getDefaultConnection
    console.log('Test 4: Get default connection');
    const defaultConn = await getDefaultConnection();
    console.log('Default connection:', defaultConn);
    console.log();

    // Test 5: Try to get non-existent connection
    console.log('Test 5: Get non-existent connection');
    try {
      await getConnection('nonexistent');
      console.log('✗ Should have thrown error');
    } catch (error: any) {
      console.log('✓ Error handling works:', error.message);
    }
    console.log();

    // Test 6: Try to resolve connection with no default
    console.log('Test 6: Resolve connection with no default');
    try {
      await resolveConnection();
      console.log('Has default or succeeded');
    } catch (error: any) {
      console.log('✓ Properly handles no default:', error.message);
    }
    console.log();

    console.log('✅ All tests completed\n');
    console.log('To test with real Craft URLs:');
    console.log('  1. Get a Craft MCP URL from https://craft.do');
    console.log('  2. Run: pnpm craft add <name> <url>');
    console.log('  3. Run: pnpm craft list');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();
