# Homebridge Legrand Radiant

[![npm](https://img.shields.io/npm/v/homebridge-legrand-radiant.svg)](https://www.npmjs.com/package/homebridge-legrand-radiant)
[![License](https://img.shields.io/npm/l/homebridge-legrand-radiant.svg)](https://github.com/yourusername/homebridge-legrand-radiant/blob/main/LICENSE)

Homebridge plugin to control **Legrand Radiant WiFi smart switches and dimmers** via the Legrand cloud API.

## Features

- 🔌 Control Legrand Radiant WiFi switches and dimmers via HomeKit
- 🔄 Automatic device discovery - no manual configuration needed
- 🔐 Secure OAuth2 authentication with automatic token refresh
- 📡 Real-time status updates
- 💡 Support for both switches and dimmers

## Supported Devices

This plugin works with Legrand Radiant WiFi smart devices that use the **Legrand Smart Lights** app, including:

- Radiant Smart WiFi Switch
- Radiant Smart WiFi Dimmer
- Other WiFi-enabled devices using the Legrand Smart Lights app

> **Note:** This plugin is for WiFi-based switches that use the cloud API. It does **not** support RF-based switches that require the LC7001 hub.

## Requirements

- [Homebridge](https://homebridge.io/) v1.6.0 or later
- Node.js v18 or later
- A Legrand Smart Lights account with configured devices

## Installation

### Via Homebridge UI (Recommended)

1. Open the Homebridge UI
2. Go to **Plugins**
3. Search for `homebridge-legrand-radiant`
4. Click **Install**

### Via npm

```bash
npm install -g homebridge-legrand-radiant
```

## Configuration

Add the platform to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "LegrandRadiant",
      "name": "Legrand",
      "email": "your-email@example.com",
      "password": "your-password"
    }
  ]
}
```

### Configuration Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `platform` | Yes | - | Must be `LegrandRadiant` |
| `name` | Yes | - | Display name in Homebridge logs |
| `email` | Yes | - | Your Legrand Smart Lights account email |
| `password` | Yes | - | Your Legrand Smart Lights account password |
| `debug` | No | `false` | Enable verbose debug logging |

### Advanced Configuration

If you need to manually specify devices (instead of auto-discovery):

```json
{
  "platforms": [
    {
      "platform": "LegrandRadiant",
      "name": "Legrand",
      "email": "your-email@example.com",
      "password": "your-password",
      "devices": [
        {
          "id": "e182f1e0-ae64-41e6-a892-43fd7c5b2bad",
          "name": "Kitchen Light",
          "type": "dimmer"
        }
      ],
      "debug": true
    }
  ]
}
```

| Device Option | Required | Description |
|---------------|----------|-------------|
| `id` | Yes | Device UUID from the Legrand API |
| `name` | Yes | Display name in HomeKit |
| `type` | No | `switch` or `dimmer` (auto-detected if not specified) |

## How It Works

This plugin connects to Legrand's cloud API to control your WiFi smart switches:

1. **Authentication** - Securely logs in using OAuth2 with your Legrand account
2. **Discovery** - Automatically finds all your configured devices
3. **Control** - Sends commands through the cloud API
4. **Status** - Retrieves current device state

```
HomeKit → Homebridge → Legrand Cloud API → Your WiFi Switch
```

## Development

### Building

```bash
npm install
npm run build
```

### Testing

```bash
# Test the API directly
npx ts-node tools/testCloudApi.ts <deviceId> interactive <token>
```

### Development Mode

```bash
npm run watch
```

## Troubleshooting

### Devices not appearing

1. Make sure your devices are set up in the Legrand Smart Lights app
2. Verify your email and password are correct
3. Enable `debug: true` in the config and check Homebridge logs

### Authentication errors

1. Verify your credentials are correct
2. Try logging out and back in to the Legrand Smart Lights app
3. Check if your account has 2FA enabled (not currently supported)

### Commands not working

1. Check that the device is online in the Legrand app
2. Verify your internet connection
3. Enable debug mode to see API responses

## API Documentation

This plugin uses the Legrand Developer API:

| Endpoint | Purpose |
|----------|---------|
| `GET /servicecatalog/api/v3.0/plants` | List homes |
| `GET /servicecatalog/api/v3.0/plants/{id}/modules` | List devices |
| `POST /devicemanagement/api/v2.0/modules/{id}/commands/setState` | Control device |

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## Credits

- Inspired by [homebridge-lc7001](https://github.com/sbozarth/homebridge-lc7001)
- Uses the Legrand cloud API (reverse engineered)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Disclaimer

This plugin is not affiliated with or endorsed by Legrand. Use at your own risk.
