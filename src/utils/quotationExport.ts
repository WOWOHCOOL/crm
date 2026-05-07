import * as XLSX from 'xlsx';
import type { Quotation, QuotationItem } from '../types';

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ============================================================
// EXCEL EXPORT — clean layout, all data fields preserved
// ============================================================
export function exportExcel(
  q: Quotation,
  items: QuotationItem[],
  type: 'quotation' | 'pi',
  currency: 'USD' | 'RMB',
) {
  const title = type === 'quotation' ? 'QUOTATION' : 'PROFORMA INVOICE';
  const priceLabel = `Price (${currency})`;
  const totalLabel = `Total (${currency})`;
  const curSym = currency === 'USD' ? '$' : '¥';
  const totalVal = items.reduce((s, i) => s + (currency === 'USD' ? Number(i.unit_price_usd) : Number(i.unit_price_rmb)) * i.quantity, 0);
  const validUntil = new Date(new Date(q.created_at).getTime() + (q.valid_days || 15) * 86400000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any[] = [];

  // Layout: columns A-G (7 cols) for QUO, A-E (5 cols) for PI
  // A-B: left section, D-E/F/G: right section

  // Row 1: Logo left | Title right
  d.push(['WOWOHCOOL', '', '', '', title, '', '']);
  // Row 2-4: Company info left | Meta right
  d.push(['Dong Yi Technology Co., Limited', '', '', '', `No: ${q.quotation_no}`, '', '']);
  d.push(['www.wowohcool.com', '', '', '', `Date: ${fmtDate(q.created_at)}`, '', '']);
  d.push(['Shenzhen, Guangdong, China', '', '', '', `Valid Until: ${fmtDate(validUntil.toISOString())}`, '', '']);
  d.push([]);
  d.push([]);

  // TO: Customer info (clean block, like reference)
  d.push(['TO:', '', '', '', '', '', '']);
  d.push([q.customer_company || '____________________', '', '', '', '', '', '']);
  d.push([`Contact: ${q.customer_contact || '____________________'}`, '', '', '', '', '', '']);
  d.push([`Tel: ${q.customer_phone || '____________________'}`, '', '', '', '', '', '']);
  d.push([`Web: ${q.customer_website || '____________________'}`, '', '', '', '', '', '']);
  d.push([`Address: ${q.customer_address || '____________________'}`, '', '', '', '', '', '']);
  d.push([]);
  d.push([]);

  // Items table
  if (type === 'quotation') {
    d.push(['#', 'Model', 'Description', 'MOQ', 'Qty', priceLabel, totalLabel, 'Remarks']);
    items.forEach((item, i) => {
      const p = currency === 'USD' ? Number(item.unit_price_usd) : Number(item.unit_price_rmb);
      d.push([i + 1, item.official_model, item.description || '', item.moq || 1, item.quantity, p, r2(p * item.quantity), item.remarks || '']);
    });
  } else {
    d.push(['#', 'Model', 'Qty', priceLabel, totalLabel]);
    items.forEach((item, i) => {
      const p = currency === 'USD' ? Number(item.unit_price_usd) : Number(item.unit_price_rmb);
      d.push([i + 1, item.official_model, item.quantity, p, r2(p * item.quantity)]);
    });
  }
  d.push([]);
  d.push([`TOTAL DUE: ${curSym}${r2(totalVal).toFixed(2)}`, '', '', '', '', '', '', '']);
  d.push([]);

  // Bank info
  d.push(['BANK INFORMATION:', '', '', '', '', '', '']);
  d.push([`Beneficiary: ${q.bank_beneficiary || 'Dong Yi Technology Co., Limited'}`, '', '', '', '', '', '']);
  d.push([`Bank: ${q.bank_name || ''}`, '', '', '', '', '', '']);
  d.push([`Account: ${q.bank_account || ''}`, '', '', '', '', '', '']);
  d.push([`SWIFT: ${q.bank_swift || ''}`, '', '', '', '', '', '']);
  d.push([]);

  // Terms
  d.push(['TERMS:', '', '', '', '', '', '']);
  d.push([`Payment: ${q.payment_terms || ''}`, '', '', '', '', '', '']);
  d.push([`Delivery: ${q.delivery_time_global || q.delivery_time || ''}`, '', '', '', '', '', '']);
  d.push([`Validity: ${q.valid_days || 15} days`, '', '', '', '', '', '']);
  if (q.notes) d.push([`Notes: ${q.notes}`, '', '', '', '', '', '']);

  const ws = XLSX.utils.aoa_to_sheet(d);
  ws['!cols'] = [
    { wch: 5 }, { wch: 25 }, { wch: 28 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title);
  XLSX.writeFile(wb, `${q.quotation_no}.xlsx`);
}

// ============================================================
// PDF EXPORT — clean A4 layout, all data fields preserved
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
  const grandTotal = currency === 'USD' ? totalUSD : totalRMB;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${q.quotation_no}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Helvetica Neue',Arial,sans-serif; color:#222; font-size:11px; line-height:1.5; }
  .page { max-width:100%; }

  /* Header: logo left, title right */
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; padding-bottom:16px; border-bottom:2px solid #e0e0e0; }
  .logo-name { font-size:22px; font-weight:700; color:#c00; letter-spacing:1px; }
  .logo-sub { font-size:10px; color:#888; margin-top:2px; line-height:1.5; }
  .title-right { text-align:right; }
  .title-text { font-size:22px; font-weight:700; color:#1a1a1a; letter-spacing:2px; text-transform:uppercase; }
  .meta { font-size:10px; color:#666; margin-top:4px; line-height:1.7; }

  /* TO section */
  .to-section { margin-bottom:20px; }
  .to-label { font-size:11px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px; }
  .to-name { font-size:13px; font-weight:600; color:#1a1a1a; }
  .to-detail { font-size:10px; color:#555; line-height:1.6; }

  /* Items table */
  table.items { width:100%; border-collapse:collapse; margin-bottom:16px; }
  table.items th { font-size:9px; font-weight:600; color:#555; text-align:center; padding:7px 5px; border-bottom:2px solid #ccc; text-transform:uppercase; letter-spacing:0.5px; }
  table.items td { text-align:center; padding:6px 5px; border-bottom:1px solid #eee; font-size:10px; }
  table.items td.left { text-align:left; }
  table.items .total-row td { font-weight:700; border-top:2px solid #333; padding:8px 5px; }

  /* Sections */
  .section { margin-bottom:14px; }
  .section-title { font-size:9px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px; }
  .section-body { font-size:10px; color:#555; line-height:1.6; }

  /* Signature */
  .signature { margin-top:32px; display:flex; justify-content:space-between; align-items:flex-end; }
  .sign-line { width:180px; border-top:1px solid #333; padding-top:5px; font-size:10px; color:#999; }
  .eoe { font-size:9px; color:#aaa; text-align:right; }
  .print-btn { text-align:center; padding:12px; background:#f0f0f0; margin-bottom:16px; }
  .print-btn button { padding:8px 24px; font-size:13px; cursor:pointer; border:1px solid #999; background:#fff; border-radius:4px; }
  .print-btn button:hover { background:#e8e8e8; }
  @media print { .print-btn { display:none; } body { -webkit-print-color-adjust:exact; } }
</style></head><body>
<div class="print-btn"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div>
      <div class="logo-name">WOWOHCOOL</div>
      <div class="logo-sub">Dong Yi Technology Co., Limited<br>www.wowohcool.com<br>Shenzhen, Guangdong, China</div>
    </div>
    <div class="title-right">
      <div class="title-text">${title}</div>
      <div class="meta">${q.quotation_no}<br>Date: ${fmtDate(q.created_at)}<br>Valid Until: ${fmtDate(validUntil.toISOString())}</div>
    </div>
  </div>

  <!-- TO -->
  <div class="to-section">
    <div class="to-label">TO</div>
    <div class="to-name">${q.customer_company || '____________________'}</div>
    <div class="to-detail">
      Contact: ${q.customer_contact || '____________________'}<br>
      Tel: ${q.customer_phone || '____________________'}<br>
      Web: ${q.customer_website || '____________________'}<br>
      Address: ${q.customer_address || '____________________'}
    </div>
  </div>

  <!-- ITEMS TABLE -->
  <table class="items">
    <thead><tr>
      <th style="width:30px">#</th>
      <th style="text-align:left">Model</th>
      ${type === 'quotation' ? '<th style="text-align:left">Description</th><th>MOQ</th>' : ''}
      <th>Qty</th>
      <th>Price (${currency})</th>
      <th>Total (${currency})</th>
      ${type === 'quotation' ? '<th>Remarks</th>' : ''}
    </tr></thead>
    <tbody>
      ${items.map((item, i) => {
        const p = showPrice(item);
        const t = r2(p * item.quantity);
        if (type === 'quotation') {
          return `<tr><td>${i+1}</td><td class="left">${item.official_model}</td><td class="left">${item.description || '-'}</td><td>${item.moq || 1}</td><td>${item.quantity}</td><td>${curSym}${p.toFixed(2)}</td><td>${curSym}${t.toFixed(2)}</td><td>${item.remarks || ''}</td></tr>`;
        }
        return `<tr><td>${i+1}</td><td class="left">${item.official_model}</td><td>${item.quantity}</td><td>${curSym}${p.toFixed(2)}</td><td>${curSym}${t.toFixed(2)}</td></tr>`;
      }).join('')}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="${type === 'quotation' ? 6 : 4}" style="text-align:right">TOTAL DUE:</td>
        <td>${curSym}${r2(grandTotal).toFixed(2)}</td>
        ${type === 'quotation' ? '<td></td>' : ''}
      </tr>
    </tfoot>
  </table>

  ${type === 'quotation' ? `
  <!-- Exchange rate note -->
  <div style="text-align:right;font-size:9px;color:#999;margin-bottom:16px">
    ${currency === 'USD' ? `Exchange Rate: 1 USD = ${q.exchange_rate || 7.25} RMB  |  RMB Equivalent: ¥${r2(totalRMB).toFixed(2)}` : `Exchange Rate: 1 USD = ${q.exchange_rate || 7.25} RMB  |  USD Equivalent: $${r2(totalUSD).toFixed(2)}`}
  </div>
  ` : ''}

  <!-- BANK INFO -->
  <div class="section">
    <div class="section-title">Bank Information</div>
    <div class="section-body">
      Beneficiary: ${q.bank_beneficiary || 'Dong Yi Technology Co., Limited'}<br>
      Bank: ${q.bank_name || '____________________'}<br>
      Account: ${q.bank_account || '____________________'}<br>
      SWIFT: ${q.bank_swift || '____________________'}
    </div>
  </div>

  <!-- TERMS -->
  <div class="section">
    <div class="section-title">Terms &amp; Conditions</div>
    <div class="section-body">
      Payment Terms: ${q.payment_terms || 'T/T'}<br>
      Delivery Time: ${q.delivery_time_global || q.delivery_time || 'To be confirmed'}<br>
      Validity: ${q.valid_days || 15} days from the date hereof<br>
      ${q.notes ? `Remarks: ${q.notes}` : ''}
    </div>
  </div>

  <!-- SIGNATURE -->
  <div class="signature">
    <div>
      <div style="font-size:10px;color:#666">Authorized Signature</div>
      <div class="sign-line" style="margin-top:30px">Signature &amp; Stamp</div>
    </div>
    <div class="eoe">E.&amp;O.E.<br>This document is computer-generated.</div>
  </div>

</div></body></html>`;

  const win = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups for PDF export'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
}
