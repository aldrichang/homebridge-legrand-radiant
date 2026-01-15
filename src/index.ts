import { API } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { LegrandCloudPlatform } from './cloudPlatform';

/**
 * Register the platform with Homebridge
 *
 * This plugin uses the Legrand Cloud API to control WiFi smart switches.
 */
export = (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, LegrandCloudPlatform);
};
