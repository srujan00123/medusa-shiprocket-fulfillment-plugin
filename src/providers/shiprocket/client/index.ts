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

export default class ShiprocketClient {
    private email: string
    private password: string
    private pickup_location?: string
    private axios: AxiosInstance
    private token: string | null = null
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

        // Interceptor to handle 401 Unauthorized automatically
        this.axios.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config
                if (
                    error.response?.status === 401 &&
                    !originalRequest._retry &&
                    !originalRequest.url?.includes("/auth/login")
                ) {
                    originalRequest._retry = true
                    try {
                        await this.refreshToken()
                        originalRequest.headers["Authorization"] = `Bearer ${this.token}`
                        return this.axios(originalRequest)
                    } catch (refreshError) {
                        return Promise.reject(refreshError)
                    }
                }
                return Promise.reject(error)
            }
        )
    }

    dispose(): void {
        this.isDisposed = true
        this.token = null
    }

    private async refreshToken(): Promise<void> {
        if (this.isDisposed) return
        const auth = await authenticate(this.axios, this.email, this.password, this.isDisposed)
        this.token = auth.token
        this.axios.defaults.headers.common["Authorization"] = `Bearer ${this.token}`
    }

    private async ensureToken(): Promise<void> {
        if (!this.token) {
            await this.refreshToken()
        }
    }

    async calculate(data: ShiprocketCalculateRateRequest): Promise<number> {
        await this.ensureToken()

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
        await this.ensureToken()

        const req = (val: any, name: string) => {
            if (val === undefined || val === null || val === "") {
                throw new MedusaError(MedusaError.Types.INVALID_DATA, `Missing required field: ${name}`)
            }
            return val
        }

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
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit", hour12: false,
                })
                .replace(",", "")
                .replace(/\//g, "-")

            // Calculate totals and dimensions
            items.forEach((item) => {
                const orderItem = orderItemMap.get(item.line_item_id)
                if (!orderItem) {
                    throw new MedusaError(
                        MedusaError.Types.INVALID_DATA,
                        `Order item not found for fulfillment item: ${item.title}`
                    )
                }

                const variant = orderItem.variant
                if (!variant) {
                    throw new MedusaError(
                        MedusaError.Types.INVALID_DATA,
                        `Variant data missing for item: ${item.title}`
                    )
                }

                const weight = Number(variant.weight || 0) / 1000
                const length = Number(variant.length || 0)
                const breadth = Number(variant.width || 0)
                const height = Number(variant.height || 0)

                if (!weight || !length || !breadth || !height) {
                    throw new MedusaError(
                        MedusaError.Types.INVALID_DATA,
                        `Missing dimensions/weight for item "${item.title}". Please update product variant settings.`
                    )
                }

                const quantity = Number(item.quantity || item.raw_quantity?.value || 1)
                totalWeight += weight * quantity
                totalLength = Math.max(totalLength, length)
                totalBreadth = Math.max(totalBreadth, breadth)
                totalHeight += height * quantity
            })

            const shipping = order.shipping_address || fulfillment?.delivery_address || {}
            const billing = order.billing_address || order.customer || {}

            // Build Order Payload with STRICT validation
            const orderData = {
                order_id: `${order.id}-${Math.floor(Date.now() / 1000)}`, // Safer randomness
                order_date,
                pickup_location: this.pickup_location || "Primary",

                billing_customer_name: req(billing.first_name, "Billing First Name"),
                billing_last_name: billing.last_name || "",
                billing_address: req(shipping.address_1 || billing.address_1, "Billing Address 1"),
                billing_address_2: shipping.address_2 || billing.address_2 || "",
                billing_city: req(shipping.city || billing.city, "Billing City"),
                billing_pincode: Number(req(shipping.postal_code || billing.postal_code, "Billing Pincode")),
                billing_state: req(shipping.province || billing.province, "Billing State"),
                billing_country: req(shipping.country_code || billing.country_code || "IN", "Billing Country"),
                billing_email: req(billing.email || order.email, "Billing Email"),
                billing_phone: Number(req(shipping.phone || billing.phone, "Billing Phone").toString().replace(/[^0-9]/g, "")),

                shipping_is_billing: true,
                shipping_customer_name: req(shipping.first_name, "Shipping First Name"),
                shipping_last_name: shipping.last_name || "",
                shipping_address: req(shipping.address_1, "Shipping Address 1"),
                shipping_address_2: shipping.address_2 || "",
                shipping_city: req(shipping.city, "Shipping City"),
                shipping_pincode: Number(req(shipping.postal_code, "Shipping Pincode")),
                shipping_country: req(shipping.country_code || "IN", "Shipping Country"),
                shipping_state: req(shipping.province, "Shipping State"),
                shipping_email: req(billing.email || order.email, "Shipping Email"),
                shipping_phone: Number(req(shipping.phone, "Shipping Phone").toString().replace(/[^0-9]/g, "")),

                order_items: items.map((item) => {
                    const orderItem = orderItemMap.get(item.line_item_id)!
                    const variant = orderItem.variant!
                    const selling_price = Math.round(Number(orderItem.unit_price || orderItem.detail?.unit_price || 0))

                    return {
                        name: item.title,
                        sku: variant.sku || orderItem.variant_sku || item.sku || item.id,
                        units: Number(item.quantity || item.raw_quantity?.value || 1),
                        selling_price,
                        discount: "",
                        tax: "",
                        hsn: Number(variant.hs_code || 0),
                    }
                }),

                payment_method: "Prepaid",
                sub_total: items.reduce((sum, item) => {
                    const orderItem = orderItemMap.get(item.line_item_id)!
                    const price = Number(orderItem.unit_price || orderItem.detail?.unit_price || 0)
                    const qty = Number(item.quantity || item.raw_quantity?.value || 1)
                    return sum + (price * qty)
                }, 0),
                length: totalLength,
                breadth: totalBreadth,
                height: totalHeight,
                weight: totalWeight,
            }

            const orderCreated = await this.axios
                .post<ShiprocketCreateOrderResponse>("/orders/create/adhoc", orderData)
                .catch((err) => {
                    // Extract deep error message if available
                    const apiError = err as { response?: { data?: { errors?: Record<string, string[]> } } }
                    const firstError = apiError.response?.data?.errors
                        ? Object.values(apiError.response.data.errors)[0][0]
                        : err.message
                    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Shiprocket Error: ${firstError}`)
                })

            if (!orderCreated.data?.shipment_id) {
                throw new MedusaError(MedusaError.Types.INVALID_DATA, "Failed to create Shiprocket order: No shipment ID returned")
            }

            // Assign AWB
            const awbCreated = await this.axios.post(`/courier/assign/awb`, {
                shipment_id: orderCreated.data.shipment_id,
            })

            if (awbCreated.data.awb_assign_status !== 1) {
                // Try to cancel if AWB fails to avoid stuck orders
                try { await this.cancel(orderCreated.data.order_id) } catch (e) { /* ignore */ }

                throw new MedusaError(
                    MedusaError.Types.NOT_ALLOWED,
                    awbCreated.data.message || "AWB assignment failed"
                )
            }

            const responseData = awbCreated.data.response.data

            return {
                ...orderCreated.data,
                awb: responseData.awb_code,
                courier_company_id: responseData.courier_company_id,
                courier_name: responseData.courier_name || orderCreated.data.courier_name,
                tracking_number: responseData.awb_code,
                tracking_url: `https://shiprocket.co/tracking/${responseData.awb_code}`,
            }

        } catch (error) {
            handleError(error)
            throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Order creation failed")
        }
    }

    async cancel(orderId: string): Promise<void> {
        await this.ensureToken()
        try {
            await this.axios.post(`/orders/cancel`, { ids: [orderId] })
        } catch (error: any) {
            handleError(error)
        }
    }

    async getTrackingInfo(trackingNumber: string): Promise<ShiprocketTrackingResponse> {
        await this.ensureToken()
        try {
            const response = await this.axios.get<ShiprocketTrackingResponse>(
                `/courier/track/awb/${trackingNumber}`
            )
            return response.data
        } catch (error) {
            handleError(error)
            throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Tracking failed")
        }
    }

    async createReturn(fulfillment: any): Promise<ShiprocketCreateOrderResponse> {
        await this.ensureToken()

        // Implementation of Return Order
        // Note: Shiprocket Return API requires specific fields. 
        // We assume 'fulfillment' contains necessary return details linked to the original order.

        const returnData = {
            order_id: `${fulfillment.id}-${Math.floor(Date.now() / 1000)}`,
            order_date: new Date().toISOString().split('T')[0],
            cannel_id: "", // Optional
            pickup_customer_name: fulfillment.pickup_address?.first_name,
            pickup_last_name: fulfillment.pickup_address?.last_name || "",
            pickup_address: fulfillment.pickup_address?.address_1,
            pickup_address_2: fulfillment.pickup_address?.address_2 || "",
            pickup_city: fulfillment.pickup_address?.city,
            pickup_state: fulfillment.pickup_address?.province,
            pickup_country: fulfillment.pickup_address?.country_code || "India",
            pickup_pincode: fulfillment.pickup_address?.postal_code,
            pickup_email: fulfillment.email,
            pickup_phone: fulfillment.pickup_address?.phone,
            order_items: fulfillment.items.map((item: any) => ({
                name: item.title,
                sku: item.sku,
                units: item.quantity,
                selling_price: item.unit_price,
                discount: "",
                qc_enable: false // default false
            })),
            payment_method: "Prepaid",
            total_discount: "0",
            sub_total: fulfillment.sub_total || 0,
            length: 10, breadth: 10, height: 10, weight: 0.5 // defaults if missing on return items
        }

        try {
            const response = await this.axios.post(`/orders/create/return`, returnData)
            return response.data
        } catch (error) {
            handleError(error)
            throw new MedusaError(MedusaError.Types.INVALID_DATA, "Failed to create return order")
        }
    }

    async createDocuments(fulfillment: any) {
        await this.ensureToken()

        const createPromise = (url: string, params: any) =>
            this.axios.get(url, { params }).catch(() => ({ data: null })) // Return null on fail to not break all

        const [manifestRes, labelRes, invoiceRes] = await Promise.all([
            createPromise(`/manifests/generate`, { order_ids: [fulfillment.shipment_id] }),
            createPromise(`/courier/generate/label`, { shipment_id: [fulfillment.shipment_id] }),
            createPromise(`/orders/print/invoice`, { ids: [fulfillment.order_id] })
        ])

        const extractUrl = (res: any, key: string, checkKey?: string, checkVal?: any) => {
            if (!res?.data) return ""
            const item = Array.isArray(res.data) ? res.data[0] : res.data
            if (checkKey && item[checkKey] !== checkVal) return ""
            return item[key] || ""
        }

        return {
            manifest: extractUrl(manifestRes, "manifest_url", "status", 1),
            label: extractUrl(labelRes, "label_url", "label_created", 1),
            invoice: extractUrl(invoiceRes, "invoice_url", "is_invoice_created", true),
        }
    }

    async generateLabel(fulfillment: any) {
        await this.ensureToken()
        const res = await this.axios.get(`/courier/generate/label`, {
            params: { shipment_id: [fulfillment.shipment_id] }
        })
        return res.data?.[0]?.label_url || ""
    }

    async generateInvoice(fulfillment: any) {
        await this.ensureToken()
        const res = await this.axios.get(`/orders/print/invoice`, {
            params: { ids: [fulfillment.order_id] }
        })
        return res.data?.[0]?.invoice_url || ""
    }
}
