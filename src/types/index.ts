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
  suggested_price: number | null;
  tax_included: boolean;
  image_url: string | null;
  supplier_id: string | null;
  color: string | null;
  material: string | null;
  weight: string | null;
  size: string | null;
  specifications: string | null;
  package_includes: string | null;
  created_at: string;
  user_id: string;
}

export type OrderType = 'normal' | 'repeat' | 'sample';

export type OrderStatus = 'pending' | 'confirmed' | 'in_production' | 'shipped' | 'completed';

export interface Order {
  id: string;
  customer_id: string;
  pi_number: string | null;
  order_type: OrderType;
  status: OrderStatus;
  total_amount: number | null;
  notes: string | null;
  date: string;
  created_at: string;
  user_id: string;
  customers?: Customer | null;
  order_items?: OrderItem[];
  tracking_company: string | null;
  tracking_number: string | null;
  container_number: string | null;
  etd: string | null;
  eta: string | null;
  shipped_date: string | null;
  shipping_notes: string | null;
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
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

export interface OrgInfo {
  org_id: string;
  org_name: string;
  invite_code: string;
  role: 'owner' | 'admin' | 'member';
}

export interface OrgMemberInfo {
  user_id: string;
  email: string;
  role: 'owner' | 'member';
  created_at: string;
}

export interface OperationLog {
  id: string;
  user_email: string;
  action: string;
  entity: string;
  description: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  org_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms: string | null;
  bank_info: string | null;
  tax_id: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export type PurchaseStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  org_id: string;
  supplier_id: string | null;
  order_no: string;
  order_date: string;
  total_amount: number | null;
  status: PurchaseStatus;
  payment_terms: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  suppliers?: Supplier | null;
  purchase_items?: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  purchase_order_id: string;
  product_id: string | null;
  model: string | null;
  product_name: string | null;
  color: string | null;
  description: string | null;
  remarks: string | null;
  quantity: number;
  unit_price: number;
  created_at: string;
  user_id: string;
  products?: Product | null;
}

export interface Task {
  id: string;
  org_id: string;
  customer_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  reminder_time: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  user_id: string;
  created_at: string;
  updated_at: string;
  customers?: Customer | null;
}

export const ALL_PERMISSIONS = [
  { key: 'customers', label: '客户管理' },
  { key: 'products', label: '商品管理' },
  { key: 'finance', label: '财务记账' },
  { key: 'accounts', label: '科目管理' },
  { key: 'reports', label: '财务报表' },
  { key: 'quotations', label: '报价管理' },
  { key: 'tasks', label: '任务跟进' },
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number]['key'];

export interface QuotationItem {
  id: string;
  quotation_id: string;
  product_id: string | null;
  official_model: string;
  supplier_model: string | null;
  quantity: number;
  moq: number;
  unit_price_rmb: number;
  unit_price_usd: number;
  supply_price: number | null;
  description: string | null;
  remarks: string | null;
  created_at: string;
  products?: Product | null;
}

export interface Quotation {
  id: string;
  type: 'quotation' | 'pi';
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
  delivery_time_global: string;
  notes: string | null;
  customer_id: string | null;
  trade_terms: string;
  bank_beneficiary: string;
  bank_name: string | null;
  bank_address: string | null;
  bank_account: string | null;
  bank_swift: string | null;
  bank_code: string | null;
  deposit_rate: number;
  status: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  org_id: string | null;
  quotation_items?: QuotationItem[];
}
