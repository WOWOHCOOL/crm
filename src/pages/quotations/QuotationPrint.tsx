import { useParams } from 'react-router-dom';
import { Spin, Button } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabase';
import type { Quotation, QuotationItem } from '../../types';

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function QuotationPrint() {
  const { id } = useParams<{ id: string }>();

  const { data: quotation, isLoading } = useQuery({
    queryKey: ['quotation-print', id],
    queryFn: async () => {
      const { data: q } = await supabase.from('quotations').select('*').eq('id', id).single();
      if (!q) throw new Error('Not found');
      const { data: items } = await supabase.from('quotation_items').select('*').eq('quotation_id', id).order('created_at');
      return { ...q, quotation_items: items ?? [] } as Quotation;
    },
    enabled: !!id,
  });

  if (isLoading) return <Spin style={{ display: 'block', margin: '100px auto' }} />;
  if (!quotation) return <div style={{ padding: 40, textAlign: 'center' }}>报价单不存在</div>;

  const items = quotation.quotation_items ?? [];
  const totalUSD = items.reduce((s, i) => s + i.unit_price_usd * i.quantity, 0);
  const totalRMB = items.reduce((s, i) => s + i.unit_price_rmb * i.quantity, 0);
  const validUntil = new Date(new Date(quotation.created_at).getTime() + (quotation.valid_days || 15) * 86400000);

  return (
    <div>
      <div style={{ textAlign: 'center', padding: 16, background: '#f5f5f5', position: 'sticky', top: 0, zIndex: 10 }}>
        <Button type="primary" icon={<PrinterOutlined />} size="large" onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
      </div>

      <div style={{
        maxWidth: 900, margin: '0 auto', padding: '40px 50px',
        background: '#fff', fontFamily: '"Helvetica Neue", Arial, sans-serif',
        color: '#222', fontSize: 13, lineHeight: 1.6,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 30 }}>
          <div>
            <img src="/logo.webp" alt="WOWOHCOOL" style={{ height: 50, marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: '#666' }}>
              <div>Dong Yi Technology Co., Limited</div>
              <div>www.wowohcool.com</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a', letterSpacing: 1 }}>
              PROFORMA INVOICE
            </div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              Quotation No: <strong>{quotation.quotation_no}</strong>
            </div>
          </div>
        </div>

        {/* Date / Validity */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, fontSize: 12, color: '#555' }}>
          <span>Date: {formatDate(quotation.created_at)}</span>
          <span>Valid Until: {formatDate(validUntil.toISOString())}</span>
        </div>

        {/* Supplier & Customer */}
        <div style={{ display: 'flex', gap: 30, marginBottom: 30 }}>
          <div style={{ flex: 1, border: '1px solid #e0e0e0', borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Supplier
            </div>
            <div style={{ fontWeight: 600 }}>Dong Yi Technology Co., Limited</div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
              <div>Contact: Sales Department</div>
              <div>Tel: +86-755-XXXXXXXX</div>
              <div>Email: sales@wowohcool.com</div>
              <div>Web: www.wowohcool.com</div>
              <div>Address: Shenzhen, Guangdong, China</div>
            </div>
          </div>
          <div style={{ flex: 1, border: '1px solid #e0e0e0', borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Customer
            </div>
            <div style={{ fontWeight: 600 }}>{quotation.customer_company || '____________________'}</div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
              <div>Contact: {quotation.customer_contact || '____________________'}</div>
              <div>Tel: {quotation.customer_phone || '____________________'}</div>
              <div>Web: {quotation.customer_website || '____________________'}</div>
              <div>Address: {quotation.customer_address || '____________________'}</div>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead>
            <tr style={{ background: '#f8f8f8' }}>
              <th style={thStyle}>#</th>
              <th style={{ ...thStyle, textAlign: 'left' }}>Product Model</th>
              <th style={thStyle}>Qty</th>
              <th style={thStyle}>Unit Price<br/>(USD)</th>
              <th style={thStyle}>Unit Price<br/>(RMB)</th>
              <th style={thStyle}>Total<br/>(USD)</th>
              <th style={thStyle}>Total<br/>(RMB)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: QuotationItem, i: number) => (
              <tr key={item.id || i}>
                <td style={tdStyle}>{i + 1}</td>
                <td style={{ ...tdStyle, textAlign: 'left' }}>
                  <div style={{ fontWeight: 500 }}>{item.official_model}</div>
                  {item.supplier_model && <div style={{ fontSize: 11, color: '#999' }}>OEM: {item.supplier_model}</div>}
                </td>
                <td style={tdStyle}>{item.quantity}</td>
                <td style={tdStyle}>${item.unit_price_usd.toFixed(2)}</td>
                <td style={tdStyle}>¥{item.unit_price_rmb.toFixed(2)}</td>
                <td style={tdStyle}><strong>${(item.unit_price_usd * item.quantity).toFixed(2)}</strong></td>
                <td style={tdStyle}>¥{(item.unit_price_rmb * item.quantity).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f8f8f8', fontWeight: 600 }}>
              <td colSpan={5} style={{ ...tdStyle, textAlign: 'right', borderBottom: '2px solid #333' }}>
                Total Amount:
              </td>
              <td style={{ ...tdStyle, borderBottom: '2px solid #333' }}>
                ${totalUSD.toFixed(2)}
              </td>
              <td style={{ ...tdStyle, borderBottom: '2px solid #333' }}>
                ¥{totalRMB.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Amount in Words */}
        <div style={{ fontSize: 12, color: '#555', marginBottom: 24, padding: 12, background: '#fafafa', borderRadius: 4 }}>
          <strong>Amount in Words:</strong> Say United States Dollars <strong>{numberToWords(totalUSD)}</strong> Only.
        </div>

        {/* Terms */}
        <div style={{ marginBottom: 30 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Terms &amp; Conditions
          </div>
          <table style={{ width: '100%', fontSize: 12, color: '#555' }}>
            <tbody>
              <tr><td style={{ padding: '2px 0', width: 140 }}>Payment Terms:</td><td>{quotation.payment_terms}</td></tr>
              <tr><td style={{ padding: '2px 0' }}>Delivery Time:</td><td>{quotation.delivery_time}</td></tr>
              <tr><td style={{ padding: '2px 0' }}>Validity:</td><td>{quotation.valid_days} days from the date hereof</td></tr>
              {quotation.notes && <tr><td style={{ padding: '2px 0' }}>Remarks:</td><td>{quotation.notes}</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Bank Info */}
        <div style={{ marginBottom: 30 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Bank Information
          </div>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 6, padding: 16, fontSize: 12, color: '#555' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Beneficiary:</span><span style={{ fontWeight: 500, color: '#333' }}>{quotation.bank_beneficiary}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Bank Name:</span><span style={{ fontWeight: 500, color: '#333' }}>{quotation.bank_name || '____________________'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Bank Address:</span><span style={{ fontWeight: 500, color: '#333' }}>{quotation.bank_address || '____________________'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Account No.:</span><span style={{ fontWeight: 500, color: '#333' }}>{quotation.bank_account || '____________________'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>SWIFT Code:</span><span style={{ fontWeight: 500, color: '#333' }}>{quotation.bank_swift || '____________________'}</span>
            </div>
          </div>
        </div>

        {/* Signature */}
        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 12, color: '#666' }}>Authorized Signature</div>
            <div style={{
              marginTop: 40, width: 200,
              borderTop: '1px solid #333',
              fontSize: 12, color: '#999', paddingTop: 6,
            }}>
              Signature &amp; Stamp
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#999', textAlign: 'right' }}>
            <div>E.&amp;O.E.</div>
            <div>This document is computer-generated and is valid without a physical signature.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', fontSize: 11, fontWeight: 600,
  textAlign: 'center', borderBottom: '2px solid #333',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'center',
  borderBottom: '1px solid #eee', fontSize: 12,
};

/** Simple number to words for USD amounts (supports up to billions) */
function numberToWords(n: number): string {
  if (n === 0) return 'Zero';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertBelow1000 = (num: number): string => {
    const parts: string[] = [];
    const h = Math.floor(num / 100);
    const r = num % 100;
    if (h > 0) parts.push(ones[h] + ' Hundred');
    if (r > 0) {
      if (r < 20) parts.push(ones[r]);
      else parts.push(tens[Math.floor(r / 10)] + (r % 10 > 0 ? '-' + ones[r % 10] : ''));
    }
    return parts.join(' ');
  };

  const intPart = Math.floor(n);
  const cents = Math.round((n - intPart) * 100);

  const billions = Math.floor(intPart / 1e9);
  const millions = Math.floor((intPart % 1e9) / 1e6);
  const thousands = Math.floor((intPart % 1e6) / 1e3);
  const remainder = intPart % 1e3;

  const words: string[] = [];
  if (billions > 0) words.push(convertBelow1000(billions) + ' Billion');
  if (millions > 0) words.push(convertBelow1000(millions) + ' Million');
  if (thousands > 0) words.push(convertBelow1000(thousands) + ' Thousand');
  if (remainder > 0) words.push(convertBelow1000(remainder));
  if (cents > 0) words.push('And Cents ' + convertBelow1000(cents));

  return words.join(' ') + ' Only';
}
