-- Enterprise Property & Leasing Management System
-- Relational Database Schema (Master Prompt V2)

PRAGMA foreign_keys = ON;

-- 1. COMPANIES & PROJECTS
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tax_number TEXT,
    currency TEXT DEFAULT 'EGP',
    country TEXT DEFAULT 'Egypt',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    project_type TEXT NOT NULL, -- Commercial, Mixed-Use, Retail Mall, Office Park
    location TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EGP',
    project_manager TEXT,
    status TEXT NOT NULL DEFAULT 'Active', -- Planning, Active, Completed, Archived
    description TEXT,
    logo_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    total_floors INTEGER DEFAULT 1,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, code)
);

CREATE TABLE IF NOT EXISTS zones (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. DYNAMIC CONFIGURATION: AREA TYPES & UNIT TYPES
CREATE TABLE IF NOT EXISTS area_types (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, -- NULL = Global default, otherwise project override
    code TEXT NOT NULL UNIQUE,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    is_rentable INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS unit_types (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    code TEXT NOT NULL UNIQUE,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    category TEXT NOT NULL, -- Retail, Office, F&B, Storage, Kiosk, Commercial, Other
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. UNITS & DYNAMIC UNIT AREAS
CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
    zone_id TEXT REFERENCES zones(id) ON DELETE SET NULL,
    floor_number TEXT,
    unit_number TEXT NOT NULL,
    unit_type_id TEXT NOT NULL REFERENCES unit_types(id),
    operational_status TEXT NOT NULL DEFAULT 'Available', -- Available, Reserved, Under Negotiation, Partially Leased, Fully Leased, Under Maintenance, Blocked
    ownership_info TEXT,
    description TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, unit_number)
);

-- Dynamic multi-component area sizing (Never hardcoded columns)
CREATE TABLE IF NOT EXISTS unit_areas (
    id TEXT PRIMARY KEY,
    unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    area_type_id TEXT NOT NULL REFERENCES area_types(id),
    size_sqm REAL NOT NULL CHECK(size_sqm > 0),
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(unit_id, area_type_id)
);

-- 4. TENANTS & BRANDS
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    legal_name TEXT NOT NULL,
    commercial_name TEXT NOT NULL,
    tax_registration_number TEXT,
    contact_person TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    address TEXT,
    country TEXT DEFAULT 'Egypt',
    status TEXT NOT NULL DEFAULT 'Active', -- Active, Inactive, Blacklisted
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    industry TEXT, -- Fashion, Dining, Electronics, Services, Grocery
    logo_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. PIPELINES & STAGES
CREATE TABLE IF NOT EXISTS pipelines (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
    id TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    stage_order INTEGER NOT NULL,
    probability_percentage REAL DEFAULT 0,
    color_hex TEXT DEFAULT '#3b82f6',
    is_won INTEGER DEFAULT 0,
    is_lost INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. DEALS & AREA ALLOCATIONS
CREATE TABLE IF NOT EXISTS deals (
    id TEXT PRIMARY KEY,
    deal_reference TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL REFERENCES projects(id),
    unit_id TEXT NOT NULL REFERENCES units(id),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    brand_id TEXT REFERENCES brands(id),
    deal_type TEXT NOT NULL DEFAULT 'New Leasing', -- New Leasing, Renewal, Expansion, Contract Amendment, Partial Unit Leasing
    pipeline_id TEXT NOT NULL REFERENCES pipelines(id),
    current_stage_id TEXT NOT NULL REFERENCES pipeline_stages(id),
    deal_status TEXT NOT NULL DEFAULT 'In Progress', -- In Progress, Won, Lost, Cancelled
    deal_owner TEXT NOT NULL,
    expected_closing_date DATE,
    contract_start_date DATE NOT NULL,
    contract_end_date DATE NOT NULL,
    handover_date DATE,
    fit_out_days INTEGER DEFAULT 0,
    rent_free_days INTEGER DEFAULT 0,
    commercial_terms TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Deals allocate portions of unit components (enables simultaneous partial leasing)
CREATE TABLE IF NOT EXISTS deal_area_allocations (
    id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    unit_area_id TEXT NOT NULL REFERENCES unit_areas(id),
    allocated_sqm REAL NOT NULL CHECK(allocated_sqm > 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Rates per area type for each deal (historical independent pricing)
CREATE TABLE IF NOT EXISTS deal_area_rates (
    id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    area_type_id TEXT NOT NULL REFERENCES area_types(id),
    rent_rate_per_sqm REAL NOT NULL DEFAULT 0,
    service_rate_per_sqm REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(deal_id, area_type_id)
);

-- 7. FINANCIAL SNAPSHOTS, DEPOSITS & TAXES
CREATE TABLE IF NOT EXISTS deal_deposits (
    id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL UNIQUE REFERENCES deals(id) ON DELETE CASCADE,
    method TEXT NOT NULL, -- FIXED_AMOUNT, RENT_ONLY, RENT_AND_SERVICE, CUSTOM
    number_of_months REAL DEFAULT 0,
    calculation_base REAL DEFAULT 0,
    deposit_amount REAL NOT NULL,
    is_tax_inclusive INTEGER DEFAULT 0,
    tax_rate REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    total_deposit REAL NOT NULL,
    manual_override INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tax_configurations (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    charge_category TEXT NOT NULL, -- RENT, SERVICE_CHARGE, DEPOSIT, COMMISSION
    tax_treatment TEXT NOT NULL DEFAULT 'EXCLUSIVE', -- EXCLUSIVE, INCLUSIVE, EXEMPT
    tax_rate REAL NOT NULL DEFAULT 0.14, -- Default 14% VAT (Egypt)
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deal_financial_snapshots (
    id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL UNIQUE REFERENCES deals(id) ON DELETE CASCADE,
    total_allocated_sqm REAL NOT NULL,
    monthly_rent REAL NOT NULL,
    monthly_service_charge REAL NOT NULL,
    total_monthly_charges REAL NOT NULL,
    annual_rent REAL NOT NULL,
    annual_service_charge REAL NOT NULL,
    total_annual_charges REAL NOT NULL,
    deposit_amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EGP',
    snapshotted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. CONTRACTS & DUAL SIGNATURE VERIFICATION
CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    contract_number TEXT NOT NULL UNIQUE,
    deal_id TEXT NOT NULL UNIQUE REFERENCES deals(id),
    version_number INTEGER DEFAULT 1,
    contract_status TEXT NOT NULL DEFAULT 'Draft', -- Draft, Pending Signatures, Partially Signed, Fully Signed, Active, Terminated, Expired
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    document_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contract_signatures (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    party_type TEXT NOT NULL CHECK(party_type IN ('LANDLORD', 'TENANT')),
    signer_name TEXT NOT NULL,
    signer_title TEXT,
    signed_at DATETIME,
    signature_status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, SIGNED, VERIFIED, REJECTED
    verified_by TEXT,
    verified_at DATETIME,
    verification_notes TEXT,
    UNIQUE(contract_id, party_type)
);

CREATE TABLE IF NOT EXISTS contract_amendments (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    amendment_number INTEGER NOT NULL,
    amendment_type TEXT NOT NULL, -- Rent Adjustment, Area Adjustment, Term Extension
    description TEXT NOT NULL,
    effective_date DATE NOT NULL,
    approved_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. LEASING COMMISSIONS (STRICTLY SEPARATED)
CREATE TABLE IF NOT EXISTS commission_agreements (
    id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL UNIQUE REFERENCES deals(id) ON DELETE CASCADE,
    calculation_method TEXT NOT NULL, -- PERCENT_ANNUAL_RENT, RENT_MONTHS, FIXED_AMOUNT
    percentage_rate REAL DEFAULT 0,
    number_of_months REAL DEFAULT 0,
    fixed_amount REAL DEFAULT 0,
    commission_payer TEXT NOT NULL DEFAULT 'LANDLORD', -- LANDLORD, TENANT, OTHER, SPLIT
    currency TEXT DEFAULT 'EGP',
    tax_treatment TEXT DEFAULT 'EXCLUSIVE',
    tax_rate REAL DEFAULT 0.14,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commission_calculations (
    id TEXT PRIMARY KEY,
    commission_agreement_id TEXT NOT NULL REFERENCES commission_agreements(id) ON DELETE CASCADE,
    deal_id TEXT NOT NULL REFERENCES deals(id),
    contract_id TEXT NOT NULL REFERENCES contracts(id),
    base_annual_rent REAL NOT NULL,
    base_monthly_rent REAL NOT NULL,
    gross_commission REAL NOT NULL,
    tax_amount REAL NOT NULL DEFAULT 0,
    net_commission REAL NOT NULL,
    commission_status TEXT NOT NULL DEFAULT 'Draft', -- Draft, Pending Signatures, Partially Signed, Fully Signed, Commission Due, Invoiced, Partially Paid, Paid, Cancelled, Disputed
    due_triggered_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commission_invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    commission_calculation_id TEXT NOT NULL REFERENCES commission_calculations(id),
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    subtotal REAL NOT NULL,
    tax_amount REAL NOT NULL,
    total_amount REAL NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Issued', -- Issued, Partially Paid, Paid, Cancelled
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commission_payments (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES commission_invoices(id) ON DELETE CASCADE,
    payment_reference TEXT NOT NULL,
    payment_date DATE NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL, -- Bank Transfer, Cheque, Cash
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. FINANCIAL SCHEDULES & ESCALATIONS
CREATE TABLE IF NOT EXISTS financial_schedules (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    billing_frequency TEXT NOT NULL DEFAULT 'MONTHLY', -- MONTHLY, QUARTERLY, SEMI_ANNUAL, ANNUAL
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedule_lines (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL REFERENCES financial_schedules(id) ON DELETE CASCADE,
    period_year INTEGER NOT NULL,
    period_start_date DATE NOT NULL,
    period_end_date DATE NOT NULL,
    due_date DATE NOT NULL,
    rent_amount REAL NOT NULL,
    service_charge_amount REAL NOT NULL,
    total_amount REAL NOT NULL,
    is_rent_free INTEGER DEFAULT 0,
    is_fit_out INTEGER DEFAULT 0,
    notes TEXT
);

-- 11. AUDIT LOGS & SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    entity_name TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL, -- CREATE, UPDATE, DELETE, SIGNATURE, VERIFICATION, OVERRIDE
    changed_by TEXT NOT NULL,
    old_values TEXT,
    new_values TEXT,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    entity_type TEXT NOT NULL, -- PROJECT, UNIT, TENANT, DEAL, CONTRACT
    field_code TEXT NOT NULL UNIQUE,
    label_en TEXT NOT NULL,
    label_ar TEXT NOT NULL,
    field_type TEXT NOT NULL, -- TEXT, NUMBER, CURRENCY, DATE, DROPDOWN, BOOLEAN
    is_mandatory INTEGER DEFAULT 0,
    options_json TEXT, -- Options array for dropdowns
    display_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS custom_field_values (
    id TEXT PRIMARY KEY,
    field_definition_id TEXT NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
    entity_id TEXT NOT NULL,
    value_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(field_definition_id, entity_id)
);
