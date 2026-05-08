import type { PurchaseOrder, PurchaseItem, Supplier } from '../types';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 金额大写 */
function amountInChinese(n: number): string {
  if (n === 0) return '零元整';
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟', '万', '拾', '佰', '仟', '亿'];
  const i = Math.floor(n);
  const cents = Math.round((n - i) * 100);
  let result = '';

  const y = Math.floor(i / 1e8);
  const w = Math.floor((i % 1e8) / 1e4);
  const g = i % 1e4;

  if (y) { result += numToChinese(y, digits, units) + '亿'; }
  if (w) { result += numToChinese(w, digits, units) + '万'; }
  if (g) { result += numToChinese(g, digits, units); }
  if (!result) result = '零';
  result += '元';

  if (cents === 0) {
    result += '整';
  } else {
    result += digits[Math.floor(cents / 10)] + '角' + digits[cents % 10] + '分';
  }

  return result;
}

function numToChinese(n: number, digits: string[], units: string[]): string {
  let r = '';
  let zero = false;
  for (let i = 3; i >= 0; i--) {
    const d = Math.floor(n / Math.pow(10, i)) % 10;
    if (d === 0) {
      zero = true;
    } else {
      if (zero) { r += '零'; zero = false; }
      r += digits[d] + units[i];
    }
  }
  return r;
}

export function exportPurchasePDF(
  order: PurchaseOrder,
  items: PurchaseItem[],
  supplier: Supplier | null,
) {
  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const origin = window.location.origin;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${order.order_no}</title>
<style>
  @page { size: A4 portrait; margin: 15mm 16mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'SimSun','STSong','Noto Serif CJK SC','Source Han Serif SC',serif; color:#222; font-size:10.5px; line-height:1.6; }
  .page { max-width:100%; }
  .header { text-align:center; margin-bottom:18px; }
  .header h1 { font-size:22px; font-weight:700; letter-spacing:4px; margin:0 0 4px 0; }
  .header .sub { font-size:9px; color:#999; display:flex; justify-content:space-between; }
  .divider { border:none; border-top:2px solid #333; margin:0 0 14px 0; }
  .info { margin-bottom:14px; }
  .info table { width:100%; border-collapse:collapse; }
  .info td { padding:2px 4px; font-size:10px; vertical-align:top; }
  .info .label { color:#666; width:80px; white-space:nowrap; }
  .info .col { width:50%; }
  table.items { width:100%; border-collapse:collapse; margin-bottom:12px; }
  table.items thead th { font-size:9.5px; font-weight:600; padding:5px 4px; border:1px solid #333; background:#f5f5f5; text-align:center; }
  table.items tbody td { font-size:10px; padding:4px; border:1px solid #ccc; text-align:center; }
  table.items tbody td.left { text-align:left; }
  .total-row { text-align:right; margin-bottom:10px; padding:6px 10px; background:#fafafa; border:1px solid #ddd; border-radius:4px; }
  .total-row .line { display:flex; justify-content:flex-end; gap:20px; font-size:10.5px; padding:2px 0; }
  .total-row .amount { font-size:14px; font-weight:700; color:#b22222; }
  .total-row .words { font-size:9.5px; color:#666; margin-top:4px; font-style:italic; }
  .section { margin-bottom:10px; }
  .section h3 { font-size:9px; font-weight:600; color:#999; text-transform:uppercase; letter-spacing:1px; margin-bottom:2px; }
  .section p, .section .line { font-size:10px; color:#555; line-height:1.6; }
  .sig { margin-top:24px; display:flex; justify-content:space-between; align-items:flex-end; }
  .sig .left, .sig .right { font-size:10px; color:#555; }
  .sig .line { width:160px; border-top:1px solid #333; padding-top:3px; font-size:9px; color:#999; text-align:center; }
  .print-btn { text-align:center; padding:8px 0 10px; }
  .print-btn button { padding:5px 18px; font-size:11px; cursor:pointer; border:1px solid #999; background:#fff; border-radius:3px; }
  .print-btn button:hover { background:#f5f5f5; }
  @media print { .print-btn { display:none; } body { -webkit-print-color-adjust:exact; } }
</style></head><body>
<div class="print-btn"><button onclick="window.print()">🖨 打印 / 保存 PDF</button></div>
<div class="page">

  <div class="header">
    <h1>采 购 订 单</h1>
    <div class="sub">
      <span>PURCHASE ORDER</span>
      <span>编号: ${order.order_no}</span>
    </div>
  </div>

  <hr class="divider">

  <div class="info">
    <table>
      <tr>
        <td class="col" valign="top">
          <table>
            <tr><td class="label">供应商：</td><td><strong>${supplier?.name || ''}</strong></td></tr>
            <tr><td class="label">联系人：</td><td>${supplier?.contact_person || ''}</td></tr>
            <tr><td class="label">电话：</td><td>${supplier?.phone || ''}</td></tr>
            <tr><td class="label">地址：</td><td>${supplier?.address || ''}</td></tr>
          </table>
        </td>
        <td class="col" valign="top">
          <table>
            <tr><td class="label">日期：</td><td>${fmtDate(order.order_date)}</td></tr>
            <tr><td class="label">付款条件：</td><td>${supplier?.payment_terms || ''}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </div>

  <table class="items">
    <thead><tr>
      <th style="width:36px">序号</th>
      <th class="left" style="width:22%">型号</th>
      <th class="left" style="width:28%">描述</th>
      <th style="width:10%">数量</th>
      <th style="width:14%">单价</th>
      <th style="width:14%">金额</th>
    </tr></thead>
    <tbody>
      ${items.map((item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td class="left">${item.model || ''}</td>
          <td class="left">${item.description || ''}</td>
          <td>${item.quantity}</td>
          <td>¥${Number(item.unit_price).toFixed(2)}</td>
          <td>¥${r2(item.quantity * item.unit_price).toFixed(2)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="total-row">
    <div class="line">
      <span>合计金额：</span>
      <span class="amount">¥${r2(total).toFixed(2)}</span>
    </div>
    <div class="words">大写：${amountInChinese(r2(total))}</div>
  </div>

  ${order.notes ? `<div class="section"><h3>备注</h3><p>${order.notes}</p></div>` : ''}

  <div class="section">
    <h3>银行信息</h3>
    <div class="line">${supplier?.bank_info?.replace(/\n/g, '<br>') || ''}</div>
  </div>

  <div class="sig">
    <div class="left">
      <div>制单人：____________________</div>
      <div style="margin-top:24px">审批人：____________________</div>
    </div>
    <div class="right">
      <div>${supplier?.name || ''}</div>
      <div class="line" style="margin-top:20px">供应商签字盖章</div>
    </div>
  </div>

</div></body></html>`;

  const win = window.open('', '_blank');
  if (!win) { alert('请允许弹出窗口以导出 PDF'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
}
