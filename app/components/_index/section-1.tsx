import { useEffect, useState } from "react";
import { CallbackEvent } from "@shopify/polaris-types";
import { jsPDF } from 'jspdf';
import { autoTable, RowInput } from 'jspdf-autotable';

const recalcBalances = (entries: Entry[]): Entry[] => {
  const chronological = [...entries].sort((a, b) => {
    const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return (a.id ?? 0) - (b.id ?? 0);
  });

  let runningBalance = 0;
  const withBalance = chronological.map((e) => {
    runningBalance = parseFloat((runningBalance + e.input - e.output).toFixed(2));
    return { ...e, endbalance: runningBalance };
  });

  return withBalance.reverse();
};

const calcMeta = (entries: Entry[]): Meta => ({
  bar: parseFloat(entries
    .filter((e) => e.type === "Bar")
    .reduce((sum, e) => sum + e.input - e.output, 0)
    .toFixed(2)),
  sumup: parseFloat(entries
    .filter((e) => e.type === "SumUp")
    .reduce((sum, e) => sum + e.input - e.output, 0)
    .toFixed(2)),
  total: parseFloat(entries
    .reduce((sum, e) => sum + e.input - e.output, 0)
    .toFixed(2)),
});

const getYearMonth = (dateStr: string): string => dateStr.slice(0, 7);

const getAvailableMonths = (entries: Entry[]): string[] => {
  const months = new Set(entries.map((e) => getYearMonth(e.date)));
  return Array.from(months).sort();
};

const formatMonthLabel = (ym: string): string => {
  const [year, month] = ym.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("de-AT", { month: "long", year: "numeric" });
};

const isFiltered = (range: MonthRange): boolean =>
  range.from !== null || range.to !== null;

const inRange = (ym: string, range: MonthRange): boolean => {
  if (range.from && ym < range.from) return false;
  if (range.to && ym > range.to) return false;
  return true;
};

export default function Index() {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<Entry[]>([]);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [range, setRange] = useState<MonthRange>({ from: null, to: null });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("api/kassenbuch/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const json = await res.json();
        const entries = json?.data || [];
        setData(entries);
        calcMeta(entries);
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const availableMonths = getAvailableMonths(data);
  const filtered = isFiltered(range);

  const chronologicalData = [...data].sort((a, b) => {
    const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return (a.id ?? 0) - (b.id ?? 0);
  });

  const filteredEntries: Entry[] = filtered
    ? data.filter((e) => inRange(getYearMonth(e.date), range))
    : data;

  const beforeEntries: Entry[] = filtered && range.from
    ? chronologicalData.filter((e) => getYearMonth(e.date) < range.from!)
    : [];

  const startwertBalance: number =
    beforeEntries.length > 0
      ? beforeEntries[beforeEntries.length - 1].endbalance
      : 0;

  const startwertEntry: Entry | null =
    filtered && range.from && beforeEntries.length > 0
      ? {
          date: `${range.from}-01`,
          invoiceid: "",
          description: "Startwert (Übertrag Vorperiode)",
          input: startwertBalance >= 0 ? startwertBalance : 0,
          output: startwertBalance < 0 ? Math.abs(startwertBalance) : 0,
          type: "-",
          endbalance: startwertBalance,
          invoice: false,
        }
      : null;

  // All entries up to and including range.to (or all entries when unfiltered).
  // This drives the Bar / SumUp / Gesamt figures shown in the summary and PDF.
  const entriesUpToEnd: Entry[] = filtered && range.to
    ? chronologicalData.filter((e) => getYearMonth(e.date) <= range.to!)
    : chronologicalData;

  const cumulativeMeta: Meta = calcMeta(entriesUpToEnd);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const paginatedEntries = filteredEntries.slice(
    (page - 1) * pageSize,
    page * pageSize
  );
  const showStartwert = startwertEntry !== null && page === totalPages;

  // maps paginated index back to global data index
  const globalIndex = (index: number) => (page - 1) * pageSize + index;

  const handlePageSizeChange = (event: CallbackEvent<'s-select'>) => {
    setPageSize(Number(event.currentTarget.value));
    setPage(1);
  };

  const handleFromChange = (event: CallbackEvent<'s-select'>) => {
    const val = event.currentTarget.value;
    const from = val === "all" ? null : val;
    setRange((prev) => ({
      from,
      to: from && prev.to && from > prev.to ? null : prev.to,
    }));
    setPage(1);
  };

  const handleToChange = (event: CallbackEvent<'s-select'>) => {
    const val = event.currentTarget.value;
    const to = val === "all" ? null : val;
    setRange((prev) => ({
      from: to && prev.from && to < prev.from ? null : prev.from,
      to,
    }));
    setPage(1);
  };

  const clearFilter = () => {
    setRange({ from: null, to: null });
    setPage(1);
  };

  const handleFieldChange = <K extends keyof Entry>(index: number, field: K, value: Entry[K]) => {
    const updated = [...data];
    const entry = { ...updated[index] };

    if (field === "input" || field === "output") {
      entry[field] = parseFloat(value as string) as Entry[K];
    } else if (field === "date") {
      entry[field] = new Date(value as string).toISOString().split("T")[0] as Entry[K];
    } else {
      entry[field] = value;
    }

    updated[index] = entry;
    const recalculated = recalcBalances(updated);
    setData(recalculated);
    calcMeta(recalculated);

    // persist the updated entry
    fetch("api/kassenbuch/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(recalculated[index]),
    }).catch((err) => console.error("Failed to update entry:", err));
  };

  const handleInputChange = (index: number, field: keyof Entry) => (event: CallbackEvent<"s-text-field" | "s-money-field" | "s-number-field" | "s-date-field">) => {
    handleFieldChange(globalIndex(index), field, event.currentTarget.value);
  };

  const handleInputModeChange = (index: number) => (event: CallbackEvent<"s-select">) => {
    handleFieldChange(globalIndex(index), "type", event.currentTarget.value);
  };

  const handleCheckboxChange = (index: number) => (event: CallbackEvent<"s-checkbox">) => {
    handleFieldChange(globalIndex(index), "invoice", event.currentTarget.checked as Entry["invoice"]);
  };

  const addEntry = async () => {
    const newEntry: Entry = {
      date: new Date().toISOString().split("T")[0],
      invoiceid: "",
      description: "",
      input: 0,
      output: 0,
      type: "Bar",
      endbalance: 0,
      invoice: false,
    };
    try {
      const res = await fetch("api/kassenbuch/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEntry),
      });
      const json = await res.json();
      // attach the id returned by the API if available
      const saved: Entry = { ...newEntry, id: json?.data?.id };
      const updated = recalcBalances([saved, ...data]);
      setData(updated);
      calcMeta(updated);
      setPage(1);
    } catch (err) {
      console.error("Failed to add entry:", err);
    }
  };

  const removeEntry = async (index: number) => {
    const entry = data[globalIndex(index)];
    try {
      if (entry.id) {
        await fetch("api/kassenbuch/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id }),
        });
      }
      const updated = recalcBalances(data.filter((_, i) => i !== globalIndex(index)));
      setData(updated);
      calcMeta(updated);
    } catch (err) {
      console.error("Failed to delete entry:", err);
    }
  };

  const exportTable = () => {
    const doc = new jsPDF({unit: 'pt', format: 'a4'});

    const currentDate = new Date();
    const day = String(currentDate.getDate()).padStart(2, '0');
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const year = currentDate.getFullYear();
    const formattedDate = `${day}_${month}_${year}`;
    const filename = "PUMPSHOT_Kassenbuch_" + formattedDate + ".pdf";

    const rangeLabel = (() => {
      if (!filtered) return "";
      if (range.from && range.to)
        return `${formatMonthLabel(range.from)} – ${formatMonthLabel(range.to)}`;
      if (range.from) return `ab ${formatMonthLabel(range.from)}`;
      if (range.to) return `bis ${formatMonthLabel(range.to)}`;
      return "";
    })();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(230, 0, 0);
    doc.text(`PUMPSHOT Kassenbuch (Bar & SumUp)${rangeLabel ? ` - ${rangeLabel}` : ""}`, 40, 50);
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("Datum: " + new Date().toLocaleDateString("de-AT"), 40, 65);
    
    const exportRows: RowInput[] = [...filteredEntries].sort(
      (a, b) => {
        const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (a.id ?? 0) - (b.id ?? 0);
      }
    ).map(
      (e): RowInput => [
        e.date,
        e.invoiceid,
        e.description,
        e.input.toFixed(2),
        e.output.toFixed(2),
        e.type,
        e.endbalance.toFixed(2),
        e.invoice ? "Ja" : "Nein",
      ]
    );

    if (startwertEntry) {
      exportRows.unshift([
        startwertEntry.date,
        "",
        startwertEntry.description,
        startwertEntry.input.toFixed(2),
        startwertEntry.output.toFixed(2),
        "-",
        startwertEntry.endbalance.toFixed(2),
        "-",
      ]);
    }

    autoTable(doc, {
      startY: 90,
      head: [["Datum", "Belegnr.", "Beschreibung", "Einnahme (€)", "Ausgabe (€)", "Zahlungsart", "Kassenstand (€)", "Beleg"]],
      body: exportRows,
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0] },
      didParseCell: (hookData) => {
        if (startwertEntry && hookData.row.index === 0 && hookData.section === "body") {
          hookData.cell.styles.fillColor = [220, 235, 255];
          hookData.cell.styles.fontStyle = "bold";
        }
      },
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 6: { halign: "right" } }
    });

    const finY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 25;

    doc.setFont("helvetica", "bold");
    doc.text(`Bar: ${cumulativeMeta.bar.toFixed(2)} €`, 40, finY);
    doc.text(`SumUp: ${cumulativeMeta.sumup.toFixed(2)} €`, 40, finY + 15);
    doc.text(`Gesamt: ${cumulativeMeta.total.toFixed(2)} €`, 40, finY + 30);
    
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
        This Page is under active Development. Please expect Bugs.
      </s-banner>
      <s-box
        padding="base"
        background="base"
        borderWidth="base"
        borderColor="base"
        borderRadius="base"
      >
        <s-stack gap="base">
          <s-grid gridTemplateColumns="auto auto auto" gap="base" justifyItems="center">
            <s-text>Bar: {cumulativeMeta.bar.toFixed(2)} €</s-text>
            <s-text>SumUp: {cumulativeMeta.sumup.toFixed(2)} €</s-text>
            <s-text>Gesamt: {cumulativeMeta.total.toFixed(2)} €</s-text>
          </s-grid>
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
        <s-stack gap="base">
          <s-stack direction="inline" gap="base">
            <s-button onClick={addEntry} variant="secondary" icon="product-add" accessibilityLabel="Eintrag Hinzufügen">Neuer Eintrag</s-button>
            <s-button id="export" onClick={exportTable} variant="secondary" icon="check" accessibilityLabel="Tabelle Exportieren">Exportieren</s-button>
            <s-select
              value={range.from ?? "all"}
              onChange={handleFromChange}
              label="Von"
              labelAccessibilityVisibility="exclusive"
            >
              <s-option value="all">Von (alle)</s-option>
              {availableMonths.map((ym) => (
                <s-option key={ym} value={ym}>
                  {formatMonthLabel(ym)}
                </s-option>
              ))}
            </s-select>

            <s-select
              value={range.to ?? "all"}
              onChange={handleToChange}
              label="Bis"
              labelAccessibilityVisibility="exclusive"
            >
              <s-option value="all">Bis (alle)</s-option>
              {availableMonths.map((ym) => (
                <s-option key={ym} value={ym}>
                  {formatMonthLabel(ym)}
                </s-option>
              ))}
            </s-select>

            {/* Clear button only visible when a range is active */}
            {filtered && (
              <s-button
                onClick={clearFilter}
                variant="tertiary"
                accessibilityLabel="Filter zurücksetzen"
              >
                Filter zurücksetzen
              </s-button>
            )}
            <s-select value={String(pageSize)} onChange={handlePageSizeChange} label="Einträge pro Seite" labelAccessibilityVisibility="exclusive">
              <s-option value="10">10 pro Seite</s-option>
              <s-option value="20">20 pro Seite</s-option>
              <s-option value="50">50 pro Seite</s-option>
              <s-option value="100">100 pro Seite</s-option>
            </s-select>
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
              {paginatedEntries.map((entry, index) => (
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
              {/* ── Startwert row (read-only, last page only) ── */}
              {showStartwert && (
                <s-table-row key="startwert">
                  <s-table-cell>{startwertEntry!.date}</s-table-cell>
                  <s-table-cell>–</s-table-cell>
                  <s-table-cell><strong>{startwertEntry!.description}</strong></s-table-cell>
                  <s-table-cell>{startwertEntry!.input.toFixed(2)} €</s-table-cell>
                  <s-table-cell>{startwertEntry!.output.toFixed(2)} €</s-table-cell>
                  <s-table-cell>–</s-table-cell>
                  <s-table-cell><strong>{startwertEntry!.endbalance.toFixed(2)} €</strong></s-table-cell>
                  <s-table-cell>–</s-table-cell>
                  <s-table-cell />
                </s-table-row>
              )}
            </s-table-body>
          </s-table>
          <s-stack direction="inline" gap="base">
            <s-button variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Zurück</s-button>
            <s-text>Seite {page} von {totalPages}</s-text>
            <s-button variant="secondary" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Weiter</s-button>
          </s-stack>
        </s-stack>
      </s-box>
    </s-stack>
  );
}
