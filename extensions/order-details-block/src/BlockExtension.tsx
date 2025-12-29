import {render} from 'preact';

export default async () => {
  render(<Extension />, document.body);
}

function Extension() {
  const {data} = shopify;
  const order_id = data.selected[0].id;

  return (
    <s-admin-block heading="Rechnungsdownload">
      <s-stack gap="base">
        <s-box
          padding="base"
          background="base"
          borderWidth="base"
          borderColor="base"
          borderRadius="base"
        >
          <s-stack gap="base">
            <s-grid gridTemplateColumns="1fr auto">
              <s-text>Order ID:</s-text>
              <s-text>{order_id}</s-text>
            </s-grid>
            <s-stack direction="inline" justifyContent="end">
              <s-button variant="primary" icon="check" accessibilityLabel="PDF Generieren">PDF Generieren</s-button>
            </s-stack>
          </s-stack>
        </s-box>
      </s-stack>
    </s-admin-block>
  );
}