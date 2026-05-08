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
  const units = ['', '拾', '佰', '仟'];
  const i = Math.floor(n);
  const cents = Math.round((n - i) * 100);
  let result = '';

  const yi = Math.floor(i / 1e8);
  const wan = Math.floor((i % 1e8) / 1e4);
  const ge = i % 1e4;

  if (yi) { result += ntc(yi, digits, units) + '亿'; }
  if (wan) { result += ntc(wan, digits, units) + '万'; }
  if (ge) { result += ntc(ge, digits, units); }
  if (!result) result = '零';
  result += '元';

  if (cents === 0) {
    result += '整';
  } else {
    const j = Math.floor(cents / 10);
    const f = cents % 10;
    if (j) result += digits[j] + '角';
    if (f) result += digits[f] + '分';
  }

  return 'RMB' + result;
}

function ntc(n: number, digits: string[], units: string[]): string {
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
  @page { size: A4 portrait; margin: 12mm 14mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'SimSun','STSong','Noto Serif CJK SC','Source Han Serif SC',serif; color:#222; font-size:10px; line-height:1.7; }
  .page { max-width:100%; }

  .header { text-align:center; margin-bottom:14px; }
  .header { text-align:center; margin-bottom:6px; }
  .header h1 { font-size:20px; font-weight:700; letter-spacing:6px; margin-bottom:2px; }
  .header .meta { font-size:9px; color:#666; display:flex; justify-content:space-between; }
  .divider { border:none; border-top:2px solid #333; margin:0 0 10px 0; }

  .info { margin-bottom:10px; font-size:10px; }
  .info table { width:100%; border-collapse:collapse; }
  .info td { padding:1px 4px; vertical-align:top; }
  .info .half { width:50%; }
  .info .label { color:#666; white-space:nowrap; }

  .section-title { font-weight:600; font-size:10.5px; margin:8px 0 4px 0; }

  table.items { width:100%; border-collapse:collapse; margin-bottom:8px; font-size:9.5px; }
  table.items thead th { font-weight:600; padding:4px 3px; border:1px solid #333; background:#f0f0f0; text-align:center; font-size:9px; }
  table.items tbody td { padding:3px; border:1px solid #ccc; text-align:center; }
  table.items tbody td.left { text-align:left; }

  .total-box { text-align:right; margin-bottom:8px; padding:4px 8px; border:1px solid #ddd; border-radius:2px; }
  .total-box .line { font-size:10px; padding:1px 0; }
  .total-box .big { font-size:11px; font-weight:700; }
  .total-box .words { font-size:9.5px; color:#333; margin-top:2px; }

  .terms { font-size:9px; line-height:1.8; margin-bottom:8px; }
  .terms p { text-indent:0; margin:0; padding:0; }
  .terms .clause { margin-bottom:1px; }

  .sig { margin-top:12px; display:flex; justify-content:space-between; font-size:9.5px; }
  .sig .box { width:45%; }
  .sig .box .title { font-weight:600; margin-bottom:4px; }
  .sig .line { width:160px; border-top:1px solid #333; padding-top:3px; margin-top:20px; text-align:center; font-size:9px; color:#999; }

  .print-btn { text-align:center; padding:6px 0 8px; }
  .print-btn button { padding:4px 16px; font-size:11px; cursor:pointer; border:1px solid #999; background:#fff; border-radius:3px; }
  .print-btn button:hover { background:#f5f5f5; }
  @media print { .print-btn { display:none; } body { -webkit-print-color-adjust:exact; } }
</style></head><body>
<div class="print-btn"><button onclick="window.print()">🖨 打印 / 保存 PDF</button></div>
<div class="page">

  <div class="header">
    <h1>采 购 订 单</h1>
    <div class="meta">
      <span>编号：${order.order_no}</span>
      <span>日期：${fmtDate(order.order_date)}</span>
    </div>
  </div>

  <hr class="divider">

  <div class="info">
    <table>
      <tr>
        <td class="half" valign="top">
          <strong>采购方（甲方）：</strong>东易科技有限公司<br>
          联系人：____________________<br>
          电话：____________________
        </td>
        <td class="half" valign="top">
          <strong>供应商（乙方）：</strong>${supplier?.name || '____________________'}<br>
          联系人：${supplier?.contact_person || '____________________'}<br>
          电话：${supplier?.phone || '____________________'}<br>
          地址：${supplier?.address || '____________________'}
        </td>
      </tr>
    </table>
  </div>

  <div class="section-title">采购信息</div>

  <table class="items">
    <thead><tr>
      <th style="width:28px">序号</th>
      <th class="left" style="width:11%">型号</th>
      <th class="left" style="width:11%">品名</th>
      <th style="width:7%">颜色</th>
      <th class="left" style="width:14%">描述/规格</th>
      <th style="width:8%">数量</th>
      <th style="width:11%">单价（RMB）</th>
      <th style="width:11%">金额</th>
      <th style="width:8%">交货周期</th>
      <th class="left" style="width:11%">备注</th>
    </tr></thead>
    <tbody>
      ${items.map((item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td class="left">${item.model || ''}</td>
          <td class="left">${item.product_name || ''}</td>
          <td>${item.color || ''}</td>
          <td class="left">${item.description || ''}</td>
          <td>${item.quantity}</td>
          <td>${Number(item.unit_price).toFixed(2)}</td>
          <td>${r2(item.quantity * item.unit_price).toFixed(2)}</td>
          <td></td>
          <td class="left">${item.remarks || ''}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="total-box">
    <div class="line big">合计金额：¥${r2(total).toFixed(2)}</div>
    <div class="words">合计人民币大写：${amountInChinese(r2(total))}</div>
  </div>

  <div class="section-title">合同内容</div>
  <div class="terms">
    <p class="clause">1、兹经买卖双方协商一致同意，甲方委托乙方生产本合同中指定产品，乙方根据甲方确认的产品进行生产；</p>
    <p class="clause">2、在制作本合同指定产品时乙方需要根据甲方要求制作，工艺、款式以双方最终确定的样品为准；</p>
    <p class="clause">3、付款方式：20%预付定金，验货通过后提货支付尾款80%。</p>
    <p class="clause" style="text-indent:2em">乙方账号信息：</p>
    <p class="clause" style="text-indent:2em">纳税识别号：${supplier?.tax_id || '____________________'}</p>
    <p class="clause" style="text-indent:2em">开  户  名：${supplier?.bank_account_name || '____________________'}</p>
    <p class="clause" style="text-indent:2em">账      号：${supplier?.bank_account_number || '____________________'}</p>
    <p class="clause" style="text-indent:2em">开  户  行：${supplier?.bank_name || '____________________'}</p>
    ${supplier?.bank_info ? `<p class="clause" style="text-indent:2em;color:#666">（${supplier.bank_info.replace(/\n/g, '；')}）</p>` : ''}
    <p class="clause">4、若产品验收不合格，则乙方应当立即返工，直至验货合格。（产品加塑料袋，塑料袋必须包含窒息危险警告和气孔，其他包装物料由甲方提供，乙方包装成品交货。请注意，出口纸箱任何一侧不能超过63厘米，毛重不得超过18Kg。）</p>
    <p class="clause">5、甲方有权利对本合同指定产品的质量、价格和服务进行监督和验审。</p>
    <p class="clause">6、乙方所提供的产品应以与甲方确认的最终样品质量为准，不得以次充好供应给甲方。否则，因此引起的一切不良后果，均由乙方承担。</p>
    <p class="clause">7、如因甲方在使用过程中因使用不当，例如人为碰摔、划伤、保养不善等原因而损坏，乙方不承担责任。</p>
    <p class="clause">8、乙方交付产品或包装时，如有质量不合格的（如出现包装不合格，配件不合格，损坏或缺少，将视为整个产品不合格），甲方有权在提出换货要求。</p>
    <p class="clause">9、产品设计，包装，以及样品的版权完全归属甲方。乙方不得在未经甲方允许情况下对产品进行复制，贩卖，赠送等侵权行为。如出现上述行为，甲方有权不支付任何生产费用，并追究乙方侵权法律责任。</p>
    <p class="clause">10、如果乙方延迟交货或甲方延期付款，在未达成谅解协议前，每逾期一日，违约方应按照本合同该礼品订购金额的3%向守约方支付违约金，但是该违约金累计不超过本合同金额的50%，逾期超过15日，守约方有权解除合同，并追究违约方的责任，向违约方索取由此造成守约方的经济以及名誉损失的赔偿。</p>
    <p class="clause">11、如任何一方无故解除合同或有其它违约行为，应向守约方支付与本合同总金额相等的违约金。</p>
    <p class="clause">12、本合同附件是本合同主要组成部分，与本合同同样具有法律效应。</p>
    <p class="clause">13、本协议一式贰份，甲乙双方各执壹份。</p>
    <p class="clause">14、本采购合同供需、双方严格遵守，如有争议，协商解决，协商不成，由仲裁委员会仲裁。</p>
    <p class="clause">15、供方产品如不符合环保标准，一切责任全由供方负责。</p>
  </div>

  <div class="sig">
    <div class="box">
      <div class="title">甲方（盖章）：东易科技有限公司</div>
      <div>代表人签字：</div>
      <div class="line">甲方签字盖章</div>
    </div>
    <div class="box" style="text-align:right">
      <div class="title">乙方（盖章）：${supplier?.name || ''}</div>
      <div>代表人签字：</div>
      <div class="line" style="margin-left:auto">乙方签字盖章</div>
    </div>
  </div>

</div></body></html>`;

  const win = window.open('', '_blank');
  if (!win) { alert('请允许弹出窗口以导出 PDF'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
}
