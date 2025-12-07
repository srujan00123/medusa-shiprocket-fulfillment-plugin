import { AbstractFulfillmentProviderService, MedusaError } from "@medusajs/framework/utils";
import {
    CalculatedShippingOptionPrice,
    CalculateShippingOptionPriceDTO,
    CreateFulfillmentResult,
    CreateShippingOptionDTO,
    FulfillmentDTO,
    FulfillmentItemDTO,
    FulfillmentOption,
    FulfillmentOrderDTO,
    Logger,
} from "@medusajs/framework/types";

import ShiprocketClient from "./client";

type InjectedDependencies = {
    logger: Logger;
};

type Options = {
    email: string;
    password: string;
    pickup_location?: string;
    cod?: 0 | 1 | "true" | "false";
};

class ShipRocketFulfillmentProviderService extends AbstractFulfillmentProviderService {
    static identifier = "shiprocket";

    protected logger_: Logger;
    protected options_: Options;
    protected client: ShiprocketClient;

    /**
     * Constructs a new instance of the ShipRocketFulfillmentProviderService.
     * @param {Logger} logger - The logger instance.
     * @param {Options} options - The options for the Shiprocket client.
     */
    constructor({ logger }: InjectedDependencies, options: Options) {
        super();
        this.logger_ = logger;
        this.options_ = options;
        this.client = new ShiprocketClient({
            email: options.email,
            password: options.password,
            pickup_location: options.pickup_location,
        });
    }

    /**
     * Returns the fulfillment options for Shiprocket.
     * @returns An array of fulfillment options.
     */
    async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
        return [
            {
                id: "Standard Shipping",
                name: "Standard Shipping",
                is_return: false,
            },
            {
                id: "Return Shipping",
                name: "Return Shipping",
                is_return: true,
            },
        ];
    }


    /**
     * Determines whether the fulfillment option can calculate the shipping rate.
     * @param data - The fulfillment option data.
     * @returns A promise that resolves to a boolean indicating whether the option can calculate the rate.
     */
    async canCalculate(data: CreateShippingOptionDTO): Promise<boolean> {
        return true;
    }
    /**
     * Calculates the shipping rate for a given order.
     * @param optionData - The fulfillment option data.
     * @param data - The fulfillment data.
     * @param context - The fulfillment context.
     * @returns The calculated shipping rate.
     * @throws {Error} If either pickup or delivery postcodes are missing.
     * @throws {Error} If weight is missing.
     */

    async calculatePrice(
        optionData: CalculateShippingOptionPriceDTO["optionData"],
        data: CalculateShippingOptionPriceDTO["data"],
        context: CalculateShippingOptionPriceDTO["context"]
    ): Promise<CalculatedShippingOptionPrice> {
        const params = {
            pickup_postcode: context["from_location"]?.address?.postal_code as string,
            delivery_postcode: context["shipping_address"]?.postal_code as string,
            weight: 0,
            cod: (this.options_.cod === "true" || this.options_.cod === 1) ? 1 : 0 as number,
        };

        // Calculate total weight
        const items = (context["items"] || []) as any[];
        let totalWeightGrams = 0;

        for (const item of items) {
            const quantity = item.quantity || 1;
            // Medusa usually stores weight in grams. Shiprocket needs kg.
            // Try variant weight first, then metadata, then default to 0
            const itemWeight = (item.variant?.weight ?? item.metadata?.weight ?? 0);
            totalWeightGrams += itemWeight * quantity;
        }

        // Convert to kg. If 0, default to 0.5kg to allow calculation to proceed (avoid blocking checkout for missing weights)
        params.weight = totalWeightGrams > 0 ? totalWeightGrams / 1000 : 0.5;

        // Ensure we have a valid pickup postcode. 
        // Note: from_location depends on Stock Location being properly configured and linked in Medusa.
        if (!params.pickup_postcode) {
            this.logger_.warn("Shiprocket: Missing pickup_postcode. Ensure a Stock Location with an address is linked to the Sales Channel.");
            // We can't proceed without it, shiprocket API will fail.
        }

        if (!params.pickup_postcode || !params.delivery_postcode) {
            throw new Error("Both pickup and delivery postcodes are required for rate calculation.");
        }

        const price = await this.client.calculate(params);

        return {
            calculated_amount: price,
            is_calculated_price_tax_inclusive: true,
        };
    }


    /**
     * Creates a fulfillment in Shiprocket.
     * @param data - The fulfillment data.
     * @param items - The items in the fulfillment.
     * @param order - The order associated with the fulfillment.
     * @param fulfillment - The fulfillment data.
     * @returns The created fulfillment data.
     */
    async createFulfillment(
        data: Record<string, unknown>,
        items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
        order: Partial<FulfillmentOrderDTO> | undefined,
        fulfillment: Partial<Omit<FulfillmentDTO, "provider_id">>
    ): Promise<CreateFulfillmentResult> {
        try {
            const externalData = await this.client.create(fulfillment, items, order);
            const { label, manifest, invoice } = await this.client.createDocuments(externalData);

            return {
                data: {
                    ...((fulfillment as object) || {}),
                    ...externalData,
                },
                labels: [
                    {
                        tracking_number: externalData.tracking_number || "",
                        tracking_url: externalData.tracking_url || "",
                        label_url: label || "",
                        // invoice_url: invoice || "", // types might not support this in label object, but okay to omit if not needed
                    },
                ],
            };
        } catch (err: any) {
            throw new MedusaError(
                MedusaError.Types.INVALID_DATA,
                (err?.message || err?.response?.data?.message || "Failed to create fulfillment")
            );
        }
    }

    /**
     * Cancels a fulfillment in Shiprocket.
     * @param data - The fulfillment data.
     * @throws {MedusaError} If the order ID is not provided.
     */
    async cancelFulfillment(data: Record<string, unknown>): Promise<any> {
        const { order_id } = data as { order_id: string };

        if (!order_id) {
            throw new MedusaError(
                MedusaError.Types.INVALID_DATA,
                "Order ID is required"
            );
        }

        await this.client.cancel(order_id);
    }

    /**
     * Creates a return fulfillment in Shiprocket.
     * @param fulfillment - The fulfillment data.
     * @returns The created return fulfillment data.
     */
    async createReturnFulfillment(
        fulfillment: Record<string, unknown>
    ): Promise<CreateFulfillmentResult> {
        const externalData = await this.client.createReturn(fulfillment);

        return {
            data: {
                ...((fulfillment as object) || {}),
                ...externalData,
            },
            labels: [
                {
                    tracking_number: externalData.tracking_number || externalData.awb || "",
                    tracking_url: externalData.tracking_url || "",
                    label_url: externalData.label_url || "",
                },
            ],
        };
    }

    /**
    * Retrieves the documents associated with a fulfillment.
    * @param data - The fulfillment data.
    * @returns An array of documents associated with the fulfillment.
    */
    async getFulfillmentDocuments(data: Record<string, unknown>): Promise<never[]> {
        const invoice = await this.client.generateInvoice(data);
        return invoice || [];
    }

    /**
     * Retrieves the documents associated with a shipment.
     * @param data - The shipment data.
     * @returns An array of documents associated with the shipment.
     */
    async getShipmentDocuments(data: any): Promise<never[]> {
        const label = await this.client.generateLabel(data);
        return label || [];
    }

    /**
     * Retrieves the documents associated with a return fulfillment.
     * @param data - The return fulfillment data.
     * @returns An empty array, as document retrieval is not supported for returns.
     */
    async getReturnDocuments(data: Record<string, unknown>): Promise<never[]> {
        return [];
    }


    /**
     * Retrieves the documents associated with a fulfillment, given its data and the type of documents to retrieve.
     * @param fulfillmentData - The fulfillment data.
     * @param documentType - The type of documents to retrieve.
     * @returns A promise that resolves once the documents have been retrieved.
     * @remarks Document retrieval is not supported by this provider.
     */
    async retrieveDocuments(
        fulfillmentData: Record<string, unknown>,
        documentType: string
    ): Promise<void> {
        this.logger_.debug("Document retrieval not supported");
    }

    /**
     * Validates the fulfillment data to ensure it has the required information.
     * If the external ID is not present, it will be generated automatically.
     * @param optionData - The data provided by the user when creating a fulfillment option.
     * @param data - The data provided by the user when creating a fulfillment.
     * @param context - The context of the fulfillment.
     * @returns A promise that resolves with the validated fulfillment data.
     */
    async validateFulfillmentData(
        optionData: Record<string, unknown>,
        data: Record<string, unknown>,
        context: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        return {
            ...data,
            external_id: `temp_${Date.now()}`,
        };
    }

    /**
     * Validates a fulfillment option to ensure it has the required information.
     * @param data - The data provided by the user when creating a fulfillment option.
     * @returns A promise that resolves with a boolean indicating whether the option is valid.
     * @remarks A fulfillment option is valid if it has an external ID.
     */
    async validateOption(data: Record<string, unknown>): Promise<boolean> {
        return data.external_id !== undefined;
    }
}

export default ShipRocketFulfillmentProviderService;
