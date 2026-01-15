/**
 * Test Tool for Legrand Cloud API
 * 
 * Supports both username/password authentication and manual token.
 * 
 * Usage:
 *   # With username/password (recommended)
 *   npx ts-node tools/testCloudApi.ts --email user@example.com --password yourpass
 * 
 *   # With manual token
 *   npx ts-node tools/testCloudApi.ts --token "eyJhbG..."
 * 
 *   # Using environment variables
 *   set LEGRAND_EMAIL=user@example.com
 *   set LEGRAND_PASSWORD=yourpass
 *   npx ts-node tools/testCloudApi.ts
 */

import * as https from 'https';
import * as crypto from 'crypto';
import * as readline from 'readline';
import { LegrandAuth } from '../src/legrandAuth';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  magenta: '\x1b[35m',
};

const API_CONFIG = {
  baseUrl: 'https://api.developer.legrand.com',
  subscriptionKey: '934c78d6eeb34879a9b66681f30b14fe',
  userAgent: 'Ambient/3.0.2 (us.legrand.wiambientlighting; build:1; iOS 26.2.0) Alamofire/4.7.3',
};

// Simple logger for LegrandAuth
const logger = {
  info: (msg: string) => console.log(`${colors.dim}[INFO] ${msg}${colors.reset}`),
  debug: (msg: string) => console.log(`${colors.dim}[DEBUG] ${msg}${colors.reset}`),
  warn: (msg: string) => console.log(`${colors.yellow}[WARN] ${msg}${colors.reset}`),
  error: (msg: string) => console.log(`${colors.red}[ERROR] ${msg}${colors.reset}`),
  log: (msg: string) => console.log(msg),
  success: () => { /* noop */ },
};

interface Options {
  email?: string;
  password?: string;
  token?: string;
  deviceId?: string;
  action?: string;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--email' || arg === '-e') {
      options.email = args[++i];
    } else if (arg === '--password' || arg === '-p') {
      options.password = args[++i];
    } else if (arg === '--token' || arg === '-t') {
      options.token = args[++i];
    } else if (arg === '--device' || arg === '-d') {
      options.deviceId = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      // Positional argument - could be action
      if (!options.action) {
        options.action = arg;
      }
    }
  }

  // Check environment variables
  if (!options.email) {
    options.email = process.env.LEGRAND_EMAIL;
  }
  if (!options.password) {
    options.password = process.env.LEGRAND_PASSWORD;
  }
  if (!options.token) {
    options.token = process.env.LEGRAND_TOKEN;
  }

  return options;
}

function printHelp(): void {
  console.log(`
${colors.bright}Legrand Cloud API Test Tool${colors.reset}

${colors.cyan}Usage:${colors.reset}
  npx ts-node tools/testCloudApi.ts [options] [action]

${colors.cyan}Authentication (choose one):${colors.reset}
  --email, -e <email>       Legrand account email
  --password, -p <password> Legrand account password
  --token, -t <token>       Manual Bearer token

${colors.cyan}Options:${colors.reset}
  --device, -d <id>         Device ID to control
  --help, -h                Show this help

${colors.cyan}Actions:${colors.reset}
  discover                  List all devices
  on                        Turn device on (requires --device)
  off                       Turn device off (requires --device)
  status                    Get device status (requires --device)
  interactive               Interactive mode (default)

${colors.cyan}Environment Variables:${colors.reset}
  LEGRAND_EMAIL             Account email
  LEGRAND_PASSWORD          Account password
  LEGRAND_TOKEN             Bearer token

${colors.cyan}Examples:${colors.reset}
  # Login and discover devices
  npx ts-node tools/testCloudApi.ts -e user@example.com -p mypass discover

  # Interactive mode with login
  npx ts-node tools/testCloudApi.ts -e user@example.com -p mypass

  # Control a specific device
  npx ts-node tools/testCloudApi.ts -e user@example.com -p mypass -d abc123 on

  # Using environment variables
  set LEGRAND_EMAIL=user@example.com
  set LEGRAND_PASSWORD=mypass
  npx ts-node tools/testCloudApi.ts discover
`);
}

function makeRequest(
  method: string,
  url: string,
  token: string,
  body?: string,
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'User-Agent': API_CONFIG.userAgent,
      'Ocp-Apim-Subscription-Key': API_CONFIG.subscriptionKey,
      'Authorization': `Bearer ${token}`,
      'Accept-Language': 'en-US;q=1.0',
    };

    if (body) {
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: headers,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, data });
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function setState(deviceId: string, state: 'on' | 'off', token: string, level?: number): Promise<void> {
  const correlationId = crypto.randomUUID();
  
  const command: Record<string, unknown> = {
    state: state,
    correlationID: correlationId,
  };
  
  // Add level for dimmers
  if (level !== undefined) {
    command.level = Math.max(0, Math.min(100, Math.round(level)));
  }
  
  const body = JSON.stringify({
    command: command,
    timeout: 10,
  });

  const url = `${API_CONFIG.baseUrl}/devicemanagement/api/v2.0/modules/${deviceId}/commands/setState`;

  const levelText = level !== undefined ? ` at ${level}%` : '';
  console.log(`\n${colors.yellow}→ Sending ${state.toUpperCase()}${levelText} command...${colors.reset}`);

  try {
    const response = await makeRequest('POST', url, token, body);
    
    if (response.status >= 200 && response.status < 300) {
      console.log(`${colors.green}✓ Success! Device is now ${state.toUpperCase()}${levelText}${colors.reset}`);
    } else {
      console.log(`${colors.red}✗ Failed! Status: ${response.status}${colors.reset}`);
      console.log(`${colors.red}  Response: ${response.data}${colors.reset}`);
    }
  } catch (error) {
    console.log(`${colors.red}✗ Error: ${error}${colors.reset}`);
  }
}

async function setBrightness(deviceId: string, level: number, token: string): Promise<void> {
  const state = level > 0 ? 'on' : 'off';
  await setState(deviceId, state, token, level);
}

interface Plant {
  id: string;
  name: string;
}

interface Module {
  id: string;
  name: string;
  status: string;
  deviceType: string;
  ipAddress: string;
}

async function getPlants(token: string): Promise<Plant[]> {
  const url = `${API_CONFIG.baseUrl}/servicecatalog/api/v3.0/plants`;
  
  try {
    const response = await makeRequest('GET', url, token);
    if (response.status >= 200 && response.status < 300 && response.data) {
      return JSON.parse(response.data);
    }
  } catch {
    // ignore
  }
  return [];
}

async function getModules(plantId: string, token: string): Promise<Module[]> {
  const url = `${API_CONFIG.baseUrl}/servicecatalog/api/v3.0/plants/${plantId}/modules`;
  
  try {
    const response = await makeRequest('GET', url, token);
    if (response.status >= 200 && response.status < 300 && response.data) {
      return JSON.parse(response.data);
    }
  } catch {
    // ignore
  }
  return [];
}

async function getModulesRaw(plantId: string, token: string): Promise<string> {
  const url = `${API_CONFIG.baseUrl}/servicecatalog/api/v3.0/plants/${plantId}/modules`;
  
  try {
    const response = await makeRequest('GET', url, token);
    if (response.status >= 200 && response.status < 300 && response.data) {
      return response.data;
    }
  } catch (e) {
    return `Error: ${e}`;
  }
  return '[]';
}

async function discoverDevices(token: string): Promise<Module[]> {
  console.log(`\n${colors.yellow}→ Discovering devices...${colors.reset}\n`);
  
  const plants = await getPlants(token);
  const allModules: Module[] = [];
  
  if (plants.length === 0) {
    console.log(`${colors.red}✗ No plants found. Authentication may have failed.${colors.reset}`);
    return [];
  }

  for (const plant of plants) {
    console.log(`${colors.green}✓ Plant: ${colors.bright}${plant.name}${colors.reset}`);
    console.log(`  ${colors.dim}ID: ${plant.id}${colors.reset}`);
    
    const modules = await getModules(plant.id, token);
    
    for (const module of modules) {
      allModules.push(module);
      const statusColor = module.status === 'on' ? colors.green : colors.dim;
      console.log(`\n  ${colors.cyan}💡 ${colors.bright}${module.name}${colors.reset}`);
      console.log(`     ID: ${colors.yellow}${module.id}${colors.reset}`);
      console.log(`     Type: ${module.deviceType}`);
      console.log(`     Status: ${statusColor}${module.status.toUpperCase()}${colors.reset}`);
      console.log(`     IP: ${module.ipAddress}`);
    }
  }
  
  console.log('');
  return allModules;
}

async function showRawDevices(token: string): Promise<void> {
  console.log(`\n${colors.yellow}→ Fetching RAW device data...${colors.reset}\n`);
  
  const plants = await getPlants(token);
  
  if (plants.length === 0) {
    console.log(`${colors.red}✗ No plants found.${colors.reset}`);
    return;
  }

  for (const plant of plants) {
    console.log(`${colors.green}Plant: ${plant.name} (${plant.id})${colors.reset}`);
    console.log(`${colors.yellow}━━━ RAW API RESPONSE ━━━${colors.reset}`);
    
    const rawData = await getModulesRaw(plant.id, token);
    
    // Pretty print the JSON
    try {
      const parsed = JSON.parse(rawData);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log(rawData);
    }
    
    console.log(`${colors.yellow}━━━ END RAW RESPONSE ━━━${colors.reset}\n`);
  }
}

async function tryStatusEndpoints(deviceId: string, token: string): Promise<void> {
  console.log(`\n${colors.yellow}→ Trying different status endpoints for ${deviceId}...${colors.reset}\n`);
  
  const endpoints = [
    `/devicemanagement/api/v2.0/modules/${deviceId}`,
    `/devicemanagement/api/v2.0/modules/${deviceId}/status`,
    `/devicemanagement/api/v2.0/modules/${deviceId}/state`,
    `/servicecatalog/api/v3.0/modules/${deviceId}`,
    `/servicecatalog/api/v3.0/modules/${deviceId}/status`,
    `/hlegrand/eliot/api/v2.0/modules/${deviceId}`,
    `/hlegrand/eliot/api/v2.0/modules/${deviceId}/status`,
  ];
  
  for (const endpoint of endpoints) {
    const url = `${API_CONFIG.baseUrl}${endpoint}`;
    console.log(`${colors.dim}Trying: ${endpoint}${colors.reset}`);
    
    try {
      const response = await makeRequest('GET', url, token);
      if (response.status >= 200 && response.status < 300 && response.data) {
        console.log(`${colors.green}✓ ${response.status}: ${endpoint}${colors.reset}`);
        try {
          const parsed = JSON.parse(response.data);
          console.log(JSON.stringify(parsed, null, 2));
        } catch {
          console.log(response.data.substring(0, 500));
        }
        console.log('');
      } else {
        console.log(`${colors.dim}  → ${response.status}${colors.reset}`);
      }
    } catch (e) {
      console.log(`${colors.dim}  → Error: ${e}${colors.reset}`);
    }
  }
  
  console.log(`${colors.yellow}Done testing endpoints.${colors.reset}\n`);
}

async function probeLocalDevice(ipAddress: string): Promise<void> {
  console.log(`\n${colors.yellow}→ Probing local device at ${ipAddress}...${colors.reset}\n`);
  
  const ports = [80, 443, 8080, 8443, 8888, 5000];
  const paths = ['/', '/status', '/api/status', '/state', '/info', '/device'];
  
  for (const port of ports) {
    for (const path of paths) {
      const protocol = port === 443 || port === 8443 ? 'https' : 'http';
      const url = `${protocol}://${ipAddress}:${port}${path}`;
      
      try {
        const result = await new Promise<string>((resolve, reject) => {
          const lib = protocol === 'https' ? https : require('http');
          const req = lib.get(url, { timeout: 2000, rejectUnauthorized: false }, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => data += chunk);
            res.on('end', () => resolve(`${res.statusCode}: ${data.substring(0, 200)}`));
          });
          req.on('error', reject);
          req.on('timeout', () => reject(new Error('timeout')));
        });
        
        console.log(`${colors.green}✓ ${url}${colors.reset}`);
        console.log(`  ${colors.dim}${result}${colors.reset}`);
      } catch {
        // No response on this port/path
      }
    }
  }
  
  console.log(`\n${colors.dim}Probe complete. If no results, device may not have a local API.${colors.reset}\n`);
}

async function getDeviceStatus(deviceId: string, token: string): Promise<void> {
  console.log(`\n${colors.yellow}→ Getting real-time device status...${colors.reset}\n`);
  
  // Use the getState command for real-time status
  const correlationId = crypto.randomUUID();
  
  const body = JSON.stringify({
    timeout: 10,
    command: {
      correlationID: correlationId,
    },
  });

  const url = `${API_CONFIG.baseUrl}/devicemanagement/api/v2.0/modules/${deviceId}/commands/getState`;

  try {
    const result = await makeRequest('POST', url, token, body);
    
    console.log(`${colors.dim}Raw response:${colors.reset}`);
    console.log(result.data);
    console.log();
    
    // Parse the response
    const response = JSON.parse(result.data) as Record<string, unknown>;
    
    if (response && typeof response === 'object') {
      const status = response.status;
      const payload = response.payload as Record<string, unknown> | undefined;
      
      if (payload) {
        const state = payload.state as string;
        const level = payload.level as number | undefined;
        const deviceTag = payload.deviceTag as string | undefined;
        
        const statusColor = state === 'on' ? colors.green : colors.dim;
        
        console.log(`${colors.bright}Device Status${colors.reset}`);
        console.log(`  State: ${statusColor}${state?.toUpperCase() || 'UNKNOWN'}${colors.reset}`);
        
        if (level !== undefined) {
          console.log(`  Brightness: ${colors.cyan}${level}%${colors.reset}`);
        }
        
        if (deviceTag) {
          console.log(`  Type: ${deviceTag}`);
        }
        
        console.log(`  API Status: ${status}`);
      } else {
        console.log(`${colors.red}✗ Could not parse device status${colors.reset}`);
      }
    }
  } catch (error) {
    console.log(`${colors.red}✗ Failed to get status: ${error}${colors.reset}`);
  }
}

async function interactiveMode(token: string, initialDeviceId?: string): Promise<void> {
  let deviceId = initialDeviceId;
  
  // If no device specified, discover and let user pick
  if (!deviceId) {
    const modules = await discoverDevices(token);
    if (modules.length === 1) {
      deviceId = modules[0].id;
      console.log(`${colors.cyan}Auto-selected: ${modules[0].name}${colors.reset}`);
    } else if (modules.length > 1) {
      console.log(`${colors.yellow}Multiple devices found. Use 'select <id>' to choose one.${colors.reset}`);
    }
  }

  console.log(`\n${colors.bright}Interactive Mode${colors.reset}`);
  console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);
  if (deviceId) {
    console.log(`Selected device: ${colors.cyan}${deviceId}${colors.reset}`);
  }
  console.log(`\nCommands:`);
  console.log(`  ${colors.cyan}on${colors.reset}            - Turn switch ON`);
  console.log(`  ${colors.cyan}off${colors.reset}           - Turn switch OFF`);
  console.log(`  ${colors.cyan}dim <0-100>${colors.reset}   - Set brightness level`);
  console.log(`  ${colors.cyan}status${colors.reset}        - Get device status`);
  console.log(`  ${colors.cyan}discover${colors.reset}      - List all devices`);
  console.log(`  ${colors.cyan}raw${colors.reset}           - Show RAW API response (for debugging)`);
  console.log(`  ${colors.cyan}endpoints${colors.reset}     - Try different API endpoints for real-time status`);
  console.log(`  ${colors.cyan}probe [ip]${colors.reset}    - Probe local device for API`);
  console.log(`  ${colors.cyan}select <id>${colors.reset}   - Select a device by ID`);
  console.log(`  ${colors.cyan}quit${colors.reset}          - Exit\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    const deviceLabel = deviceId ? deviceId.substring(0, 8) : 'none';
    process.stdout.write(`${colors.cyan}legrand[${deviceLabel}]>${colors.reset} `);
  };

  prompt();

  rl.on('line', async (input) => {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const arg = parts[1];

    switch (cmd) {
      case 'on':
        if (!deviceId) {
          console.log(`${colors.red}No device selected. Use 'select <id>' first.${colors.reset}`);
        } else {
          await setState(deviceId, 'on', token);
        }
        break;
        
      case 'off':
        if (!deviceId) {
          console.log(`${colors.red}No device selected. Use 'select <id>' first.${colors.reset}`);
        } else {
          await setState(deviceId, 'off', token);
        }
        break;
        
      case 'dim':
      case 'brightness':
      case 'level':
        if (!deviceId) {
          console.log(`${colors.red}No device selected. Use 'select <id>' first.${colors.reset}`);
        } else if (arg) {
          const level = parseInt(arg, 10);
          if (isNaN(level) || level < 0 || level > 100) {
            console.log(`${colors.red}Invalid level. Use a number between 0 and 100.${colors.reset}`);
          } else {
            await setBrightness(deviceId, level, token);
          }
        } else {
          console.log(`${colors.red}Usage: dim <0-100>${colors.reset}`);
        }
        break;
        
      case 'status':
        if (!deviceId) {
          console.log(`${colors.red}No device selected. Use 'select <id>' first.${colors.reset}`);
        } else {
          await getDeviceStatus(deviceId, token);
        }
        break;
        
      case 'discover':
      case 'list':
      case 'devices':
        await discoverDevices(token);
        break;
      
      case 'raw':
        await showRawDevices(token);
        break;
      
      case 'probe':
        if (arg) {
          await probeLocalDevice(arg);
        } else {
          // Try to find device IP from discovery
          const probeModules = await discoverDevices(token);
          if (probeModules.length > 0 && probeModules[0].ipAddress) {
            await probeLocalDevice(probeModules[0].ipAddress);
          } else {
            console.log(`${colors.red}Usage: probe <ip-address>${colors.reset}`);
          }
        }
        break;
      
      case 'endpoints':
      case 'try':
        if (deviceId) {
          await tryStatusEndpoints(deviceId, token);
        } else if (arg) {
          await tryStatusEndpoints(arg, token);
        } else {
          console.log(`${colors.red}Select a device first or: endpoints <device-id>${colors.reset}`);
        }
        break;
        
      case 'select':
      case 'use':
        if (arg) {
          deviceId = arg;
          console.log(`${colors.green}✓ Selected device: ${deviceId}${colors.reset}`);
        } else {
          console.log(`${colors.red}Usage: select <device-id>${colors.reset}`);
        }
        break;
        
      case 'quit':
      case 'exit':
      case 'q':
        console.log(`${colors.yellow}Goodbye!${colors.reset}`);
        process.exit(0);
        break;
        
      case 'help':
      case '?':
        console.log(`\nCommands: on, off, dim, status, discover, raw, select <id>, quit\n`);
        break;
        
      default:
        if (cmd) {
          console.log(`${colors.dim}Unknown command: ${cmd}. Type 'help' for commands.${colors.reset}`);
        }
    }

    prompt();
  });

  rl.on('close', () => {
    console.log(`\n${colors.yellow}Goodbye!${colors.reset}`);
    process.exit(0);
  });
}

// Main
async function main() {
  console.log('');
  console.log(`${colors.cyan}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.bright}Legrand Cloud API Test Tool${colors.reset}                              ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════╝${colors.reset}`);

  const options = parseArgs();

  // Determine authentication method
  let token: string;

  if (options.email && options.password) {
    // Authenticate with username/password
    console.log(`\n${colors.yellow}→ Authenticating as ${options.email}...${colors.reset}`);
    
    try {
      const auth = new LegrandAuth(options.email, options.password, logger as any);
      token = await auth.getAccessToken();
      console.log(`${colors.green}✓ Authentication successful!${colors.reset}`);
    } catch (error) {
      console.log(`${colors.red}✗ Authentication failed: ${error}${colors.reset}`);
      process.exit(1);
    }
  } else if (options.token) {
    // Use manual token
    token = options.token;
    console.log(`\n${colors.dim}Using manual token: ${token.substring(0, 30)}...${colors.reset}`);
  } else {
    // No authentication provided
    console.log(`
${colors.red}No authentication provided.${colors.reset}

${colors.bright}Option 1: Username/Password (Recommended)${colors.reset}
  npx ts-node tools/testCloudApi.ts -e your@email.com -p yourpassword

${colors.bright}Option 2: Environment Variables${colors.reset}
  set LEGRAND_EMAIL=your@email.com
  set LEGRAND_PASSWORD=yourpassword
  npx ts-node tools/testCloudApi.ts

${colors.bright}Option 3: Manual Token${colors.reset}
  npx ts-node tools/testCloudApi.ts -t "eyJhbG..."

Run with --help for more options.
`);
    process.exit(1);
  }

  // Execute action
  switch (options.action) {
    case 'discover':
    case 'list':
      await discoverDevices(token);
      break;
    
    case 'raw':
      await showRawDevices(token);
      break;
      
    case 'on':
      if (!options.deviceId) {
        console.log(`${colors.red}Error: --device required for 'on' action${colors.reset}`);
        process.exit(1);
      }
      await setState(options.deviceId, 'on', token);
      break;
      
    case 'off':
      if (!options.deviceId) {
        console.log(`${colors.red}Error: --device required for 'off' action${colors.reset}`);
        process.exit(1);
      }
      await setState(options.deviceId, 'off', token);
      break;
      
    case 'status':
      if (!options.deviceId) {
        console.log(`${colors.red}Error: --device required for 'status' action${colors.reset}`);
        process.exit(1);
      }
      await getDeviceStatus(options.deviceId, token);
      break;
      
    default:
      // Interactive mode
      await interactiveMode(token, options.deviceId);
  }
}

main().catch((error) => {
  console.error(`${colors.red}Fatal error: ${error}${colors.reset}`);
  process.exit(1);
});
