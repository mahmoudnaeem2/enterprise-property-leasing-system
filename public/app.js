// Enterprise Property & Leasing Client Controller
const I18N = {
    en: {
        app_sub: 'Enterprise Property & Leasing',
        nav_portfolio: 'Portfolio & Projects',
        nav_units: 'Units & Dynamic Areas',
        nav_pipeline: 'Leasing Pipeline (Kanban)',
        nav_contracts: 'Contracts & Dual Signatures',
        nav_commissions: 'Commission Ledger',
        nav_admin: 'Dynamic Admin Settings',
        btn_new_deal: 'New Leasing Deal',
        kpi_occupancy: 'Portfolio Occupancy',
        kpi_active_deals: 'Active Deals in Pipeline',
        kpi_comm_due: 'Leasing Commission Due',
        kpi_comm_collected: 'Commission Collected',
        kpi_dual_sig_note: 'Triggered upon dual signature',
        projects_title: 'Commercial Projects',
        units_title: 'Unit Register & Dynamic Multi-Component Areas',
        units_desc: 'Units support multiple independent area types (Indoor, Outdoor, Terrace, Storage) and simultaneous partial leasing.',
        pipeline_title: 'Leasing Opportunities Pipeline',
        pipeline_desc: 'Drag deals across stages. Pipeline stage is strictly separated from operational unit status.',
        contracts_title: 'Contracts & Dual Signature Verification',
        contracts_desc: 'Commission becomes due ONLY after both required signatures (Landlord & Tenant) are legally verified.',
        commissions_title: 'Segregated Leasing Commission Ledger',
        commissions_desc: 'Strictly separated from monthly rent collection. Supports 3 calculation methods, invoicing and payment tracking.',
        admin_title: 'Centralized Dynamic Configuration (Zero Code Modification)',
        admin_desc: 'Configure Area Types, Unit Types, Tax Rules, and Pipelines directly through the admin engine.'
    },
    ar: {
        app_sub: 'نظام إدارة العقارات والتأجير التجاري',
        nav_portfolio: 'المحفظة والمشاريع',
        nav_units: 'سجل الوحدات والمساحات الديناميكية',
        nav_pipeline: 'خط صفقات التأجير (كانبان)',
        nav_contracts: 'العقود والتوقيع الثنائي القانوني',
        nav_commissions: 'سجل عمولات التأجير المستقل',
        nav_admin: 'الإعدادات والتهيئات الديناميكية',
        btn_new_deal: 'صفقة تأجير جديدة',
        kpi_occupancy: 'نسبة إشغال المحفظة',
        kpi_active_deals: 'الصفقات النشطة بالخط',
        kpi_comm_due: 'عمولة التأجير المستحقة',
        kpi_comm_collected: 'العمولات المحصلة',
        kpi_dual_sig_note: 'تُستحق فقط بعد اكتمال التوقيعين والتحقق',
        projects_title: 'المشاريع التجارية',
        units_title: 'سجل الوحدات ومكونات المساحة المتعددة',
        units_desc: 'تدعم كل وحدة عدة أنواع مساحات مستقلة (داخلي، خارجي، تراس، مخزن) مع دعم التأجير الجزئي المتزامن.',
        pipeline_title: 'خط مراحل صفقات التأجير',
        pipeline_desc: 'مرحلة الصفقة في الـ Pipeline منفصلة تماماً عن الحالة التشغيلية للوحدة.',
        contracts_title: 'العقود والتحقق من التوقيع الثنائي',
        contracts_desc: 'تصبح العمولة مستحقة الدفع فقط بعد التحقق القانوني من توقيعي الطرفين (المؤجر والمستأجر).',
        commissions_title: 'دفتر عمولات التأجير المفصول مالياً',
        commissions_desc: 'فصل مالي تام عن فواتير الإيجار والخدمات الشهرية، مع دعم طرق الحساب الثلاثة وتتبع السداد.',
        admin_title: 'محرك الإعدادات والتهيئات الديناميكية (بدون تعديل كود)',
        admin_desc: 'إمكانية إضافة أنواع المساحات، أنواع الوحدات، خطوط الصفقات والمراحل مباشرة من لوحة التحكم.'
    }
};

let currentLang = 'en';
let state = {
    projects: [],
    units: [],
    deals: [],
    pipelines: [],
    areaTypes: [],
    tenants: [],
    commissions: []
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadInitialData();
});

function setupEventListeners() {
    // Navigation Tabs
    document.querySelectorAll('.nav-item').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = link.getAttribute('data-tab');
            switchTab(tabName);
        });
    });

    // Language Toggle
    const langBtn = document.getElementById('langToggleBtn');
    langBtn.addEventListener('click', () => {
        currentLang = currentLang === 'en' ? 'ar' : 'en';
        document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = currentLang;
        document.getElementById('langLabel').textContent = currentLang === 'ar' ? 'English (LTR)' : 'العربية (RTL)';
        updateTranslations();
        renderAll();
    });

    // Modals
    document.getElementById('openNewDealBtn').addEventListener('click', openDealModal);
    document.getElementById('closeDealModalBtn').addEventListener('click', closeDealModal);
    document.getElementById('cancelDealModalBtn').addEventListener('click', closeDealModal);

    document.getElementById('addAreaTypeBtn').addEventListener('click', () => {
        document.getElementById('areaTypeModalOverlay').classList.add('active');
    });
    document.getElementById('closeAreaTypeModalBtn').addEventListener('click', () => {
        document.getElementById('areaTypeModalOverlay').classList.remove('active');
    });

    // New Deal Form Submission
    document.getElementById('newDealForm').addEventListener('submit', handleCreateDeal);
    document.getElementById('newAreaTypeForm').addEventListener('submit', handleCreateAreaType);

    // Unit select change in modal
    document.getElementById('dealUnitSelect').addEventListener('change', populateUnitAllocationsInModal);
}

function updateTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (I18N[currentLang][key]) {
            el.textContent = I18N[currentLang][key];
        }
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    const activeLink = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    const activePane = document.getElementById(`tab-${tabName}`);
    if (activeLink) activeLink.classList.add('active');
    if (activePane) activePane.classList.add('active');

    const headingKey = `nav_${tabName}`;
    document.getElementById('pageHeading').textContent = I18N[currentLang][headingKey] || tabName;
}

// Data Fetching
async function loadInitialData() {
    try {
        const [statsRes, projRes, unitsRes, dealsRes, pipeRes, atRes, tenantsRes, commRes] = await Promise.all([
            fetch('/api/dashboard/stats').then(r => r.json()),
            fetch('/api/projects').then(r => r.json()),
            fetch('/api/units').then(r => r.json()),
            fetch('/api/deals').then(r => r.json()),
            fetch('/api/pipelines').then(r => r.json()),
            fetch('/api/admin/area-types').then(r => r.json()),
            fetch('/api/tenants').then(r => r.json()),
            fetch('/api/commissions').then(r => r.json())
        ]);

        state.projects = projRes;
        state.units = unitsRes;
        state.deals = dealsRes;
        state.pipelines = pipeRes;
        state.areaTypes = atRes;
        state.tenants = tenantsRes;
        state.commissions = commRes;

        renderKPIs(statsRes);
        renderAll();
    } catch (err) {
        console.error('Failed to load data:', err);
    }
}

function renderKPIs(stats) {
    if (!stats || !stats.portfolio) return;
    document.getElementById('kpiOccupancy').textContent = `${stats.portfolio.occupancy_rate}%`;
    document.getElementById('kpiAreaSummary').textContent = `${stats.portfolio.leased_area_sqm} / ${stats.portfolio.total_area_sqm} SQM`;

    document.getElementById('kpiActiveDeals').textContent = stats.leasing.active_deals;
    document.getElementById('kpiContractedRent').textContent = `EGP ${Number(stats.leasing.total_contracted_annual_rent).toLocaleString()}/yr`;

    document.getElementById('kpiCommDue').textContent = `EGP ${Number(stats.commissions.earned_due).toLocaleString()}`;
    document.getElementById('kpiCommCollected').textContent = `EGP ${Number(stats.commissions.collected).toLocaleString()}`;
    document.getElementById('kpiCommOutstanding').textContent = `Outstanding: EGP ${Number(stats.commissions.outstanding_balance).toLocaleString()}`;
}

function renderAll() {
    renderProjects();
    renderUnits();
    renderKanban();
    renderContracts();
    renderCommissions();
    renderAdminSettings();
}

function renderProjects() {
    const grid = document.getElementById('projectsGrid');
    grid.innerHTML = state.projects.map(p => `
        <div class="project-card">
            <span class="project-code">${p.code}</span>
            <div class="project-name">${p.name}</div>
            <div class="project-location">📍 ${p.location}</div>
            <p style="font-size:0.8rem; color:#64748b; margin-bottom:12px;">${p.description || ''}</p>
            <div class="project-stats-grid">
                <div class="p-stat-box">
                    <div class="lbl">Total Units</div>
                    <div class="val">${p.total_units} units</div>
                </div>
                <div class="p-stat-box">
                    <div class="lbl">Gross Leasable Area</div>
                    <div class="val">${Number(p.total_area_sqm).toLocaleString()} SQM</div>
                </div>
            </div>
        </div>
    `).join('');
}

function renderUnits() {
    const tbody = document.getElementById('unitsTableBody');
    tbody.innerHTML = state.units.map(u => {
        const areaChips = (u.areas || []).map(a => {
            const cls = a.area_type_code ? `chip-${a.area_type_code.toLowerCase()}` : 'chip-indoor';
            const name = currentLang === 'ar' ? a.name_ar : a.name_en;
            return `<span class="area-chip ${cls}">${name}: ${a.size_sqm}m² (Avail: ${a.available_sqm}m²)</span>`;
        }).join('');

        let statusClass = 'status-available';
        if (u.operational_status === 'Partially Leased') statusClass = 'status-partially-leased';
        if (u.operational_status === 'Fully Leased') statusClass = 'status-fully-leased';

        return `
            <tr>
                <td style="font-weight:700;">${u.unit_number}</td>
                <td>${u.project_name}</td>
                <td>${currentLang === 'ar' ? u.unit_type_ar : u.unit_type_en}</td>
                <td><div class="area-breakdown-cell">${areaChips}</div></td>
                <td style="font-weight:700;">${u.total_physical_sqm} SQM</td>
                <td style="color:#2563eb; font-weight:700;">${u.total_allocated_sqm} SQM</td>
                <td style="color:#10b981; font-weight:700;">${u.total_available_sqm} SQM</td>
                <td><span class="status-pill ${statusClass}">${u.operational_status}</span></td>
            </tr>
        `;
    }).join('');
}

function renderKanban() {
    const board = document.getElementById('kanbanBoard');
    const pipeline = state.pipelines[0];
    if (!pipeline || !pipeline.stages) return;

    board.innerHTML = pipeline.stages.map(stg => {
        const stageName = currentLang === 'ar' ? stg.name_ar : stg.name_en;
        const stageDeals = state.deals.filter(d => d.current_stage_id === stg.id);

        const dealCards = stageDeals.map(d => `
            <div class="deal-card" draggable="true" ondragstart="handleDragStart(event, '${d.id}')">
                <div class="deal-ref">${d.deal_reference}</div>
                <div class="deal-tenant">${d.brand_name || d.tenant_name}</div>
                <div class="deal-unit">Unit: ${d.unit_number} (${d.project_name})</div>
                <div class="deal-financials">
                    <span>${d.total_allocated_sqm || 0} SQM</span>
                    <span style="color:#2563eb;">EGP ${Number(d.annual_rent || 0).toLocaleString()}/yr</span>
                </div>
            </div>
        `).join('');

        return `
            <div class="kanban-column" ondragover="handleDragOver(event)" ondrop="handleDrop(event, '${stg.id}')">
                <div class="kanban-col-header">
                    <span class="col-title" style="border-left: 3px solid ${stg.color_hex}; padding-left: 8px;">${stageName}</span>
                    <span class="badge-count">${stageDeals.length}</span>
                </div>
                <div class="deals-container">
                    ${dealCards}
                </div>
            </div>
        `;
    }).join('');
}

function renderContracts() {
    const container = document.getElementById('contractsList');
    container.innerHTML = state.deals.filter(d => d.contract_id).map(d => `
        <div class="contract-card">
            <div class="contract-header">
                <div>
                    <h3 style="font-size:1.05rem; font-weight:800;">Contract: ${d.contract_number}</h3>
                    <p style="font-size:0.8rem; color:#64748b;">Deal: ${d.deal_reference} | Tenant: ${d.brand_name || d.tenant_name} | Unit: ${d.unit_number}</p>
                </div>
                <span class="status-pill ${d.contract_status === 'Fully Signed' ? 'status-paid' : 'status-partially-leased'}">${d.contract_status}</span>
            </div>

            <!-- Dual Signature Status Box -->
            <div class="dual-signature-grid">
                <div class="sig-slot">
                    <div class="sig-slot-title">🏢 Landlord / Owner Signature</div>
                    <div style="font-size:0.82rem; margin-bottom:8px;">Signer: <strong>Authorized Asset Manager</strong></div>
                    <button class="secondary-btn" onclick="verifySig('${d.contract_id}', 'LANDLORD')">✓ Verify Landlord Signature</button>
                </div>
                <div class="sig-slot">
                    <div class="sig-slot-title">🏬 Tenant Authorized Signatory</div>
                    <div style="font-size:0.82rem; margin-bottom:8px;">Signer: <strong>${d.tenant_name}</strong></div>
                    <button class="secondary-btn" onclick="verifySig('${d.contract_id}', 'TENANT')">✓ Verify Tenant Signature</button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderCommissions() {
    const tbody = document.getElementById('commissionsTableBody');
    tbody.innerHTML = state.commissions.map(c => `
        <tr>
            <td style="font-weight:700; color:#2563eb;">${c.deal_reference}</td>
            <td>${c.contract_number}</td>
            <td><strong>${c.tenant_name}</strong></td>
            <td>EGP ${Number(c.base_annual_rent).toLocaleString()}</td>
            <td>EGP ${Number(c.gross_commission).toLocaleString()}</td>
            <td style="font-weight:700; color:#1d4ed8;">EGP ${Number(c.net_commission).toLocaleString()}</td>
            <td><span class="status-pill ${c.commission_status === 'Commission Due' ? 'status-due' : 'status-paid'}">${c.commission_status}</span></td>
            <td>${c.invoice_number ? `${c.invoice_number} (Paid: EGP ${Number(c.paid_amount).toLocaleString()})` : 'Not Invoiced'}</td>
            <td>
                ${c.commission_status === 'Commission Due' ? 
                    `<button class="primary-btn" style="padding:4px 8px; font-size:0.75rem;" onclick="issueCommInvoice('${c.id}')">Issue Invoice</button>` : 
                  c.invoice_id && c.invoice_status !== 'Paid' ? 
                    `<button class="secondary-btn" style="padding:4px 8px; font-size:0.75rem;" onclick="payCommInvoice('${c.invoice_id}', ${c.remaining_balance})">Record Pay</button>` : 
                    `<span style="color:#10b981; font-weight:700;">Completed</span>`
                }
            </td>
        </tr>
    `).join('');
}

function renderAdminSettings() {
    const atList = document.getElementById('areaTypesConfigList');
    atList.innerHTML = state.areaTypes.map(at => `
        <li class="config-item">
            <div>
                <strong>${currentLang === 'ar' ? at.name_ar : at.name_en}</strong>
                <span style="font-size:0.75rem; color:#64748b; margin-left:8px;">Code: ${at.code}</span>
            </div>
            <span class="badge-count">${at.is_rentable ? 'Rentable' : 'Non-Rentable'}</span>
        </li>
    `).join('');
}

// Modal Handlers
function openDealModal() {
    const projSelect = document.getElementById('dealProjectSelect');
    projSelect.innerHTML = state.projects.map(p => `<option value="${p.id}">${p.name} (${p.code})</option>`).join('');

    const unitSelect = document.getElementById('dealUnitSelect');
    unitSelect.innerHTML = state.units.map(u => `<option value="${u.id}">${u.unit_number} - ${u.project_name}</option>`).join('');

    const tenantSelect = document.getElementById('dealTenantSelect');
    tenantSelect.innerHTML = state.tenants.map(t => `<option value="${t.id}">${t.commercial_name}</option>`).join('');

    populateUnitAllocationsInModal();
    document.getElementById('dealModalOverlay').classList.add('active');
}

function closeDealModal() {
    document.getElementById('dealModalOverlay').classList.remove('active');
}

function populateUnitAllocationsInModal() {
    const unitId = document.getElementById('dealUnitSelect').value;
    const unit = state.units.find(u => u.id === unitId);
    const tbody = document.getElementById('dealAllocationRows');
    if (!unit || !unit.areas) {
        tbody.innerHTML = '<tr><td colspan="6">No area components configured for this unit.</td></tr>';
        return;
    }

    tbody.innerHTML = unit.areas.map(a => `
        <tr data-unit-area-id="${a.unit_area_id}" data-area-type-id="${a.area_type_id}">
            <td><strong>${a.name_en}</strong></td>
            <td>${a.available_sqm} SQM</td>
            <td><input type="number" class="alloc-sqm" max="${a.available_sqm}" value="${Math.min(50, a.available_sqm)}" min="0" oninput="calcModalTotals()"></td>
            <td><input type="number" class="rent-rate" value="1000" min="0" oninput="calcModalTotals()"></td>
            <td><input type="number" class="service-rate" value="150" min="0" oninput="calcModalTotals()"></td>
            <td class="line-monthly" style="font-weight:700;">EGP 0</td>
        </tr>
    `).join('');

    calcModalTotals();
}

window.calcModalTotals = function() {
    const rows = document.querySelectorAll('#dealAllocationRows tr');
    let grandMonthly = 0;

    rows.forEach(r => {
        const sqm = Number(r.querySelector('.alloc-sqm')?.value || 0);
        const rentRate = Number(r.querySelector('.rent-rate')?.value || 0);
        const servRate = Number(r.querySelector('.service-rate')?.value || 0);
        const lineTotal = sqm * (rentRate + servRate);
        const lineCell = r.querySelector('.line-monthly');
        if (lineCell) lineCell.textContent = `EGP ${Number(lineTotal).toLocaleString()}`;
        grandMonthly += lineTotal;
    });

    document.getElementById('calcMonthlyTotal').textContent = `EGP ${Number(grandMonthly).toLocaleString()}`;
};

// Deal Creation
async function handleCreateDeal(e) {
    e.preventDefault();
    const rows = document.querySelectorAll('#dealAllocationRows tr');
    const allocations = [];
    const rates = [];

    rows.forEach(r => {
        const unitAreaId = r.getAttribute('data-unit-area-id');
        const areaTypeId = r.getAttribute('data-area-type-id');
        const sqm = Number(r.querySelector('.alloc-sqm').value || 0);
        const rentRate = Number(r.querySelector('.rent-rate').value || 0);
        const servRate = Number(r.querySelector('.service-rate').value || 0);

        if (sqm > 0) {
            allocations.push({ unit_area_id: unitAreaId, allocated_sqm: sqm });
            rates.push({ area_type_id: areaTypeId, rent_rate_per_sqm: rentRate, service_rate_per_sqm: servRate });
        }
    });

    const payload = {
        project_id: document.getElementById('dealProjectSelect').value,
        unit_id: document.getElementById('dealUnitSelect').value,
        tenant_id: document.getElementById('dealTenantSelect').value,
        contract_start_date: document.getElementById('dealStartDate').value,
        contract_end_date: document.getElementById('dealEndDate').value,
        pipeline_id: state.pipelines[0].id,
        current_stage_id: state.pipelines[0].stages[0].id,
        allocations,
        rates,
        deposit: {
            method: document.getElementById('dealDepositMethod').value,
            number_of_months: Number(document.getElementById('dealDepositMonths').value)
        },
        commission: {
            calculation_method: document.getElementById('dealCommMethod').value,
            percentage_rate: Number(document.getElementById('dealCommRate').value)
        }
    };

    try {
        const res = await fetch('/api/deals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json();
            alert(`Error creating deal: ${err.error}`);
            return;
        }
        closeDealModal();
        await loadInitialData();
    } catch (err) {
        alert('Failed to execute deal');
    }
}

// Area Type Creation
async function handleCreateAreaType(e) {
    e.preventDefault();
    const payload = {
        company_id: state.projects[0].company_id,
        code: document.getElementById('newAreaCode').value.toUpperCase(),
        name_en: document.getElementById('newAreaNameEn').value,
        name_ar: document.getElementById('newAreaNameAr').value,
        is_rentable: 1
    };

    const res = await fetch('/api/admin/area-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        document.getElementById('areaTypeModalOverlay').classList.remove('active');
        await loadInitialData();
    }
}

// Drag & Drop
window.handleDragStart = function(e, dealId) {
    e.dataTransfer.setData('dealId', dealId);
};
window.handleDragOver = function(e) {
    e.preventDefault();
};
window.handleDrop = async function(e, newStageId) {
    e.preventDefault();
    const dealId = e.dataTransfer.getData('dealId');
    if (!dealId) return;

    await fetch(`/api/deals/${dealId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: newStageId })
    });
    await loadInitialData();
};

// Signature & Verification Handlers
window.verifySig = async function(contractId, partyType) {
    await fetch(`/api/contracts/${contractId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            party_type: partyType,
            verified_by: 'Authorized Legal Officer',
            notes: 'Verified via commercial registry'
        })
    });
    await loadInitialData();
};

window.issueCommInvoice = async function(calcId) {
    await fetch(`/api/commissions/${calcId}/invoice`, { method: 'POST' });
    await loadInitialData();
};

window.payCommInvoice = async function(invoiceId, balance) {
    await fetch(`/api/commissions/invoices/${invoiceId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            amount: balance,
            payment_reference: 'WIRE-' + Math.floor(100000 + Math.random() * 900000),
            payment_method: 'Bank Transfer'
        })
    });
    await loadInitialData();
};
