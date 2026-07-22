/**
 * Maximum allowed length for Kanban column names and workflow status names.
 * Applied consistently across DTO validation, service layer, and database schema.
 */
export const MAX_COLUMN_NAME_LENGTH = 50 as const;
