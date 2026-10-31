// Rent, Service Charge, Deposit & Tax Calculation Engine
const { getDatabase } = require('../db/database');
const crypto = require('node:crypto');

class FinancialEngine {
    /**
     * Calculate rent and service charge line items from area allocations and rates
     * @param {Array<{area_type_id: string, name_en: string, allocated_sqm: number, rent_rate_per_sqm: number, service_rate_per_sqm: number}>} items 
     */
    static calculateCharges(items) {
        let totalMonthlyRent = 0;
        let totalMonthlyServiceCharge = 0;
        const lineItems = [];

        for (const item of items) {
            const sqm = Number(item.allocated_sqm) || 0;
            const rentRate = Number(item.rent_rate_per_sqm) || 0;
            const serviceRate = Number(item.service_rate_per_sqm) || 0;

            const lineMonthlyRent = Number((sqm * rentRate).toFixed(2));
            const lineMonthlyService = Number((sqm * serviceRate).toFixed(2));
            const lineTotalMonthly = Number((lineMonthlyRent + lineMonthlyService).toFixed(2));

            totalMonthlyRent += lineMonthlyRent;
            totalMonthlyServiceCharge += lineMonthlyService;

            lineItems.push({
                area_type_id: item.area_type_id,
                name_en: item.name_en || 'Area Component',
                allocated_sqm: sqm,
                rent_rate_per_sqm: rentRate,
                service_rate_per_sqm: serviceRate,
                monthly_rent: lineMonthlyRent,
                monthly_service_charge: lineMonthlyService,
                monthly_total: lineTotalMonthly,
                annual_rent: Number((lineMonthlyRent * 12).toFixed(2)),
                annual_service_charge: Number((lineMonthlyService * 12).toFixed(2)),
                annual_total: Number((lineTotalMonthly * 12).toFixed(2))
            });
        }

        const totalMonthlyCharges = Number((totalMonthlyRent + totalMonthlyServiceCharge).toFixed(2));
        const totalAnnualRent = Number((totalMonthlyRent * 12).toFixed(2));
        const totalAnnualServiceCharge = Number((totalMonthlyServiceCharge * 12).toFixed(2));
        const totalAnnualCharges = Number((totalMonthlyCharges * 12).toFixed(2));

        return {
            line_items: lineItems,
            monthly_rent: totalMonthlyRent,
            monthly_service_charge: totalMonthlyServiceCharge,
            total_monthly_charges: totalMonthlyCharges,
            annual_rent: totalAnnualRent,
            annual_service_charge: totalAnnualServiceCharge,
            total_annual_charges: totalAnnualCharges
        };
    }

    /**
     * Calculate security deposit according to 4 standard enterprise methods
     * @param {Object} options 
     * @param {'FIXED_AMOUNT'|'RENT_ONLY'|'RENT_AND_SERVICE'|'CUSTOM'} options.method
     * @param {number} options.monthly_rent
     * @param {number} options.monthly_service_charge
     * @param {number} [options.number_of_months]
     * @param {number} [options.fixed_amount]
     * @param {number} [options.calculation_base]
     * @param {boolean} [options.is_tax_inclusive]
     * @param {number} [options.tax_rate] e.g. 0.14 for 14% VAT
     */
    static calculateSecurityDeposit(options) {
        const {
            method,
            monthly_rent = 0,
            monthly_service_charge = 0,
            number_of_months = 0,
            fixed_amount = 0,
            calculation_base = 0,
            is_tax_inclusive = false,
            tax_rate = 0
        } = options;

        let baseDeposit = 0;

        switch (method) {
            case 'FIXED_AMOUNT':
                baseDeposit = Number(fixed_amount) || 0;
                break;
            case 'RENT_ONLY':
                baseDeposit = Number((monthly_rent * number_of_months).toFixed(2));
                break;
            case 'RENT_AND_SERVICE':
                baseDeposit = Number(((monthly_rent + monthly_service_charge) * number_of_months).toFixed(2));
                break;
            case 'CUSTOM':
                baseDeposit = Number((calculation_base * (number_of_months || 1)).toFixed(2));
                break;
            default:
                throw new Error(`Unknown deposit method: ${method}`);
        }

        let taxAmount = 0;
        let totalDeposit = baseDeposit;

        if (tax_rate > 0) {
            if (is_tax_inclusive) {
                // If inclusive, baseDeposit includes tax: totalDeposit = baseDeposit, base = total / (1 + rate)
                totalDeposit = baseDeposit;
                baseDeposit = Number((totalDeposit / (1 + tax_rate)).toFixed(2));
                taxAmount = Number((totalDeposit - baseDeposit).toFixed(2));
            } else {
                // If exclusive, tax is added on top
                taxAmount = Number((baseDeposit * tax_rate).toFixed(2));
                totalDeposit = Number((baseDeposit + taxAmount).toFixed(2));
            }
        }

        return {
            method,
            base_deposit: baseDeposit,
            number_of_months,
            tax_rate,
            is_tax_inclusive: is_tax_inclusive ? 1 : 0,
            tax_amount: taxAmount,
            total_deposit: totalDeposit
        };
    }

    /**
     * Create and freeze a deal financial snapshot to protect signed commitments
     */
    static createFinancialSnapshot(dealId) {
        const db = getDatabase();

        // 1. Fetch deal allocations and rates
        const rows = db.prepare(`
            SELECT daa.allocated_sqm, at.id as area_type_id, at.name_en,
                   dar.rent_rate_per_sqm, dar.service_rate_per_sqm
            FROM deal_area_allocations daa
            JOIN unit_areas ua ON daa.unit_area_id = ua.id
            JOIN area_types at ON ua.area_type_id = at.id
            LEFT JOIN deal_area_rates dar ON dar.deal_id = daa.deal_id AND dar.area_type_id = at.id
            WHERE daa.deal_id = ?
        `).all(dealId);

        const chargeSummary = this.calculateCharges(rows);
        const totalAllocated = rows.reduce((s, r) => s + Number(r.allocated_sqm || 0), 0);

        // Fetch deposit
        const depositRow = db.prepare(`SELECT * FROM deal_deposits WHERE deal_id = ?`).get(dealId);
        const depositAmount = depositRow ? depositRow.total_deposit : 0;

        // Upsert snapshot
        const snapshotId = crypto.randomUUID();
        db.prepare(`
            INSERT OR REPLACE INTO deal_financial_snapshots (
                id, deal_id, total_allocated_sqm, monthly_rent, monthly_service_charge,
                total_monthly_charges, annual_rent, annual_service_charge, total_annual_charges,
                deposit_amount, currency, snapshotted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EGP', CURRENT_TIMESTAMP)
        `).run(
            snapshotId, dealId, totalAllocated,
            chargeSummary.monthly_rent, chargeSummary.monthly_service_charge,
            chargeSummary.total_monthly_charges, chargeSummary.annual_rent,
            chargeSummary.annual_service_charge, chargeSummary.total_annual_charges,
            depositAmount
        );

        return chargeSummary;
    }
}

module.exports = FinancialEngine;
