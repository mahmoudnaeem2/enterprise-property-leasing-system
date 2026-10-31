// Unit Allocation & Temporal Availability Service
const { getDatabase } = require('../db/database');

class AllocationService {
    /**
     * Get all area components of a unit with their total physical SQM and current allocated/available SQM
     * @param {string} unitId 
     * @param {string} [startDate] Optional date range start (YYYY-MM-DD)
     * @param {string} [endDate] Optional date range end (YYYY-MM-DD)
     * @param {string} [excludeDealId] Exclude specific deal when checking (e.g. for update)
     */
    static getUnitAreaAvailability(unitId, startDate = null, endDate = null, excludeDealId = null) {
        const db = getDatabase();

        // 1. Fetch physical area components
        const areas = db.prepare(`
            SELECT ua.id as unit_area_id, ua.unit_id, ua.size_sqm, ua.description,
                   at.id as area_type_id, at.code as area_type_code, at.name_en, at.name_ar, at.is_rentable
            FROM unit_areas ua
            JOIN area_types at ON ua.area_type_id = at.id
            WHERE ua.unit_id = ? AND ua.is_active = 1
            ORDER BY at.display_order ASC
        `).all(unitId);

        // 2. Fetch existing active deal allocations overlapping with date range
        let query = `
            SELECT daa.unit_area_id, SUM(daa.allocated_sqm) as total_allocated
            FROM deal_area_allocations daa
            JOIN deals d ON daa.deal_id = d.id
            WHERE d.unit_id = ?
              AND d.deal_status NOT IN ('Lost', 'Cancelled')
        `;
        const params = [unitId];

        if (startDate && endDate) {
            // Standard temporal interval overlap: StartA <= EndB and EndA >= StartB
            query += ` AND NOT (d.contract_end_date < ? OR d.contract_start_date > ?)`;
            params.push(startDate, endDate);
        }

        if (excludeDealId) {
            query += ` AND d.id != ?`;
            params.push(excludeDealId);
        }

        query += ` GROUP BY daa.unit_area_id`;
        const allocatedRows = db.prepare(query).all(...params);
        const allocatedMap = new Map();
        for (const row of allocatedRows) {
            allocatedMap.set(row.unit_area_id, Number(row.total_allocated) || 0);
        }

        return areas.map(area => {
            const allocated = allocatedMap.get(area.unit_area_id) || 0;
            const remaining = Math.max(0, Number((area.size_sqm - allocated).toFixed(2)));
            return {
                ...area,
                allocated_sqm: Number(allocated.toFixed(2)),
                available_sqm: remaining,
                is_fully_allocated: remaining === 0
            };
        });
    }

    /**
     * Validate requested allocations against available capacity
     * @param {string} unitId 
     * @param {Array<{unit_area_id: string, allocated_sqm: number}>} requestedAllocations 
     * @param {string} startDate 
     * @param {string} endDate 
     * @param {string} [excludeDealId]
     */
    static validateAllocations(unitId, requestedAllocations, startDate, endDate, excludeDealId = null) {
        const availability = this.getUnitAreaAvailability(unitId, startDate, endDate, excludeDealId);
        const availMap = new Map(availability.map(a => [a.unit_area_id, a]));

        for (const req of requestedAllocations) {
            const component = availMap.get(req.unit_area_id);
            if (!component) {
                return {
                    valid: false,
                    error: `Area component ID ${req.unit_area_id} does not exist on unit ${unitId}`
                };
            }
            if (req.allocated_sqm <= 0) {
                return {
                    valid: false,
                    error: `Allocated SQM for ${component.name_en} must be greater than zero.`
                };
            }
            if (req.allocated_sqm > component.available_sqm + 0.001) {
                return {
                    valid: false,
                    error: `Allocation exceeds available area for ${component.name_en}. Requested: ${req.allocated_sqm} SQM, Available: ${component.available_sqm} SQM.`
                };
            }
        }

        return { valid: true };
    }

    /**
     * Recalculate unit operational status based on all its components
     */
    static updateUnitOperationalStatus(unitId) {
        const db = getDatabase();
        const availability = this.getUnitAreaAvailability(unitId);

        const totalPhysical = availability.reduce((sum, a) => sum + a.size_sqm, 0);
        const totalAllocated = availability.reduce((sum, a) => sum + a.allocated_sqm, 0);

        let newStatus = 'Available';
        if (totalAllocated >= totalPhysical - 0.001) {
            newStatus = 'Fully Leased';
        } else if (totalAllocated > 0) {
            newStatus = 'Partially Leased';
        } else {
            // Check if there are active deals under negotiation
            const inNegotiation = db.prepare(`
                SELECT COUNT(*) as count FROM deals 
                WHERE unit_id = ? AND deal_status = 'In Progress'
            `).get(unitId);
            if (inNegotiation.count > 0) {
                newStatus = 'Under Negotiation';
            }
        }

        db.prepare(`UPDATE units SET operational_status = ? WHERE id = ?`).run(newStatus, unitId);
        return newStatus;
    }
}

module.exports = AllocationService;
