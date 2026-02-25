import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

interface StatementTransaction {
  date: string;
  notes: string | null;
  categoryName: string | null;
  type: "income" | "expense";
  amount: number;
  runningBalance: number;
}

interface StatementOptions {
  fromDate: string;
  toDate: string;
  transactions: StatementTransaction[];
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  userEmail: string;   // ✅ NEW
}


const fmt = (n: number) =>
  Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });



const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = url;
    img.crossOrigin = "Anonymous"; // IMPORTANT
    img.onload = () => resolve(img);
    img.onerror = reject;
  });
};

const drawHeader = (
  doc: jsPDF,
  logo: HTMLImageElement,
  pageWidth: number,
  margin: number,
  brand: [number, number, number],
  white: [number, number, number]
) => {

  // Header background
  doc.setFillColor(...brand);
  doc.rect(0, 0, pageWidth, 26, "F");

  // Logo
  doc.addImage(logo, "PNG", margin, 4, 18, 18);

  // Company Name
  doc.setTextColor(...white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("CashFlow", margin + 22, 14);

  // Tagline
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Personal Finance Management", margin + 22, 20);
};


export async function generateStatementPDF(options: StatementOptions) {
  const logo = await loadImage("/cash_flow_logo_new.png");
  const {
  fromDate,
  toDate,
  transactions,
  totalIncome,
  totalExpense,
  netBalance,
  userEmail   // ✅ ADD THIS
} = options;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFont("helvetica", "normal");   // ⭐ IMPORTANT
  doc.setCharSpace(0);  
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // ── Color Palette ──
  const brand: [number, number, number] = [30, 64, 175];
  const dark: [number, number, number] = [17, 24, 39];
  const muted: [number, number, number] = [107, 114, 128];
  const white: [number, number, number] = [255, 255, 255];
  const headerBg: [number, number, number] = [237, 242, 255];
  const zebraRow: [number, number, number] = [248, 250, 252];
  const border: [number, number, number] = [209, 213, 219];
  const redText: [number, number, number] = [220, 38, 38];
  const greenText: [number, number, number] = [22, 163, 74];

  let y = 0;

 // ═══════════════════════════════════════════
// HEADER BAR
// ═══════════════════════════════════════════
doc.setFillColor(...brand);
doc.rect(0, 0, pageWidth, 26, "F");

// Logo
doc.addImage(logo, "PNG", margin, 4, 18, 18);

// Company Name
doc.setTextColor(...white);
doc.setFont("helvetica", "bold");
doc.setFontSize(16);
doc.text("CashFlow", margin + 22, 14);

// Tagline
doc.setFont("helvetica", "normal");
doc.setFontSize(8);
doc.text("Personal Finance Management", margin + 22, 20);

y = 32;



  // Brand text
  doc.setTextColor(...white);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  // doc.text("Cloud CashFlow", margin + 22, 14);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  // doc.text("Personal Finance Management", margin + 22, 20);

  y = 32;

  // ═══════════════════════════════════════════
  // STATEMENT TITLE
  // ═══════════════════════════════════════════
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...dark);
  doc.text("ACCOUNT STATEMENT", margin, y);
  y += 7;

  // ═══════════════════════════════════════════
  // INFO GRID (2-column layout)
  // ═══════════════════════════════════════════
  doc.setFillColor(...headerBg);
  doc.setDrawColor(...border);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, contentWidth, 26, "FD");

  const col1X = margin + 4;
  const col2X = margin + contentWidth / 2 + 4;
  let infoY = y + 6;

  const drawInfoRow = (label: string, value: string, x: number, iy: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(label + ":", x, iy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...dark);
    doc.text(value, x + 32, iy);
  };

 // Row 1
// Row 1 (User Email + Generated On)
drawInfoRow(
  "User Email",
  userEmail,
  col1X,
  infoY
);

drawInfoRow(
  "Generated On",
  format(new Date(), "dd MMM yyyy, hh:mm a"),
  col2X,
  infoY
);

infoY += 6;

// Row 2 (Date Range)
drawInfoRow(
  "From Date",
  format(new Date(fromDate), "dd MMM yyyy"),
  col1X,
  infoY
);

drawInfoRow(
  "To Date",
  format(new Date(toDate), "dd MMM yyyy"),
  col2X,
  infoY
);

infoY += 6;

// Row 3 (Transactions)
drawInfoRow(
  "Total Transactions",
  String(transactions.length),
  col1X,
  infoY
);
  

  y += 26;

  // Divider
  doc.setDrawColor(...brand);
  doc.setLineWidth(0.6);
  doc.line(margin, y, margin + contentWidth, y);
  y += 4;

  // ═══════════════════════════════════════════
  // TRANSACTION TABLE
  // ═══════════════════════════════════════════
  // Fixed column widths that sum to contentWidth (182mm for A4 with 14mm margins)
  // Date=22, Description=auto, Category=28, Debit=28, Credit=28, Balance=30
  const tableData = transactions.map((tx) => [
    format(new Date(tx.date), "dd/MM/yyyy"),
    tx.notes || "—",
    tx.categoryName || "Uncategorized",
    tx.type === "expense" ? fmt(tx.amount) : "",
    tx.type === "income" ? fmt(tx.amount) : "",
    fmt(tx.runningBalance),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Date", "Description", "Category", "Debit (Dr)", "Credit (Cr)", "Balance"]],
    body: tableData,
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
    styles: {
      font: "helvetica",      // ⭐ FORCE FONT
      fontStyle: "normal",
      fontSize: 7.5,
      cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
      lineColor: border,
      lineWidth: 0.25,
      textColor: dark,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: brand,
      textColor: white,
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "center",
      lineColor: brand,
      lineWidth: 0.25,
      cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
    },
    columnStyles: {
      0: { cellWidth: 22, halign: "left" },
      1: { cellWidth: "auto", halign: "left" },
      2: { cellWidth: 28, halign: "left" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 28, halign: "right" },
      5: { cellWidth: 30, halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: {
      fillColor: zebraRow,
    },
    didParseCell: (data) => {
      data.cell.styles.font = "helvetica";

      if (data.section === "body") {
        if (data.column.index === 3 && data.cell.raw) {
          data.cell.styles.textColor = redText;
        }

        if (data.column.index === 4 && data.cell.raw) {
          data.cell.styles.textColor = greenText;
        }
      }
    },
    // Page break handling
    showHead: "everyPage",
    didDrawPage: (data) => {
      drawHeader(doc, logo, pageWidth, margin, brand, white);
    },
  });

  // ═══════════════════════════════════════════
  // SUMMARY ROW
  // ═══════════════════════════════════════════
  const finalY = (doc as any).lastAutoTable.finalY;

  // Summary box
  doc.setFillColor(...headerBg);
  doc.setDrawColor(...border);
  doc.setLineWidth(0.3);
  doc.rect(margin, finalY, contentWidth, 10, "FD");

  // Top border accent
  doc.setDrawColor(...brand);
  doc.setLineWidth(0.6);
  doc.line(margin, finalY, margin + contentWidth, finalY);

  const sumY = finalY + 6.5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");

  // "Total" label
  doc.setTextColor(...dark);
  doc.text("TOTAL", margin + 4, sumY);

  // Align totals with table columns using the fixed widths
  // Col positions from right edge: Balance=30, Credit=28, Debit=28
  const balRight = margin + contentWidth - 2;
  const creditRight = balRight - 30;
  const debitRight = creditRight - 28;

  doc.setTextColor(...redText);
  doc.text(fmt(totalExpense), debitRight, sumY, { align: "right" });
  doc.setTextColor(...greenText);
  doc.text(fmt(totalIncome), creditRight, sumY, { align: "right" });
  doc.setTextColor(...dark);
  doc.text(fmt(netBalance), balRight, sumY, { align: "right" });

  // ═══════════════════════════════════════════
  // FOOTER ON EVERY PAGE
  // ═══════════════════════════════════════════
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();

    doc.setDrawColor(...border);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 14, pageWidth - margin, pageH - 14);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...muted);
    doc.text("Cloud CashFlow — Personal Finance Management", margin, pageH - 9);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageH - 9, { align: "right" });
    doc.text("This is a computer-generated statement and does not require a signature.", margin, pageH - 5);
  }

  // ═══════════════════════════════════════════
  // SAVE
  // ═══════════════════════════════════════════
  doc.save(`CloudCashFlow_Statement_${fromDate}_to_${toDate}.pdf`);
}
