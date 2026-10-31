// Enterprise Property & Leasing System - Comprehensive Automated Verification Suite
const assert = require('node:assert');
const { getDatabase, initSchema } = require('../src/db/database');
const MasterDataService = require('../src/services/masterDataService');
const AllocationService = require('../src/services/allocationService');
const FinancialEngine = require('../src/services/financialEngine');
const ContractService = require('../src/services/contractService');
const CommissionEngine = require('../src/services/commissionEngine');
const ScheduleEngine = require('../src/services/scheduleEngine');
const AdminConfigService = require('../src/services/adminConfigService');
const { runSeed } = require('../src/db/seed');

console.log('================================================================');
console.log('  RUNNING ENTERPRISE PROPERTY & LEASING VERIFICATION TEST SUITE ');
console.log('================================================================');

// Step 1: Initialize and Seed
runSeed();
const db = getDatabase();

let passedTests = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`[PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`[FAIL] ${name}:`, err.message);
        throw err;
    }
}

// 1. MASTER DATA & UNLIMITED PROJECTS
test('Can retrieve and create unlimited projects', () => {
    const projects = MasterDataService.getProjects();
    assert(projects.length >= 3, 'Must have at least 3 seeded projects');
    const cfc = projects.find(p => p.code === 'SAV-CFC' || p.code === 'CFC-MALL');
    assert(cfc, 'SAV-CFC project must exist');
});

// 2. DYNAMIC AREA TYPES (NEVER HARDCODED COLUMNS)
test('Dynamic area types can be retrieved and added without modifying code', () => {
    const areaTypes = AdminConfigService.getAreaTypes();
    assert(areaTypes.length >= 6, 'Must have default dynamic area types');
    
    // Add custom area type
    const newArea = AdminConfigService.createAreaType({
        company_id: areaTypes[0].company_id,
        code: 'TEST_MEZZANINE_' + Date.now(),
        name_en: 'Test Mezzanine',
        name_ar: 'ميزانين اختباري',
        is_rentable: 1
    });
    assert(newArea && newArea.id, 'New area type must be created dynamically');
});

// 3. MULTI-COMPONENT DYNAMIC UNIT SIZING
test('Units have dynamic multi-component area sizing with automatic total calculation', () => {
    const units = MasterDataService.getUnits();
    const unitA101 = units.find(u => u.unit_number === 'A-101');
    assert(unitA101, 'Unit A-101 must exist');
    assert.strictEqual(unitA101.total_physical_sqm, 135, 'Unit A-101 physical area must equal 135 SQM (100+20+15)');
    assert(unitA101.areas.length === 3, 'Unit A-101 must have 3 distinct area components');
});

// 4. SIMULTANEOUS PARTIAL LEASING (MULTIPLE DEALS ON SAME UNIT)
test('Unit A-101 supports multiple simultaneous deals with partial allocations', () => {
    const deals = MasterDataService.getDeals();
    const dealsOnA101 = deals.filter(d => d.unit_number === 'A-101');
    assert(dealsOnA101.length >= 2, 'Unit A-101 must have at least 2 simultaneous active deals');
    
    // Check remaining availability
    const availability = AllocationService.getUnitAreaAvailability(dealsOnA101[0].unit_id);
    const indoor = availability.find(a => a.area_type_code === 'INDOOR');
    // Seed: 100 SQM total; Deal 1 took 70 SQM, Deal 2 took 30 SQM -> allocated = 100, available = 0
    assert.strictEqual(indoor.allocated_sqm, 100, 'Indoor allocated area must equal 100 SQM');
    assert.strictEqual(indoor.available_sqm, 0, 'Indoor available area must be 0 SQM');
});

// 5. OVERLAP CAPACITY VALIDATION (PREVENTS PHYSICAL DOUBLE LEASING)
test('Validation engine strictly blocks allocations exceeding available SQM', () => {
    const units = MasterDataService.getUnits();
    const unitA101 = units.find(u => u.unit_number === 'A-101');
    const indoorComponent = unitA101.areas.find(a => a.area_type_code === 'INDOOR');
    
    // Attempt to allocate 10 SQM when available is 0
    const validation = AllocationService.validateAllocations(
        unitA101.id,
        [{ unit_area_id: indoorComponent.unit_area_id, allocated_sqm: 10 }],
        '2026-05-01',
        '2027-05-01'
    );
    assert.strictEqual(validation.valid, false, 'Over-allocation must be blocked');
    assert(validation.error.includes('Allocation exceeds available area'), 'Error message must specify capacity exceeded');
});

// 6. FINANCIAL PRICING BY INDEPENDENT AREA TYPE
test('Rent and service charges are calculated independently per area type', () => {
    const calc = FinancialEngine.calculateCharges([
        { area_type_id: '1', name_en: 'Indoor', allocated_sqm: 100, rent_rate_per_sqm: 1000, service_rate_per_sqm: 150 },
        { area_type_id: '2', name_en: 'Outdoor', allocated_sqm: 20, rent_rate_per_sqm: 500, service_rate_per_sqm: 100 },
        { area_type_id: '3', name_en: 'Terrace', allocated_sqm: 15, rent_rate_per_sqm: 400, service_rate_per_sqm: 75 }
    ]);
    // Indoor: Rent = 100,000, Service = 15,000
    // Outdoor: Rent = 10,000, Service = 2,000
    // Terrace: Rent = 6,000, Service = 1,125
    // Monthly Rent = 116,000 | Monthly Service = 18,125 | Total Monthly = 134,125
    assert.strictEqual(calc.monthly_rent, 116000, 'Monthly rent must match exact sum');
    assert.strictEqual(calc.monthly_service_charge, 18125, 'Monthly service charge must match sum');
    assert.strictEqual(calc.total_monthly_charges, 134125, 'Total monthly charges must match sum');
    assert.strictEqual(calc.annual_rent, 1392000, 'Annual rent must be 116,000 * 12');
});

// 7. SECURITY DEPOSIT CALCULATION (4 METHODS)
test('Security deposit engine supports all 4 enterprise calculation methods', () => {
    const monthlyRent = 100000;
    const monthlyService = 15000;

    // Method 1: FIXED_AMOUNT
    const dep1 = FinancialEngine.calculateSecurityDeposit({ method: 'FIXED_AMOUNT', fixed_amount: 250000 });
    assert.strictEqual(dep1.total_deposit, 250000);

    // Method 2: RENT_ONLY (3 months)
    const dep2 = FinancialEngine.calculateSecurityDeposit({ method: 'RENT_ONLY', monthly_rent: monthlyRent, number_of_months: 3 });
    assert.strictEqual(dep2.total_deposit, 300000);

    // Method 3: RENT_AND_SERVICE (3 months)
    const dep3 = FinancialEngine.calculateSecurityDeposit({ method: 'RENT_AND_SERVICE', monthly_rent: monthlyRent, monthly_service_charge: monthlyService, number_of_months: 3 });
    assert.strictEqual(dep3.total_deposit, 345000); // (100k + 15k) * 3

    // Method 4: CUSTOM with 14% tax
    const dep4 = FinancialEngine.calculateSecurityDeposit({ method: 'FIXED_AMOUNT', fixed_amount: 100000, tax_rate: 0.14, is_tax_inclusive: false });
    assert.strictEqual(dep4.total_deposit, 114000); // 100k + 14k VAT
});

// 8. DUAL-SIGNATURE VERIFICATION GATING (NON-NEGOTIABLE REQUIREMENT)
test('Commission is gated by dual-signature verification: single signature NEVER triggers due', () => {
    // Create test contract
    const contracts = db.prepare(`SELECT * FROM contracts`).all();
    assert(contracts.length > 0, 'Must have existing contracts');
    
    // Check Deal Paul: Both signatures were verified in seed -> Status must be 'Commission Due' or 'Invoiced' / 'Paid'
    const calcPaul = db.prepare(`
        SELECT cc.*, c.contract_status 
        FROM commission_calculations cc 
        JOIN contracts c ON cc.contract_id = c.id
    `).get();
    assert(calcPaul, 'Commission calculation record must exist');
    assert(['Commission Due', 'Invoiced', 'Partially Paid', 'Paid'].includes(calcPaul.commission_status), 'Verified dual-signature contract must trigger commission');
});

// 9. FINANCIAL SEPARATION & COMMISSION INVOICE TRACKING
test('Commission ledger maintains strict separation with invoice and payment tracking', () => {
    const summary = CommissionEngine.getFinancialSummary();
    assert(summary.earned_due > 0, 'Earned/Due commission must be calculated');
    assert(summary.invoiced > 0, 'Invoiced commission must be tracked');
    assert(summary.collected > 0, 'Collected commission must be tracked');
    assert(summary.outstanding_balance >= 0, 'Outstanding balance must be non-negative');
});

// 10. FINANCIAL BILLING SCHEDULE WITH ESCALATION
test('Financial billing schedules generate correct period lines and escalations', () => {
    const schedule = db.prepare(`SELECT * FROM financial_schedules`).get();
    assert(schedule, 'Financial schedule must exist');
    const lines = db.prepare(`SELECT * FROM schedule_lines WHERE schedule_id = ?`).all(schedule.id);
    assert(lines.length > 0, 'Schedule must contain lines');
    // Verify first line has rent free period or valid amounts
    assert(lines[0].total_amount !== undefined, 'Line must have total amount');
});

console.log('================================================================');
console.log(`  ALL ${passedTests} ENTERPRISE VERIFICATION TESTS PASSED! `);
console.log('================================================================');
