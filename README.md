# Enterprise Property & Commercial Leasing Management System
### Architecture | Business Logic | Relational Database | Dual-Signature Verification | Commission Ledger

A production-grade, enterprise commercial property operations and leasing platform modeled after world-class platforms such as **Yardi Voyager** and **MRI Software**. The platform governs multi-project portfolios, multi-component dynamic unit area allocations, multi-deal concurrency, independent area pricing, dual-signature verification gating, and segregated leasing commission ledgers.

---

## 🌟 Core Architectural Pillars

### 1. Dynamic Area Management (Zero Hardcoded Columns)
* Never hardcodes Indoor, Outdoor, or Terrace as static columns.
* Multi-component dynamic area model: Each unit contains $N$ physical area components with distinct SQM and independent rates.
* Automatic physical area calculation and temporal capacity tracking.

### 2. Simultaneous Multi-Deal Partial Leasing
* Units can host multiple simultaneous active deals allocating different physical portions across overlapping lease terms.
* Strict temporal allocation engine prevents physical double-allocation while maximizing leasable capacity.

### 3. Financial Calculation Engine & Historical Snapshots
* Formula: $\text{Rent} = \sum (\text{Allocated SQM} \times \text{Rent Rate})$, $\text{Service Charge} = \sum (\text{Allocated SQM} \times \text{Service Rate})$.
* 4-method Security Deposit Matrix (`FIXED_AMOUNT`, `RENT_ONLY`, `RENT_AND_SERVICE`, `CUSTOM`).
* Immutable financial snapshots: Changing future base unit prices never alters signed agreements.

### 4. Dual-Signature Commission Gating Workflow
* **Trigger Guarantee:** Leasing commission becomes due **ONLY after BOTH Landlord and Tenant signatures have been legally verified**. A single signature alone will NEVER trigger commission due.
* Status lifecycle: `Draft` $\to$ `Pending Signatures` $\to$ `Partially Signed` $\to$ `Fully Signed` $\to$ `Commission Due` $\to$ `Invoiced` $\to$ `Paid`.

### 5. Strict Financial Separation
* Leasing commission is completely decoupled from regular monthly rent collection.
* Independent tracking of Commission Earned/Due, Invoiced, Collected, and Outstanding Balance.

### 6. Dynamic Admin Engine & RTL/LTR Localization
* Full Arabic (RTL) and English (LTR) bilingual interface with EGP currency formatting.
* Administrators can add, edit, or deactivate area types, unit types, pipelines, and stages without altering source code.

---

## 🏗️ Relational Database Architecture

```
Company
 └── Projects (Code, Location, Currency: EGP)
      └── Buildings & Zones
           └── Units (Number, Type, Operational Status)
                └── Dynamic Unit Areas (Area Type, SQM, Rates)
                     └── Deal Area Allocations (Partial Leases)
                          ├── Financial Snapshot & Deposits
                          ├── Contracts & Dual Signatures (Landlord + Tenant)
                          └── Commission Agreement & Ledger (Due, Invoiced, Paid)
```

---

## 🚀 Quick Start

### Prerequisites
* Node.js v22+ (Native SQLite `node:sqlite` built-in)
* Zero external package dependencies needed!

### Running the Application
```bash
# 1. Run Automated Verification Tests
npm test

# 2. Start the Enterprise Server
npm start
```

Access the web application at:  
👉 **http://localhost:3000**

---

## 🧪 Automated Verification Suite
All core acceptance criteria are verified:
- [x] Unlimited projects creation
- [x] Dynamic area types configuration without code changes
- [x] Dynamic multi-component unit area sizing & total area calculation
- [x] Simultaneous partial unit leasing (e.g. Unit A-101 hosting Deal 1 & Deal 2 concurrently)
- [x] Physical over-allocation prevention
- [x] Independent area pricing calculation
- [x] 4 Security deposit calculation methods
- [x] Dual-signature gating for commission due trigger
- [x] Segregated commission invoicing and payment tracking
- [x] Financial billing schedule generator with annual escalation
