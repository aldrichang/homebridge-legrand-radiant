import { Logger } from 'homebridge';
import * as https from 'https';
import * as crypto from 'crypto';
import { LegrandAuth } from './legrandAuth';

/**
 * Legrand Cloud API Configuration
 */
export interface LegrandCloudConfig {
  // Authentication
  email?: string;
  password?: string;
  
  // Optional
  debug?: boolean;
}

/**
 * Plant (Home) from the API
 */
export interface Plant {
  id: string;
  name: string;
  ownerEmail: string;
  status: string;
  type: string;
  country: string;
}

/**
 * Module (Device) from the API
 */
export interface Module {
  id: string;
  name: string;
  status: string; // 'on' | 'off'
  device: string; // 'light'
  deviceType: string; // 'wifiDimmer' | 'wifiSwitch'
  deviceModel: string;
  connectionState: string;
  ipAddress: string;
  macAddress: string;
  firmwareVersion: string;
  plantId: string;
}

/**
 * API Constants discovered from traffic capture
 */
const API_CONSTANTS = {
  // Base API URL
  baseUrl: 'https://api.developer.legrand.com',
  
  // Azure API Management subscription key (from app)
  subscriptionKey: '934c78d6eeb34879a9b66681f30b14fe',
  
  // Azure B2C configuration
  b2cTenant: 'login.eliotbylegrand.com',
  b2cPolicy: 'B2C_1_ambientwifi_SignUpOrSignIn',
  clientId: 'd6f3606b-c2fe-4376-a6dd-dd929cbde18d',
  
  // User agent to mimic the app
  userAgent: 'Ambient/3.0.2 (us.legrand.wiambientlighting; build:1; iOS 26.2.0) Alamofire/4.7.3',
};

/**
 * Device state
 */
export interface DeviceState {
  on: boolean;
  brightness?: number;
}

/**
 * Legrand Cloud API Client
 * 
 * Communicates with the Legrand cloud API to control WiFi smart switches
 */
export class LegrandCloudApi {
  private auth: LegrandAuth | null = null;
  private manualToken: string | null = null;
  private manualTokenExpiry: number = 0;

  constructor(
    private readonly config: LegrandCloudConfig,
    private readonly log: Logger,
  ) {
    // Set up authentication if credentials provided
    if (config.email && config.password) {
      this.auth = new LegrandAuth(config.email, config.password, log);
    }
  }

  /**
   * Get all plants (homes) for the user
   */
  async getPlants(): Promise<Plant[]> {
    await this.ensureAuthenticated();

    const url = `${API_CONSTANTS.baseUrl}/servicecatalog/api/v3.0/plants`;

    try {
      const response = await this.makeRequest('GET', url);
      
      if (Array.isArray(response)) {
        return response as unknown as Plant[];
      }
      
      return [];
    } catch (error) {
      this.log.error(`Failed to get plants: ${error}`);
      return [];
    }
  }

  /**
   * Get all modules (devices) for a plant
   */
  async getModules(plantId: string): Promise<Module[]> {
    await this.ensureAuthenticated();

    const url = `${API_CONSTANTS.baseUrl}/servicecatalog/api/v3.0/plants/${plantId}/modules`;

    try {
      const response = await this.makeRequest('GET', url);
      
      if (Array.isArray(response)) {
        return response as unknown as Module[];
      }
      
      return [];
    } catch (error) {
      this.log.error(`Failed to get modules: ${error}`);
      return [];
    }
  }

  /**
   * Discover all devices across all plants
   */
  async discoverDevices(): Promise<Module[]> {
    const plants = await this.getPlants();
    const allModules: Module[] = [];

    for (const plant of plants) {
      this.log.info(`Found plant: ${plant.name} (${plant.id})`);
      const modules = await this.getModules(plant.id);
      
      for (const module of modules) {
        this.log.info(`  Found device: ${module.name} (${module.deviceType}) - ${module.status}`);
        allModules.push(module);
      }
    }

    return allModules;
  }

  /**
   * Get current status of a device
   */
  async getDeviceStatus(plantId: string, deviceId: string): Promise<DeviceState | null> {
    const modules = await this.getModules(plantId);
    const device = modules.find(m => m.id === deviceId);
    
    if (device) {
      return {
        on: device.status === 'on',
      };
    }
    
    return null;
  }

  /**
   * Set the state of a device (on/off)
   */
  async setState(deviceId: string, state: 'on' | 'off'): Promise<boolean> {
    await this.ensureAuthenticated();

    const correlationId = crypto.randomUUID();
    
    const body = JSON.stringify({
      command: {
        state: state,
        correlationID: correlationId,
      },
      timeout: 10,
    });

    const url = `${API_CONSTANTS.baseUrl}/devicemanagement/api/v2.0/modules/${deviceId}/commands/setState`;

    try {
      const response = await this.makeRequest('POST', url, body);
      
      if (this.config.debug) {
        this.log.debug(`setState response: ${JSON.stringify(response)}`);
      }

      return true;
    } catch (error) {
      this.log.error(`Failed to set state: ${error}`);
      return false;
    }
  }

  /**
   * Set the brightness level of a dimmer (0-100)
   */
  async setBrightness(deviceId: string, level: number): Promise<boolean> {
    await this.ensureAuthenticated();

    const correlationId = crypto.randomUUID();
    const clampedLevel = Math.max(0, Math.min(100, Math.round(level)));
    const state = clampedLevel > 0 ? 'on' : 'off';
    
    const body = JSON.stringify({
      command: {
        state: state,
        level: clampedLevel,
        correlationID: correlationId,
      },
      timeout: 10,
    });

    const url = `${API_CONSTANTS.baseUrl}/devicemanagement/api/v2.0/modules/${deviceId}/commands/setState`;

    try {
      const response = await this.makeRequest('POST', url, body);
      
      if (this.config.debug) {
        this.log.debug(`setBrightness response: ${JSON.stringify(response)}`);
      }

      this.log.info(`Set ${deviceId} brightness to ${clampedLevel}%`);
      return true;
    } catch (error) {
      this.log.error(`Failed to set brightness: ${error}`);
      return false;
    }
  }

  /**
   * Turn device on
   */
  async turnOn(deviceId: string): Promise<boolean> {
    this.log.info(`Turning on device ${deviceId}`);
    return this.setState(deviceId, 'on');
  }

  /**
   * Turn device off
   */
  async turnOff(deviceId: string): Promise<boolean> {
    this.log.info(`Turning off device ${deviceId}`);
    return this.setState(deviceId, 'off');
  }

  /**
   * Get real-time device status using the getState command
   * This queries the device directly and returns current state
   */
  async getStatus(deviceId: string): Promise<DeviceState | null> {
    await this.ensureAuthenticated();

    const correlationId = crypto.randomUUID();
    
    const body = JSON.stringify({
      timeout: 10,
      command: {
        correlationID: correlationId,
      },
    });

    const url = `${API_CONSTANTS.baseUrl}/devicemanagement/api/v2.0/modules/${deviceId}/commands/getState`;

    try {
      const response = await this.makeRequest('POST', url, body);
      
      if (this.config.debug) {
        this.log.debug(`getState response: ${JSON.stringify(response)}`);
      }

      // Response format: { status: 200, payload: { state: "on", level: 75, ... } }
      if (response && typeof response === 'object') {
        const payload = response.payload as Record<string, unknown> | undefined;
        
        if (payload) {
          const state = payload.state === 'on';
          const level = typeof payload.level === 'number' ? payload.level : undefined;
          
          return {
            on: state,
            brightness: level,
          };
        }
      }

      return null;
    } catch (error) {
      this.log.error(`Failed to get device status: ${error}`);
      return null;
    }
  }


  /**
   * Ensure we have a valid access token
   */
  private async ensureAuthenticated(): Promise<void> {
    // Check manual token first
    if (this.manualToken && Date.now() < this.manualTokenExpiry - 60000) {
      return;
    }

    // Use auth module if available
    if (this.auth) {
      await this.auth.getAccessToken(); // This handles refresh internally
      return;
    }

    // No auth available
    if (!this.manualToken) {
      throw new Error(
        'No authentication available. ' +
        'Please provide email/password in config or set an access token manually.'
      );
    }
  }

  /**
   * Get the current access token
   */
  private async getAccessToken(): Promise<string> {
    if (this.auth) {
      return this.auth.getAccessToken();
    }
    
    if (this.manualToken) {
      return this.manualToken;
    }
    
    throw new Error('No access token available');
  }

  /**
   * Set access token manually (for testing or when token is obtained externally)
   */
  setAccessToken(token: string, expiresIn: number = 3600): void {
    this.manualToken = token;
    this.manualTokenExpiry = Date.now() + (expiresIn * 1000);
    
    // Also set on auth module if available
    if (this.auth) {
      this.auth.setTokens(token, undefined, expiresIn);
    }
    
    this.log.info('Access token set manually');
  }

  /**
   * Make an authenticated HTTP request
   */
  private async makeRequest(
    method: string,
    url: string,
    body?: string,
  ): Promise<Record<string, unknown>> {
    const token = await this.getAccessToken();
    
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      const headers: Record<string, string | number> = {
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'User-Agent': API_CONSTANTS.userAgent,
        'Ocp-Apim-Subscription-Key': API_CONSTANTS.subscriptionKey,
        'Authorization': `Bearer ${token}`,
        'Accept-Language': 'en-US;q=1.0',
        'Accept-Encoding': 'gzip, deflate',
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

      if (this.config.debug) {
        this.log.debug(`${method} ${url}`);
      }

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = data ? JSON.parse(data) : {};
              resolve(json);
            } catch {
              resolve({});
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (body) {
        req.write(body);
      }
      
      req.end();
    });
  }
}
