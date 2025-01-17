export function sanitizeWordCandidates(word: string): string[] {
  return [
    // General match.
    sanitizeQuotedTable(sanitizeDynamicPartitionTable(word)),
    // Specific partition table match.
    sanitizeUuidPartitionTable(sanitizeNumberPartitionTable(word)),
  ]
}

/**
 * sanitize table row type.
 *   e.g.)
 *     public.table_name%ROWTYPE
 */
export function sanitizeTableRowType(word: string): string {
  return word.replace(/"?([a-zA-Z_]\w*)"?%(ROWTYPE|rowtype)$/, "$1")
}

/**
 * sanitize quoted table.
 *   e.g.)
 *     public."table_name"
 *            "table_name"
 */
export function sanitizeQuotedTable(word: string): string {
  return word.replace(/(^[a-zA-Z_]\w*\.)?"([a-zA-Z_]\w*)"$/, "$1$2")
}

/**
 * sanitize dynamic partition table.
 *   e.g.)
 *     public."table_name_$$ || partition_key || $$"
 *            "table_name_$$ || partition_key || $$"
 */
export function sanitizeDynamicPartitionTable(word: string): string {
  return word
    .replace(/"([a-zA-Z_]\w*)_\$\$$/, "$1")
}

/**
 * sanitize number partition table.
 *   e.g.)
 *     public.table_name_1234
 *            table_name_1234
 *     public."table_name_1234"
 *            "table_name_1234"
 */
export function sanitizeNumberPartitionTable(word: string): string {
  return word.replace(/"?([a-zA-Z_]\w*)_[0-9]+"?$/, "$1")
}

/**
 * sanitize uuid partition table.
 *   e.g.)
 *     public.table_name_12345678-1234-1234-1234-123456789012
 *            table_name_12345678-1234-1234-1234-123456789012
 *     public."table_name_12345678-1234-1234-1234-123456789012"
 *            "table_name_12345678-1234-1234-1234-123456789012"
 */
export function sanitizeUuidPartitionTable(word: string): string {
  return word.replace(
    /"?([a-zA-Z_]\w*)_[0-9]{8}-[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{12}"?$/,
    "$1",
  )
}
