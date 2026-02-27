import { useEffect, useState } from "react";
import { CallbackEvent } from "@shopify/polaris-types";
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

export default function Index() {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<Entry[]>([]);
  const [meta, setMeta] = useState<Meta>({ bar: 0, sumup: 0, total: 0 });

  useEffect(() => {
    (async () => {
      setLoading(false);
    })();
  }, []);

  const handleFieldChange = <K extends keyof Entry>(index: number, field: K, value: Entry[K]) => {
    const updatedEntries: Entry[] = [...data];
    const updatedEntry: Entry = { ...updatedEntries[index] };

    if (field === 'input' || field === 'output' || field === 'endbalance') {
      updatedEntry[field] = parseFloat(value as string) as Entry[K];
    } else if (field == "date" && value != data[index].date) {
      updatedEntry[field] = new Date(value as string).toLocaleDateString('de-at') as Entry[K];
    } else {
      updatedEntry[field] = value;
    }

    updatedEntries[index] = updatedEntry;
    setData(updatedEntries);
  };

  const handleInputChange = (index: number, field: keyof Entry) => (event: CallbackEvent<'s-text-field' | 's-money-field' | 's-number-field' | 's-date-field'>) => {
    const value = event.currentTarget.value;
    handleFieldChange(index, field, value);
  };
  
  const handleInputModeChange = (index: number) => (event: CallbackEvent<'s-select'>) => {
    const selectedMode = event.currentTarget.value as 'bar' | 'sumup';
    const updatedEntries: Entry[] = [...data];
    const updatedEntry: Entry = { ...updatedEntries[index] };
    updatedEntry.type = selectedMode;
    updatedEntries[index] = updatedEntry;
    setData(updatedEntries);
  };

  const handleCheckboxChange = (index: number) => (event: CallbackEvent<'s-checkbox'>) => {
    const checked = event.currentTarget.checked as boolean;
    const updatedEntries: Entry[] = [...data];
    const updatedEntry: Entry = { ...updatedEntries[index] };
    updatedEntry.invoice = checked;
    updatedEntries[index] = updatedEntry;
    setData(updatedEntries);
  }

  const addEntry = () => {
    const newEntry: Entry = {
        date: new Date().toLocaleDateString('de-at'),
        invoiceid: '',
        description: '',
        input: 0,
        output: 0,
        type: '',
        endbalance: 0,
        invoice: false
    };
    setData((prevEntries) => [...prevEntries, newEntry]);
  };

  const removeEntry = (index: number) => {
    const updatedData: Entry[] = data.filter((_, entryIndex) => entryIndex !== index);
    setData(updatedData);
  };

  const exportTable = () => {
    const doc = new jsPDF({unit: 'pt', format: 'a4'});
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();

    const currentDate = new Date();
    const day = String(currentDate.getDate()).padStart(2, '0');
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const year = currentDate.getFullYear();
    const formattedDate = `${day}_${month}_${year}`;
    const filename = "PUMPSHOT_Kassenbuch_" + formattedDate + ".pdf";
    doc.save(filename);
  };

  if (loading) {
    return (
      <s-stack direction="inline">
        <s-spinner />
      </s-stack>
    );
  }

  return (
    <s-stack gap="base">
      <s-banner heading="Development Notice" tone="warning">
        This Page is still under active Development.
      </s-banner>
      <s-box
        padding="base"
        background="base"
        borderWidth="base"
        borderColor="base"
        borderRadius="base"
      >
        <s-stack gap="base">
          <s-stack direction="inline" gap="base">
            <s-button onClick={addEntry} variant="secondary" icon="product-add" accessibilityLabel="Eintrag Hinzufügen">Neuer Eintrag</s-button>
            <s-button id="export" onClick={exportTable} variant="secondary" icon="check" accessibilityLabel="Tabelle Exportieren">Exportieren</s-button>
          </s-stack>
          <s-table id="cashTable">
            <s-table-header-row>
              <s-table-header>Datum</s-table-header>
              <s-table-header listSlot="primary" format="numeric">Belegnummer</s-table-header>
              <s-table-header>Beschreibung</s-table-header>
              <s-table-header format="currency">Einnahme (Brutto) [€]</s-table-header>
              <s-table-header format="currency">Ausgabe (Brutto) [€]</s-table-header>
              <s-table-header>Zahlungsart</s-table-header>
              <s-table-header format="currency">Kassenstand (Brutto) [€]</s-table-header>
              <s-table-header>Beleg</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body id="cashRows">
              {data.map((entry, index) => (
                <s-table-row key={index}>
                  <s-table-cell><s-date-field value={entry.date} onBlur={handleInputChange(index, 'date')} label="Datum" labelAccessibilityVisibility="exclusive" /></s-table-cell>
                  <s-table-cell><s-text-field value={entry.invoiceid} onBlur={handleInputChange(index, 'invoiceid')} label="Rechnungsnummer" labelAccessibilityVisibility="exclusive" /></s-table-cell>
                  <s-table-cell><s-text-field value={entry.description} onBlur={handleInputChange(index, 'description')} label="Beschreibung" labelAccessibilityVisibility="exclusive" /></s-table-cell>
                  <s-table-cell><s-money-field value={entry.input.toFixed(2).toString()} onBlur={handleInputChange(index, 'input')} label="Einnahmen" labelAccessibilityVisibility="exclusive" /></s-table-cell>
                  <s-table-cell><s-money-field value={entry.output.toFixed(2).toString()} onBlur={handleInputChange(index, 'output')} label="Ausgaben" labelAccessibilityVisibility="exclusive" /></s-table-cell>
                  <s-table-cell>
                    <s-select value={entry.type} onChange={handleInputModeChange(index)} label="Zahlungstyp" labelAccessibilityVisibility="exclusive">
                      <s-option value="bar">Bar</s-option>
                      <s-option value="sumup">SumUp (Karte)</s-option>
                    </s-select>
                  </s-table-cell>
                  <s-table-cell>{entry.endbalance.toFixed(2).toString()} €</s-table-cell>
                  <s-table-cell><s-checkbox checked={entry.invoice} onChange={handleCheckboxChange(index)} label="Beleg" accessibilityLabel="exclusive" /></s-table-cell>
                  <s-table-cell><s-button onClick={() => removeEntry(index)} variant="tertiary" tone="critical" icon="delete" accessibilityLabel="Eintrag Entfernen"/></s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-stack>
      </s-box>

      <s-divider />

      <s-box
        padding="base"
        background="base"
        borderWidth="base"
        borderColor="base"
        borderRadius="base"
      >
        <s-grid gridTemplateColumns="auto auto auto" gap="base" justifyItems="center">
          <s-text>Bar: {meta.bar.toFixed(2).toString()} €</s-text>
          <s-text>SumUp: {meta.sumup.toFixed(2).toString()} €</s-text>
          <s-text><strong>Gesamt: {meta.total.toFixed(2).toString()} €</strong></s-text>
        </s-grid>
      </s-box>
    </s-stack>
  );
}
