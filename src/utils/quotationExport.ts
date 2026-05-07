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
// Number to Words
// ============================================================
function numberToWords(n: number): string {
  if (n === 0) return 'Zero';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const c = (num: number): string => {
    const p: string[] = [];
    const h = Math.floor(num / 100);
    const r = num % 100;
    if (h) p.push(ones[h] + ' Hundred');
    if (r) { if (r < 20) p.push(ones[r]); else p.push(tens[Math.floor(r / 10)] + (r % 10 ? '-' + ones[r % 10] : '')); }
    return p.join(' ');
  };
  const i = Math.floor(n);
  const cents = Math.round((n - i) * 100);
  const b = Math.floor(i / 1e9), m = Math.floor((i % 1e9) / 1e6), th = Math.floor((i % 1e6) / 1e3), rem = i % 1e3;
  const w: string[] = [];
  if (b) w.push(c(b) + ' Billion');
  if (m) w.push(c(m) + ' Million');
  if (th) w.push(c(th) + ' Thousand');
  if (rem) w.push(c(rem));
  if (cents) w.push('And Cents ' + c(cents));
  return w.join(' ') + ' Only';
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
  const depRate = q.deposit_rate || 50;
  const deposit = r2(grandTotal * depRate / 100);
  const balance = r2(grandTotal - deposit);
  const qtys = items.reduce((s, i) => s + i.quantity, 0);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${q.quotation_no}</title>
<style>
  @page { size: A4 portrait; margin: 18mm 16mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Helvetica Neue',Arial,'Segoe UI',sans-serif; color:#222; font-size:10px; line-height:1.5; }
  .page { max-width:100%; }
  .top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; }
  .logo img { height:44px; }
  .title-block { text-align:right; }
  .title-block h1 { font-size:20px; font-weight:700; color:#b22222; letter-spacing:2px; text-transform:uppercase; margin:0; }
  .title-block .meta { font-size:9px; color:#666; margin-top:2px; line-height:1.6; }
  .divider { border:none; border-top:2px solid #ddd; margin:0 0 14px 0; }
  .parties { display:flex; gap:20px; margin-bottom:14px; }
  .party { flex:1; }
  .party h3 { font-size:8.5px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:1px; margin-bottom:2px; }
  .party .name { font-size:10.5px; font-weight:600; color:#111; }
  .party .info { font-size:9px; color:#555; margin-top:1px; line-height:1.6; }
  .trade-terms { font-size:9px; color:#333; margin-bottom:12px; padding:6px 10px; background:#fafafa; border:1px solid #eee; border-radius:3px; }
  .trade-terms strong { color:#b22222; }
  table.items { width:100%; border-collapse:collapse; margin-bottom:10px; }
  table.items thead th { font-size:8px; font-weight:600; color:#444; padding:4px 3px; border-bottom:2px solid #bbb; text-align:center; text-transform:uppercase; letter-spacing:0.2px; }
  table.items thead th.left { text-align:left; }
  table.items tbody td { font-size:9px; padding:4px 3px; border-bottom:1px solid #e8e8e8; text-align:center; }
  table.items tbody td.left { text-align:left; }
  table.items tfoot td { font-size:9.5px; font-weight:700; padding:5px 3px; border-top:2px solid #333; text-align:right; }
  .note { font-size:8.5px; color:#999; text-align:right; margin-bottom:10px; }
  .amounts { border:1px solid #ddd; border-radius:4px; padding:10px 14px; margin-bottom:12px; }
  .amounts .row { display:flex; justify-content:space-between; font-size:9.5px; color:#333; padding:2px 0; }
  .amounts .row.total { font-size:11px; font-weight:700; color:#b22222; border-top:1px solid #ddd; padding-top:4px; margin-top:2px; }
  .amounts .words { font-size:8.5px; color:#666; font-style:italic; margin-top:6px; }
  .section { margin-bottom:10px; }
  .section h3 { font-size:8.5px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:1px; margin-bottom:2px; }
  .section p, .section .line { font-size:9px; color:#555; line-height:1.6; margin:0; }
  .sig { margin-top:24px; display:flex; justify-content:space-between; align-items:flex-end; }
  .sig .line { width:150px; border-top:1px solid #333; padding-top:3px; font-size:8.5px; color:#999; }
  .sig .eoe { font-size:8px; color:#aaa; text-align:right; }
  .print-btn { text-align:center; padding:8px 0 10px; }
  .print-btn button { padding:5px 18px; font-size:11px; cursor:pointer; border:1px solid #999; background:#fff; border-radius:3px; }
  .print-btn button:hover { background:#f5f5f5; }
  @media print { .print-btn { display:none; } body { -webkit-print-color-adjust:exact; } }
</style></head><body>
<div class="print-btn"><button onclick="window.print()">🖨 Print / Save PDF</button></div>
<div class="page">

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

  ${type === 'pi' && q.trade_terms ? `<div class="trade-terms"><strong>Trade Terms:</strong> ${q.trade_terms}</div>` : ''}

  <!-- Items Table -->
  <table class="items">
    <thead><tr>
      <th style="width:28px">#</th>
      <th class="left" style="width:${type === 'quotation' ? '22%' : '35%'}">Model</th>
      ${type === 'quotation' ? '<th class="left" style="width:25%">Description</th><th style="width:6%">MOQ</th>' : ''}
      ${type === 'pi' ? '<th style="width:8%">PCS</th>' : ''}
      <th style="width:8%">Qty</th>
      <th style="width:${type === 'quotation' ? '14%' : '15%'}">Price (${currency})</th>
      <th style="width:${type === 'quotation' ? '14%' : '15%'}">Total (${currency})</th>
      ${type === 'quotation' ? '<th style="width:12%">Remarks</th>' : ''}
    </tr></thead>
    <tbody>
      ${items.map((item, i) => {
        const p = showPrice(item);
        const t = r2(p * item.quantity);
        if (type === 'quotation') {
          return `<tr><td>${i+1}</td><td class="left">${item.official_model}</td><td class="left">${item.description || '-'}</td><td>${item.moq || 1}</td><td>${item.quantity}</td><td>${curSym}${p.toFixed(2)}</td><td>${curSym}${t.toFixed(2)}</td><td>${item.remarks || ''}</td></tr>`;
        }
        return `<tr><td>${i+1}</td><td class="left">${item.official_model}</td><td>${item.moq || 1}</td><td>${item.quantity}</td><td>${curSym}${p.toFixed(2)}</td><td>${curSym}${t.toFixed(2)}</td></tr>`;
      }).join('')}
    </tbody>
    <tfoot><tr>
      <td colspan="${type === 'quotation' ? 6 : 4}" style="text-align:right;padding-right:8px">TOTAL DUE:</td>
      <td style="text-align:center">${curSym}${r2(grandTotal).toFixed(2)}</td>
      ${type === 'quotation' ? '<td></td>' : ''}
    </tr></tfoot>
  </table>

  ${type === 'quotation' ? `<div class="note">Exchange Rate: 1 USD = ${q.exchange_rate || 7.25} RMB  |  ${currency === 'USD' ? `RMB Equivalent: ¥${r2(totalRMB).toFixed(2)}` : `USD Equivalent: $${r2(totalUSD).toFixed(2)}`}</div>` : ''}

  ${type === 'pi' ? `
  <div class="amounts">
    <div class="row"><span>Total Amount:</span><span>${curSym}${r2(grandTotal).toFixed(2)}</span></div>
    <div class="row"><span>Deposit (${depRate}%):</span><span>${curSym}${deposit.toFixed(2)}</span></div>
    <div class="row"><span>Balance (${100-depRate}%):</span><span>${curSym}${balance.toFixed(2)}</span></div>
    <div class="row total"><span>Total Due:</span><span>${curSym}${r2(grandTotal).toFixed(2)}</span></div>
    <div class="words">Amount in Words: ${numberToWords(currency === 'USD' ? totalUSD : totalRMB)}</div>
  </div>
  ` : ''}

  ${type === 'pi' ? `
  <div class="section">
    <h3>Bank Information</h3>
    <div class="line">
      Company Name: ${q.bank_beneficiary || 'Dong Yi Technology Co., Limited'}<br>
      Account No: ${q.bank_account || '____________________'}<br>
      Bank Name: ${q.bank_name || '____________________'}<br>
      Bank Address: ${q.bank_address || '____________________'}<br>
      SWIFT Code: ${q.bank_swift || '____________________'}<br>
      Bank Code: ${q.bank_code || '____________________'}
    </div>
  </div>
  ` : ''}

  <div class="section">
    <h3>Terms &amp; Conditions</h3>
    <div class="line">
      ${type === 'pi' ? `
      1. Payment Terms: 50% T/T advance as deposit, 50% balance before shipment. Samples need full payments.<br>
      2. All banking charges outside Hong Kong are on the buyer's account.<br>
      3. Delivery Terms: Within 35 days after payment is confirmed.<br>
      4. Requests for revision or cancellation of acknowledged orders will not be accepted.<br>
      ` : `
      Payment Terms: ${q.payment_terms || 'T/T'}<br>
      Delivery Time: ${q.delivery_time_global || q.delivery_time || 'To be confirmed'}<br>
      `}
      Validity: ${q.valid_days || 15} days from the date hereof
      ${q.notes ? `<br>Remarks: ${q.notes}` : ''}
    </div>
  </div>

  <div class="sig">
    <div>
      <div style="font-size:9px;color:#555">Authorized Signature</div>
      <div class="line" style="margin-top:20px">Signature &amp; Stamp</div>
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
