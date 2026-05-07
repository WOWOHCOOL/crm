import * as XLSX from 'xlsx';
import type { Quotation, QuotationItem } from '../types';

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ============================================================
// EXCEL EXPORT
// ============================================================
export function exportExcel(
  q: Quotation,
  items: QuotationItem[],
  type: 'quotation' | 'pi',
  currency: 'USD' | 'RMB',
) {
  const title = type === 'quotation' ? 'QUOTATION' : 'PROFORMA INVOICE';
  const priceLabel = currency === 'USD' ? 'Price (USD)' : 'Price (RMB)';
  const totalLabel = currency === 'USD' ? 'Total (USD)' : 'Total (RMB)';
  const curSym = currency === 'USD' ? '$' : '¥';
  const totalVal = type === 'quotation'
    ? items.reduce((s, i) => s + (currency === 'USD' ? Number(i.unit_price_usd) : Number(i.unit_price_rmb)) * i.quantity, 0)
    : items.reduce((s, i) => s + (currency === 'USD' ? Number(i.unit_price_usd) : Number(i.unit_price_rmb)) * i.quantity, 0);

  const validUntil = new Date(new Date(q.created_at).getTime() + (q.valid_days || 15) * 86400000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any[] = [];

  // Use 10 columns: A-J
  // Left side (col A-F): Seller info | Right side (col G-J): Doc header + Buyer

  // Row 0-1: Logo + Title
  d.push(['WOWOHCOOL', '', '', '', '', '', title, '', '', '']);
  d.push(['Dong Yi Technology Co., Limited', '', '', '', '', '', `No: ${q.quotation_no}`, '', '', '']);
  d.push(['www.wowohcool.com', '', '', '', '', '', `Date: ${fmtDate(q.created_at)}`, '', '', '']);
  d.push(['', '', '', '', '', '', `Valid Until: ${fmtDate(validUntil.toISOString())}`, '', '', '']);
  d.push([]);

  // Seller vs Buyer (side by side)
  d.push(['SELLER / SUPPLIER:', '', '', '', '', 'BUYER / CUSTOMER:', '', '', '']);
  d.push(['Dong Yi Technology Co., Limited', '', '', '', '', q.customer_company || '____________________', '', '', '']);
  d.push(['Contact: Sales Department', '', '', '', '', `Contact: ${q.customer_contact || '____________________'}`, '', '', '']);
  d.push(['Tel: +86-755-XXXXXXXX', '', '', '', '', `Tel: ${q.customer_phone || '____________________'}`, '', '', '']);
  d.push(['Email: sales@wowohcool.com', '', '', '', '', `Web: ${q.customer_website || '____________________'}`, '', '', '']);
  d.push(['Web: www.wowohcool.com', '', '', '', '', `Address: ${q.customer_address || '____________________'}`, '', '', '']);
  d.push(['Address: Shenzhen, Guangdong, China', '', '', '', '', '', '', '', '']);
  d.push([]);
  d.push([]);

  // Items table
  if (type === 'quotation') {
    d.push(['#', 'Model', 'Description', 'MOQ', 'Qty', priceLabel, totalLabel, 'Remarks', '', '']);
    items.forEach((item, i) => {
      const p = currency === 'USD' ? Number(item.unit_price_usd) : Number(item.unit_price_rmb);
      d.push([i + 1, item.official_model, item.description || '', item.moq || 1, item.quantity, p, r2(p * item.quantity), item.remarks || '', '', '']);
    });
  } else {
    d.push(['#', 'Model', 'Qty', priceLabel, totalLabel, '', '', '', '', '']);
    items.forEach((item, i) => {
      const p = currency === 'USD' ? Number(item.unit_price_usd) : Number(item.unit_price_rmb);
      d.push([i + 1, item.official_model, item.quantity, p, r2(p * item.quantity), '', '', '', '', '']);
    });
  }
  d.push([]);
  d.push([`TOTAL AMOUNT: ${curSym}${r2(totalVal).toFixed(2)}`, '', '', '', '', '', '', '', '', '']);
  d.push([]);

  // Bank Info
  d.push(['BANK INFORMATION:', '', '', '', '', '', '', '', '', '']);
  d.push([`Beneficiary: ${q.bank_beneficiary || 'Dong Yi Technology Co., Limited'}`, '', '', '', '', '', '', '', '', '']);
  d.push([`Bank: ${q.bank_name || ''}`, '', '', '', '', '', '', '', '', '']);
  d.push([`Account: ${q.bank_account || ''}`, '', '', '', '', '', '', '', '', '']);
  d.push([`SWIFT: ${q.bank_swift || ''}`, '', '', '', '', '', '', '', '', '']);
  d.push([]);

  // Terms
  d.push(['TERMS & CONDITIONS:', '', '', '', '', '', '', '', '', '']);
  d.push([`Payment: ${q.payment_terms || ''}`, '', '', '', '', '', '', '', '', '']);
  d.push([`Delivery: ${q.delivery_time_global || q.delivery_time || ''}`, '', '', '', '', '', '', '', '', '']);
  d.push([`Validity: ${q.valid_days || 15} days`, '', '', '', '', '', '', '', '', '']);
  if (q.notes) d.push([`Notes: ${q.notes}`, '', '', '', '', '', '', '', '', '']);

  const ws = XLSX.utils.aoa_to_sheet(d);
  ws['!cols'] = [
    { wch: 6 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 },
    { wch: 22 }, { wch: 28 }, { wch: 6 }, { wch: 6 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title);
  XLSX.writeFile(wb, `${q.quotation_no}.xlsx`);
}

// ============================================================
// PDF EXPORT (HTML → Print)
// ============================================================
export function exportPDF(
  q: Quotation,
  items: QuotationItem[],
  type: 'quotation' | 'pi',
  currency: 'USD' | 'RMB',
) {
  const title = type === 'quotation' ? 'QUOTATION' : 'PROFORMA INVOICE';
  const validUntil = new Date(new Date(q.created_at).getTime() + (q.valid_days || 15) * 86400000);
  const totalUSD = items.reduce((s, i) => s + Number(i.unit_price_usd) * i.quantity, 0);
  const totalRMB = items.reduce((s, i) => s + Number(i.unit_price_rmb) * i.quantity, 0);
  const curSym = currency === 'USD' ? 'US$' : '¥';
  const showPrice = (i: QuotationItem) => currency === 'USD' ? Number(i.unit_price_usd) : Number(i.unit_price_rmb);
  const showTotalFn = (i: QuotationItem) => r2(showPrice(i) * i.quantity);
  const grandTotal = currency === 'USD' ? totalUSD : totalRMB;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${q.quotation_no}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #222; font-size: 12px; line-height: 1.5; padding: 0; }
  .page { max-width: 100%; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
  .logo-area { flex: 1; }
  .logo-name { font-size: 22px; font-weight: 700; color: #c00; letter-spacing: 1px; }
  .logo-sub { font-size: 11px; color: #666; margin-top: 2px; }
  .title-area { text-align: right; }
  .title-text { font-size: 26px; font-weight: 700; color: #1a1a1a; letter-spacing: 2px; text-transform: uppercase; }
  .doc-meta { font-size: 11px; color: #555; margin-top: 6px; line-height: 1.8; }
  .parties { display: flex; gap: 30px; margin-bottom: 28px; }
  .party-box { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 14px 16px; }
  .party-label { font-size: 10px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .party-name { font-size: 14px; font-weight: 600; color: #1a1a1a; }
  .party-detail { font-size: 11px; color: #555; margin-top: 4px; line-height: 1.7; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  table.items th { background: #f5f5f5; font-size: 10px; font-weight: 600; color: #333; text-align: center; padding: 8px 6px; border-bottom: 2px solid #ccc; text-transform: uppercase; letter-spacing: 0.5px; }
  table.items td { text-align: center; padding: 7px 6px; border-bottom: 1px solid #eee; font-size: 11px; }
  table.items td.left { text-align: left; }
  table.items .grand-total td { background: #f9f9f9; font-weight: 700; border-top: 2px solid #333; }
  .totals { text-align: right; font-size: 14px; font-weight: 700; margin-bottom: 24px; padding: 8px 0; }
  .section { margin-bottom: 18px; }
  .section-title { font-size: 10px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .info-grid { border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; font-size: 11px; color: #555; line-height: 1.8; }
  .info-grid .row { display: flex; justify-content: space-between; }
  .terms { font-size: 11px; color: #555; line-height: 1.8; }
  .signature { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
  .sign-line { width: 200px; border-top: 1px solid #333; padding-top: 6px; font-size: 11px; color: #999; }
  .eoe { font-size: 10px; color: #aaa; text-align: right; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    table.items th { background: #f5f5f5 !important; }
    .no-print { display: none; }
  }
</style></head>
<body>
  <div class="no-print" style="text-align:center;padding:12px;background:#f0f0f0;margin-bottom:16px">
    <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer">Print / Save as PDF</button>
  </div>
  <div class="page">

    <!-- Header -->
    <div class="header">
      <div class="logo-area">
        <div class="logo-name">WOWOHCOOL</div>
        <div class="logo-sub">Dong Yi Technology Co., Limited</div>
      </div>
      <div class="title-area">
        <div class="title-text">${title}</div>
        <div class="doc-meta">
          ${q.quotation_no}<br>
          Date: ${fmtDate(q.created_at)}<br>
          Valid Until: ${fmtDate(validUntil.toISOString())}
        </div>
      </div>
    </div>

    <!-- Parties -->
    <div class="parties">
      <div class="party-box">
        <div class="party-label">Seller / Supplier</div>
        <div class="party-name">Dong Yi Technology Co., Limited</div>
        <div class="party-detail">
          Contact: Sales Department<br>
          Tel: +86-755-XXXXXXXX<br>
          Email: sales@wowohcool.com<br>
          Web: www.wowohcool.com<br>
          Address: Shenzhen, Guangdong, China
        </div>
      </div>
      <div class="party-box">
        <div class="party-label">Buyer / Customer</div>
        <div class="party-name">${q.customer_company || '____________________'}</div>
        <div class="party-detail">
          Contact: ${q.customer_contact || '____________________'}<br>
          Tel: ${q.customer_phone || '____________________'}<br>
          Web: ${q.customer_website || '____________________'}<br>
          Address: ${q.customer_address || '____________________'}
        </div>
      </div>
    </div>

    <!-- Items -->
    <table class="items">
      <thead>
        <tr>${type === 'quotation'
          ? '<th>#</th><th style="text-align:left">Model</th><th style="text-align:left">Description</th><th>MOQ</th><th>Qty</th><th>Price (' + currency + ')</th><th>Total (' + currency + ')</th><th>Remarks</th>'
          : '<th>#</th><th style="text-align:left">Model</th><th>Qty</th><th>Price (' + currency + ')</th><th>Total (' + currency + ')</th>'}</tr>
      </thead>
      <tbody>
        ${items.map((item, i) => {
          const p = showPrice(item);
          const t = showTotalFn(item);
          if (type === 'quotation') {
            return `<tr><td>${i + 1}</td><td class="left">${item.official_model}</td><td class="left">${item.description || '-'}</td><td>${item.moq || 1}</td><td>${item.quantity}</td><td>${curSym}${p.toFixed(2)}</td><td>${curSym}${t.toFixed(2)}</td><td>${item.remarks || ''}</td></tr>`;
          }
          return `<tr><td>${i + 1}</td><td class="left">${item.official_model}</td><td>${item.quantity}</td><td>${curSym}${p.toFixed(2)}</td><td>${curSym}${t.toFixed(2)}</td></tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr class="grand-total">
          <td colspan="${type === 'quotation' ? 6 : 4}" style="text-align:right">Total Amount:</td>
          <td>${curSym}${r2(grandTotal).toFixed(2)}</td>
          ${type === 'quotation' ? '<td></td>' : ''}
        </tr>
      </tfoot>
    </table>

    <div class="totals" style="text-align:right;font-size:13px;color:#666">
      ${currency === 'USD'
        ? `Exchange Rate: 1 USD = ${q.exchange_rate || 7.25} RMB &nbsp;|&nbsp; RMB Equivalent: ¥${r2(totalRMB).toFixed(2)}`
        : `Exchange Rate: 1 USD = ${q.exchange_rate || 7.25} RMB &nbsp;|&nbsp; USD Equivalent: $${r2(totalUSD).toFixed(2)}`}
    </div>

    <!-- Bank -->
    <div class="section">
      <div class="section-title">Bank Information</div>
      <div class="info-grid">
        <div class="row"><span>Beneficiary:</span><span style="font-weight:500;color:#333">${q.bank_beneficiary || 'Dong Yi Technology Co., Limited'}</span></div>
        <div class="row"><span>Bank Name:</span><span style="font-weight:500;color:#333">${q.bank_name || '____________________'}</span></div>
        <div class="row"><span>Bank Address:</span><span style="font-weight:500;color:#333">${q.bank_address || '____________________'}</span></div>
        <div class="row"><span>Account No.:</span><span style="font-weight:500;color:#333">${q.bank_account || '____________________'}</span></div>
        <div class="row"><span>SWIFT Code:</span><span style="font-weight:500;color:#333">${q.bank_swift || '____________________'}</span></div>
      </div>
    </div>

    <!-- Terms -->
    <div class="section">
      <div class="section-title">Terms &amp; Conditions</div>
      <div class="terms">
        <div>Payment Terms: ${q.payment_terms || 'T/T'}</div>
        <div>Delivery Time: ${q.delivery_time_global || q.delivery_time || 'To be confirmed'}</div>
        <div>Validity: ${q.valid_days || 15} days from the date hereof</div>
        ${q.notes ? `<div>Remarks: ${q.notes}</div>` : ''}
      </div>
    </div>

    <!-- Signature -->
    <div class="signature">
      <div>
        <div style="font-size:11px;color:#666">Authorized Signature</div>
        <div class="sign-line" style="margin-top:36px">Signature &amp; Stamp</div>
      </div>
      <div class="eoe">
        E.&amp;O.E.<br>
        This document is computer-generated and is valid without a physical signature.
      </div>
    </div>

  </div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups for PDF export'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
}
