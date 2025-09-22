import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Table, Text } from "@medusajs/ui"
import { DetailWidgetProps, AdminOrder } from "@medusajs/framework/types"

const ShiprocketTrackingWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
    if (!order?.id || !order?.fulfillments) return null

    const activeShipments = order.fulfillments?.filter(
        (f: any) => !f.canceled_at && f.data.awb && f.data.shipment_id && f.provider?.id === "shiprocket_shiprocket"
    )

    return (
        <Container className="p-6 rounded-lg shadow-lg border border-neutral-700">
            <header className="mb-6">
                <Heading level="h2" className="font-semibold text-lg text-white">
                    Shiprocket Printables
                </Heading>
            </header>

            {activeShipments?.length === 0 ? (
                <Text className="text-sm italic text-gray-400">
                    No active shipments
                </Text>
            ) : (
                <ul className="space-y-6">
                    {activeShipments.map((fulfillment: any) => (
                        <li
                            key={fulfillment.id}
                            className="bg-neutral-900/10 rounded-xl shadow-none p-5 flex flex-col gap-4 border border-neutral-900/10"
                        >
                            <div className="flex justify-between items-center">
                                <Text className="text-sm text-gray-300 font-normal">
                                    <span className="text-xs font-normal text-white">Shipment ID:</span>{" "}
                                    {fulfillment.data?.shipment_id || "No AWB found"}
                                </Text>

                                <span className={`
                                px-2 py-1 rounded-lg shadow-none text-[9px] font-semibold uppercase select-none 
                                ${fulfillment.status === "delivered"
                                        ? "bg-green-500 text-black"
                                        : fulfillment.status === "pending"
                                            ? "bg-yellow-400 text-black"
                                            : "bg-red-700 text-white"}
                                            min-w-[4.5rem] text-center`}>
                                    {fulfillment.status || "Cancelled"}
                                </span>
                            </div>

                            {JSON.stringify(fulfillment, null, 2)}

                            <div className="flex justify-center items-center gap-3 mt-4">

                                {fulfillment.labels?.label_url &&
                                    <a href={`${fulfillment.labels?.label_url}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 px-4 py-1 text-xs bg-neutral-900/60 font-medium hover:bg-neutral-900/90 rounded-lg transition-colors text-center"
                                        aria-disabled="false"
                                    >
                                        Label
                                    </a>
                                }

                                {fulfillment.labels?.manifest_url &&
                                    <a href={`${fulfillment.labels?.manifest_url}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 px-4 py-1 text-xs bg-neutral-900/60 font-medium hover:bg-neutral-900/90 rounded-lg transition-colors text-center"
                                        aria-disabled="false"
                                    >
                                        Manifest
                                    </a>
                                }

                                {fulfillment.labels?.invoice_url &&
                                    <a href={`${fulfillment.labels?.invoice_url}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 px-4 py-1 text-xs bg-neutral-900/60 font-medium hover:bg-neutral-900/90 rounded-lg transition-colors text-center"
                                        aria-disabled="false"
                                    >
                                        Invoice
                                    </a>
                                }

                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Container>
    )
}

export const config = defineWidgetConfig({
    zone: "order.details.side.after",
})

export default ShiprocketTrackingWidget
