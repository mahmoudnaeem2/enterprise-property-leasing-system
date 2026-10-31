// Admin Settings & Dynamic Configuration Service
const { getDatabase } = require('../db/database');
const crypto = require('node:crypto');

class AdminConfigService {
    // AREA TYPES CONFIGURATION
    static getAreaTypes(projectId = null) {
        const db = getDatabase();
        if (projectId) {
            // Project-level override query: Project override first, then Global fallback
            return db.prepare(`
                SELECT * FROM area_types 
                WHERE (project_id = ? OR project_id IS NULL) AND is_active = 1
                ORDER BY display_order ASC, name_en ASC
            `).all(projectId);
        }
        return db.prepare(`
            SELECT * FROM area_types 
            WHERE is_active = 1
            ORDER BY display_order ASC, name_en ASC
        `).all();
    }

    static createAreaType(data) {
        const db = getDatabase();
        const id = crypto.randomUUID();
        const {
            company_id,
            project_id = null,
            code,
            name_en,
            name_ar,
            is_rentable = 1,
            display_order = 0
        } = data;

        db.prepare(`
            INSERT INTO area_types (id, company_id, project_id, code, name_en, name_ar, is_rentable, is_active, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        `).run(id, company_id, project_id, code, name_en, name_ar, is_rentable ? 1 : 0, display_order);

        return db.prepare(`SELECT * FROM area_types WHERE id = ?`).get(id);
    }

    static updateAreaType(id, data) {
        const db = getDatabase();
        const fields = [];
        const values = [];

        for (const [key, val] of Object.entries(data)) {
            if (['name_en', 'name_ar', 'is_rentable', 'is_active', 'display_order'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(val);
            }
        }
        if (fields.length === 0) return null;

        values.push(id);
        db.prepare(`UPDATE area_types SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return db.prepare(`SELECT * FROM area_types WHERE id = ?`).get(id);
    }

    // PIPELINES & STAGES CONFIGURATION
    static getPipelines(projectId = null) {
        const db = getDatabase();
        const pipelines = db.prepare(`
            SELECT * FROM pipelines WHERE is_active = 1 ORDER BY created_at ASC
        `).all();

        return pipelines.map(p => {
            const stages = db.prepare(`
                SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY stage_order ASC
            `).all(p.id);
            return { ...p, stages };
        });
    }

    static createPipeline(data) {
        const db = getDatabase();
        const id = crypto.randomUUID();
        const { company_id, project_id = null, name, code, stages = [] } = data;

        db.exec('BEGIN TRANSACTION;');
        try {
            db.prepare(`
                INSERT INTO pipelines (id, company_id, project_id, name, code, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
            `).run(id, company_id, project_id, name, code);

            let order = 1;
            for (const stg of stages) {
                const stageId = crypto.randomUUID();
                db.prepare(`
                    INSERT INTO pipeline_stages (
                        id, pipeline_id, name_en, name_ar, stage_order, probability_percentage,
                        color_hex, is_won, is_lost
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    stageId, id, stg.name_en, stg.name_ar || stg.name_en,
                    order++, stg.probability_percentage || 0,
                    stg.color_hex || '#3b82f6',
                    stg.is_won ? 1 : 0, stg.is_lost ? 1 : 0
                );
            }

            db.exec('COMMIT;');
        } catch (err) {
            db.exec('ROLLBACK;');
            throw err;
        }

        return this.getPipelines().find(p => p.id === id);
    }

    // CUSTOM FIELDS CONFIGURATION
    static getCustomFields(entityType) {
        const db = getDatabase();
        return db.prepare(`
            SELECT * FROM custom_field_definitions 
            WHERE entity_type = ? 
            ORDER BY display_order ASC
        `).all(entityType);
    }

    static createCustomField(data) {
        const db = getDatabase();
        const id = crypto.randomUUID();
        const { company_id, entity_type, field_code, label_en, label_ar, field_type, is_mandatory = 0, options_json = null, display_order = 0 } = data;

        db.prepare(`
            INSERT INTO custom_field_definitions (
                id, company_id, entity_type, field_code, label_en, label_ar,
                field_type, is_mandatory, options_json, display_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, company_id, entity_type, field_code, label_en, label_ar, field_type, is_mandatory ? 1 : 0, options_json, display_order);

        return db.prepare(`SELECT * FROM custom_field_definitions WHERE id = ?`).get(id);
    }

    static setCustomFieldValue(fieldDefinitionId, entityId, valueText) {
        const db = getDatabase();
        const id = crypto.randomUUID();
        db.prepare(`
            INSERT INTO custom_field_values (id, field_definition_id, entity_id, value_text)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(field_definition_id, entity_id) DO UPDATE SET value_text = excluded.value_text
        `).run(id, fieldDefinitionId, entityId, String(valueText));
    }
}

module.exports = AdminConfigService;
