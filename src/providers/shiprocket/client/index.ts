import axios, { AxiosInstance } from "axios"
import { MedusaError } from "@medusajs/utils"
import { authenticate } from "./methods/authenticate"
import { handleError } from "./handle-error"

import type {
    ShiprocketClientOptions,
    ShiprocketCalculateRateRequest,
    ShiprocketCalculateRateResponse,
    ShiprocketCreateOrderResponse,
    ShiprocketTrackingResponse,
} from "./types"

class ShiprocketClient {
    private email: string
    private password: string
    private pickup_location?: string
    private axios: AxiosInstance
    private token: string | null = null
    private tokenExpiry: number | null = null
    private refreshTimeout: NodeJS.Timeout | null = null
    private isDisposed = false

    constructor(options: ShiprocketClientOptions) {
        if (!options.email || !options.password) {
            throw new MedusaError(
                MedusaError.Types.INVALID_DATA,
                "Shiprocket API credentials are required"
            )
        }
        this.email = options.email
        this.password = options.password
        this.pickup_location = options.pickup_location
        this.axios = axios.create({
            baseURL: "https://apiv2.shiprocket.in/v1/external",
            headers: { "Content-Type": "application/json" },
            timeout: 10000,
        })
        process.on("beforeExit", () => this.dispose())
    }

    dispose(): void {
        if (this.isDisposed) return
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout)
            this.refreshTimeout = null
        }
        this.token = null
        this.tokenExpiry = null
        this.isDisposed = true
    }

    private async ensureAuthenticated(): Promise<void> {
        if (!this.token || !this.tokenExpiry || Date.now() > this.tokenExpiry) {
            const auth = await authenticate(this.axios, this.email, this.password, this.isDisposed)
            this.token = auth.token
            this.tokenExpiry = auth.tokenExpiry
            this.axios.defaults.headers.common["Authorization"] = `Bearer ${this.token}`
            if (this.refreshTimeout) clearTimeout(this.refreshTimeout)
            this.refreshTimeout = setTimeout(
                () => {
                    this.ensureAuthenticated().catch((error) => {
                        throw new MedusaError(
                            MedusaError.Types.UNEXPECTED_STATE,
                            `Failed to refresh Shiprocket token: ${error.message}`
                        )
                    })
                },
                8 * 24 * 60 * 60 * 1000 // Refresh after 8 days
            )
        }
    }

    async calculate(data: ShiprocketCalculateRateRequest): Promise<number> {
        await this.ensureAuthenticated()

        try {
            const response = await this.axios.get<ShiprocketCalculateRateResponse>(
                "/courier/serviceability/",
                { params: data }
            )

            const availableCouriers = response.data.data.available_courier_companies
            if (!availableCouriers?.length) {
                throw new MedusaError(
                    MedusaError.Types.NOT_FOUND,
                    "No couriers available for this route"
                )
            }

            const filtered = data.allowed_courier_ids?.length
                ? availableCouriers.filter((c) => data.allowed_courier_ids!.includes(c.id))
                : availableCouriers

            if (!filtered?.length) {
                throw new MedusaError(
                    MedusaError.Types.NOT_FOUND,
                    "No allowed couriers available for this route"
                )
            }

            const cheapest = filtered.reduce((min, curr) =>
                Number(curr.rate) < Number(min.rate) ? curr : min
            )

            return Math.ceil(Number(cheapest?.rate) || 0)
        } catch (error) {
            handleError(error)
            throw new MedusaError(
                MedusaError.Types.UNEXPECTED_STATE,
                "Rate calculation failed unexpectedly"
            )
        }
    }

    async create(
        fulfillment: any,
        items: any[],
        order: any
    ): Promise<ShiprocketCreateOrderResponse> {
        await this.ensureAuthenticated()

        const safe = (v: any, fallback: any) => (v != null ? v : fallback)

        const orderItemMap = new Map()
        if (Array.isArray(order.items)) {
            order.items.forEach((orderItem) => {
                orderItemMap.set(orderItem.id, orderItem)
            })
        }

        let totalWeight = 0
        let totalLength = 0
        let totalBreadth = 0
        let totalHeight = 0

        try {
            const order_date = new Date(order.created_at)
                .toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                })
                .replace(",", "")
                .replace(/\//g, "-")

            const totalCost = items.reduce((sum, fi) => {
                const orderItem = orderItemMap.get(fi.line_item_id)
                if (!orderItem) {
                    throw new MedusaError(
                        MedusaError.Types.INVALID_DATA,
                        `Fulfillment item ${fi.id} (${fi.title}) has no matching order item with line_item_id: ${fi.line_item_id}`
                    )
                }

                const unit = Number(orderItem.unit_price ?? orderItem.detail?.unit_price ?? 0)
                const qty = Number(fi.quantity ?? fi.raw_quantity?.value ?? 0)

                if (!unit || !qty) {
                    throw new MedusaError(
                        MedusaError.Types.INVALID_DATA,
                        `Missing unit price or quantity for fulfillment item: ${JSON.stringify(fi)}`
                    )
                }

                return sum + unit * qty
            }, 0)

            const shipping = order.shipping_address || fulfillment?.delivery_address || {}
            const billing = order.customer || {}
            const region = order.region || {}

            items.forEach((item) => {
                const orderItem = orderItemMap.get(item.line_item_id)
                if (!orderItem) {
                    throw new MedusaError(
                        MedusaError.Types.INVALID_DATA,
                        `Order item not found for fulfillment item: ${item.title} (line_item_id: ${item.line_item_id})`
                    )
                }

                const variant = orderItem.variant
                if (!variant) {
                    throw new MedusaError(
                        MedusaError.Types.INVALID_DATA,
                        `Variant data not found for order item: ${orderItem.id}`
                    )
                }

                const weight = Number(variant.weight || 0) / 1000
                const length = Number(variant.length || 0)
                const breadth = Number(variant.width || 0)
                const height = Number(variant.height || 0)

                if (!weight || !length || !breadth || !height) {
                    throw new MedusaError(
                        MedusaError.Types.INVALID_DATA,
                        `Missing dimensions/weight for item "${item.title}" (Order Item: ${orderItem.id}, Variant: ${variant.id}). 
            Please set weight, length, width, and height in the product variant settings in Medusa Admin.`
                    )
                }

                const quantity = Number(item.quantity || item.raw_quantity?.value || 1)
                totalWeight += weight * quantity
                totalLength = Math.max(totalLength, length)
                totalBreadth = Math.max(totalBreadth, breadth)
                totalHeight += height * quantity
            })

            const orderData = {
                order_id: order.id + "-" + Math.random().toString().slice(2, 12),
                order_date,
                pickup_location: this.pickup_location || "Primary",

                billing_customer_name: safe(billing.first_name, ""),
                billing_last_name: safe(billing.last_name, ""),
                billing_address: safe(shipping.address_1, ""),
                billing_address_2: safe(shipping.address_2, ""),
                billing_city: safe(shipping.city, ""),
                billing_pincode: Number(safe(shipping.postal_code, "110001")),
                billing_state: safe(shipping.province, ""),
                billing_country: safe(region.name, "India"),
                billing_email: safe(billing.email, ""),
                billing_phone: Number(
                    safe(shipping.phone, "9999999999").toString().replace(/[^0-9]/g, "")
                ),

                shipping_is_billing: true,
                shipping_customer_name: safe(shipping.first_name, ""),
                shipping_last_name: safe(shipping.last_name, ""),
                shipping_address: safe(shipping.address_1, ""),
                shipping_address_2: safe(shipping.address_2, ""),
                shipping_city: safe(shipping.city, ""),
                shipping_pincode: Number(safe(shipping.postal_code, "110001")),
                shipping_country: safe(region.name, "India"),
                shipping_state: safe(shipping.province, ""),
                shipping_email: safe(billing.email, ""),
                shipping_phone: Number(
                    safe(shipping.phone, "9999999999").toString().replace(/[^0-9]/g, "")
                ),

                order_items: items.map((item) => {
                    const orderItem = orderItemMap.get(item.line_item_id)!
                    const variant = orderItem.variant!

                    const selling_price = Math.round(
                        Number(orderItem.unit_price || orderItem.detail?.unit_price || 0)
                    )
                    const hsn_code = variant.hs_code ? Number(variant.hs_code) : 0

                    return {
                        name: item.title,
                        sku: variant.sku || orderItem.variant_sku || item.sku || item.id,
                        units: Number(item.quantity || item.raw_quantity?.value || 1),
                        selling_price,
                        discount: "",
                        tax: "",
                        hsn: hsn_code,
                    }
                }),

                payment_method: "Prepaid",
                shipping_charges: 0,
                giftwrap_charges: 0,
                transaction_charges: 0,
                total_discount: Number(order.discount_total || 0),
                sub_total: totalCost,

                length: totalLength,
                breadth: totalBreadth,
                height: totalHeight,
                weight: totalWeight,
            }

            const orderCreated = await this.axios
                .post<ShiprocketCreateOrderResponse>("/orders/create/adhoc", orderData)
                .catch((err) => {
                    const apiError = err as { response?: { data?: { errors?: Record<string, string[]> } } }
                    const firstError =
                        apiError.response?.data?.errors
                            ? Object.values(apiError.response.data.errors)[0][0]
                            : "Unknown error"
                    throw new MedusaError(MedusaError.Types.INVALID_DATA, firstError)
                })

            if (!orderCreated.data?.shipment_id) {
                throw new MedusaError(
                    MedusaError.Types.INVALID_DATA,
                    "Failed to create Shiprocket order"
                )
            }

            const awbCreated = await this.axios.post(`/courier/assign/awb`, {
                shipment_id: orderCreated.data.shipment_id,
                courier_id: orderCreated.data.courier_company_id,
            })

            if (awbCreated.data.awb_assign_status !== 1) {
                try {
                    await this.cancel(orderCreated.data.order_id)
                } catch (err: any) {
                    // swallow cancel error but log upstream if needed
                }

                throw new MedusaError(
                    MedusaError.Types.NOT_ALLOWED,
                    awbCreated.data.message || "AWB assignment failed"
                )
            }

            return {
                order_id: orderCreated.data.order_id,
                shipment_id: orderCreated.data.shipment_id,
                status: orderCreated.data.status,
                status_code: orderCreated.data.status_code,
                awb: awbCreated.data.response.data.awb_code,
                courier_company_id: awbCreated.data.response.data.courier_company_id,
                courier_name: orderCreated.data.courier_name,
                tracking_number: awbCreated.data.response.data.awb_code,
                tracking_url: "https://shiprocket.co/tracking/" + awbCreated.data.response.data.awb_code,
                label_url: orderCreated.data.label_url,
                shipping_charges: orderCreated.data.shipping_charges,
                payment_method: orderCreated.data.payment_method,
                transaction_charges: orderCreated.data.transaction_charges,
                giftwrap_charges: orderCreated.data.giftwrap_charges,
            }
        } catch (error) {
            handleError(error)
            throw new MedusaError(
                MedusaError.Types.UNEXPECTED_STATE,
                "Order creation failed unexpectedly"
            )
        }
    }

    async cancel(orderId: string): Promise<void> {
        await this.ensureAuthenticated()
        try {
            await this.axios.post(`/orders/cancel`, { ids: [orderId] })
        } catch (error: any) {
            handleError(error)
            throw new MedusaError(
                MedusaError.Types.UNEXPECTED_STATE,
                error.message || "Order cancellation failed unexpectedly"
            )
        }
    }

    async getTrackingInfo(trackingNumber: string): Promise<ShiprocketTrackingResponse> {
        await this.ensureAuthenticated()
        try {
            const response = await this.axios.get<ShiprocketTrackingResponse>(
                `/courier/track/awb/${trackingNumber}`
            )
            return response.data
        } catch (error) {
            handleError(error)
            throw new MedusaError(
                MedusaError.Types.UNEXPECTED_STATE,
                "Tracking info retrieval failed unexpectedly"
            )
        }
    }

    async createReturn(fulfillment: any): Promise<ShiprocketCreateOrderResponse> {
        await this.ensureAuthenticated()

        throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "Not Implemented. Please create a return order manually."
        )

        return {
            order_id: fulfillment.external_id,
            shipment_id: fulfillment.external_id,
            status: "success",
            status_code: 200,
            awb: "1234567890",
            courier_company_id: 1,
            courier_name: "DHL",
            tracking_number: "1234567890",
            tracking_url: "",
            label_url: "",
            payment_method: "cod",
            shipping_charges: "0",
            transaction_charges: "0",
            giftwrap_charges: "0",
        }
    }

    async createDocuments(fulfillment: any) {
        await this.ensureAuthenticated()

        const manifest = await this.axios.get(`/manifests/generate`, {
            params: { order_ids: [fulfillment.shipment_id] },
        })
        const label = await this.axios.get(`/courier/generate/label`, {
            params: { shipment_id: [fulfillment.shipment_id] },
        })
        const invoice = await this.axios.get(`/orders/print/invoice`, {
            params: { ids: [fulfillment.order_id] },
        })

        return {
            label: label[0].label_created === 1 ? label[0].label_url : "",
            manifest: manifest[0].status === 1 ? manifest[0].manifest_url : "",
            invoice: invoice[0].is_invoice_created ? invoice[0].invoice_url : "",
        }
    }

    async generateLabel(fulfillment: any) {
        const label = await this.axios.get(`/courier/generate/label`, {
            params: { shipment_id: [fulfillment.shipment_id] },
        })
        return label[0].label_url
    }

    async generateInvoice(fulfillment: any) {
        const invoice = await this.axios.get(`/orders/print/invoice`, {
            params: { ids: [fulfillment.order_id] },
        })
        return invoice[0].invoice_url
    }
}

export default ShiprocketClient
