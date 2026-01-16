import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import sizeOf from "image-size";
import fs from 'fs/promises';
import path from 'path';

let cachedLogo: { base64: string; width: number; height: number } | null = null;

const NAMESPACE = "pumpshot";
const KEY = "invoice_id";

export const loader = async () => {
  return Response.json({}, { headers: { 'Access-Control-Allow-Origin': 'https://extensions.shopifycdn.com' } });
};

async function getLogo(): Promise<{ base64: string; width: number; height: number } | null> {
  if (cachedLogo) return cachedLogo;

  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    const logoBuffer = await fs.readFile(logoPath);
    const base64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

    const dimensions = sizeOf(logoBuffer);

    cachedLogo = {
      base64,
      width: dimensions.width,
      height: dimensions.height,
    };

    return cachedLogo;
  } catch (error) {
    console.error('Failed to load logo:', error);
    return null;
  }
}

const getInvoiceId = async (admin: AdminApiContext, order_id: string) => {
  const query = `
    query GetOrderMetafield($namespace: String!, $key: String!, $orderId: ID!) {
      order(id: $orderId) {
        metafield(namespace: $namespace, key: $key) {
          value
        }
      }
    }
  `;

  const response = await admin.graphql(query, {
    variables: { namespace: NAMESPACE, key: KEY, orderId: order_id },
  });
  const data = await response.json();

  let metafield = data?.data?.order?.metafield;

  if (!metafield) {
    metafield =  null;
  }
  
  return metafield?.value;
};

export const action = async ({ request }: { request: Request }) => {
  const { admin } = await authenticate.admin(request);

  const body = await request.json();
  const { order_id } = body;

  const items: Item[] =  [];
  const totals: Total =  {totalNet: 0, with20: 0, with0: 0, totalGross: 0};
  const data: Data = {
    orderNumber: '',
    invoiceDate: new Date().toLocaleDateString('de-at'),
    deliveryDate: new Date().toLocaleDateString('de-at'),
    paymenttype: '',
    customerNumber: '',
    refrence: '',
    contactPerson: 'Fabian Flotzinger',
    email: 'office@pumpshot.at',
    customerName: '',
    customerAddress: '',
    customerUID: '',
    company: 'PUMPSHOT GmbH',
    companyAddress: 'Sallet 6\n4762 St. Willibald\nÖsterreich',
    companyUID: 'ATU82402026',
    hint: ''
  };

  const invoiceId =  await getInvoiceId(admin, order_id);
  if (!invoiceId) {
    return null;
  }

  await getLogo();

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();

  // Handle logo image if provided
  if (cachedLogo?.base64 && cachedLogo?.width && cachedLogo?.height) {
    let imgW = cachedLogo?.width;
    let imgH = cachedLogo?.height;
    if (imgW > 170) {
      const scale = 170 / imgW;
      imgW = 170;
      imgH *= scale;
    }
    doc.addImage(cachedLogo?.base64, 'PNG', width - imgW - 50, 50 - imgH / 2, imgW, imgH);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(230, 0, 0);
  doc.text(`Rechnung zur Bestellung ${data.orderNumber}`, 40, 50);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  let y = 84;
  doc.setFont('helvetica', 'bold');
  doc.text('Rechnungsdaten', 40, y);
  doc.setFont('helvetica', 'normal');
  y += 16;
  doc.text(`RECHNUNGS-NR.: ${invoiceId}`, 40, y);
  y += 14;
  doc.text(`RECHNUNGSDATUM: ${data.invoiceDate || ''}`, 40, y);
  y += 14;
  doc.text(`LIEFERDATUM: ${data.deliveryDate || ''}`, 40, y);
  y += 14;
  doc.text(`ZAHLUNGSART: ${data.paymenttype || ''}`, 40, y);

  let ry = 84;
  if (data.customerNumber) {
    doc.text(`IHRE KUNDENNUMMER: ${data.customerNumber}`, 340, ry);
  }
  ry += 16;
  if (data.refrence) {
    doc.text(`REFERENZ: ${data.refrence}`, 340, ry);
  }
  ry += 14;
  doc.text(`IHR ANSPRECHPARTNER: ${data.contactPerson || ''}`, 340, ry);
  ry += 14;
  doc.text(`E-MAIL: ${data.email || ''}`, 340, ry);

  y += 28;
  doc.setFont('helvetica', 'bold');
  doc.text('Rechnung an', 40, y);
  doc.text('Von', 340, y);
  doc.setFont('helvetica', 'normal');
  y += 16;

  let yLeft = y;
  doc.text(data.customerName || '', 40, yLeft);
  yLeft += 14;
  data.customerAddress.split('\n').forEach((line) => {
    if (line.trim()) {
      doc.text(line, 40, yLeft);
      yLeft += 14;
    }
  });
  if (data.customerUID) {
    doc.text(`UID: ${data.customerUID}`, 40, yLeft);
    yLeft += 14;
  }

  let yRight = y;
  doc.text(data.company || '', 340, yRight);
  yRight += 14;
  data.companyAddress.split('\n').forEach((line) => {
    if (line.trim()) {
      doc.text(line, 340, yRight);
      yRight += 14;
    }
  });
  if (data.companyUID) {
    doc.text(`UID: ${data.companyUID}`, 340, yRight);
    yRight += 14;
  }

  const doc_body = items.map((item) => [
    item.description,
    item.quantity.toFixed(2).replace('.', ','),
    item.net.toFixed(2).replace('.', ',') + ' €',
    item.tax.toFixed(2).replace('.', ',') + ' %',
    item.gross.toFixed(2).replace('.', ',') + ' €',
    item.discount.toFixed(2).replace('.', ',') + ' %',
    item.lineTotalGross.toFixed(2).replace('.', ',') + ' €',
  ]);

  autoTable(doc, {
    startY: Math.max(yLeft, yRight) + 16,
    head: [['Beschreibung', 'Menge', 'Netto', 'Steuer', 'Brutto', 'Rabatt', 'Gesamtpreis']],
    body: doc_body,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0] },
  });

  const finY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 30;
  const boxW = 240;
  const boxH = 85;
  const boxX = doc.internal.pageSize.getWidth() - boxW - 40;
  const boxY = finY;

  doc.setFillColor(245, 245, 245);
  doc.roundedRect(boxX, boxY, boxW, boxH, 6, 6, 'F');

  let ty = boxY + 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Gesamtbetrag netto', boxX + 10, ty);
  doc.text(`${totals.totalNet.toFixed(2)} €`, boxX + boxW - 10, ty, { align: 'right' });
  ty += 16;

  doc.text('zzgl. Umsatzsteuer 20%', boxX + 10, ty);
  doc.text(`${totals.with20.toFixed(2)} €`, boxX + boxW - 10, ty, { align: 'right' });
  ty += 16;

  doc.text('zzgl. Umsatzsteuer 0%', boxX + 10, ty);
  doc.text(`${totals.with0.toFixed(2)} €`, boxX + boxW - 10, ty, { align: 'right' });
  ty += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Gesamtbetrag brutto', boxX + 10, ty);
  doc.text(`${totals.totalGross.toFixed(2)} €`, boxX + boxW - 10, ty, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  const vat20Num =
    parseFloat((String(totals.with20) || '0').replace(/\./g, '').replace(',', '.')) || 0;
  const vat0Num =
    parseFloat((String(totals.with0) || '0').replace(/\./g, '').replace(',', '.')) || 0;
  const taxZero = Math.abs(vat20Num + vat0Num) < 1e-9;
  const hasCustomerUID = (data.customerUID || '').trim().length > 0;

  if (hasCustomerUID && taxZero) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(
      'Reverse Charge – Steuerschuld geht auf den Leistungsempfänger über (Art. 196 MwStSystRL).',
      40,
      ty
    );
    doc.setTextColor(0);
  }

  const note = (data.hint || '').trim();
  if (note) {
    doc.setFont('helvetica', 'bold');
    doc.text('Hinweis', 40, ty + 26);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(note, 480), 40, ty + 42);
  }

  const footerY = 770;
  doc.setDrawColor(220);
  doc.line(40, footerY - 18, 555, footerY - 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(
    'PUMPSHOT GmbH · pumpshotenergy.com · Sallet 6 · 4762 St. Willibald · Österreich',
    40,
    footerY
  );
  doc.text(
    'Tel: 06503903663 · E-Mail: office@pumpshot.at · Web: www.pumpshotenergy.com',
    40,
    footerY + 12
  );
  doc.text(
    'Amtsgericht: Landesgericht Ried · FN-Nr.: FN658945M · USt-ID: ATU82402026 · St-Nr.: 41356/4923',
    40,
    footerY + 24
  );
  doc.text(
    'Bank: Raiffeisenbank · IBAN: AT123445500005032271 · BIC: RZOOAT2L455',
    40,
    footerY + 36
  );
  doc.setTextColor(0);

  // Convert to Buffer instead of saving to file
  const pdfOutput = doc.output('arraybuffer');
  return new Response(
    Buffer.from(pdfOutput)
  , {
    headers: {
      'Content-Disposition': 'Attachment',
      'Access-Control-Allow-Origin': 'https://extensions.shopifycdn.com',
      'X-Invoice-Id': invoiceId
    }
  });
};
