/**
 * CSV/XLSX parsing and Brazilian data normalization utilities for FreteLab
 */
import * as XLSX from "xlsx";

/** Remove accents from string */
export function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Normalize city name: trim, uppercase, remove accents, strip non-alpha chars */
export function normalizeCity(city: string): string {
  let s = removeAccents(city.trim().toUpperCase());
  // Remove any remaining non-ASCII (handles mojibake/corrupted accents)
  s = s.replace(/[^A-Z0-9 \-']/g, "");
  // Collapse multiple spaces
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Normalize UF: trim, uppercase */
export function normalizeUF(uf: string): string {
  return uf.trim().toUpperCase();
}

/**
 * Parse a Brazilian numeric value.
 * Handles: "R$ 1.234,56", "1.234,56", "1234.56", "0,50%", "0.5%", etc.
 */
export function parseBrazilianNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return raw;

  let str = String(raw).trim();

  // Remove currency prefix
  str = str.replace(/^R\$\s*/i, "");

  // Treat lone dash or empty as null (means "not applicable")
  if (str === "-" || str === "–" || str === "—" || str === "") return null;

  // Remove percent suffix (convert to decimal later)
  const isPercent = str.endsWith("%");
  if (isPercent) str = str.slice(0, -1).trim();

  // Determine format: if there's a comma, it's Brazilian
  // "1.234,56" -> dots are thousands, comma is decimal
  if (str.includes(",")) {
    str = str.replace(/\./g, ""); // remove thousand separators
    str = str.replace(",", "."); // comma to decimal point
  }

  // Remove any remaining non-numeric chars (except . and -)
  str = str.replace(/[^\d.\-]/g, "");

  const num = parseFloat(str);
  if (isNaN(num)) return null;

  // Convert percentage to decimal (0.50% -> 0.005)
  if (isPercent) return num / 100;

  return num;
}

/** Normalize column header for matching */
export function normalizeHeader(header: string): string {
  return removeAccents(header.trim().toLowerCase())
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Map of normalized carrier rate column names to DB column names */
const CARRIER_COLUMN_MAP: Record<string, string> = {
  cidade_corrigida: "cidade_corrigida",
  uf: "uf",
  adv_min: "adv_min",
  adv_nf: "adv_pct_nf",
  adv_pct_nf: "adv_pct_nf",
  sec_cat: "sec_cat",
  pedagio_fr_100kg: "pedagio_fr_100kg",
  gris_min: "gris_min",
  gris_nf: "gris_pct_nf",
  gris_pct_nf: "gris_pct_nf",
  tas: "tas",
  tas_desp: "tas",
  sefaz: "sefaz",
  emex_min: "emex_min",
  emex_nf: "emex_pct_nf",
  emex_pct_nf: "emex_pct_nf",
  trt_min: "trt_min",
  trt_fr: "trt_pct_fr",
  trt_pct_fr: "trt_pct_fr",
  tde_min: "tde_min",
  tde_fr: "tde_pct_fr",
  tde_pct_fr: "tde_pct_fr",
  tde_por_kg: "tde_por_kg",
  tce_min: "tce_min",
  tda_min: "tda_min",
  tda_fr: "tda_pct_fr",
  tda_pct_fr: "tda_pct_fr",
  tso: "tso_pct",
  tso_pct: "tso_pct",
  tso_min: "tso_min",
  "10": "faixa_10",
  "20": "faixa_20",
  "30": "faixa_30",
  "50": "faixa_50",
  "70": "faixa_70",
  "100": "faixa_100",
  "150": "faixa_150",
  "200": "faixa_200",
  frete_kg_ex_200kg: "frete_kg_ex_200",
  frete_kg_ex_200: "frete_kg_ex_200",
};

const REQUIRED_CARRIER_COLUMNS = [
  "cidade_corrigida", "uf", "faixa_10", "faixa_20", "faixa_30", "faixa_50", "faixa_70", "frete_kg_ex_200"
];

const SHIPMENT_COLUMN_MAP: Record<string, string> = {
  faturamento: "valor_nf",
  grsweight: "peso",
  city: "cidade_corrigida",
  states: "uf",
  cte_data_lancamento: "data",
  doctotacte: "valor_cobrado",
  doctotalcte: "valor_cobrado",
};

const REQUIRED_SHIPMENT_COLUMNS = ["valor_nf", "peso", "cidade_corrigida", "uf", "valor_cobrado"];

export interface ParseError {
  row: number;
  column: string;
  value: string;
  message: string;
}

export interface DuplicateInfo {
  row: number;
  key: string;
  firstRow: number;
}

export interface ParseResult<T> {
  data: T[];
  errors: ParseError[];
  totalRows: number;
  duplicates: number;
  duplicateDetails: DuplicateInfo[];
  missingColumns: string[];
}

/** Parse a file (CSV or XLSX) into array of string arrays */
export function parseCSVText(text: string, delimiter?: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];

  // Auto-detect delimiter
  if (!delimiter) {
    const firstLine = lines[0];
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    if (tabCount > commaCount && tabCount > semicolonCount) delimiter = "\t";
    else if (semicolonCount > commaCount) delimiter = ";";
    else delimiter = ",";
  }

  return lines.map(line => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          result.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  });
}

/** Parse XLSX file buffer into array of string arrays */
export function parseXLSXBuffer(buffer: ArrayBuffer): string[][] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  return data.map(row => row.map(cell => String(cell ?? "")));
}

/** Read a file as either CSV text or XLSX buffer, returning string[][] rows */
export async function readFileAsRows(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    return parseXLSXBuffer(buffer);
  }
  const text = await file.text();
  return parseCSVText(text);
}

/** Parse carrier rate CSV/XLSX — accepts text (CSV) or pre-parsed rows */
export function parseCarrierRateCSV(input: string | string[][]): ParseResult<Record<string, unknown>> {
  const rows = typeof input === "string" ? parseCSVText(input) : input;
  if (rows.length < 2) return { data: [], errors: [], totalRows: 0, duplicates: 0, duplicateDetails: [], missingColumns: [] };

  const headers = rows[0].map(h => normalizeHeader(h));

  // Map headers to DB columns
  const columnMapping: Array<{ csvIndex: number; dbColumn: string }> = [];
  const mappedDbCols = new Set<string>();

  headers.forEach((h, i) => {
    const dbCol = CARRIER_COLUMN_MAP[h];
    if (dbCol && !mappedDbCols.has(dbCol)) {
      columnMapping.push({ csvIndex: i, dbColumn: dbCol });
      mappedDbCols.add(dbCol);
    }
  });

  // Check required columns
  const missingColumns = REQUIRED_CARRIER_COLUMNS.filter(c => !mappedDbCols.has(c));

  const errors: ParseError[] = [];
  const data: Record<string, unknown>[] = [];
  const seen = new Map<string, number>();
  let duplicates = 0;
  const duplicateDetails: DuplicateInfo[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every(c => !c.trim())) continue;

    const record: Record<string, unknown> = {};

    for (const { csvIndex, dbColumn } of columnMapping) {
      const rawVal = row[csvIndex] ?? "";

      if (dbColumn === "cidade_corrigida") {
        record[dbColumn] = normalizeCity(rawVal);
      } else if (dbColumn === "uf") {
        record[dbColumn] = normalizeUF(rawVal);
      } else {
        const num = parseBrazilianNumber(rawVal);
        if (num === null && rawVal.trim() !== "") {
          errors.push({ row: r + 1, column: dbColumn, value: rawVal, message: "Valor numérico inválido" });
        }
        record[dbColumn] = num ?? 0;
      }
    }

    // Handle nullable faixas
    for (const f of ["faixa_100", "faixa_150", "faixa_200"]) {
      if (!mappedDbCols.has(f)) {
        record[f] = null;
      }
    }

    const key = `${record.uf}|${record.cidade_corrigida}`;
    const prevRow = seen.get(key);
    if (prevRow !== undefined) {
      duplicates++;
      duplicateDetails.push({ row: r + 1, key, firstRow: prevRow });
      continue;
    }
    seen.set(key, r + 1);
    data.push(record);
  }

  return { data, errors, totalRows: rows.length - 1, duplicates, duplicateDetails, missingColumns };
}

/** Parse shipments CSV/XLSX — accepts text (CSV) or pre-parsed rows */
export function parseShipmentCSV(input: string | string[][]): ParseResult<Record<string, unknown>> {
  const rows = typeof input === "string" ? parseCSVText(input) : input;
  if (rows.length < 2) return { data: [], errors: [], totalRows: 0, duplicates: 0, duplicateDetails: [], missingColumns: [] };

  const headers = rows[0].map(h => normalizeHeader(h));

  const columnMapping: Array<{ csvIndex: number; dbColumn: string }> = [];
  const mappedDbCols = new Set<string>();

  headers.forEach((h, i) => {
    const dbCol = SHIPMENT_COLUMN_MAP[h];
    if (dbCol && !mappedDbCols.has(dbCol)) {
      columnMapping.push({ csvIndex: i, dbColumn: dbCol });
      mappedDbCols.add(dbCol);
    }
  });

  const missingColumns = REQUIRED_SHIPMENT_COLUMNS.filter(c => !mappedDbCols.has(c));

  const errors: ParseError[] = [];
  const data: Record<string, unknown>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every(c => !c.trim())) continue;

    const record: Record<string, unknown> = {};
    record.shipment_id = `SHP-${String(r).padStart(6, "0")}`;

    for (const { csvIndex, dbColumn } of columnMapping) {
      const rawVal = row[csvIndex] ?? "";

      if (dbColumn === "cidade_corrigida") {
        record[dbColumn] = normalizeCity(rawVal);
      } else if (dbColumn === "uf") {
        record[dbColumn] = normalizeUF(rawVal);
      } else if (dbColumn === "data") {
        // Try to parse date
        const trimmed = rawVal.trim();
        if (trimmed) {
          // Try DD/MM/YYYY or YYYY-MM-DD
          const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
          if (brMatch) {
            record[dbColumn] = `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
          } else {
            record[dbColumn] = trimmed;
          }
        } else {
          record[dbColumn] = null;
        }
      } else {
        const num = parseBrazilianNumber(rawVal);
        if (num === null && rawVal.trim() !== "") {
          errors.push({ row: r + 1, column: dbColumn, value: rawVal, message: "Valor numérico inválido" });
        }
        record[dbColumn] = num ?? 0;
      }
    }

    data.push(record);
  }

  return { data, errors, totalRows: rows.length - 1, duplicates: 0, duplicateDetails: [], missingColumns };
}

/** Format number as BRL currency */
export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Format number as percentage */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return (value * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "%";
}

/** Format number with Brazilian locale */
export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Generate carrier rate CSV template */
export function generateCarrierTemplate(): string {
  const headers = [
    "CIDADE_CORRIGIDA", "UF", "adv min", "adv % nf", "SEC-CAT", "Pedágio FR 100KG",
    "GRIS MIN", "GRIS % NF", "TAS", "SEFAZ", "EMEX MIN", "EMEX % NF",
    "TRT MIN", "TRT % FR", "TDE MIN", "TDE % FR", "TDE POR KG", "TCE MIN",
    "TDA MIN", "TDA % FR", "TSO %", "TSO MIN", "10", "20", "30", "50", "70",
    "100", "150", "200", "Frete kg ex 200kg"
  ];
  const example = [
    "SAO PAULO", "SP", "25,00", "0,30%", "15,00", "10,50",
    "15,00", "0,30%", "5,00", "3,00", "10,00", "0,10%",
    "20,00", "1,50%", "0,00", "0,00%", "0,00", "0,00",
    "0,00", "0,00%", "0,00%", "0,00", "150,00", "180,00", "220,00", "300,00", "400,00",
    "500,00", "600,00", "700,00", "3,50"
  ];
  return headers.join(";") + "\n" + example.join(";");
}

/** Generate shipment CSV template */
export function generateShipmentTemplate(): string {
  const headers = ["Faturamento", "GrsWeight", "city", "StateS", "CTe - Data Lançamento", "DocTotaCTe"];
  const example = ["15000,00", "250,5", "SAO PAULO", "SP", "15/01/2024", "1250,00"];
  return headers.join(";") + "\n" + example.join(";");
}
