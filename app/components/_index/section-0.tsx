import { useEffect, useState } from "react";
import { CallbackEvent } from "@shopify/polaris-types";
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

export default function Index() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [qr, setQr] = useState<HTMLImageElement | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [totals, setTotals] = useState<Total>({totalNet: 0, with20: 0, with0: 0, totalGross: 0});
  const [invoice_id, setInvoiceId] = useState<string>('');
  const [data, setData] = useState<Data>({
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
  });

  useEffect(() => {
    handleNewHint()({currentTarget: { value: 'Onlinezahlung' }} as CallbackEvent<"s-select">);
    getInvoiceId();
    (async () => {
      const image = new Image();
      image.src = 'logo.png';
      await image.decode();
      setImg(image);
      const qr = new Image();
      qr.src = 'qrcode.png';
      await qr.decode();
      setQr(qr);
    })();
  }, []);

  useEffect(() => {
    if (items.length == 0) {
      setTotals({totalNet: 0, with20: 0, with0: 0, totalGross: 0});
    }
    const newTotals: Total = {totalNet: 0, with20: 0, with0: 0, totalGross: 0};
    items.forEach((item) => {
      const tax = item.tax;
      const total = item.lineTotalGross;

      const lineTax = clamp(total - (total / (1 + tax / 100)), 0);

      newTotals.totalNet += clamp(total / (1 + tax / 100), 0);
      newTotals.totalGross += total;
      if (Math.abs(tax) < 1e-9) {
        newTotals.with0 += lineTax;
      } else {
        newTotals.with20 += lineTax;
      }
    });
    setTotals(newTotals);
  }, [items]);

  const getInvoiceId = async (): Promise<string | null> => {
    try {
      const res = await fetch("api/invoiceid/get");
      const data = await res.json();
      setInvoiceId(data?.metafield?.value || "");
      return data?.metafield?.value;
    } catch (err) {
      console.error("Failed to fetch invoice_id:", err);
      return null;
    }
  };

  const updateInvoiceId = async (): Promise<void> => {
    try {
      await fetch("api/invoiceid/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ incommingValue: invoice_id }),
      });
    } catch (err) {
      console.error("Failed to update invoice_id:", err);
    }
  };

  const handleNewHint = () => (event: CallbackEvent<'s-select'>) => {
    const selectedHint = event.currentTarget.value as 'Onlinezahlung' | 'Bar' | 'SumUp' | 'Überweisung' | 'Offen';
    
    const commonHint: string =
    "\n\nSofern nicht anders angegeben, entspricht das Lieferdatum dem Rechnungsdatum.\n" +
    "Es gelten unsere Allgemeinen Geschäftsbedingungen (AGB).\n" +
    "Mit Entgegennahme der Ware erkennen Sie den Eigentumsvorbehalt bis zur vollständigen Bezahlung an.";

    let specialHint: string = '';
    if (selectedHint === "Onlinezahlung") {
      specialHint = "Die Zahlung wurde bereits per Onlinezahlung beglichen. Bitte keinen weiteren Betrag überweisen.";
    } else if (selectedHint === "Bar") {
      specialHint = "Die Zahlung wurde bar entgegengenommen.";
    } else if (selectedHint === "SumUp") {
      specialHint = "Die Zahlung wurde per Kartenzahlung (SumUp) abgewickelt.";
    } else if (selectedHint === "Überweisung") {
      specialHint = "Bitte überweisen Sie den Gesamtbetrag innerhalb von 7 Tagen auf das unten angegebene Konto.";
    } else if (selectedHint === "Offen") {
      specialHint = "Der Betrag ist noch offen. Bitte begleichen Sie die Rechnung innerhalb der angegebenen Frist.";
    }

    const newHint: string = specialHint + commonHint;
    const updatedData: Data = { ...data };
    updatedData.paymenttype = selectedHint;
    updatedData.hint = newHint;
    setData(updatedData);
  }

  const removeItem = (index: number) => {
    const updatedItems: Item[] = items.filter((_, itemIndex) => itemIndex !== index);
    setItems(updatedItems);
  };

  const addProduct = () => {
    const newItem: Item = {
      description: 'Produkt',
      quantity: 1,
      net: 0,
      gross: 2.19,
      tax: 20,
      allowDiscount: true,
      discount: 0,
      lineTotalGross: 0,
      inputMode: 'gross',
    };
    const calculatedItem: Item = recalculateItemValues(newItem);
    setItems((prevItems) => [...prevItems, calculatedItem]);
  };

  const addPfand = () => {
    const newItem: Item = {
      description: 'Pfand',
      quantity: 1,
      net: 0.25,
      gross: 0,
      tax: 0,
      allowDiscount: false,
      discount: 0,
      lineTotalGross: 0,
      inputMode: 'net',
    };
    const calculatedItem: Item = recalculateItemValues(newItem);
    setItems((prevItems) => [...prevItems, calculatedItem]);
  };

  const addShipping = () => {
    const newItem: Item = {
      description: 'Versand',
      quantity: 1,
      net: 0,
      gross: 4.9,
      tax: 20,
      allowDiscount: true,
      discount: 0,
      lineTotalGross: 0,
      inputMode: 'gross',
    };
    const calculatedItem: Item = recalculateItemValues(newItem);
    setItems((prevItems) => [...prevItems, calculatedItem]);
  };

  const clamp = (value: number, min: number, max?: number): number => {
    return value < min ? min : max !== undefined && value > max ? max : value;
  }

  const recalculateItemValues = (item: Item): Item => {
    const updatedItem: Item = { ...item };

    const factor = 1 - (updatedItem.discount / 100);

    switch (updatedItem.inputMode) {
      case 'net':
        updatedItem.gross = updatedItem.net * (1 + updatedItem.tax / 100);
        updatedItem.lineTotalGross = updatedItem.gross * clamp(updatedItem.quantity, 1) * factor;
        break;
      case 'gross':
        updatedItem.net = updatedItem.gross / (1 + updatedItem.tax / 100);
        updatedItem.lineTotalGross = updatedItem.gross * clamp(updatedItem.quantity, 1) * factor;
        break;
      case 'lineTotalGross':
        updatedItem.gross = (updatedItem.lineTotalGross / clamp(updatedItem.quantity, 1)) / factor;
        updatedItem.net = updatedItem.gross / (1 + updatedItem.tax / 100);
        break;
    }

    return updatedItem;
  };

  const handleFieldChange = (index: number, field: keyof Item, value: string) => {
    const updatedItems: Item[] = [...items];
    const updatedItem: Item = { ...updatedItems[index] };

    if (field === 'quantity' || field === 'tax' || field === 'discount') {
      updatedItem[field] = parseFloat(value);
    } else if (field === 'net' || field === 'gross' || field === 'lineTotalGross') {
      updatedItem[field] = parseFloat(value);
    } else if (field === 'allowDiscount') {
      updatedItem[field] = value.toLowerCase() === 'true';
    } else {
      updatedItem[field] = value;
    }

    const recalculatedItem = recalculateItemValues(updatedItem);

    updatedItems[index] = recalculatedItem;
    setItems(updatedItems);
  };

  const handleInputChange = (index: number, field: keyof Item) => (event: CallbackEvent<'s-text-field' | 's-money-field' | 's-number-field'>) => {
    const value = event.currentTarget.value;
    handleFieldChange(index, field, value);
  };
  
  const handleInputModeChange = (index: number) => (event: CallbackEvent<'s-select'>) => {
    const selectedMode = event.currentTarget.value as 'net' | 'gross' | 'lineTotalGross';
    const updatedItems: Item[] = [...items];
    const updatedItem: Item = { ...updatedItems[index] };
    updatedItem.inputMode = selectedMode;

    const recalculatedItem = recalculateItemValues(updatedItem);

    updatedItems[index] = recalculatedItem;
    setItems(updatedItems);
  };

  const handleDataChange = (field: keyof Data) => (event: CallbackEvent<'s-text-field' | 's-text-area' | 's-date-field' | 's-email-field'>) => {
    const value = event.currentTarget.value;
    const updatedData: Data = { ...data };

    if ((field == "invoiceDate" || field == "deliveryDate") && !(value == data.invoiceDate || value == data.deliveryDate)) {
      updatedData[field] = new Date(value).toLocaleDateString('de-at');
    } else {
      updatedData[field] = value;
    }
    setData(updatedData);
  };

  const handlePdfButton = async () => {
    const res = await generateInvoicePdf();
    if (!res) {
      await updateInvoiceId();
      await getInvoiceId();
    }
  };

  const generateInvoicePdf = async (): Promise<number> => {
    const invoice_id: string | null = await getInvoiceId();
    if (invoice_id == null) {
      return 1;
    }
    if (img == null) {
      return 1;
    }
    if (qr == null) {
      return 1;
    }
    const doc = new jsPDF({unit: 'pt', format: 'a4'});
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();

    let imgWidth = img.width;
    let imgHeight = img.height;
    if (imgWidth > 170) {
      const scale = 170 / imgWidth;
      imgWidth = 170;
      imgHeight *= scale;
    }

    let qrWidth = qr.width;
    let qrHeight = qr.height;
    if (qrWidth > 70) {
      const scale = 70 / qrWidth;
      qrWidth = 70;
      qrHeight *= scale;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(230, 0, 0);
    doc.text(`Rechnung zur Bestellung ${data.orderNumber}`, 40, 50);
    doc.addImage(img, "PNG", width - imgWidth - 50, 50 - imgHeight / 2, imgWidth, imgHeight);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    let y = 84;
    doc.setFont('helvetica', 'bold');
    doc.text('Rechnungsdaten', 40, y);
    doc.setFont('helvetica', 'normal');
    y += 16;
    doc.text(`RECHNUNGS-NR.: ${invoice_id || ''}`, 40, y);
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
    data.customerAddress.split('\n').forEach(line => {
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
    data.companyAddress.split('\n').forEach(line => {
      if (line.trim()) {
        doc.text(line, 340, yRight);
        yRight += 14;
      }
    });
    if (data.companyUID) {
      doc.text(`UID: ${data.companyUID}`, 340, yRight);
      yRight += 14;
    }

    const body = items.map(item => [
      item.description,
      item.quantity.toFixed(2).replace('.', ','),
      item.net.toFixed(2).replace('.', ',') + ' €',
      item.tax.toFixed(2).replace('.', ',') + ' %',
      item.gross.toFixed(2).replace('.', ',') + ' €',
      item.discount.toFixed(2).replace('.', ',') + ' %',
      item.lineTotalGross.toFixed(2).replace('.', ',') + ' €'
    ]);

    autoTable(doc, {
      startY: Math.max(yLeft, yRight) + 16,
      head: [['Beschreibung', 'Menge', 'Netto', 'Steuer', 'Brutto', 'Rabatt', 'Gesamtpreis']],
      body,
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

    const vat20Num = parseFloat((String(totals.with20) || '0').replace(/\./g, '').replace(',', '.')) || 0;
    const vat0Num = parseFloat((String(totals.with0) || '0').replace(/\./g, '').replace(',', '.')) || 0;
    const taxZero = Math.abs(vat20Num + vat0Num) < 1e-9;
    const hasCustomerUID = (data.customerUID || '').trim().length > 0;

    if (hasCustomerUID && taxZero) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text('Reverse Charge - Steuerschuld geht auf den Leistungsempfänger über (Art. 196 MwStSystRL).', 40, ty);
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
    doc.text('PUMPSHOT GmbH · pumpshotenergy.com · Sallet 6 · 4762 St. Willibald · Österreich', 40, footerY);
    doc.text('Tel: 06503903663 · E-Mail: office@pumpshot.at · Web: www.pumpshotenergy.com', 40, footerY + 12);
    doc.text('Amtsgericht: Landesgericht Ried · FN-Nr.: FN658945M · USt-ID: ATU82402026 · St-Nr.: 41356/4923', 40, footerY + 24);
    doc.text('Bank: Raiffeisenbank · IBAN: AT12 3445 5000 0503 2271 · BIC: RZOOAT2L455', 40, footerY + 36);
    doc.setTextColor(0);

    doc.addImage(qr, "PNG", width - qrWidth - 20, height - qrHeight - 10, qrWidth, qrHeight);

    const file = `Rechnung_${invoice_id || 'RE'}.pdf`;
    doc.save(file);
    return 0;
  };
  
  return (
  <s-stack gap="base">
    <s-box
      padding="base"
      background="base"
      borderWidth="base"
      borderColor="base"
      borderRadius="base"
    >
      <s-grid gridTemplateColumns="1fr 1fr" gap="base">
        <s-stack gap="base">
          <s-text-field onBlur={handleDataChange('orderNumber')} value={data.orderNumber} label="Bestellnummer" placeholder="order_0123456789" autocomplete="off"></s-text-field>
          <s-text-field value={invoice_id} label="Rechnungsnummer" placeholder="invoice_0123456789" autocomplete="off" readOnly></s-text-field>
          <s-date-field
            onBlur={handleDataChange('invoiceDate')}
            value={data.invoiceDate}
            label="Rechnungsdatum"
            required
          />
          <s-date-field
            onBlur={handleDataChange('deliveryDate')}
            value={data.deliveryDate}
            label="Lieferdatum"
            required
          />
        </s-stack>
        <s-stack gap="base">
          <s-text-field onBlur={handleDataChange('customerNumber')} value={data.customerNumber} label="Kundennummer" placeholder="user_0123456789" autocomplete="off"></s-text-field>
          <s-text-field onBlur={handleDataChange('refrence')} value={data.refrence} label="Referenz" autocomplete="off"></s-text-field>
          <s-text-field onBlur={handleDataChange('contactPerson')} value={data.contactPerson} label="Ansprechpartner" placeholder="Max Mustermann" autocomplete="off" required></s-text-field>
          <s-email-field onBlur={handleDataChange('email')} value={data.email} label="E-Mail" placeholder="invalid@example.com" autocomplete="off" required></s-email-field>
        </s-stack>
      </s-grid>
    </s-box>
  
    <s-divider />

    <s-box
      padding="base"
      background="base"
      borderWidth="base"
      borderColor="base"
      borderRadius="base"
    >
      <s-select label="Zahlungsart" value={data.paymenttype} onChange={handleNewHint()} required>
        <s-option value="Onlinezahlung">Onlinezahlung (bereits beglichen)</s-option>
        <s-option value="Bar">Barzahlung</s-option>
        <s-option value="SumUp">Kartenzahlung (SumUp)</s-option>
        <s-option value="Überweisung">Überweisung</s-option>
        <s-option value="Offen">Offen (noch zu zahlen)</s-option>
      </s-select>
    </s-box>

    <s-divider />

    <s-grid gridTemplateColumns="1fr 1fr" gap="base">
      <s-box
        padding="base"
        background="base"
        borderWidth="base"
        borderColor="base"
        borderRadius="base"
      >
        <s-section heading="Rechnungsadresse" padding="base">
          <s-text-field onBlur={handleDataChange('customerName')} value={data.customerName} label="Name / Firma" placeholder="Max Mustermann / Muster GmbH" autocomplete="off" required></s-text-field>
          <s-text-area onBlur={handleDataChange('customerAddress')} value={data.customerAddress} label="Adresse" rows={3} placeholder={"Straße Hausnummer\nPLZ Ort\nLand"} autocomplete="off" required></s-text-area>
          <s-text-field onBlur={handleDataChange('customerUID')} value={data.customerUID} label="UID Kunde" placeholder="DE123456789" autocomplete="off"></s-text-field>
        </s-section>
      </s-box>
      <s-box
        padding="base"
        background="base"
        borderWidth="base"
        borderColor="base"
        borderRadius="base"
      >
        <s-section heading="PUMPSHOT Absender" padding="base">
          <s-text-field onBlur={handleDataChange('company')} value={data.company} label="Firma" placeholder="Max Mustermann / Muster GmbH" autocomplete="off" required></s-text-field>
          <s-text-area onBlur={handleDataChange('companyAddress')} value={data.companyAddress} label="Adresse" rows={3} placeholder={"Straße Hausnummer\nPLZ Ort\nLand"} autocomplete="off" required></s-text-area>
          <s-text-field onBlur={handleDataChange('companyUID')} value={data.companyUID} label="UID Firma" placeholder="DE123456789" autocomplete="off" required></s-text-field>
        </s-section>
      </s-box>
    </s-grid>

    <s-divider />

    <s-box
        padding="base"
        background="base"
        borderWidth="base"
        borderColor="base"
        borderRadius="base"
    >
      <s-stack gap="base">
        <s-stack direction="inline" gap="base">
          <s-button onClick={addProduct} variant="secondary" icon="product-add" accessibilityLabel="Produkt Hinzufügen">Produkt</s-button>
          <s-button onClick={addPfand} variant="secondary" icon="plus" accessibilityLabel="Pfand Hinzufügen">Pfand</s-button>
          <s-button onClick={addShipping} variant="secondary" icon="plus" accessibilityLabel="Versand Hinzufügen">Versand</s-button>
        </s-stack>
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="secondary">Beschreibung</s-table-header>
            <s-table-header format="numeric">Menge</s-table-header>
            <s-table-header format="currency">Netto [€]</s-table-header>
            <s-table-header format="currency">Brutto [€]</s-table-header>
            <s-table-header format="numeric">Steuer [%]</s-table-header>
            <s-table-header format="numeric">Rabatt [%]</s-table-header>
            <s-table-header listSlot="primary" format="currency">Zeilengesamt (Brutto) [€]</s-table-header>
            <s-table-header>Eingabemodus</s-table-header>
            <s-table-header></s-table-header>
          </s-table-header-row>
          <s-table-body id="itemRows">
            {items.map((item, index) => (
              <s-table-row key={index}>
                <s-table-cell><s-text-field value={item.description} onBlur={handleInputChange(index, 'description')} label="Beschreibung" labelAccessibilityVisibility="exclusive" /></s-table-cell>
                <s-table-cell><s-number-field value={item.quantity.toFixed(0).toString()} onBlur={handleInputChange(index, 'quantity')} label="Menge" labelAccessibilityVisibility="exclusive" /></s-table-cell>
                <s-table-cell><s-money-field value={item.net.toFixed(2).toString()} onBlur={handleInputChange(index, 'net')} label="Netto Betrag" labelAccessibilityVisibility="exclusive" /></s-table-cell>
                <s-table-cell><s-money-field value={item.gross.toFixed(2).toString()} onBlur={handleInputChange(index, 'gross')} label="Brutto Betrag" labelAccessibilityVisibility="exclusive" /></s-table-cell>
                <s-table-cell><s-number-field value={item.tax.toFixed(2).toString()} onBlur={handleInputChange(index, 'tax')} label="Steuer" labelAccessibilityVisibility="exclusive" /></s-table-cell>
                <s-table-cell><s-number-field value={item.discount.toFixed(2).toString()} onBlur={handleInputChange(index, 'discount')} label="Rabat" labelAccessibilityVisibility="exclusive" readOnly={!item.allowDiscount}/></s-table-cell>
                <s-table-cell><s-money-field value={item.lineTotalGross.toFixed(2).toString()} onBlur={handleInputChange(index, 'lineTotalGross')} label="Gesamptpreis" labelAccessibilityVisibility="exclusive" /></s-table-cell>
                <s-table-cell>
                  <s-select value={item.inputMode} onChange={handleInputModeChange(index)} label="Eingabemodus" labelAccessibilityVisibility="exclusive">
                    <s-option value="net">Netto</s-option>
                    <s-option value="gross">Brutto</s-option>
                    <s-option value="lineTotalGross">Gesamt</s-option>
                  </s-select>
                </s-table-cell>
                <s-table-cell><s-button onClick={() => removeItem(index)} variant="tertiary" tone="critical" icon="delete" accessibilityLabel="Remove Item"/></s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-stack>
    </s-box>

    <s-divider />

    <s-grid gridTemplateColumns="1fr 1fr" gap="base">
      <s-box
        padding="base"
        background="base"
        borderWidth="base"
        borderColor="base"
        borderRadius="base"
      >
        <s-section heading="Hinweise" padding="base">
          <s-text-area value={data.hint} label="Hinweis" labelAccessibilityVisibility="exclusive" rows={5} placeholder="Danke für Ihre Bestellung ..."></s-text-area>
        </s-section>
      </s-box>
      <s-box
        padding="base"
        background="base"
        borderWidth="base"
        borderColor="base"
        borderRadius="base"
      >
        <s-stack gap="base">
          <s-box padding="base">
            <s-stack gap="small-300">
              <s-grid gridTemplateColumns="1fr auto">
                <s-text>Gesamtbetrag Netto</s-text>
                <s-text>{totals.totalNet.toFixed(2).toString()}€</s-text>
              </s-grid>
              <s-divider />
              <s-grid gridTemplateColumns="1fr auto">
                <s-text>zzgl. Umsatzsteuer 20%</s-text>
                <s-text>{totals.with20.toFixed(2).toString()}€</s-text>
              </s-grid>
              <s-divider />
              <s-grid gridTemplateColumns="1fr auto">
                <s-text>zzgl. Umsatzsteuer 0%</s-text>
                <s-text>{totals.with0.toFixed(2).toString()}€</s-text>
              </s-grid>
              <s-divider />
              <s-grid gridTemplateColumns="1fr auto">
                <s-text><strong>Gesamtbetrag Brutto</strong></s-text>
                <s-text><strong>{totals.totalGross.toFixed(2).toString()}€</strong></s-text>
              </s-grid>
            </s-stack>
          </s-box>
          <s-stack direction="inline" justifyContent="end">
            <s-button onClick={handlePdfButton} variant="primary" icon="check" accessibilityLabel="PDF Generieren">PDF Generieren</s-button>
          </s-stack>
        </s-stack>
      </s-box>
    </s-grid>

    <s-divider />

    <s-box
      padding="base"
      background="base"
      borderWidth="base"
      borderColor="base"
      borderRadius="base"
    >
      <s-paragraph color="subdued">
        PUMPSHOT GmbH &middot; pumpshot.at &middot; Sallet 6 &middot; 4762 St. Willibald &middot; Österreich<br/>
        Tel: <s-link href="tel:+436503903663">+43 650 3903663</s-link> &middot; E-Mail: <s-link href="mailto:office@pumpshot.at">office@pumpshot.at</s-link> &middot; Web: <s-link href="https://pumpshotenergy.com" target="_blank">pumpshotenergy.com</s-link><br/>
        Amtsgericht: Landesgericht Ried &middot; FN-Nr.: FN658945M &middot; USt-ID: ATU82402026 &middot; St-Nr.: 41356/4923<br/>
        Bank: Raiffeisenbank &middot; IBAN: AT12 3445 5000 0503 2271 &middot; BIC: RZOOAT2L455
      </s-paragraph>
    </s-box>
  </s-stack>
  );
}
