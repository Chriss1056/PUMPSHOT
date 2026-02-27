    const { jsPDF } = window.jspdf;

    function parseNum(s){ return parseFloat(String(s).replace(',', '.')) || 0; }
    function deNum(x){ return Number(x).toLocaleString('de-AT', {minimumFractionDigits:2, maximumFractionDigits:2}); }

    function compute() {
      let stand = 0, sumBar = 0, sumSumUp = 0;

      document.querySelectorAll("#cashRows s-table-row").forEach(tr => {
        const ein = parseNum(tr.querySelector(".in").value);
        const aus = parseNum(tr.querySelector(".out").value);
        const pay = tr.querySelector(".payment").value;
        const diff = ein - aus;

        // Nach Zahlungsart summieren
        if (pay === "Bar") sumBar += diff;
        if (pay === "SumUp") sumSumUp += diff;

        stand += diff;
        tr.querySelector(".stand").textContent = deNum(stand);
      });

      document.getElementById("sumBar").textContent = deNum(sumBar) + " €";
      document.getElementById("sumSumUp").textContent = deNum(sumSumUp) + " €";
      document.getElementById("sumTotal").textContent = deNum(sumBar + sumSumUp) + " €";
    }

    function downloadPDF() {
      const doc = new jsPDF({unit: "pt", format: "a4"});
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(230, 0, 0);
      doc.text("PUMPSHOT Kassenbuch (Bar & SumUp)", 40, 50);
      doc.setFontSize(10); doc.setTextColor(0, 0, 0);
      doc.text("Datum: " + new Date().toLocaleDateString("de-AT"), 40, 65);

      const body = [];
      document.querySelectorAll("#cashRows tr").forEach(tr => {
        const d = tr.querySelector(".date").value;
        const b = tr.querySelector(".beleg").value;
        const desc = tr.querySelector(".desc").value;
        const ein = parseNum(tr.querySelector(".in").value);
        const aus = parseNum(tr.querySelector(".out").value);
        const pay = tr.querySelector(".payment").value;
        const stand = tr.querySelector(".stand").textContent;
        const rec = tr.querySelector(".receipt").value;
        body.push([d, b, desc, deNum(ein), deNum(aus), pay, stand, rec]);
      });

      doc.autoTable({
        startY: 90,
        head: [["Datum", "Belegnr.", "Beschreibung", "Einnahme (€)", "Ausgabe (€)", "Zahlungsart", "Kassenstand (€)", "Beleg"]],
        body,
        styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0] },
        columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 6: { halign: "right" } }
      });

      const finY = doc.lastAutoTable.finalY + 25;
      doc.setFont("helvetica", "bold");
      doc.text(`Bar: ${document.getElementById("sumBar").textContent}`, 40, finY);
      doc.text(`SumUp: ${document.getElementById("sumSumUp").textContent}`, 40, finY + 15);
      doc.text(`Gesamt: ${document.getElementById("sumTotal").textContent}`, 40, finY + 35);

      doc.save("PUMPSHOT_Kassenbuch.pdf");
    }
    