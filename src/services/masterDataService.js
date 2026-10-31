// Master Data Service (Projects, Units, Dynamic Unit Areas, Tenants, Deals)
const { getDatabase } = require('../db/database');
const crypto = require('node:crypto');
const AllocationService = require('./allocationService');
const FinancialEngine = require('./financialEngine');

class MasterDataService {
    // PROJECTS
    static getProjects() {
        const db = getDatabase();
        const projects = db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all();
        return projects.map(p => {
            const unitStats = db.prepare(`
                SELECT 
                    COUNT(*) as total_units,
                    SUM(CASE WHEN operational_status = 'Available' THEN 1 ELSE 0 END) as available_units,
                    SUM(CASE WHEN operational_status = 'Fully Leased' THEN 1 ELSE 0 END) as leased_units
                FROM units WHERE project_id = ?
            `).get(p.id);

            const areaStats = db.prepare(`
                SELECT COALESCE(SUM(ua.size_sqm), 0) as total_area_sqm
                FROM unit_areas ua
                JOIN units u ON ua.unit_id = u.id
                WHERE u.project_id = ?
            `).get(p.id);

            return {
                ...p,
                total_units: unitStats.total_units || 0,
                available_units: unitStats.available_units || 0,
                leased_units: unitStats.leased_units || 0,
                total_area_sqm: Number(areaStats.total_area_sqm || 0).toFixed(1)
            };
        });
    }

    static createProject(data) {
        const db = getDatabase();
        const id = crypto.randomUUID();
        const {
            company_id,
            code,
            name,
            project_type,
            location,
            currency = 'EGP',
            project_manager = '',
            description = '',
            logo_url = ''
        } = data;

        db.prepare(`
            INSERT INTO projects (
                id, company_id, code, name, project_type, location,
                currency, project_manager, status, description, logo_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)
        `).run(id, company_id, code, name, project_type, location, currency, project_manager, description, logo_url);

        return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    }

    // UNITS & DYNAMIC AREA SIZING
    static getUnits(projectId = null) {
        const db = getDatabase();
        let query = `
            SELECT u.*, p.name as project_name, p.code as project_code,
                   ut.name_en as unit_type_en, ut.name_ar as unit_type_ar, ut.category as unit_category,
                   b.name as building_name
            FROM units u
            JOIN projects p ON u.project_id = p.id
            JOIN unit_types ut ON u.unit_type_id = ut.id
            LEFT JOIN buildings b ON u.building_id = b.id
        `;
        const params = [];
        if (projectId) {
            query += ` WHERE u.project_id = ?`;
            params.push(projectId);
        }
        query += ` ORDER BY u.unit_number ASC`;

        const units = db.prepare(query).all(...params);

        return units.map(u => {
            const areas = AllocationService.getUnitAreaAvailability(u.id);
            const totalPhysical = areas.reduce((s, a) => s + a.size_sqm, 0);
            const totalAllocated = areas.reduce((s, a) => s + a.allocated_sqm, 0);
            const totalAvailable = areas.reduce((s, a) => s + a.available_sqm, 0);

            return {
                ...u,
                areas,
                total_physical_sqm: Number(totalPhysical.toFixed(2)),
                total_allocated_sqm: Number(totalAllocated.toFixed(2)),
                total_available_sqm: Number(totalAvailable.toFixed(2))
            };
        });
    }

    static createUnitWithAreas(data) {
        const db = getDatabase();
        const unitId = crypto.randomUUID();
        const {
            project_id,
            building_id = null,
            zone_id = null,
            floor_number = '',
            unit_number,
            unit_type_id,
            ownership_info = '',
            description = '',
            areas = [] // Array of { area_type_id, size_sqm, description }
        } = data;

        db.exec('BEGIN TRANSACTION;');
        try {
            db.prepare(`
                INSERT INTO units (
                    id, project_id, building_id, zone_id, floor_number,
                    unit_number, unit_type_id, operational_status, ownership_info, description
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Available', ?, ?)
            `).run(unitId, project_id, building_id, zone_id, floor_number, unit_number, unit_type_id, ownership_info, description);

            for (const area of areas) {
                const areaId = crypto.randomUUID();
                db.prepare(`
                    INSERT INTO unit_areas (id, unit_id, area_type_id, size_sqm, description, is_active)
                    VALUES (?, ?, ?, ?, ?, 1)
                `).run(areaId, unitId, area.area_type_id, Number(area.size_sqm), area.description || '');
            }

            db.exec('COMMIT;');
        } catch (err) {
            db.exec('ROLLBACK;');
            throw err;
        }

        return this.getUnits().find(u => u.id === unitId);
    }

    // TENANTS & BRANDS
    static getTenants() {
        const db = getDatabase();
        const tenants = db.prepare(`SELECT * FROM tenants ORDER BY legal_name ASC`).all();
        return tenants.map(t => {
            const brands = db.prepare(`SELECT * FROM brands WHERE tenant_id = ?`).all(t.id);
            const deals = db.prepare(`
                SELECT d.*, p.name as project_name, u.unit_number 
                FROM deals d
                JOIN projects p ON d.project_id = p.id
                JOIN units u ON d.unit_id = u.id
                WHERE d.tenant_id = ?
            `).all(t.id);
            return { ...t, brands, deals };
        });
    }

    static getTenant360(tenantId) {
        const db = getDatabase();
        const tenant = db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(tenantId);
        if (!tenant) return null;

        const brands = db.prepare(`SELECT * FROM brands WHERE tenant_id = ?`).all(tenantId);
        const deals = db.prepare(`
            SELECT d.*, p.name as project_name, u.unit_number, ps.name_en as stage_name
            FROM deals d
            JOIN projects p ON d.project_id = p.id
            JOIN units u ON d.unit_id = u.id
            JOIN pipeline_stages ps ON d.current_stage_id = ps.id
            WHERE d.tenant_id = ?
            ORDER BY d.created_at DESC
        `).all(tenantId);

        const contracts = db.prepare(`
            SELECT c.*, d.deal_reference, p.name as project_name, u.unit_number
            FROM contracts c
            JOIN deals d ON c.deal_id = d.id
            JOIN projects p ON d.project_id = p.id
            JOIN units u ON d.unit_id = u.id
            WHERE d.tenant_id = ?
        `).all(tenantId);

        return {
            ...tenant,
            brands,
            deals,
            contracts
        };
    }

    // DEALS & AREA ALLOCATIONS
    static getDeals(projectId = null) {
        const db = getDatabase();
        let query = `
            SELECT d.*, p.name as project_name, p.code as project_code,
                   u.unit_number, t.commercial_name as tenant_name, t.legal_name as tenant_legal_name,
                   b.name as brand_name, pl.name as pipeline_name,
                   ps.name_en as stage_name_en, ps.name_ar as stage_name_ar, ps.color_hex as stage_color,
                   dfs.total_allocated_sqm, dfs.monthly_rent, dfs.monthly_service_charge,
                   dfs.total_monthly_charges, dfs.annual_rent, dfs.deposit_amount,
                   c.id as contract_id, c.contract_number, c.contract_status,
                   cc.commission_status, cc.net_commission as commission_amount
            FROM deals d
            JOIN projects p ON d.project_id = p.id
            JOIN units u ON d.unit_id = u.id
            JOIN tenants t ON d.tenant_id = t.id
            LEFT JOIN brands b ON d.brand_id = b.id
            JOIN pipelines pl ON d.pipeline_id = pl.id
            JOIN pipeline_stages ps ON d.current_stage_id = ps.id
            LEFT JOIN deal_financial_snapshots dfs ON dfs.deal_id = d.id
            LEFT JOIN contracts c ON c.deal_id = d.id
            LEFT JOIN commission_calculations cc ON cc.deal_id = d.id
        `;
        const params = [];
        if (projectId) {
            query += ` WHERE d.project_id = ?`;
            params.push(projectId);
        }
        query += ` ORDER BY d.created_at DESC`;

        return db.prepare(query).all(...params);
    }

    static createDealWithAllocations(data) {
        const db = getDatabase();
        const dealId = crypto.randomUUID();
        const dealReference = `DL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        const {
            project_id,
            unit_id,
            tenant_id,
            brand_id = null,
            deal_type = 'New Leasing',
            pipeline_id,
            current_stage_id,
            deal_owner = 'Commercial Director',
            expected_closing_date = null,
            contract_start_date,
            contract_end_date,
            handover_date = null,
            fit_out_days = 0,
            rent_free_days = 0,
            commercial_terms = '',
            notes = '',
            allocations = [], // Array of { unit_area_id, allocated_sqm }
            rates = [],       // Array of { area_type_id, rent_rate_per_sqm, service_rate_per_sqm }
            deposit = null,   // { method, number_of_months, fixed_amount, is_tax_inclusive, tax_rate }
            commission = null // { calculation_method, percentage_rate, number_of_months, fixed_amount, commission_payer }
        } = data;

        // 1. Validate Allocations against capacity
        const validation = AllocationService.validateAllocations(
            unit_id,
            allocations,
            contract_start_date,
            contract_end_date
        );
        if (!validation.valid) {
            throw new Error(`Allocation Validation Error: ${validation.error}`);
        }

        db.exec('BEGIN TRANSACTION;');
        try {
            // 2. Insert Deal
            db.prepare(`
                INSERT INTO deals (
                    id, deal_reference, project_id, unit_id, tenant_id, brand_id,
                    deal_type, pipeline_id, current_stage_id, deal_status, deal_owner,
                    expected_closing_date, contract_start_date, contract_end_date,
                    handover_date, fit_out_days, rent_free_days, commercial_terms, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'In Progress', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                dealId, dealReference, project_id, unit_id, tenant_id, brand_id,
                deal_type, pipeline_id, current_stage_id, deal_owner,
                expected_closing_date, contract_start_date, contract_end_date,
                handover_date, fit_out_days, rent_free_days, commercial_terms, notes
            );

            // 3. Insert Allocations
            for (const alloc of allocations) {
                const allocId = crypto.randomUUID();
                db.prepare(`
                    INSERT INTO deal_area_allocations (id, deal_id, unit_area_id, allocated_sqm)
                    VALUES (?, ?, ?, ?)
                `).run(allocId, dealId, alloc.unit_area_id, Number(alloc.allocated_sqm));
            }

            // 4. Insert Independent Rates per Area Type
            for (const r of rates) {
                const rateId = crypto.randomUUID();
                db.prepare(`
                    INSERT INTO deal_area_rates (id, deal_id, area_type_id, rent_rate_per_sqm, service_rate_per_sqm)
                    VALUES (?, ?, ?, ?, ?)
                `).run(rateId, dealId, r.area_type_id, Number(r.rent_rate_per_sqm || 0), Number(r.service_rate_per_sqm || 0));
            }

            db.exec('COMMIT;');
        } catch (err) {
            db.exec('ROLLBACK;');
            throw err;
        }

        // 5. Calculate Financials & Create Snapshot
        const snapshot = FinancialEngine.createFinancialSnapshot(dealId);

        // 6. Deposit Calculation
        if (deposit) {
            const depCalc = FinancialEngine.calculateSecurityDeposit({
                method: deposit.method,
                monthly_rent: snapshot.monthly_rent,
                monthly_service_charge: snapshot.monthly_service_charge,
                number_of_months: deposit.number_of_months || 0,
                fixed_amount: deposit.fixed_amount || 0,
                calculation_base: deposit.calculation_base || 0,
                is_tax_inclusive: !!deposit.is_tax_inclusive,
                tax_rate: deposit.tax_rate || 0
            });

            const depId = crypto.randomUUID();
            db.prepare(`
                INSERT INTO deal_deposits (
                    id, deal_id, method, number_of_months, calculation_base, deposit_amount,
                    is_tax_inclusive, tax_rate, tax_amount, total_deposit, manual_override, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            `).run(
                depId, dealId, depCalc.method, depCalc.number_of_months, depCalc.base_deposit,
                depCalc.base_deposit, depCalc.is_tax_inclusive, depCalc.tax_rate,
                depCalc.tax_amount, depCalc.total_deposit, deposit.notes || ''
            );

            // Re-update snapshot with deposit amount
            db.prepare(`UPDATE deal_financial_snapshots SET deposit_amount = ? WHERE deal_id = ?`).run(depCalc.total_deposit, dealId);
        }

        // 7. Commission Agreement Setup
        if (commission) {
            const CommissionEngine = require('./commissionEngine');
            CommissionEngine.setCommissionAgreement(dealId, commission);
        }

        // 8. Auto-create draft contract
        const ContractService = require('./contractService');
        ContractService.createContractForDeal(dealId);

        // 9. Update Unit Operational Status
        AllocationService.updateUnitOperationalStatus(unit_id);

        return this.getDeals().find(d => d.id === dealId);
    }
}

module.exports = MasterDataService;
