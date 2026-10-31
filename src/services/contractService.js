// Contract Management & Dual Signature Verification Service
const { getDatabase } = require('../db/database');
const crypto = require('node:crypto');

class ContractService {
    /**
     * Create or retrieve contract for a deal with dual signature slots
     * @param {string} dealId 
     * @param {Object} options 
     */
    static createContractForDeal(dealId, options = {}) {
        const db = getDatabase();

        const deal = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(dealId);
        if (!deal) throw new Error(`Deal ${dealId} not found`);

        const existingContract = db.prepare(`SELECT * FROM contracts WHERE deal_id = ?`).get(dealId);
        if (existingContract) return existingContract;

        const contractId = crypto.randomUUID();
        const contractNumber = `CNT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        db.exec('BEGIN TRANSACTION;');
        try {
            db.prepare(`
                INSERT INTO contracts (
                    id, contract_number, deal_id, version_number, contract_status,
                    start_date, end_date, created_at
                ) VALUES (?, ?, ?, 1, 'Pending Signatures', ?, ?, CURRENT_TIMESTAMP)
            `).run(contractId, contractNumber, dealId, deal.contract_start_date, deal.contract_end_date);

            // Create two required signature records: LANDLORD and TENANT
            const landlordSigId = crypto.randomUUID();
            db.prepare(`
                INSERT INTO contract_signatures (
                    id, contract_id, party_type, signer_name, signer_title, signature_status
                ) VALUES (?, ?, 'LANDLORD', 'Authorized Landlord Rep', 'Asset Manager', 'PENDING')
            `).run(landlordSigId, contractId);

            const tenantSigId = crypto.randomUUID();
            db.prepare(`
                INSERT INTO contract_signatures (
                    id, contract_id, party_type, signer_name, signer_title, signature_status
                ) VALUES (?, ?, 'TENANT', 'Authorized Tenant Rep', 'Managing Director', 'PENDING')
            `).run(tenantSigId, contractId);

            db.exec('COMMIT;');
        } catch (err) {
            db.exec('ROLLBACK;');
            throw err;
        }

        return db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(contractId);
    }

    /**
     * Record a signature for one party (LANDLORD or TENANT)
     */
    static recordSignature(contractId, partyType, signerName, signerTitle) {
        const db = getDatabase();
        const signature = db.prepare(`
            SELECT * FROM contract_signatures 
            WHERE contract_id = ? AND party_type = ?
        `).get(contractId, partyType);

        if (!signature) throw new Error(`Signature slot for ${partyType} not found on contract ${contractId}`);

        db.prepare(`
            UPDATE contract_signatures 
            SET signer_name = ?, signer_title = ?, signed_at = CURRENT_TIMESTAMP, signature_status = 'SIGNED'
            WHERE id = ?
        `).run(signerName, signerTitle, signature.id);

        this.checkAndUpdateContractStatus(contractId);
        return db.prepare(`SELECT * FROM contract_signatures WHERE id = ?`).get(signature.id);
    }

    /**
     * Verify a signature by compliance/manager
     */
    static verifySignature(contractId, partyType, verifiedBy, notes = '') {
        const db = getDatabase();
        const signature = db.prepare(`
            SELECT * FROM contract_signatures 
            WHERE contract_id = ? AND party_type = ?
        `).get(contractId, partyType);

        if (!signature) throw new Error(`Signature slot for ${partyType} not found`);
        if (signature.signature_status !== 'SIGNED') {
            throw new Error(`Signature for ${partyType} must be SIGNED before it can be VERIFIED (current status: ${signature.signature_status})`);
        }

        db.prepare(`
            UPDATE contract_signatures 
            SET signature_status = 'VERIFIED', verified_by = ?, verified_at = CURRENT_TIMESTAMP, verification_notes = ?
            WHERE id = ?
        `).run(verifiedBy, notes, signature.id);

        // Check if BOTH are now verified!
        const statusResult = this.checkAndUpdateContractStatus(contractId);
        return statusResult;
    }

    /**
     * Check verification status of both signatures.
     * Only when BOTH are VERIFIED does the contract become 'Fully Signed'
     * and triggers the Commission Due workflow.
     */
    static checkAndUpdateContractStatus(contractId) {
        const db = getDatabase();
        const signatures = db.prepare(`
            SELECT * FROM contract_signatures WHERE contract_id = ?
        `).all(contractId);

        const allSigned = signatures.every(s => s.signature_status === 'SIGNED' || s.signature_status === 'VERIFIED');
        const anySigned = signatures.some(s => s.signature_status === 'SIGNED' || s.signature_status === 'VERIFIED');
        const bothVerified = signatures.length === 2 && signatures.every(s => s.signature_status === 'VERIFIED');

        let newStatus = 'Pending Signatures';
        if (bothVerified) {
            newStatus = 'Fully Signed';
        } else if (anySigned) {
            newStatus = 'Partially Signed';
        }

        db.prepare(`UPDATE contracts SET contract_status = ? WHERE id = ?`).run(newStatus, contractId);

        const contract = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(contractId);

        // Notify CommissionEngine if both verified!
        if (bothVerified) {
            const CommissionEngine = require('./commissionEngine');
            CommissionEngine.triggerCommissionDue(contractId);
        }

        return {
            contract,
            signatures,
            both_verified: bothVerified
        };
    }
}

module.exports = ContractService;
