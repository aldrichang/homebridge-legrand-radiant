import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { LegrandCloudApi, Module } from './legrandCloudApi';
import { LegrandCloudAccessory } from './cloudAccessory';

/**
 * Device configuration from config.json (manual override)
 */
interface DeviceConfig {
  id: string;
  name: string;
  type?: 'switch' | 'dimmer';
}


/**
 * Legrand Radiant Cloud Platform Plugin
 * Controls Legrand Radiant WiFi smart switches via the cloud API
 */
export class LegrandCloudPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  private readonly accessoryHandlers: Map<string, LegrandCloudAccessory> = new Map();

  public cloudApi: LegrandCloudApi;
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.log.info('Initializing Legrand Radiant Cloud platform');

    // Create cloud API client
    this.cloudApi = new LegrandCloudApi(
      {
        email: this.config.email || '',
        password: this.config.password || '',
        debug: this.config.debug,
      },
      this.log,
    );

    // If manual token provided, use it
    if (this.config.accessToken) {
      this.cloudApi.setAccessToken(this.config.accessToken);
      this.log.info('Using manually provided access token');
    }

    // When homebridge is fully loaded, register devices
    this.api.on('didFinishLaunching', () => {
      this.log.debug('Homebridge finished launching');
      this.discoverDevices();
    });

    // Handle shutdown - stop polling
    this.api.on('shutdown', () => {
      this.log.info('Shutting down, stopping polling...');
      this.stopPolling();
    });
  }

  /**
   * Start polling for device status updates
   */
  private startPolling(): void {
    // Don't start if already polling
    if (this.pollingInterval) {
      this.log.debug('Polling already running');
      return;
    }

    // Config is in seconds, convert to milliseconds
    const intervalSeconds = this.config.pollingInterval || 30;
    const interval = intervalSeconds * 1000;

    this.log.info(`Starting status polling every ${intervalSeconds} seconds`);

    // Do an immediate poll
    this.pollDeviceStatus();

    this.pollingInterval = setInterval(() => {
      this.pollDeviceStatus();
    }, interval);
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Poll all devices for their current status using real-time getState command
   */
  private async pollDeviceStatus(): Promise<void> {
    if (this.config.debug) {
      this.log.debug('Polling for device status (using getState command)...');
    }

    // Poll each device individually using the real-time getState endpoint
    for (const [deviceId, handler] of this.accessoryHandlers) {
      try {
        const state = await this.cloudApi.getStatus(deviceId);

        if (state) {
          if (this.config.debug) {
            this.log.debug(`  ${deviceId}: on=${state.on}, brightness=${state.brightness}`);
          }
          handler.updateState(state.on, state.brightness);
        } else if (this.config.debug) {
          this.log.debug(`  ${deviceId}: no state returned`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('401') || errorMessage.includes('auth')) {
          this.log.error('Polling failed: Authentication error - check email/password');
          return; // Stop polling if auth fails
        } else {
          this.log.warn(`Polling error for ${deviceId}: ${errorMessage}`);
        }
      }
    }
  }

  /**
   * Called when homebridge restores cached accessories from disk
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  /**
   * Discover and register devices
   */
  private async discoverDevices(): Promise<void> {
    // Log cached accessories for debugging
    this.log.debug(`Found ${this.accessories.length} cached accessories`);
    for (const acc of this.accessories) {
      this.log.debug(`  Cached: ${acc.displayName} (${acc.context.deviceId}) UUID: ${acc.UUID}`);
    }

    // Check for manual device config first
    const manualDevices: DeviceConfig[] = this.config.devices || [];

    if (manualDevices.length > 0) {
      this.log.info('Using manually configured devices');

      const configuredIds = new Set<string>();
      for (const device of manualDevices) {
        this.addDevice(device);
        configuredIds.add(device.id);
      }

      // Remove cached accessories not in manual config
      this.cleanupOldAccessories(configuredIds);

      // Check if we have credentials for polling
      if (this.config.email && this.config.password) {
        this.log.info('Credentials provided - polling will update state automatically');
        this.startPolling();
      } else if (this.config.accessToken) {
        this.log.info('Access token provided - polling will update state automatically');
        this.startPolling();
      } else {
        this.log.warn('No credentials or access token provided - polling disabled');
        this.log.warn('Add email/password to enable automatic state updates');
      }
      return;
    }

    // Auto-discover devices from API
    this.log.info('Auto-discovering devices from Legrand cloud...');

    try {
      const modules = await this.cloudApi.discoverDevices();

      if (modules.length === 0) {
        this.log.warn('No devices found. Check your access token.');
        return;
      }

      const discoveredIds = new Set<string>();
      for (const module of modules) {
        this.addDeviceFromModule(module);
        discoveredIds.add(module.id);
      }

      // Start polling for status updates
      this.startPolling();

      // Remove any cached accessories that are no longer present
      this.cleanupOldAccessories(discoveredIds);
    } catch (error) {
      this.log.error(`Failed to discover devices: ${error}`);
    }
  }

  /**
   * Remove cached accessories that are no longer present
   */
  private cleanupOldAccessories(validIds: Set<string>): void {
    const toRemove: PlatformAccessory[] = [];

    for (const accessory of this.accessories) {
      if (!validIds.has(accessory.context.deviceId)) {
        this.log.info('Removing old accessory:', accessory.displayName);
        toRemove.push(accessory);
      }
    }

    if (toRemove.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, toRemove);

      // Remove from our array too
      for (const acc of toRemove) {
        const index = this.accessories.indexOf(acc);
        if (index > -1) {
          this.accessories.splice(index, 1);
        }
      }
    }
  }

  /**
   * Add a device from an API module
   */
  private addDeviceFromModule(module: Module): void {
    // Skip devices without a name
    if (!module.name || module.name.trim() === '') {
      this.log.warn(`Skipping device ${module.id} - no name provided`);
      return;
    }

    const isDimmer = module.deviceType?.toLowerCase().includes('dimmer') || false;

    this.addDevice({
      id: module.id,
      name: module.name.trim(),
      type: isDimmer ? 'dimmer' : 'switch',
    });
  }

  /**
   * Add a device as a HomeKit accessory
   */
  private addDevice(device: DeviceConfig): void {
    // Validate device name
    const deviceName = device.name?.trim() || `Legrand Device ${device.id.substring(0, 8)}`;

    if (!deviceName) {
      this.log.error(`Cannot add device ${device.id} - no valid name`);
      return;
    }

    const uuid = this.api.hap.uuid.generate(`legrand-cloud-${device.id}`);

    // Check if accessory already exists
    const existingAccessory = this.accessories.find(acc => acc.UUID === uuid);

    if (existingAccessory) {
      this.log.info('Restoring existing accessory:', existingAccessory.displayName);

      existingAccessory.context.deviceId = device.id;
      existingAccessory.context.deviceName = deviceName;
      existingAccessory.context.deviceType = device.type || 'switch';

      const handler = new LegrandCloudAccessory(
        this,
        existingAccessory,
        device.id,
        deviceName,
        device.type || 'switch',
      );
      this.accessoryHandlers.set(device.id, handler);

      this.api.updatePlatformAccessories([existingAccessory]);
    } else {
      this.log.info('Adding new accessory:', deviceName);

      const accessory = new this.api.platformAccessory(deviceName, uuid);

      accessory.context.deviceId = device.id;
      accessory.context.deviceName = deviceName;
      accessory.context.deviceType = device.type || 'switch';

      const handler = new LegrandCloudAccessory(
        this,
        accessory,
        device.id,
        deviceName,
        device.type || 'switch',
      );
      this.accessoryHandlers.set(device.id, handler);

      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    }
  }
}
