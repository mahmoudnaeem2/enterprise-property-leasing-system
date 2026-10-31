// Express-compatible or Native HTTP Router for Enterprise Leasing API
const { getDatabase } = require('../db/database');
const MasterDataService = require('../services/masterDataService');
const AllocationService = require('../services/allocationService');
const FinancialEngine = require('../services/financialEngine');
const ContractService = require('../services/contractService');
const CommissionEngine = require('../services/commissionEngine');
const ScheduleEngine = require('../services/scheduleEngine');
const AdminConfigService = require('../services/adminConfigService');

function handleApiRequest(reqUrl, method, body) {
    const url = new URL(reqUrl, 'http://localhost');
    const pathname = url.pathname;
    const db = getDatabase();

    // 1. DASHBOARD & SUMMARY
    if (pathname === '/api/dashboard/stats' && method === 'GET') {
        const projects = MasterDataService.getProjects();
        const units = MasterDataService.getUnits();
        const deals = MasterDataService.getDeals();
        const commSummary = CommissionEngine.getFinancialSummary();

        const totalArea = units.reduce((s, u) => s + u.total_physical_sqm, 0);
        const leasedArea = units.reduce((s, u) => s + u.total_allocated_sqm, 0);
        const availableArea = units.reduce((s, u) => s + u.total_available_sqm, 0);
        const occupancyRate = totalArea > 0 ? Number(((leasedArea / totalArea) * 100).toFixed(1)) : 0;

        return {
            status: 200,
            data: {
                portfolio: {
                    total_projects: projects.length,
                    total_units: units.length,
                    total_area_sqm: Number(totalArea.toFixed(1)),
                    leased_area_sqm: Number(leasedArea.toFixed(1)),
                    available_area_sqm: Number(availableArea.toFixed(1)),
                    occupancy_rate: occupancyRate,
                    available_units_count: units.filter(u => u.operational_status === 'Available').length
                },
                leasing: {
                    total_deals: deals.length,
                    active_deals: deals.filter(d => d.deal_status === 'In Progress').length,
                    won_deals: deals.filter(d => d.deal_status === 'Won').length,
                    total_contracted_annual_rent: deals.reduce((s, d) => s + (d.annual_rent || 0), 0)
                },
                commissions: commSummary
            }
        };
    }

    // 2. PROJECTS
    if (pathname === '/api/projects' && method === 'GET') {
        return { status: 200, data: MasterDataService.getProjects() };
    }
    if (pathname === '/api/projects' && method === 'POST') {
        const project = MasterDataService.createProject(body);
        return { status: 201, data: project };
    }

    // 3. UNITS & DYNAMIC AREAS
    if (pathname === '/api/units' && method === 'GET') {
        const projectId = url.searchParams.get('project_id');
        return { status: 200, data: MasterDataService.getUnits(projectId) };
    }
    if (pathname === '/api/units' && method === 'POST') {
        const unit = MasterDataService.createUnitWithAreas(body);
        return { status: 201, data: unit };
    }
    if (pathname.startsWith('/api/units/') && pathname.endsWith('/availability') && method === 'GET') {
        const parts = pathname.split('/');
        const unitId = parts[3];
        const start = url.searchParams.get('start_date');
        const end = url.searchParams.get('end_date');
        return { status: 200, data: AllocationService.getUnitAreaAvailability(unitId, start, end) };
    }

    // 4. TENANTS & BRANDS
    if (pathname === '/api/tenants' && method === 'GET') {
        return { status: 200, data: MasterDataService.getTenants() };
    }
    if (pathname.startsWith('/api/tenants/') && method === 'GET') {
        const tenantId = pathname.split('/')[3];
        return { status: 200, data: MasterDataService.getTenant360(tenantId) };
    }

    // 5. DEALS & PIPELINES
    if (pathname === '/api/deals' && method === 'GET') {
        const projectId = url.searchParams.get('project_id');
        return { status: 200, data: MasterDataService.getDeals(projectId) };
    }
    if (pathname === '/api/deals' && method === 'POST') {
        const deal = MasterDataService.createDealWithAllocations(body);
        return { status: 201, data: deal };
    }
    if (pathname.startsWith('/api/deals/') && pathname.endsWith('/stage') && method === 'PATCH') {
        const parts = pathname.split('/');
        const dealId = parts[3];
        const { stage_id } = body;
        db.prepare(`UPDATE deals SET current_stage_id = ? WHERE id = ?`).run(stage_id, dealId);
        return { status: 200, data: { success: true } };
    }

    // 6. PIPELINES
    if (pathname === '/api/pipelines' && method === 'GET') {
        return { status: 200, data: AdminConfigService.getPipelines() };
    }

    // 7. CONTRACTS & DUAL SIGNATURES
    if (pathname.startsWith('/api/contracts/') && pathname.endsWith('/sign') && method === 'POST') {
        const contractId = pathname.split('/')[3];
        const { party_type, signer_name, signer_title } = body;
        const sig = ContractService.recordSignature(contractId, party_type, signer_name, signer_title);
        return { status: 200, data: sig };
    }
    if (pathname.startsWith('/api/contracts/') && pathname.endsWith('/verify') && method === 'POST') {
        const contractId = pathname.split('/')[3];
        const { party_type, verified_by, notes } = body;
        const res = ContractService.verifySignature(contractId, party_type, verified_by, notes);
        return { status: 200, data: res };
    }
    if (pathname.startsWith('/api/contracts/') && pathname.endsWith('/schedule') && method === 'GET') {
        const contractId = pathname.split('/')[3];
        return { status: 200, data: ScheduleEngine.getContractSchedule(contractId) };
    }

    // 8. COMMISSIONS
    if (pathname === '/api/commissions' && method === 'GET') {
        const list = db.prepare(`
            SELECT cc.*, d.deal_reference, p.name as project_name, u.unit_number,
                   t.commercial_name as tenant_name, c.contract_number,
                   ci.id as invoice_id, ci.invoice_number, ci.status as invoice_status,
                   ci.paid_amount, (ci.total_amount - ci.paid_amount) as remaining_balance
            FROM commission_calculations cc
            JOIN deals d ON cc.deal_id = d.id
            JOIN projects p ON d.project_id = p.id
            JOIN units u ON d.unit_id = u.id
            JOIN tenants t ON d.tenant_id = t.id
            JOIN contracts c ON cc.contract_id = c.id
            LEFT JOIN commission_invoices ci ON ci.commission_calculation_id = cc.id
            ORDER BY cc.created_at DESC
        `).all();
        return { status: 200, data: list };
    }
    if (pathname.startsWith('/api/commissions/') && pathname.endsWith('/invoice') && method === 'POST') {
        const calcId = pathname.split('/')[3];
        const inv = CommissionEngine.issueCommissionInvoice(calcId);
        return { status: 201, data: inv };
    }
    if (pathname.startsWith('/api/commissions/invoices/') && pathname.endsWith('/payment') && method === 'POST') {
        const invoiceId = pathname.split('/')[4];
        const pay = CommissionEngine.recordCommissionPayment(invoiceId, body);
        return { status: 201, data: pay };
    }

    // 9. DYNAMIC ADMIN CONFIGURATIONS
    if (pathname === '/api/admin/area-types' && method === 'GET') {
        return { status: 200, data: AdminConfigService.getAreaTypes() };
    }
    if (pathname === '/api/admin/area-types' && method === 'POST') {
        const at = AdminConfigService.createAreaType(body);
        return { status: 201, data: at };
    }

    return { status: 404, data: { error: 'API endpoint not found' } };
}

module.exports = { handleApiRequest };
