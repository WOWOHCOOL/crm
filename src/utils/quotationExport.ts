import * as XLSX from 'xlsx';
import type { Quotation, QuotationItem } from '../types';

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ============================================================
// EXCEL EXPORT (QUO only — PI uses PDF)
// ============================================================
export function exportExcel(
  q: Quotation,
  items: QuotationItem[],
  currency: 'USD' | 'RMB',
) {
  const curSym = currency === 'USD' ? '$' : '¥';
  const totalVal = items.reduce((s, i) => s + (currency === 'USD' ? Number(i.unit_price_usd) : Number(i.unit_price_rmb)) * i.quantity, 0);
  const validUntil = new Date(new Date(q.created_at).getTime() + (q.valid_days || 15) * 86400000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any[] = [];

  d.push(['WOWOHCOOL — QUOTATION', '', '', '', '', '', '', '']);
  d.push([q.quotation_no, '', '', '', '', '', '', '']);
  d.push([`Date: ${fmtDate(q.created_at)}  |  Valid: ${fmtDate(validUntil.toISOString())}`, '', '', '', '', '', '', '']);
  d.push([]);

  d.push(['SUPPLIER:', '', '', '', 'CUSTOMER:', '', '', '']);
  d.push(['Dong Yi Technology Co., Limited', '', '', '', q.customer_company || '', '', '', '']);
  d.push([`Contact: Sales Dept`, '', '', '', `Contact: ${q.customer_contact || ''}`, '', '', '']);
  d.push([`Tel: +86-755-XXXXXXXX`, '', '', '', `Tel: ${q.customer_phone || ''}`, '', '', '']);
  d.push([`Web: www.wowohcool.com`, '', '', '', `Web: ${q.customer_website || ''}`, '', '', '']);
  d.push([`Address: Shenzhen, China`, '', '', '', `Address: ${q.customer_address || ''}`, '', '', '']);
  d.push([]);
  d.push([]);

  d.push(['#', 'Model', 'Description', 'MOQ', 'Qty', `Price (${currency})`, `Total (${currency})`, 'Remarks']);
  items.forEach((item, i) => {
    const p = currency === 'USD' ? Number(item.unit_price_usd) : Number(item.unit_price_rmb);
    d.push([i + 1, item.official_model, item.description || '', item.moq || 1, item.quantity, p, r2(p * item.quantity), item.remarks || '']);
  });
  d.push([]);
  d.push([`TOTAL: ${curSym}${r2(totalVal).toFixed(2)}`, '', '', '', '', '', '', '']);
  d.push([]);

  d.push(['BANK INFORMATION', '', '', '', '', '', '', '']);
  d.push([`Beneficiary: ${q.bank_beneficiary || 'Dong Yi Technology Co., Limited'}`, '', '', '', '', '', '', '']);
  d.push([`Bank: ${q.bank_name || ''}`, '', '', '', '', '', '', '']);
  d.push([`Account: ${q.bank_account || ''}`, '', '', '', '', '', '', '']);
  d.push([`SWIFT: ${q.bank_swift || ''}`, '', '', '', '', '', '', '']);
  d.push([]);

  d.push(['TERMS', '', '', '', '', '', '', '']);
  d.push([`Payment: ${q.payment_terms || ''}`, '', '', '', '', '', '', '']);
  d.push([`Delivery: ${q.delivery_time_global || q.delivery_time || ''}`, '', '', '', '', '', '', '']);
  d.push([`Validity: ${q.valid_days || 15} days`, '', '', '', '', '', '', '']);
  if (q.notes) d.push([`Notes: ${q.notes}`, '', '', '', '', '', '', '']);

  const ws = XLSX.utils.aoa_to_sheet(d);
  ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 25 }, { wch: 6 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'QUOTATION');
  XLSX.writeFile(wb, `${q.quotation_no}.xlsx`);
}

// ============================================================
// PDF EXPORT — A4 portrait, ready to print
// ============================================================
export function exportPDF(
  q: Quotation,
  items: QuotationItem[],
  type: 'quotation' | 'pi',
  currency: 'USD' | 'RMB',
) {
  const title = type === 'quotation' ? 'QUOTATION' : 'INVOICE';
  const validUntil = new Date(new Date(q.created_at).getTime() + (q.valid_days || 15) * 86400000);
  const totalUSD = items.reduce((s, i) => s + Number(i.unit_price_usd) * i.quantity, 0);
  const totalRMB = items.reduce((s, i) => s + Number(i.unit_price_rmb) * i.quantity, 0);
  const curSym = currency === 'USD' ? 'US$' : '¥';
  const showPrice = (i: QuotationItem) => currency === 'USD' ? Number(i.unit_price_usd) : Number(i.unit_price_rmb);
  const grandTotal = currency === 'USD' ? totalUSD : totalRMB;
  const origin = window.location.origin;

  const colCount = type === 'quotation' ? 6 : 4; // colspan for total row

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${q.quotation_no}</title>
<style>
  @page { size: A4 portrait; margin: 18mm 16mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Helvetica Neue',Arial,'Segoe UI',sans-serif; color:#222; font-size:10.5px; line-height:1.5; }
  .page { max-width:100%; }

  /* Top section: logo left, title right */
  .top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px; }
  .logo img { height:44px; }
  .title-block { text-align:right; }
  .title-block h1 { font-size:20px; font-weight:700; color:#b22222; letter-spacing:2px; text-transform:uppercase; margin:0; }
  .title-block .meta { font-size:9.5px; color:#666; margin-top:3px; line-height:1.6; }

  /* Divider */
  .divider { border:none; border-top:2px solid #ddd; margin:0 0 16px 0; }

  /* Supplier / Customer side by side */
  .parties { display:flex; gap:20px; margin-bottom:18px; }
  .party { flex:1; }
  .party h3 { font-size:9px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:1px; margin-bottom:3px; }
  .party .name { font-size:11px; font-weight:600; color:#111; }
  .party .info { font-size:9.5px; color:#555; margin-top:2px; line-height:1.6; }

  /* Items */
  table.items { width:100%; border-collapse:collapse; margin-bottom:14px; }
  table.items thead th { font-size:8.5px; font-weight:600; color:#444; padding:5px 4px; border-bottom:2px solid #bbb; text-align:center; text-transform:uppercase; letter-spacing:0.3px; }
  table.items thead th.left { text-align:left; }
  table.items tbody td { font-size:9.5px; padding:5px 4px; border-bottom:1px solid #e8e8e8; text-align:center; }
  table.items tbody td.left { text-align:left; }
  table.items tfoot td { font-size:10px; font-weight:700; padding:7px 4px; border-top:2px solid #333; text-align:right; }

  /* Note line */
  .note { font-size:9px; color:#999; text-align:right; margin-bottom:14px; }

  /* Sections: Bank, Terms */
  .section { margin-bottom:12px; }
  .section h3 { font-size:9px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:1px; margin-bottom:3px; }
  .section p { font-size:9.5px; color:#555; line-height:1.6; margin:0; }

  /* Signature area */
  .sig { margin-top:28px; display:flex; justify-content:space-between; align-items:flex-end; }
  .sig .line { width:160px; border-top:1px solid #333; padding-top:4px; font-size:9px; color:#999; }
  .sig .eoe { font-size:8.5px; color:#aaa; text-align:right; }

  /* Print button */
  .print-btn { text-align:center; padding:10px 0 12px; }
  .print-btn button { padding:6px 20px; font-size:12px; cursor:pointer; border:1px solid #999; background:#fff; border-radius:3px; }
  .print-btn button:hover { background:#f5f5f5; }
  @media print { .print-btn { display:none; } body { -webkit-print-color-adjust:exact; } }
</style></head><body>
<div class="print-btn"><button onclick="window.print()">🖨 Print / Save PDF</button></div>
<div class="page">

  <!-- Header: logo left, title right -->
  <div class="top">
    <div class="logo"><img src="${origin}/logo.webp" alt="WOWOHCOOL"></div>
    <div class="title-block">
      <h1>${title}</h1>
      <div class="meta">
        ${q.quotation_no}<br>
        Date: ${fmtDate(q.created_at)}<br>
        Valid Until: ${fmtDate(validUntil.toISOString())}
      </div>
    </div>
  </div>

  <hr class="divider">

  <!-- Supplier & Customer -->
  <div class="parties">
    <div class="party">
      <h3>Seller / Supplier</h3>
      <div class="name">Dong Yi Technology Co., Limited</div>
      <div class="info">
        Contact: Sales Department<br>
        Tel: +86-755-XXXXXXXX<br>
        Email: sales@wowohcool.com<br>
        Web: www.wowohcool.com<br>
        Address: Shenzhen, Guangdong, China
      </div>
    </div>
    <div class="party">
      <h3>Buyer / Customer</h3>
      <div class="name">${q.customer_company || '____________________'}</div>
      <div class="info">
        Contact: ${q.customer_contact || '____________________'}<br>
        Tel: ${q.customer_phone || '____________________'}<br>
        Web: ${q.customer_website || '____________________'}<br>
        Address: ${q.customer_address || '____________________'}
      </div>
    </div>
  </div>

  <!-- Items Table -->
  <table class="items">
    <thead><tr>
      <th style="width:28px">#</th>
      <th class="left" style="width:${type === 'quotation' ? '22%' : '35%'}">Model</th>
      ${type === 'quotation' ? '<th class="left" style="width:25%">Description</th><th style="width:6%">MOQ</th>' : ''}
      <th style="width:8%">Qty</th>
      <th style="width:${type === 'quotation' ? '14%' : '18%'}">Price (${currency})</th>
      <th style="width:${type === 'quotation' ? '14%' : '18%'}">Total (${currency})</th>
      ${type === 'quotation' ? '<th style="width:12%">Remarks</th>' : ''}
    </tr></thead>
    <tbody>
      ${items.map((item, i) => {
        const p = showPrice(item);
        const t = r2(p * item.quantity);
        return type === 'quotation'
          ? `<tr><td>${i+1}</td><td class="left">${item.official_model}</td><td class="left">${item.description || '-'}</td><td>${item.moq || 1}</td><td>${item.quantity}</td><td>${curSym}${p.toFixed(2)}</td><td>${curSym}${t.toFixed(2)}</td><td>${item.remarks || ''}</td></tr>`
          : `<tr><td>${i+1}</td><td class="left">${item.official_model}</td><td>${item.quantity}</td><td>${curSym}${p.toFixed(2)}</td><td>${curSym}${t.toFixed(2)}</td></tr>`;
      }).join('')}
    </tbody>
    <tfoot><tr>
      <td colspan="${colCount}" style="text-align:right;padding-right:8px">TOTAL DUE:</td>
      <td style="text-align:center">${curSym}${r2(grandTotal).toFixed(2)}</td>
      ${type === 'quotation' ? '<td></td>' : ''}
    </tr></tfoot>
  </table>

  ${type === 'quotation' ? `<div class="note">Exchange Rate: 1 USD = ${q.exchange_rate || 7.25} RMB  |  ${currency === 'USD' ? `RMB Equivalent: ¥${r2(totalRMB).toFixed(2)}` : `USD Equivalent: $${r2(totalUSD).toFixed(2)}`}</div>` : ''}

  <!-- Bank -->
  <div class="section">
    <h3>Bank Information</h3>
    <p>
      Beneficiary: ${q.bank_beneficiary || 'Dong Yi Technology Co., Limited'}<br>
      Bank: ${q.bank_name || '____________________'}<br>
      Account: ${q.bank_account || '____________________'}<br>
      SWIFT: ${q.bank_swift || '____________________'}
    </p>
  </div>

  <!-- Terms -->
  <div class="section">
    <h3>Terms &amp; Conditions</h3>
    <p>
      Payment Terms: ${q.payment_terms || 'T/T'}<br>
      Delivery Time: ${q.delivery_time_global || q.delivery_time || 'To be confirmed'}<br>
      Validity: ${q.valid_days || 15} days from the date hereof<br>
      ${q.notes ? `Remarks: ${q.notes}` : ''}
    </p>
  </div>

  <!-- Signature -->
  <div class="sig">
    <div>
      <div style="font-size:9.5px;color:#555">Authorized Signature</div>
      <div class="line" style="margin-top:24px">Signature &amp; Stamp</div>
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
