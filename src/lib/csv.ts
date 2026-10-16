// CSV (RFC 4180) for spreadsheets.
//
// Cells are quoted when they contain a separator, quote or line break, with
// quotes doubled. Cells starting with = + - @ (or a tab / carriage return)
// get a leading apostrophe: Excel and Sheets would otherwise run them as
// formulas, and a comment is text anyone can write ("CSV injection").
// The file starts with a byte order mark so Excel reads it as UTF-8.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: (string | number | null)[][]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
