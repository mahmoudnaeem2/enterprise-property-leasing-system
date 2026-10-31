// Savills Enterprise Real Estate Seed Data (Master Prompt V2)
const { getDatabase, initSchema } = require('./database');
const crypto = require('node:crypto');
const MasterDataService = require('../services/masterDataService');
const ContractService = require('../services/contractService');
const CommissionEngine = require('../services/commissionEngine');
const ScheduleEngine = require('../services/scheduleEngine');

function runSeed(force = false) {
    console.log('--- Initializing Savills Commercial Leasing Schema ---');
    initSchema();
    const db = getDatabase();

    if (force) {
        db.exec('PRAGMA foreign_keys = OFF;');
        const tables = [
            'companies', 'projects', 'buildings', 'zones', 'area_types', 'unit_types',
            'units', 'unit_areas', 'tenants', 'brands', 'pipelines', 'pipeline_stages',
            'deals', 'deal_area_allocations', 'deal_area_rates', 'deal_deposits',
            'tax_configurations', 'deal_financial_snapshots', 'contracts', 'contract_signatures',
            'contract_amendments', 'commission_agreements', 'commission_calculations',
            'commission_invoices', 'commission_payments', 'financial_schedules', 'schedule_lines'
        ];
        for (const t of tables) {
            db.exec(`DELETE FROM ${t};`);
        }
        db.exec('PRAGMA foreign_keys = ON;');
    } else {
        const companyCount = db.prepare(`SELECT COUNT(*) as count FROM companies`).get();
        if (companyCount.count > 0) {
            console.log('Database already seeded. Skipping initial seeding.');
            return;
        }
    }

    console.log('--- Seeding Savills Corporate Entity ---');
    const companyId = crypto.randomUUID();
    db.prepare(`
        INSERT INTO companies (id, name, tax_number, currency, country)
        VALUES (?, 'Savills Commercial Egypt Ltd. (Savills Middle East)', 'EG-SAVILLS-001', 'EGP', 'Egypt')
    `).run(companyId);

    // 1. DYNAMIC AREA TYPES
    console.log('--- Seeding Dynamic Area Types ---');
    const areaTypes = [
        { id: crypto.randomUUID(), code: 'INDOOR', en: 'Indoor Area', ar: 'Indoor Area', rentable: 1, order: 1 },
        { id: crypto.randomUUID(), code: 'OUTDOOR', en: 'Outdoor Promenade', ar: 'Outdoor Promenade', rentable: 1, order: 2 },
        { id: crypto.randomUUID(), code: 'TERRACE', en: 'Terrace', ar: 'Terrace', rentable: 1, order: 3 },
        { id: crypto.randomUUID(), code: 'STORAGE', en: 'Dedicated Storage', ar: 'Dedicated Storage', rentable: 1, order: 4 },
        { id: crypto.randomUUID(), code: 'GARDEN', en: 'Private Garden', ar: 'Private Garden', rentable: 1, order: 5 },
        { id: crypto.randomUUID(), code: 'BASEMENT', en: 'Basement Facility', ar: 'Basement Facility', rentable: 0, order: 6 }
    ];

    const areaTypeMap = {};
    for (const at of areaTypes) {
        db.prepare(`
            INSERT INTO area_types (id, company_id, code, name_en, name_ar, is_rentable, is_active, display_order)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `).run(at.id, companyId, at.code, at.en, at.ar, at.rentable, at.order);
        areaTypeMap[at.code] = at.id;
    }

    // 2. UNIT TYPES
    console.log('--- Seeding Unit Types ---');
    const unitTypes = [
        { id: crypto.randomUUID(), code: 'RETAIL', en: 'Prime Retail Store', ar: 'Prime Retail Store', category: 'Retail' },
        { id: crypto.randomUUID(), code: 'RESTAURANT', en: 'Restaurant & Dining', ar: 'Restaurant & Dining', category: 'F&B' },
        { id: crypto.randomUUID(), code: 'OFFICE', en: 'Grade-A Corporate Office', ar: 'Grade-A Corporate Office', category: 'Office' },
        { id: crypto.randomUUID(), code: 'KIOSK', en: 'Promenade Island Kiosk', ar: 'Promenade Island Kiosk', category: 'Kiosk' },
        { id: crypto.randomUUID(), code: 'STORAGE', en: 'Commercial Storage', ar: 'Commercial Storage', category: 'Storage' }
    ];
    const unitTypeMap = {};
    for (const ut of unitTypes) {
        db.prepare(`
            INSERT INTO unit_types (id, company_id, code, name_en, name_ar, category, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        `).run(ut.id, companyId, ut.code, ut.en, ut.ar, ut.category);
        unitTypeMap[ut.code] = ut.id;
    }

    // 3. SAVILLS PRIME MANAGED ASSETS
    console.log('--- Seeding Savills Managed Commercial Assets ---');
    const projectCFC = MasterDataService.createProject({
        company_id: companyId,
        code: 'SAV-CFC',
        name: 'Savills Commercial Plaza (CFC)',
        project_type: 'Retail & Lifestyle Mall',
        location: 'New Cairo, 5th Settlement, Cairo',
        currency: 'EGP',
        project_manager: 'Mahmoud Naeem (Head of Commercial Leasing)',
        description: 'Flagship Savills managed regional retail and lifestyle destination featuring high-street fashion and luxury F&B promenades.'
    });

    const projectNile = MasterDataService.createProject({
        company_id: companyId,
        code: 'SAV-NCT',
        name: 'Nile City Corporate Towers',
        project_type: 'Grade-A Corporate Towers',
        location: 'Corniche El Nil, Ramlet Beaulac, Cairo',
        currency: 'EGP',
        project_manager: 'Nouran Mostafa (Senior Director)',
        description: 'Savills asset advisory corporate office headquarters offering panoramic Nile river views.'
    });

    const projectArkan = MasterDataService.createProject({
        company_id: companyId,
        code: 'SAV-ARK',
        name: 'Arkan Plaza Commercial Wing',
        project_type: 'Commercial & Open-Air Dining',
        location: 'El Sheikh Zayed City, Giza',
        currency: 'EGP',
        project_manager: 'Karim Mansour (Asset Manager)',
        description: 'Premier upscale open-air lifestyle commercial center in Sheikh Zayed.'
    });

    // Buildings
    const bldRetailA = crypto.randomUUID();
    db.prepare(`
        INSERT INTO buildings (id, project_id, code, name, total_floors, description)
        VALUES (?, ?, 'BLD-A', 'Savills Promenade Building A', 3, 'Prime retail arcade adjacent to Fountain Square')
    `).run(bldRetailA, projectCFC.id);

    const bldTowerNile = crypto.randomUUID();
    db.prepare(`
        INSERT INTO buildings (id, project_id, code, name, total_floors, description)
        VALUES (?, ?, 'TWR-NORTH', 'North Executive Office Tower', 32, 'Grade-A multinational corporate headquarters')
    `).run(bldTowerNile, projectNile.id);

    // 4. PIPELINES & STAGES
    console.log('--- Seeding Leasing Pipelines ---');
    const pipelineRetail = crypto.randomUUID();
    db.prepare(`
        INSERT INTO pipelines (id, company_id, project_id, name, code, is_active)
        VALUES (?, ?, ?, 'Savills Commercial Leasing Pipeline', 'PL-SAVILLS-COMM', 1)
    `).run(pipelineRetail, companyId, projectCFC.id);

    const stagesRetail = [
        { id: crypto.randomUUID(), en: 'Initial Prospecting', ar: 'Initial Prospecting', order: 1, prob: 10, color: '#94a3b8' },
        { id: crypto.randomUUID(), en: 'Concept Review & Tour', ar: 'Concept Review & Tour', order: 2, prob: 30, color: '#38bdf8' },
        { id: crypto.randomUUID(), en: 'Commercial Proposal', ar: 'Commercial Proposal', order: 3, prob: 60, color: '#f59e0b' },
        { id: crypto.randomUUID(), en: 'Dual Signature & Legal Verification', ar: 'Dual Signature & Legal Verification', order: 4, prob: 85, color: '#8b5cf6' },
        { id: crypto.randomUUID(), en: 'Executed & Closed Won', ar: 'Executed & Closed Won', order: 5, prob: 100, color: '#10b981', won: 1 },
        { id: crypto.randomUUID(), en: 'Closed Lost', ar: 'Closed Lost', order: 6, prob: 0, color: '#ef4444', lost: 1 }
    ];

    const stageMap = {};
    for (const stg of stagesRetail) {
        db.prepare(`
            INSERT INTO pipeline_stages (id, pipeline_id, name_en, name_ar, stage_order, probability_percentage, color_hex, is_won, is_lost)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(stg.id, pipelineRetail, stg.en, stg.ar, stg.order, stg.prob, stg.color, stg.won || 0, stg.lost || 0);
        stageMap[stg.en] = stg.id;
    }

    // 5. TENANTS & BRANDS
    console.log('--- Seeding Tenants & Global Brands ---');
    const tenantAlshayaId = crypto.randomUUID();
    db.prepare(`
        INSERT INTO tenants (id, company_id, legal_name, commercial_name, tax_registration_number, contact_person, phone, email, address)
        VALUES (?, ?, 'M.H. Alshaya Egypt LLC', 'Alshaya International Group', 'EG-493-291-01', 'Tarek El-Kady', '+20 100 123 4567', 'leasing.egypt@alshaya.com', 'Plot 43, 90th North St, New Cairo')
    `).run(tenantAlshayaId, companyId);

    const brandStarbucks = crypto.randomUUID();
    db.prepare(`INSERT INTO brands (id, tenant_id, name, industry) VALUES (?, ?, 'Starbucks Reserve', 'F&B Specialty Dining')`).run(brandStarbucks, tenantAlshayaId);

    const tenantAzadeaId = crypto.randomUUID();
    db.prepare(`
        INSERT INTO tenants (id, company_id, legal_name, commercial_name, tax_registration_number, contact_person, phone, email, address)
        VALUES (?, ?, 'Azadea Egypt for Retail S.A.E.', 'Azadea Group Holding', 'EG-782-119-45', 'Mona Zaki', '+20 102 987 6543', 'realestate@azadea.com', 'Dandy Mall Complex, Cairo-Alexandria Rd')
    `).run(tenantAzadeaId, companyId);

    const brandPaul = crypto.randomUUID();
    db.prepare(`INSERT INTO brands (id, tenant_id, name, industry) VALUES (?, ?, 'Paul Bakery & Restaurant', 'French Bistro & Cafe')`).run(brandPaul, tenantAzadeaId);

    // 6. UNITS WITH DYNAMIC MULTI-COMPONENT SIZING
    console.log('--- Seeding Dynamic Commercial Units ---');
    // Unit A-101: Indoor 100 SQM, Outdoor 20 SQM, Terrace 15 SQM (Total 135 SQM)
    const unitA101 = MasterDataService.createUnitWithAreas({
        project_id: projectCFC.id,
        building_id: bldRetailA,
        unit_number: 'A-101',
        floor_number: 'Ground Floor',
        unit_type_id: unitTypeMap['RESTAURANT'],
        ownership_info: 'Savills Managed Portfolio',
        description: 'Prime corner restaurant unit with outdoor promenade frontage and private terrace.',
        areas: [
            { area_type_id: areaTypeMap['INDOOR'], size_sqm: 100, description: 'Main indoor seating & dining hall' },
            { area_type_id: areaTypeMap['OUTDOOR'], size_sqm: 20, description: 'Promenade outdoor customer seating' },
            { area_type_id: areaTypeMap['TERRACE'], size_sqm: 15, description: 'Elevated side terrace' }
        ]
    });

    // Unit A-102: Indoor 250 SQM, Storage 40 SQM
    const unitA102 = MasterDataService.createUnitWithAreas({
        project_id: projectCFC.id,
        building_id: bldRetailA,
        unit_number: 'A-102',
        floor_number: 'Ground Floor',
        unit_type_id: unitTypeMap['RETAIL'],
        ownership_info: 'Savills Managed Portfolio',
        description: 'Anchor retail showroom with dedicated rear loading storage.',
        areas: [
            { area_type_id: areaTypeMap['INDOOR'], size_sqm: 250, description: 'Flagship retail showroom' },
            { area_type_id: areaTypeMap['STORAGE'], size_sqm: 40, description: 'Dedicated logistics storage' }
        ]
    });

    // Unit T-1401: Office in Nile City: Indoor 320 SQM, Terrace 30 SQM, Storage 25 SQM
    const unitT1401 = MasterDataService.createUnitWithAreas({
        project_id: projectNile.id,
        building_id: bldTowerNile,
        unit_number: 'T-1401',
        floor_number: '14th Floor',
        unit_type_id: unitTypeMap['OFFICE'],
        ownership_info: 'Nile City Holdings (Savills Exclusive Advisory)',
        description: 'Full-floor panoramic Nile view corporate office suite.',
        areas: [
            { area_type_id: areaTypeMap['INDOOR'], size_sqm: 320, description: 'Executive workspace & boardrooms' },
            { area_type_id: areaTypeMap['TERRACE'], size_sqm: 30, description: 'Nile-facing open terrace' },
            { area_type_id: areaTypeMap['STORAGE'], size_sqm: 25, description: 'Secure IT and server room' }
        ]
    });

    // 7. SIMULTANEOUS PARTIAL LEASING ON UNIT A-101
    console.log('--- Seeding Simultaneous Partial Leasing Deals on Unit A-101 ---');
    const unitA101Indoor = unitA101.areas.find(a => a.area_type_code === 'INDOOR');
    const unitA101Outdoor = unitA101.areas.find(a => a.area_type_code === 'OUTDOOR');
    const unitA101Terrace = unitA101.areas.find(a => a.area_type_code === 'TERRACE');

    // Deal 1: Paul Bakery taking Indoor 70 SQM + Outdoor 10 SQM
    const dealPaul = MasterDataService.createDealWithAllocations({
        project_id: projectCFC.id,
        unit_id: unitA101.id,
        tenant_id: tenantAzadeaId,
        brand_id: brandPaul,
        deal_type: 'Partial Unit Leasing',
        pipeline_id: pipelineRetail,
        current_stage_id: stageMap['Dual Signature & Legal Verification'],
        deal_owner: 'Mahmoud Naeem (Head of Commercial)',
        contract_start_date: '2026-01-01',
        contract_end_date: '2028-12-31',
        fit_out_days: 60,
        rent_free_days: 30,
        commercial_terms: 'High-end artisan bakery concept. Base rent + 15% service charge. EGP currency.',
        allocations: [
            { unit_area_id: unitA101Indoor.unit_area_id, allocated_sqm: 70 },
            { unit_area_id: unitA101Outdoor.unit_area_id, allocated_sqm: 10 }
        ],
        rates: [
            { area_type_id: areaTypeMap['INDOOR'], rent_rate_per_sqm: 1000, service_rate_per_sqm: 150 },
            { area_type_id: areaTypeMap['OUTDOOR'], rent_rate_per_sqm: 500, service_rate_per_sqm: 100 }
        ],
        deposit: {
            method: 'RENT_AND_SERVICE',
            number_of_months: 3,
            is_tax_inclusive: false,
            tax_rate: 0.14
        },
        commission: {
            calculation_method: 'PERCENT_ANNUAL_RENT',
            percentage_rate: 10,
            commission_payer: 'LANDLORD',
            tax_rate: 0.14
        }
    });

    // Deal 2: Starbucks Reserve taking remaining portion: Indoor 30 SQM + Terrace 15 SQM!
    const dealStarbucks = MasterDataService.createDealWithAllocations({
        project_id: projectCFC.id,
        unit_id: unitA101.id,
        tenant_id: tenantAlshayaId,
        brand_id: brandStarbucks,
        deal_type: 'Partial Unit Leasing',
        pipeline_id: pipelineRetail,
        current_stage_id: stageMap['Commercial Proposal'],
        deal_owner: 'Sara Ibrahim (Commercial Associate)',
        contract_start_date: '2026-02-01',
        contract_end_date: '2029-01-31',
        fit_out_days: 45,
        rent_free_days: 15,
        commercial_terms: 'Express reserve coffee bar with exclusive outdoor terrace seating.',
        allocations: [
            { unit_area_id: unitA101Indoor.unit_area_id, allocated_sqm: 30 },
            { unit_area_id: unitA101Terrace.unit_area_id, allocated_sqm: 15 }
        ],
        rates: [
            { area_type_id: areaTypeMap['INDOOR'], rent_rate_per_sqm: 1100, service_rate_per_sqm: 160 },
            { area_type_id: areaTypeMap['TERRACE'], rent_rate_per_sqm: 400, service_rate_per_sqm: 75 }
        ],
        deposit: {
            method: 'RENT_ONLY',
            number_of_months: 3,
            is_tax_inclusive: false,
            tax_rate: 0.14
        },
        commission: {
            calculation_method: 'RENT_MONTHS',
            number_of_months: 2,
            commission_payer: 'LANDLORD',
            tax_rate: 0.14
        }
    });

    // 8. DUAL-SIGNATURE WORKFLOW & COMMISSION DUE TRIGGER
    console.log('--- Executing Savills Dual-Signature Legal Verification on Deal Paul ---');
    const contractPaul = db.prepare(`SELECT * FROM contracts WHERE deal_id = ?`).get(dealPaul.id);

    // Step A: Landlord signs & verifies
    ContractService.recordSignature(contractPaul.id, 'LANDLORD', 'Mahmoud Naeem', 'Savills Head of Commercial Advisory');
    ContractService.verifySignature(contractPaul.id, 'LANDLORD', 'Savills Legal & Governance Council', 'Power of Attorney verified');

    // Step B: Tenant signs & verifies
    ContractService.recordSignature(contractPaul.id, 'TENANT', 'Mona Zaki', 'Country Real Estate Director');
    ContractService.verifySignature(contractPaul.id, 'TENANT', 'Azadea Legal Counsel', 'Commercial register verified');

    // Automatic trigger: Both verified -> Commission Due!
    const commCalc = db.prepare(`SELECT * FROM commission_calculations WHERE contract_id = ?`).get(contractPaul.id);

    // Issue Commission Invoice
    const invoice = CommissionEngine.issueCommissionInvoice(commCalc.id);

    // Record Partial Payment
    CommissionEngine.recordCommissionPayment(invoice.id, {
        amount: Math.round(invoice.total_amount / 2),
        payment_reference: 'SAVILLS-CIB-TRANSFER-992014',
        payment_method: 'Bank Transfer',
        notes: 'First 50% instalment received per Savills commercial mandate'
    });

    // Generate Financial Schedule
    ScheduleEngine.generateSchedule(contractPaul.id, {
        billing_frequency: 'QUARTERLY',
        annual_escalation_rate: 0.10,
        rent_free_months: 1,
        fit_out_months: 2
    });

    console.log('=== Savills Seed Data Initialized Successfully! ===');
}

if (require.main === module) {
    runSeed(true);
}

module.exports = { runSeed };
