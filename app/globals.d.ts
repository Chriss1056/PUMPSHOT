declare module "*.css";

declare namespace JSX {
  interface IntrinsicElements {
    's-app-nav': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  }
}

interface ShopifyAppItem {
  id: string
  name: string
  quantity: number
  taxable: boolean
  originalTotalSet: {
    shopMoney: {
      amount: number
      currencyCode: string
    }
  }
  discountedTotalSet: {
    shopMoney: {
      amount: number
      currencyCode: string
    }
  }
  totalDiscountSet: {
    shopMoney: {
      amount: number
      currencyCode: string
    }
  }
  taxLines: [
    {
      title: string
      rate: number
      ratePercentage: number
      channelLiable: string
      priceSet: {
        shopMoney: {
          amount: number
          currencyCode: string
        }
      }
    }
  ]
}

interface Item {
  description: string;
  quantity: number;
  net: number;
  gross: number;
  tax: number;
  allowDiscount: boolean;
  discount: number;
  lineTotalGross: number;
  inputMode: string;
}

interface Total {
  totalNet: number;
  with20: number;
  with0: number;
  totalGross: number;
}

interface Data {
  orderNumber: string;
  invoiceDate: string;
  deliveryDate: string;
  paymenttype: string;
  customerNumber: string;
  refrence: string;
  contactPerson: string;
  email: email;
  customerName: string;
  customerAddress: string;
  customerUID: string;
  company: string;
  companyAddress: string;
  companyUID: string;
  hint: string;
}