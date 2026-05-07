export interface Customer {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  website: string | null;
  country: string | null;
  source: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  parent_id: string | null;
  created_at: string;
  user_id: string;
}

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  customer_id: string | null;
  account_id: string | null;
  type: TransactionType;
  amount: number;
  description: string | null;
  date: string;
  created_at: string;
  user_id: string;
  customers?: Customer | null;
  accounts?: Account | null;
}

export interface Product {
  id: string;
  official_model: string;
  supplier_model: string | null;
  supplier_name: string | null;
  supply_price: number | null;
  tax_included: boolean;
  created_at: string;
  user_id: string;
}

export type OrderType = 'normal' | 'repeat' | 'sample';

export interface Order {
  id: string;
  customer_id: string;
  pi_number: string | null;
  order_type: OrderType;
  total_amount: number | null;
  notes: string | null;
  date: string;
  created_at: string;
  user_id: string;
  customers?: Customer | null;
  order_items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  model: string | null;
  quantity: number;
  unit_price: number;
  created_at: string;
  user_id: string;
  products?: Product | null;
}

export interface Organization {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
}

export interface OrganizationMember {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'member';
  created_at: string;
}

export interface OrgInfo {
  org_id: string;
  org_name: string;
  invite_code: string;
  role: 'owner' | 'member';
}

export interface OrgMemberInfo {
  user_id: string;
  email: string;
  role: 'owner' | 'member';
  created_at: string;
}

export interface QuotationItem {
  id: string;
  quotation_id: string;
  product_id: string | null;
  official_model: string;
  supplier_model: string | null;
  quantity: number;
  unit_price_rmb: number;
  unit_price_usd: number;
  supply_price: number | null;
  created_at: string;
}

export interface Quotation {
  id: string;
  quotation_no: string;
  customer_company: string | null;
  customer_contact: string | null;
  customer_website: string | null;
  customer_address: string | null;
  customer_phone: string | null;
  exchange_rate: number;
  valid_days: number;
  payment_terms: string;
  delivery_time: string;
  notes: string | null;
  bank_beneficiary: string;
  bank_name: string | null;
  bank_address: string | null;
  bank_account: string | null;
  bank_swift: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  org_id: string | null;
  quotation_items?: QuotationItem[];
}
