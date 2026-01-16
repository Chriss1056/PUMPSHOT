import {
  useLoaderData,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  
  const url = new URL(request.url);
  
  const order_id = url.searchParams.get("order_id");

  if (!order_id || order_id.trim() === "") {
    throw new Response("Missing order_id parameter.", { status: 400 });
  }

  return ({
    order_id
  });
};

export default function Index() {  
  const { order_id } = useLoaderData<typeof loader>();

  (async () => {
    try {
      const response = await fetch('/api/invoicepdf/get', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ order_id: order_id }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to generate invoice:', error);
        return 1;
      }
      
      const invoiceId = response.headers.get('x-invoice-id') || 'RE';

      console.log(invoiceId);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Rechnung_${invoiceId}.pdf`;
      document.body.appendChild(link);
      link.click(); // doesnt work?
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const return_id = order_id.split('/').pop();

      open('shopify://admin/orders/' + return_id, '_top');

      return 0;
    } catch (error) {
      console.error('Error generating invoice:', error);
      return 1;
    }
  })();

  return (
    <s-page heading="PUMPSHOT">
      <s-stack gap="base">
        <s-box
          padding="base"
          background="base"
          borderWidth="base"
          borderColor="base"
          borderRadius="base"
        >
          <s-section heading="Rechnungsgenerator">
            <s-stack gap="base">
              <s-text>Rechnungsgenerierung in arbeit, bitte warten...</s-text>
            </s-stack>
          </s-section>
        </s-box>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
