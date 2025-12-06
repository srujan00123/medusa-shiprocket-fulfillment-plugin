<p align="center">
  <a href="https://www.shiprocket.in">
    <img src="https://custom-icon-badges.demolab.com/badge/Shiprocket-purple?style=for-the-badge&logo=package&logoColor=white" alt="Shiprocket Logo" height="50">
  </a>
</p>

<h1 align="center">Medusa Shiprocket Fulfillment Plugin</h1>

<p align="center">
  <strong>Seamless Logistics for Medusa v2 Stores in India 🇮🇳</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/medusa-shiprocket-fulfillment-plugin">
    <img src="https://img.shields.io/npm/v/medusa-shiprocket-fulfillment-plugin?color=blue&style=flat-square" alt="NPM Version">
  </a>
  <a href="https://www.npmjs.com/package/medusa-shiprocket-fulfillment-plugin">
    <img src="https://img.shields.io/npm/dw/medusa-shiprocket-fulfillment-plugin?style=flat-square" alt="NPM Downloads">
  </a>
  <a href="https://github.com/SAM-AEL/medusa-shiprocket-fulfillment-plugin/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/SAM-AEL/medusa-shiprocket-fulfillment-plugin?style=flat-square" alt="License">
  </a>
</p>

<hr />

## 🚀 Overview

The **Medusa Shiprocket Fulfillment Plugin** integrates [Shiprocket](https://www.shiprocket.in/), India's leading logistics aggregator, directly into your [Medusa](https://medusajs.com/) store. 

Streamline your shipping operations by automating rate calculations, order creation, label generation, and returns—all from within the Medusa Admin.

**Compatible with Medusa v2.0+**

## ✨ Key Features

| Feature | Description |
| :--- | :--- |
| **💵 Automated Rates** | Fetch real-time shipping rates at checkout based on pickup and delivery pin codes. |
| **📦 Seamless Fulfillment** | Automatically create shipments in Shiprocket when you fulfill an order in Medusa. |
| **📄 Document Generation** | Generate and retrieve **Shipping Labels**, **Manifests**, and **Invoices** directly. |
| **↩️ Returns Management** | Handle return requests and generate reverse pickup shipments effortlessly. |
| **🇮🇳 India-First** | Optimized for Indian addresses, GST compliance, and domestic courier networks. |
| **🛑 Easy Cancellation** | Cancel shipments instantly from the Medusa Admin to void labels. |

## 📋 Prerequisites

Before you begin, ensure you have:

1.  A **[Medusa v2](https://docs.medusajs.com/)** server set up.
2.  A **[Shiprocket](https://app.shiprocket.in/register)** account.
3.  At least one **Pickup Location** configured in your Shiprocket dashboard.

## 🛠️ Installation

Install the plugin using your preferred package manager:

```bash
npm install medusa-shiprocket-fulfillment-plugin
# or
yarn add medusa-shiprocket-fulfillment-plugin
```

## ⚙️ Configuration

### 1. Environment Variables

Add your Shiprocket credentials to your `.env` file. 

> [!WARNING]
> **Security Note**: Never commit your actual API passwords to version control (git).

```bash
SHIPROCKET_EMAIL="your_email@example.com"
SHIPROCKET_PASSWORD="your_shiprocket_password"
# Must match the 'Nickname' of a pickup location in your Shiprocket settings
SHIPROCKET_PICKUP_LOCATION="Primary"
```

### 2. Medusa Config

Register the plugin in your `medusa-config.js` (or `medusa-config.ts`) file. You need to add it to both the `modules` (for the fulfillment provider) and `plugins` (if you are using any admin widgets, though currently optional).

```javascript
module.exports = defineConfig({
  // ... other config
  modules: [
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          {
            resolve: "medusa-shiprocket-fulfillment-plugin",
            id: "shiprocket",
            options: {
              email: process.env.SHIPROCKET_EMAIL,
              password: process.env.SHIPROCKET_PASSWORD,
              pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION,
              /**
               * Set "true" (string) to enable Cash on Delivery support.
               * This maps the payment method 'cod' to Shiprocket's COD logic.
               */
              cod: "false", 
            },
          },
        ],
      },
    },
  ],
});
```

## 💻 Usage Guide

### Enabling the Provider

1.  Log in to your **Medusa Admin**.
2.  Go to **Settings** → **Regions**.
3.  Select the region you want to ship to (e.g., "India").
4.  In the **Fulfillment Providers** section, edit and ensure `shiprocket` is selected.
5.  Save changes.

### Shipping Options

You can now create Shipping Options (e.g., "Standard Shipping") that use the **shiprocket** provider.
-   **Calculated**: Choose "Calculated" price type to use Shiprocket's real-time rate API.

### Creating a Fulfillment (Shipment)
When you fulfill an order in the Medusa Admin:
1.  The plugin creates an order in Shiprocket.
2.  It attempts to automatically assign an AWB (Air Waybill) using Shiprocket's "adhoc" API.
3.  If successful, the **Tracking Number** and **Tracking URL** are saved to the fulfillment in Medusa.

## 🐛 Troubleshooting

### "Rate calculation failed"
-   Ensure both the **Store Address** (Pickup) and **Customer Address** (Delivery) have valid 6-digit Indian pincodes.
-   Check that the `weight` is set on your Product Variants (in grams or per your Shiprocket config). Shiprocket requires weight to calculate rates.

### "Authentication failed"
-   Double-check your `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD` in `.env`.
-   The plugin auto-refreshes tokens, but invalid credentials will block this.

## 🤝 Contributing

Contributions are welcome! If you find a bug or want to add a feature:

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes.
4.  Open a Pull Request.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/SAM-AEL">SAM-AEL</a>
</p>
