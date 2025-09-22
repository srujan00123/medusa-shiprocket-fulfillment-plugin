<h1 align="center">
  <br>
  <a href="http://www.shiprocket.in"><img src="https://i.postimg.cc/zGzTRdqp/id-Nga-I3rk-T-logos.png" alt="Markdownify" width="200"></a>
  <br>
 for Medusa 2.0+
  <br>
</h1>

<p align="center">
    <img src="https://img.shields.io/npm/v/medusa-cashfree-payment-plugin" alt="medusa-cashfree-payment-plugin">
    <img src="https://img.shields.io/npm/dw/medusa-cashfree-payment-plugin" alt="medusa-cashfree-payment-plugin">  
    <img src="https://img.shields.io/github/contributors/SAM-AEL/medusa-cashfree-payment-plugin" alt="medusa-cashfree-payment-plugin">  
 <img src="https://img.shields.io/github/last-commit/SAM-AEL/medusa-cashfree-payment-plugin" alt="medusa-cashfree-payment-plugin">
</p>
  
<h4 align="center">From checkout to doorstep — simplify logistics with <a href="https://www.shiprocket.in" target="_blank">Shiprocket</a> for Medusa.</h4>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#%EF%B8%8F-installation">Installation</a> •
  <a href="#-setup-guide">Setup Guide</a> •
  <a href="#-api-reference">API Reference</a> •
  <a href="#-troubleshooting">Troubleshooting</a> •
  <a href="#-contributing">Contributing</a> •
  <a href="#-license">License</a>
</p>

## ✨ Features

- 🚚 **Seamless Shipping** - _Create and manage shipments directly from Medusa admin panel_

- 💸 **Automated Rate Calculation** - _Fetch real-time courier rates at checkout_

- ❌ **Easy Cancellations** - _Cancel shipments instantly from Medusa_

- 📦 **Pickup Location Support** - _Configure and use multiple Shiprocket pickup points_

- 🌍 **India-first Logistics** - _Optimized for Indian e-commerce and Shiprocket’s courier network_

## 📋 Prerequisites

- [MedusaJS](https://docs.medusajs.com/) 2 store

- [Shiprocket](https://www.shiprocket.in/) account

## 🚧 To Do:

- 💱 **Return Shipping** - _Initiate Refund and replacement directly through Admin Dashboard_

- 🔗 **Webhooks integration** - _Stay updated with shipment updates in Admin Dashboard_

- 🔎 **Live Tracking** - _Get shipment status and tracking updates without leaving Medusa Admin Dashboard_

- 📚 **Label, Manifest and Invoice** - _Directly accessible in Medusa Admin_
- **_Rewrite the plugin with more optimizations and code cleanup._**

## 🛠️ Installation

#### Step 1: Install the Plugin

Choose your preferred package manager:

```bash

# npm

npm  install  medusa-shiprocket-fulfillment-plugin



# yarn

yarn  add  medusa-shiprocket-fulfillment-plugin



# pnpm

pnpm  add  medusa-shiprocket-fulfillment-plugin

```

#### Step 2: Configure Plugin

Add the plugin to your `medusa-config.js`:

```javascript
module.exports = defineConfig({

  // other configs

  modules: [

    // other plugins

    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          {
            resolve:
              "medusa-shiprocket-fulfillment-plugin/providers/shiprocket",
            id: "shiprocket",
            options: {
              email: process.env.SHIPROCKET_EMAIL,
              password: process.env.SHIPROCKET_PASSWORD,
              pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION,
            },
          },
        ],
      },
    },
  ],
  plugins: [
    {
      resolve: "medusa-shiprocket-fulfillment-plugin",
      options: {
        email: process.env.SHIPROCKET_EMAIL,
        password: process.env.SHIPROCKET_PASSWORD,
        pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION,
      },
    },
  ],
});
```

#### Step 3: Environment Variables

Create or update your `.env` file:

```env

# Shiprocket Configuration

SHIPROCKET_EMAIL=your email
SHIPROCKET_PASSWORD=password
SHIPROCKET_PICKUP_LOCATION=Primary

```

> ⚠️ **Security Note**: Never commit your production credentials to version control.

### ⚙️ Configuration Options

| Option            | Type   | Required | Default | Description                                                                          |
| ----------------- | ------ | -------- | ------- | ------------------------------------------------------------------------------------ |
| `email`           | string | ✅       | -       | Your Shiprocket account email                                                        |
| `password`        | string | ✅       | -       | Your Shiprocket account password                                                     |
| `pickup_location` | string | ✅       | -       | The Shiprocket pickup location name (must match one created in Shiprocket dashboard) |

### 🎯 Setup Guide

### Enable Fulfillment Provider

1. Navigate to **Medusa Admin → Settings → Regions**
2. Select your target region - India (or any region you want Shiprocket to serve).
3. In **Fulfillment Providers**, select `shiprocket`.
4. Click **Save Changes**.

---

### Configure Shiprocket Credentials

1. Go to your [Shiprocket Dashboard](https://app.shiprocket.in/).
2. Ensure you have:
   - **Email** and **Password** of your Shiprocket account.
   - At least one **Pickup Location** set up (e.g., `Primary`).
3. Add credentials to your `.env` file:

### 🔧 API Reference

This plugin implements the complete `AbstractFulfillmentProvider` interface:

#### Core Methods

- `createFulfillment()` - Create a fulfillment in Shiprocket.
- `cancelFulfillment()` - Cancel a fulfillment in Shiprocket.
- `getFulfillmentDocuments()` - Retrieve labels, manifests, and invoices for a fulfillment.
- `getTrackingInfo()` - Get tracking information for a shipment.

#### Utility Methods

- `calculateShippingRate()` - Calculate shipping rates for an order.
- `createReturn()` - Create a return shipment in Shiprocket.
- `generateLabel()` - Generate shipping label for a fulfillment.
- `generateInvoice()` - Generate invoice for a fulfillment.

### 🐛 Troubleshooting

**_Plugin not appearing in admin_**

- Follow the setup and reload the server.

**_Admin UI Widget not working_**

- Add the plugin to plugin import in medusa-config. reload the server.

### Getting Help

- 📖 [Shiprocket API Documentation](https://api.shiprocket.in/)

- 💬 [MedusaJS Discord](https://discord.gg/medusajs)

- 🐛 [Report Issues](https://github.com/SAM-AEL/medusa-shiprocket-fulfillment-plugin/issues)

### 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository

2. Create your feature branch (`git checkout -b feature/amazing-feature`)

3. Commit your changes (`git commit -m 'Add amazing feature'`)

4. Push to the branch (`git push origin feature/amazing-feature`)

5. Open a Pull Request

### 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### 🙏 Acknowledgments

- [MedusaJS](https://medusajs.com/) - for the best open-source e-commerce platform.

- [Shiprocket](https://www.shiprocket.in/) - for making the life of a shipper easier.

---

<h1 align="center">
  <br> 
  Thank you 🫶
  <br>
</h1>
