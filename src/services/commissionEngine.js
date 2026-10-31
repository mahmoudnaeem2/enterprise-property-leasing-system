// Leasing Commission Management Engine (Strict Financial Separation & Dual Signature Gating)
const { getDatabase } = require('../db/database');
const crypto = require('node:crypto');

class CommissionEngine {
    /**
     * Set up or update a commission agreement for a deal
     */
    static setCommissionAgreement(dealId, config) {
        const db = getDatabase();
        const {
            calculation_method, // 'PERCENT_ANNUAL_RENT' | 'RENT_MONTHS' | 'FIXED_AMOUNT'
            percentage_rate = 0,
            number_of_months = 0,
            fixed_amount = 0,
            commission_payer = 'LANDLORD',
            tax_rate = 0.14,
            notes = ''
        } = config;

        let agreement = db.prepare(`SELECT * FROM commission_agreements WHERE deal_id = ?`).get(dealId);
        const agreementId = agreement ? agreement.id : crypto.randomUUID();

        if (agreement) {
            db.prepare(`
                UPDATE commission_agreements 
                SET calculation_method = ?, percentage_rate = ?, number_of_months = ?,
                    fixed_amount = ?, commission_payer = ?, tax_rate = ?, notes = ?
                WHERE id = ?
            `).run(calculation_method, percentage_rate, number_of_months, fixed_amount, commission_payer, tax_rate, notes, agreementId);
        } else {
            db.prepare(`
                INSERT INTO commission_agreements (
                    id, deal_id, calculation_method, percentage_rate, number_of_months,
                    fixed_amount, commission_payer, currency, tax_treatment, tax_rate, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'EGP', 'EXCLUSIVE', ?, ?)
            `).run(agreementId, dealId, calculation_method, percentage_rate, number_of_months, fixed_amount, commission_payer, tax_rate, notes);
        }

        return db.prepare(`SELECT * FROM commission_agreements WHERE id = ?`).get(agreementId);
    }

    /**
     * Compute gross, tax, and net commission amounts based on agreement method and deal rent
     */
    static calculateCommissionAmounts(agreement, monthlyRent, annualRent) {
        let grossCommission = 0;

        switch (agreement.calculation_method) {
            case 'PERCENT_ANNUAL_RENT':
                grossCommission = Number((annualRent * (agreement.percentage_rate / 100)).toFixed(2));
                break;
            case 'RENT_MONTHS':
                grossCommission = Number((monthlyRent * agreement.number_of_months).toFixed(2));
                break;
            case 'FIXED_AMOUNT':
                grossCommission = Number(agreement.fixed_amount || 0);
                break;
            default:
                throw new Error(`Unsupported commission method: ${agreement.calculation_method}`);
        }

        const taxRate = Number(agreement.tax_rate) || 0;
        const taxAmount = Number((grossCommission * taxRate).toFixed(2));
        const netCommission = Number((grossCommission + taxAmount).toFixed(2));

        return {
            gross_commission: grossCommission,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            net_commission: netCommission
        };
    }

    /**
     * Triggered automatically ONLY when both signatures are verified on the contract.
     */
    static triggerCommissionDue(contractId) {
        const db = getDatabase();

        const contract = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(contractId);
        if (!contract) return null;

        const dealId = contract.deal_id;
        let agreement = db.prepare(`SELECT * FROM commission_agreements WHERE deal_id = ?`).get(dealId);
        if (!agreement) {
            // Default: 10% of annual rent if not customized
            agreement = this.setCommissionAgreement(dealId, {
                calculation_method: 'PERCENT_ANNUAL_RENT',
                percentage_rate: 10,
                commission_payer: 'LANDLORD'
            });
        }

        // Get snapshot or calculate deal rent
        const snapshot = db.prepare(`SELECT * FROM deal_financial_snapshots WHERE deal_id = ?`).get(dealId);
        let monthlyRent = snapshot ? snapshot.monthly_rent : 0;
        let annualRent = snapshot ? snapshot.annual_rent : 0;

        if (!snapshot) {
            const FinancialEngine = require('./financialEngine');
            const calculated = FinancialEngine.createFinancialSnapshot(dealId);
            monthlyRent = calculated.monthly_rent;
            annualRent = calculated.annual_rent;
        }

        const amounts = this.calculateCommissionAmounts(agreement, monthlyRent, annualRent);

        // Check existing calculation record
        let calc = db.prepare(`SELECT * FROM commission_calculations WHERE contract_id = ?`).get(contractId);
        const calcId = calc ? calc.id : crypto.randomUUID();

        if (calc) {
            db.prepare(`
                UPDATE commission_calculations
                SET base_annual_rent = ?, base_monthly_rent = ?, gross_commission = ?,
                    tax_amount = ?, net_commission = ?, commission_status = 'Commission Due',
                    due_triggered_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(annualRent, monthlyRent, amounts.gross_commission, amounts.tax_amount, amounts.net_commission, calcId);
        } else {
            db.prepare(`
                INSERT INTO commission_calculations (
                    id, commission_agreement_id, deal_id, contract_id, base_annual_rent,
                    base_monthly_rent, gross_commission, tax_amount, net_commission,
                    commission_status, due_triggered_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Commission Due', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(calcId, agreement.id, dealId, contractId, annualRent, monthlyRent, amounts.gross_commission, amounts.tax_amount, amounts.net_commission);
        }

        return db.prepare(`SELECT * FROM commission_calculations WHERE id = ?`).get(calcId);
    }

    /**
     * Issue separate commission invoice
     */
    static issueCommissionInvoice(calculationId, dueDate = null) {
        const db = getDatabase();
        const calc = db.prepare(`SELECT * FROM commission_calculations WHERE id = ?`).get(calculationId);
        if (!calc) throw new Error(`Commission calculation ${calculationId} not found`);

        if (calc.commission_status !== 'Commission Due' && calc.commission_status !== 'Invoiced') {
            throw new Error(`Commission cannot be invoiced while status is: ${calc.commission_status}`);
        }

        const invoiceId = crypto.randomUUID();
        const invoiceNumber = `COMM-INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const invoiceDate = new Date().toISOString().split('T')[0];
        const finalDueDate = dueDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

        db.exec('BEGIN TRANSACTION;');
        try {
            db.prepare(`
                INSERT INTO commission_invoices (
                    id, invoice_number, commission_calculation_id, invoice_date, due_date,
                    subtotal, tax_amount, total_amount, paid_amount, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'Issued')
            `).run(invoiceId, invoiceNumber, calculationId, invoiceDate, finalDueDate, calc.gross_commission, calc.tax_amount, calc.net_commission);

            db.prepare(`
                UPDATE commission_calculations 
                SET commission_status = 'Invoiced' 
                WHERE id = ?
            `).run(calculationId);

            db.exec('COMMIT;');
        } catch (err) {
            db.exec('ROLLBACK;');
            throw err;
        }

        return db.prepare(`SELECT * FROM commission_invoices WHERE id = ?`).get(invoiceId);
    }

    /**
     * Record payment against commission invoice
     */
    static recordCommissionPayment(invoiceId, paymentData) {
        const db = getDatabase();
        const { amount, payment_reference, payment_method = 'Bank Transfer', notes = '' } = paymentData;

        const invoice = db.prepare(`SELECT * FROM commission_invoices WHERE id = ?`).get(invoiceId);
        if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

        const paymentId = crypto.randomUUID();
        const paymentDate = new Date().toISOString().split('T')[0];
        const newPaidAmount = Number((invoice.paid_amount + Number(amount)).toFixed(2));
        const newStatus = newPaidAmount >= invoice.total_amount - 0.01 ? 'Paid' : 'Partially Paid';

        db.exec('BEGIN TRANSACTION;');
        try {
            db.prepare(`
                INSERT INTO commission_payments (
                    id, invoice_id, payment_reference, payment_date, amount, payment_method, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(paymentId, invoiceId, payment_reference, paymentDate, amount, payment_method, notes);

            db.prepare(`
                UPDATE commission_invoices 
                SET paid_amount = ?, status = ? 
                WHERE id = ?
            `).run(newPaidAmount, newStatus, invoiceId);

            // Also update commission_calculation status
            db.prepare(`
                UPDATE commission_calculations
                SET commission_status = ?
                WHERE id = ?
            `).run(newStatus, invoice.commission_calculation_id);

            db.exec('COMMIT;');
        } catch (err) {
            db.exec('ROLLBACK;');
            throw err;
        }

        return {
            payment_id: paymentId,
            paid_amount: newPaidAmount,
            remaining_balance: Number((invoice.total_amount - newPaidAmount).toFixed(2)),
            status: newStatus
        };
    }

    /**
     * Financial separation summary: Earned, Due, Invoiced, Collected, Outstanding
     */
    static getFinancialSummary(projectId = null) {
        const db = getDatabase();

        let filter = '';
        const params = [];
        if (projectId) {
            filter = `JOIN deals d ON cc.deal_id = d.id WHERE d.project_id = ?`;
            params.push(projectId);
        }

        const summary = db.prepare(`
            SELECT 
                COUNT(DISTINCT cc.id) as total_commissions_count,
                COALESCE(SUM(CASE WHEN cc.commission_status IN ('Commission Due', 'Invoiced', 'Partially Paid', 'Paid') THEN cc.net_commission ELSE 0 END), 0) as total_earned_due,
                COALESCE(SUM(ci.total_amount), 0) as total_invoiced,
                COALESCE(SUM(ci.paid_amount), 0) as total_collected,
                COALESCE(SUM(ci.total_amount - ci.paid_amount), 0) as total_outstanding_balance
            FROM commission_calculations cc
            LEFT JOIN commission_invoices ci ON ci.commission_calculation_id = cc.id
            ${filter}
        `).get(...params);

        return {
            earned_due: Number(summary.total_earned_due || 0),
            invoiced: Number(summary.total_invoiced || 0),
            collected: Number(summary.total_collected || 0),
            outstanding_balance: Number(summary.total_outstanding_balance || 0),
            total_count: summary.total_commissions_count || 0
        };
    }
}

module.exports = CommissionEngine;
