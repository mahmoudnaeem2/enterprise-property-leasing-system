// Enterprise Real Estate Seed Data (Master Prompt V2)
const { getDatabase, initSchema } = require('./database');
const crypto = require('node:crypto');
const MasterDataService = require('../services/masterDataService');
const ContractService = require('../services/contractService');
const CommissionEngine = require('../services/commissionEngine');
const ScheduleEngine = require('../services/scheduleEngine');

function runSeed() {
    console.log('--- Initializing Enterprise Leasing Schema ---');
    initSchema();
    const db = getDatabase();

    // Check if already seeded
    const companyCount = db.prepare(`SELECT COUNT(*) as count FROM companies`).get();
    if (companyCount.count > 0) {
        console.log('Database already seeded. Skipping initial seeding.');
        return;
    }

    console.log('--- Seeding Companies & Master Hierarchy ---');
    const companyId = crypto.randomUUID();
    db.prepare(`
        INSERT INTO companies (id, name, tax_number, currency, country)
        VALUES (?, 'Al-Futtaim & Horizon Real Estate Management Ltd.', 'EG-8849-204', 'EGP', 'Egypt')
    `).run(companyId);

    // 1. DYNAMIC AREA TYPES (NEVER HARDCODED COLUMNS)
    console.log('--- Seeding Dynamic Area Types ---');
    const areaTypes = [
        { id: crypto.randomUUID(), code: 'INDOOR', en: 'Indoor', ar: 'مساحة داخلية', rentable: 1, order: 1 },
        { id: crypto.randomUUID(), code: 'OUTDOOR', en: 'Outdoor', ar: 'مساحة خارجية', rentable: 1, order: 2 },
        { id: crypto.randomUUID(), code: 'TERRACE', en: 'Terrace', ar: 'تراس', rentable: 1, order: 3 },
        { id: crypto.randomUUID(), code: 'STORAGE', en: 'Storage', ar: 'مخزن ملحق', rentable: 1, order: 4 },
        { id: crypto.randomUUID(), code: 'GARDEN', en: 'Garden', ar: 'حديقة خاصة', rentable: 1, order: 5 },
        { id: crypto.randomUUID(), code: 'BASEMENT', en: 'Basement', ar: 'بدروم', rentable: 0, order: 6 }
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
        { id: crypto.randomUUID(), code: 'RETAIL', en: 'Retail Store', ar: 'محل تجاري', category: 'Retail' },
        { id: crypto.randomUUID(), code: 'RESTAURANT', en: 'Restaurant & Cafe', ar: 'مطعم ومقهى', category: 'F&B' },
        { id: crypto.randomUUID(), code: 'OFFICE', en: 'Corporate Office', ar: 'مكتب إداري', category: 'Office' },
        { id: crypto.randomUUID(), code: 'KIOSK', en: 'Island Kiosk', ar: 'كشك جزيرة', category: 'Kiosk' },
        { id: crypto.randomUUID(), code: 'STORAGE', en: 'Dedicated Storage', ar: 'مستودع تجاري', category: 'Storage' }
    ];
    const unitTypeMap = {};
    for (const ut of unitTypes) {
        db.prepare(`
            INSERT INTO unit_types (id, company_id, code, name_en, name_ar, category, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        `).run(ut.id, companyId, ut.code, ut.en, ut.ar, ut.category);
        unitTypeMap[ut.code] = ut.id;
    }

    // 3. PROJECTS & BUILDINGS
    console.log('--- Seeding Projects & Buildings ---');
    const projectCFC = MasterDataService.createProject({
        company_id: companyId,
        code: 'CFC-MALL',
        name: 'Cairo Festival City Mall',
        project_type: 'Retail Mall',
        location: 'New Cairo, 5th Settlement, Cairo',
        currency: 'EGP',
        project_manager: 'Eng. Karim El-Sayed',
        description: 'Premier regional shopping mall featuring luxury retail, F&B promenades and entertainment zones.'
    });

    const projectNile = MasterDataService.createProject({
        company_id: companyId,
        code: 'NCT-OFFICE',
        name: 'Nile City Towers',
        project_type: 'Commercial & Mixed-Use',
        location: 'Corniche El Nil, Ramlet Beaulac, Cairo',
        currency: 'EGP',
        project_manager: 'Nouran Mostafa',
        description: 'Grade-A corporate office towers with panoramic Nile views and premium retail frontage.'
    });

    const projectArkan = MasterDataService.createProject({
        company_id: companyId,
        code: 'ARK-PLAZA',
        name: 'Arkan Plaza Expansion',
        project_type: 'Commercial & Dining',
        location: 'El Sheikh Zayed City, Giza',
        currency: 'EGP',
        project_manager: 'Ahmed Mansour',
        description: 'Upscale open-air lifestyle commercial center in Sheikh Zayed.'
    });

    // Buildings & Zones for CFC
    const bldRetailA = crypto.randomUUID();
    db.prepare(`
        INSERT INTO buildings (id, project_id, code, name, total_floors, description)
        VALUES (?, ?, 'BLD-A', 'Fashion Avenue Building A', 3, 'Prime retail arcade adjacent to Fountain Promenade')
    `).run(bldRetailA, projectCFC.id);

    const bldTowerNile = crypto.randomUUID();
    db.prepare(`
        INSERT INTO buildings (id, project_id, code, name, total_floors, description)
        VALUES (?, ?, 'TWR-NORTH', 'North Executive Office Tower', 32, 'Grade-A headquarters tower')
    `).run(bldTowerNile, projectNile.id);

    // 4. PIPELINES & STAGES
    console.log('--- Seeding Pipelines & Stages ---');
    const pipelineRetail = crypto.randomUUID();
    db.prepare(`
        INSERT INTO pipelines (id, company_id, project_id, name, code, is_active)
        VALUES (?, ?, ?, 'Retail & Commercial Leasing Pipeline', 'PL-RETAIL', 1)
    `).run(pipelineRetail, companyId, projectCFC.id);

    const stagesRetail = [
        { id: crypto.randomUUID(), en: 'Initial Prospecting', ar: 'التواصل المبدئي', order: 1, prob: 10, color: '#94a3b8' },
        { id: crypto.randomUUID(), en: 'Brand Concept & Tour', ar: 'معاينة الموقع ومراجعة العلامة', order: 2, prob: 30, color: '#38bdf8' },
        { id: crypto.randomUUID(), en: 'Commercial Proposal', ar: 'العرض التجاري والمالي', order: 3, prob: 60, color: '#f59e0b' },
        { id: crypto.randomUUID(), en: 'Dual Signature & Legal Verification', ar: 'التوقيع والتحقق القانوني', order: 4, prob: 85, color: '#8b5cf6' },
        { id: crypto.randomUUID(), en: 'Closed Won (Executed)', ar: 'تم التعاقد بنجاح', order: 5, prob: 100, color: '#10b981', won: 1 },
        { id: crypto.randomUUID(), en: 'Closed Lost', ar: 'صفقة ملغاة', order: 6, prob: 0, color: '#ef4444', lost: 1 }
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
    console.log('--- Seeding Tenants & Brands ---');
    const tenantAlshayaId = crypto.randomUUID();
    db.prepare(`
        INSERT INTO tenants (id, company_id, legal_name, commercial_name, tax_registration_number, contact_person, phone, email, address)
        VALUES (?, ?, 'M.H. Alshaya Egypt LLC', 'Alshaya Group Egypt', 'EG-493-291-01', 'Tarek El-Kady', '+20 100 123 4567', 'leasing.egypt@alshaya.com', 'Plot 43, 90th North St, New Cairo')
    `).run(tenantAlshayaId, companyId);

    const brandStarbucks = crypto.randomUUID();
    db.prepare(`INSERT INTO brands (id, tenant_id, name, industry) VALUES (?, ?, 'Starbucks Coffee', 'Dining & Cafes')`).run(brandStarbucks, tenantAlshayaId);
    const brandHM = crypto.randomUUID();
    db.prepare(`INSERT INTO brands (id, tenant_id, name, industry) VALUES (?, ?, 'H&M Hennes & Mauritz', 'Fashion Apparel')`).run(brandHM, tenantAlshayaId);

    const tenantAzadeaId = crypto.randomUUID();
    db.prepare(`
        INSERT INTO tenants (id, company_id, legal_name, commercial_name, tax_registration_number, contact_person, phone, email, address)
        VALUES (?, ?, 'Azadea Egypt for Retail S.A.E.', 'Azadea Group', 'EG-782-119-45', 'Mona Zaki', '+20 102 987 6543', 'realestate@azadea.com', 'Dandy Mall Complex, Cairo-Alexandria Rd')
    `).run(tenantAzadeaId, companyId);

    const brandZara = crypto.randomUUID();
    db.prepare(`INSERT INTO brands (id, tenant_id, name, industry) VALUES (?, ?, 'Zara & Zara Home', 'Fast Fashion')`).run(brandZara, tenantAzadeaId);
    const brandPaul = crypto.randomUUID();
    db.prepare(`INSERT INTO brands (id, tenant_id, name, industry) VALUES (?, ?, 'Paul Bakery & Restaurant', 'French Bakery & Cafe')`).run(brandPaul, tenantAzadeaId);

    // 6. UNITS WITH DYNAMIC AREA SIZING
    console.log('--- Seeding Units with Dynamic Multi-Component Sizing ---');
    // Unit A-101: Indoor 100 SQM, Outdoor 20 SQM, Terrace 15 SQM (Total 135 SQM) - Exactly as in Prompt Example!
    const unitA101 = MasterDataService.createUnitWithAreas({
        project_id: projectCFC.id,
        building_id: bldRetailA,
        unit_number: 'A-101',
        floor_number: 'Ground Floor',
        unit_type_id: unitTypeMap['RESTAURANT'],
        ownership_info: 'Developer Owned',
        description: 'Prime corner restaurant unit with outdoor promenade frontage and private terrace.',
        areas: [
            { area_type_id: areaTypeMap['INDOOR'], size_sqm: 100, description: 'Main indoor seating & kitchen area' },
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
        ownership_info: 'Developer Owned',
        description: 'Anchor retail showroom with dedicated rear loading storage.',
        areas: [
            { area_type_id: areaTypeMap['INDOOR'], size_sqm: 250, description: 'Retail display area' },
            { area_type_id: areaTypeMap['STORAGE'], size_sqm: 40, description: 'Back-of-house storage facility' }
        ]
    });

    // Unit T-1401 (Office in Nile City): Indoor 320 SQM, Terrace 30 SQM, Storage 25 SQM
    const unitT1401 = MasterDataService.createUnitWithAreas({
        project_id: projectNile.id,
        building_id: bldTowerNile,
        unit_number: 'T-1401',
        floor_number: '14th Floor',
        unit_type_id: unitTypeMap['OFFICE'],
        ownership_info: 'Nile City Holdings',
        description: 'Full-floor panoramic Nile view corporate office suite.',
        areas: [
            { area_type_id: areaTypeMap['INDOOR'], size_sqm: 320, description: 'Executive workspace & meeting rooms' },
            { area_type_id: areaTypeMap['TERRACE'], size_sqm: 30, description: 'Nile-facing open terrace' },
            { area_type_id: areaTypeMap['STORAGE'], size_sqm: 25, description: 'Secure IT and archive room' }
        ]
    });

    // 7. MULTI-DEAL ALLOCATION MANAGEMENT ON UNIT A-101 (PARTIAL UNIT LEASING)
    console.log('--- Creating Simultaneous Partial Leasing Deals on Unit A-101 ---');
    // Deal 1: Paul Bakery taking Indoor 70 SQM + Outdoor 10 SQM
    const unitA101Indoor = unitA101.areas.find(a => a.area_type_code === 'INDOOR');
    const unitA101Outdoor = unitA101.areas.find(a => a.area_type_code === 'OUTDOOR');
    const unitA101Terrace = unitA101.areas.find(a => a.area_type_code === 'TERRACE');

    const dealPaul = MasterDataService.createDealWithAllocations({
        project_id: projectCFC.id,
        unit_id: unitA101.id,
        tenant_id: tenantAzadeaId,
        brand_id: brandPaul,
        deal_type: 'Partial Unit Leasing',
        pipeline_id: pipelineRetail,
        current_stage_id: stageMap['Dual Signature & Legal Verification'],
        deal_owner: 'Mostafa Kamel (Senior Leasing Specialist)',
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

    // Deal 2: Starbucks taking the remaining portion: Indoor 30 SQM + Terrace 15 SQM!
    const dealStarbucks = MasterDataService.createDealWithAllocations({
        project_id: projectCFC.id,
        unit_id: unitA101.id,
        tenant_id: tenantAlshayaId,
        brand_id: brandStarbucks,
        deal_type: 'Partial Unit Leasing',
        pipeline_id: pipelineRetail,
        current_stage_id: stageMap['Commercial Proposal'],
        deal_owner: 'Noha Sherif (Commercial Leasing Manager)',
        contract_start_date: '2026-02-01',
        contract_end_date: '2029-01-31',
        fit_out_days: 45,
        rent_free_days: 15,
        commercial_terms: 'Express coffee bar with exclusive outdoor terrace seating.',
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

    // 8. DUAL-SIGNATURE VERIFICATION WORKFLOW & COMMISSION DUE TRIGGER ON DEAL PAUL
    console.log('--- Executing Dual-Signature Workflow on Deal Paul ---');
    const contractPaul = db.prepare(`SELECT * FROM contracts WHERE deal_id = ?`).get(dealPaul.id);

    // Step A: Landlord signs
    ContractService.recordSignature(contractPaul.id, 'LANDLORD', 'Ahmed El-Gohary', 'VP Commercial Operations');
    // Step B: Landlord signature is verified
    ContractService.verifySignature(contractPaul.id, 'LANDLORD', 'Legal Counsel - Compliance Dept', 'Verified corporate authorization power of attorney');

    // Commission should NOT be due yet because Tenant has not signed/verified!
    let commCalc = db.prepare(`SELECT * FROM commission_calculations WHERE contract_id = ?`).get(contractPaul.id);
    console.log(`Single signature verified - Commission status: ${commCalc ? commCalc.commission_status : 'Not Triggered Yet (Correct)'}`);

    // Step C: Tenant signs
    ContractService.recordSignature(contractPaul.id, 'TENANT', 'Mona Zaki', 'Country Real Estate Director');
    // Step D: Tenant signature is verified
    ContractService.verifySignature(contractPaul.id, 'TENANT', 'Head of Legal & Governance', 'Commercial register and board resolution verified');

    // Now BOTH are verified! Commission Due is automatically triggered!
    commCalc = db.prepare(`SELECT * FROM commission_calculations WHERE contract_id = ?`).get(contractPaul.id);
    console.log(`Both signatures verified! Commission status triggered: ${commCalc ? commCalc.commission_status : 'Error'}`);

    // Issue Commission Invoice
    const invoice = CommissionEngine.issueCommissionInvoice(commCalc.id);
    console.log(`Commission Invoice issued: ${invoice.invoice_number} for amount EGP ${invoice.total_amount}`);

    // Record Partial Payment
    const payment = CommissionEngine.recordCommissionPayment(invoice.id, {
        amount: Math.round(invoice.total_amount / 2),
        payment_reference: 'CIB-TRANSFER-992014',
        payment_method: 'Bank Transfer',
        notes: 'First 50% instalment received per commercial agreement'
    });
    console.log(`Commission payment recorded: EGP ${payment.paid_amount} / Remaining Balance: EGP ${payment.remaining_balance}`);

    // Generate Financial Schedule with 10% annual escalation
    const schedule = ScheduleEngine.generateSchedule(contractPaul.id, {
        billing_frequency: 'QUARTERLY',
        annual_escalation_rate: 0.10,
        rent_free_months: 1,
        fit_out_months: 2
    });
    console.log(`Financial Billing Schedule generated with ${schedule.lines.length} quarterly billing periods.`);

    console.log('=== Database Seeding Completed Successfully! ===');
}

if (require.main === module) {
    runSeed();
}

module.exports = { runSeed };
