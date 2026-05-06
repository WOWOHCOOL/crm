export interface Customer {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  social_media: string | null;
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
  // join fields
  customers?: Customer | null;
  accounts?: Account | null;
}

export interface TransactionWithDetails extends Transaction {
  customers: Customer | null;
  accounts: Account | null;
}
