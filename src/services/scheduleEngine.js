// Financial Billing Schedule Engine (Escalations, Rent-Free, Billing Frequencies)
const { getDatabase } = require('../db/database');
const crypto = require('node:crypto');

class ScheduleEngine {
    /**
     * Generate financial schedule lines for a contract
     * @param {string} contractId 
     * @param {Object} options 
     * @param {'MONTHLY'|'QUARTERLY'|'SEMI_ANNUAL'|'ANNUAL'} [options.billing_frequency]
     * @param {number} [options.annual_escalation_rate] e.g. 0.10 for 10% annual escalation
     * @param {number} [options.rent_free_months]
     * @param {number} [options.fit_out_months]
     */
    static generateSchedule(contractId, options = {}) {
        const db = getDatabase();
        const contract = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(contractId);
        if (!contract) throw new Error(`Contract ${contractId} not found`);

        const snapshot = db.prepare(`SELECT * FROM deal_financial_snapshots WHERE deal_id = ?`).get(contract.deal_id);
        const monthlyRent = snapshot ? snapshot.monthly_rent : 0;
        const monthlyService = snapshot ? snapshot.monthly_service_charge : 0;

        const {
            billing_frequency = 'MONTHLY',
            annual_escalation_rate = 0.0,
            rent_free_months = 0,
            fit_out_months = 0
        } = options;

        // Clean existing schedule
        const existingSchedule = db.prepare(`SELECT * FROM financial_schedules WHERE contract_id = ?`).get(contractId);
        const scheduleId = existingSchedule ? existingSchedule.id : crypto.randomUUID();

        if (!existingSchedule) {
            db.prepare(`
                INSERT INTO financial_schedules (id, contract_id, billing_frequency, created_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `).run(scheduleId, contractId, billing_frequency);
        } else {
            db.prepare(`DELETE FROM schedule_lines WHERE schedule_id = ?`).run(scheduleId);
            db.prepare(`UPDATE financial_schedules SET billing_frequency = ? WHERE id = ?`).run(billing_frequency, scheduleId);
        }

        const start = new Date(contract.start_date);
        const end = new Date(contract.end_date);

        // Calculate total months
        const totalMonths = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
        
        let intervalMonths = 1;
        if (billing_frequency === 'QUARTERLY') intervalMonths = 3;
        else if (billing_frequency === 'SEMI_ANNUAL') intervalMonths = 6;
        else if (billing_frequency === 'ANNUAL') intervalMonths = 12;

        const lines = [];
        let currentMonthIndex = 0;

        while (currentMonthIndex < totalMonths) {
            const periodYear = Math.floor(currentMonthIndex / 12) + 1;
            const escalationFactor = Math.pow(1 + annual_escalation_rate, periodYear - 1);

            const periodStartDate = new Date(start);
            periodStartDate.setMonth(start.getMonth() + currentMonthIndex);

            const periodEndDate = new Date(start);
            periodEndDate.setMonth(start.getMonth() + Math.min(totalMonths, currentMonthIndex + intervalMonths));
            periodEndDate.setDate(periodEndDate.getDate() - 1);

            const isRentFree = currentMonthIndex < rent_free_months;
            const isFitOut = currentMonthIndex < fit_out_months;

            const monthsInInterval = Math.min(intervalMonths, totalMonths - currentMonthIndex);
            const periodRent = isRentFree ? 0 : Number((monthlyRent * escalationFactor * monthsInInterval).toFixed(2));
            const periodService = Number((monthlyService * monthsInInterval).toFixed(2));
            const totalAmount = Number((periodRent + periodService).toFixed(2));

            const lineId = crypto.randomUUID();
            db.prepare(`
                INSERT INTO schedule_lines (
                    id, schedule_id, period_year, period_start_date, period_end_date,
                    due_date, rent_amount, service_charge_amount, total_amount,
                    is_rent_free, is_fit_out, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                lineId, scheduleId, periodYear,
                periodStartDate.toISOString().split('T')[0],
                periodEndDate.toISOString().split('T')[0],
                periodStartDate.toISOString().split('T')[0],
                periodRent, periodService, totalAmount,
                isRentFree ? 1 : 0, isFitOut ? 1 : 0,
                `Year ${periodYear} - ${billing_frequency} (Escalation: ${(annual_escalation_rate * 100).toFixed(0)}%)`
            );

            lines.push({
                id: lineId,
                period_year: periodYear,
                start_date: periodStartDate.toISOString().split('T')[0],
                end_date: periodEndDate.toISOString().split('T')[0],
                rent_amount: periodRent,
                service_charge_amount: periodService,
                total_amount: totalAmount,
                is_rent_free: isRentFree,
                is_fit_out: isFitOut
            });

            currentMonthIndex += intervalMonths;
        }

        return {
            schedule_id: scheduleId,
            billing_frequency,
            lines
        };
    }

    static getContractSchedule(contractId) {
        const db = getDatabase();
        const schedule = db.prepare(`SELECT * FROM financial_schedules WHERE contract_id = ?`).get(contractId);
        if (!schedule) return null;

        const lines = db.prepare(`
            SELECT * FROM schedule_lines WHERE schedule_id = ? ORDER BY period_start_date ASC
        `).all(schedule.id);

        return {
            ...schedule,
            lines
        };
    }
}

module.exports = ScheduleEngine;
