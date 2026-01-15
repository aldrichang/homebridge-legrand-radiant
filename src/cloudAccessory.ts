import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
} from 'homebridge';
import { LegrandCloudPlatform } from './cloudPlatform';

/**
 * Accessory handler for a Legrand Cloud-controlled switch
 */
export class LegrandCloudAccessory {
  private service: Service;
  private state = {
    on: false,
    brightness: 100,
  };
  private readonly isDimmer: boolean;

  constructor(
    private readonly platform: LegrandCloudPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly deviceId: string,
    private readonly deviceName: string,
    deviceType: string,
  ) {
    this.isDimmer = deviceType === 'dimmer';

    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Legrand')
      .setCharacteristic(this.platform.Characteristic.Model, `Radiant WiFi ${this.isDimmer ? 'Dimmer' : 'Switch'}`)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, deviceId.substring(0, 8))
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, '1.0.0');

    // Remove any conflicting services
    const existingLightbulb = this.accessory.getService(this.platform.Service.Lightbulb);
    const existingSwitch = this.accessory.getService(this.platform.Service.Switch);

    if (this.isDimmer) {
      // Remove switch service if exists (in case device type changed)
      if (existingSwitch) {
        this.accessory.removeService(existingSwitch);
      }

      // Get or create lightbulb service
      this.service = existingLightbulb || this.accessory.addService(this.platform.Service.Lightbulb, deviceName);

      // Set up brightness characteristic
      this.service.getCharacteristic(this.platform.Characteristic.Brightness)
        .onSet(this.setBrightness.bind(this))
        .onGet(this.getBrightness.bind(this));
    } else {
      // Remove lightbulb service if exists
      if (existingLightbulb) {
        this.accessory.removeService(existingLightbulb);
      }

      // Get or create switch service
      this.service = existingSwitch || this.accessory.addService(this.platform.Service.Switch, deviceName);
    }

    // Set the display name
    this.service.setCharacteristic(this.platform.Characteristic.Name, deviceName);

    // Register handlers for on/off
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));
  }

  /**
   * Handle SET On
   */
  private async setOn(value: CharacteristicValue): Promise<void> {
    const isOn = value as boolean;

    this.platform.log.debug(`Setting ${this.deviceName} to ${isOn ? 'ON' : 'OFF'}`);

    try {
      const success = isOn
        ? await this.platform.cloudApi.turnOn(this.deviceId)
        : await this.platform.cloudApi.turnOff(this.deviceId);

      if (success) {
        this.state.on = isOn;
        this.platform.log.info(`${this.deviceName} is now ${isOn ? 'ON' : 'OFF'}`);
      } else {
        throw new Error('Failed to set power state');
      }
    } catch (error) {
      this.platform.log.error(`Error setting power: ${error}`);
      throw error;
    }
  }

  /**
   * Handle GET On
   */
  private async getOn(): Promise<CharacteristicValue> {
    return this.state.on;
  }

  /**
   * Handle SET Brightness (for dimmers)
   */
  private async setBrightness(value: CharacteristicValue): Promise<void> {
    const brightness = value as number;

    this.platform.log.debug(`Setting ${this.deviceName} brightness to ${brightness}%`);

    try {
      const success = await this.platform.cloudApi.setBrightness(this.deviceId, brightness);

      if (success) {
        this.state.brightness = brightness;
        this.state.on = brightness > 0;
      } else {
        throw new Error('Failed to set brightness');
      }
    } catch (error) {
      this.platform.log.error(`Error setting brightness: ${error}`);
      throw error;
    }
  }

  /**
   * Handle GET Brightness (for dimmers)
   */
  private async getBrightness(): Promise<CharacteristicValue> {
    return this.state.brightness;
  }

  /**
   * Update state from external source (polling)
   */
  updateState(isOn: boolean, brightness?: number): void {
    // Only update if state has changed
    if (this.state.on !== isOn) {
      this.state.on = isOn;
      this.service.updateCharacteristic(this.platform.Characteristic.On, isOn);
      this.platform.log.debug(`${this.deviceName} state updated: ${isOn ? 'ON' : 'OFF'}`);
    }

    if (this.isDimmer && brightness !== undefined && this.state.brightness !== brightness) {
      this.state.brightness = brightness;
      this.service.updateCharacteristic(this.platform.Characteristic.Brightness, brightness);
      this.platform.log.debug(`${this.deviceName} brightness updated: ${brightness}%`);
    }
  }
}
