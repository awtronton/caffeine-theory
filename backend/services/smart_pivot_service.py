"""Preview-only row-to-column transformation for account-coded Excel reports.

7A.2.2.1 intentionally performs no database operations.
"""
from __future__ import annotations

import io
import re
from decimal import Decimal, InvalidOperation
from math import isfinite

import pandas as pd


MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_ROWS = 30000
MAX_COLUMNS = 120
MAX_ACCOUNTS = 1200
CODE_PATTERN = re.compile(r"^\d{4,18}$")
COLUMN_PATTERN = re.compile(r"^sandi_\d{4,18}$")
NUMBER_PATTERN = re.compile(r"^[+-]?(?:\d+(?:[.,]\d+)*|\.\d+)$")


def _label(value) -> str:
    if pd.isna(value):
        return ""
    return re.sub(r"\s+", " ", str(value)).strip().casefold()


def _is_blank(value) -> bool:
    if value is None:
        return True
    try:
        if bool(pd.isna(value)):
            return True
    except (TypeError, ValueError):
        pass
    return not str(value).strip()


def _code(value):
    if _is_blank(value):
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        raw = str(value)
    elif isinstance(value, float):
        if not isfinite(value) or not value.is_integer():
            return None
        raw = format(value, ".0f")
    else:
        raw = str(value).strip()
        if re.fullmatch(r"\d+\.0+", raw):
            raw = raw.split(".")[0]
    return raw if CODE_PATTERN.fullmatch(raw) else None


def _parse_amount(value):
    if _is_blank(value):
        return None
    if isinstance(value, bool):
        raise ValueError("Nilai jumlah tidak boleh BOOLEAN.")
    if isinstance(value, (int, float, Decimal)):
        try:
            amount = Decimal(str(value))
        except InvalidOperation:
            raise ValueError("Nilai jumlah tidak valid.")
    else:
        raw = str(value).strip().replace("\u00a0", "").replace(" ", "")
        negative = raw.startswith("(") and raw.endswith(")")
        if negative:
            raw = raw[1:-1]
        if not NUMBER_PATTERN.fullmatch(raw):
            raise ValueError("Nilai jumlah bukan angka.")
        # Indonesian separators: 1.234.567,89 / 1.234.567 / 12,5.
        if "." in raw and "," in raw:
            if raw.rfind(",") > raw.rfind("."):
                raw = raw.replace(".", "").replace(",", ".")
            else:
                raw = raw.replace(",", "")
        elif "." in raw:
            if re.fullmatch(r"[+-]?\d{1,3}(?:\.\d{3})+", raw):
                raw = raw.replace(".", "")
        elif "," in raw:
            if re.fullmatch(r"[+-]?\d{1,3}(?:,\d{3})+", raw):
                raw = raw.replace(",", "")
            else:
                raw = raw.replace(",", ".")
        if negative:
            raw = "-" + raw
        try:
            amount = Decimal(raw)
        except InvalidOperation:
            raise ValueError("Nilai jumlah tidak valid.")
    if not amount.is_finite():
        raise ValueError("Nilai jumlah harus finite.")
    return amount


def _json_number(value: Decimal | None):
    if value is None:
        return None
    if value == value.to_integral_value():
        return int(value)
    # JSON does not support Decimal; string retains decimal precision.
    return format(value, "f")


def _detect_header(rows):
    found = []
    code_labels = {"sandi", "kode sandi", "kode akun", "kode rekening"}
    value_labels = {"jumlah", "nilai", "nominal", "saldo"}
    for index, row in enumerate(rows):
        norm = [_label(cell) for cell in row]
        codes = [i for i, txt in enumerate(norm) if txt in code_labels]
        values = [i for i, txt in enumerate(norm) if txt in value_labels]
        if codes and values:
            code = codes[0]
            amount = next((j for j in values if j != code), None)
            if amount is not None:
                found.append((index, code, amount))
    return found


def preview_pivot_excel(
    *,
    file_bytes: bytes,
    sheet_name: str,
    bank_id: str,
    bank_name: str,
    month: int,
    year: int,
    code_column: int | None = None,
    value_column: int | None = None,
):
    if not file_bytes or len(file_bytes) > MAX_FILE_BYTES:
        raise ValueError("Ukuran file pivot harus antara 1 byte dan 20 MB.")
    if not str(sheet_name or "").strip():
        raise ValueError("Pilih sheet Excel terlebih dahulu.")
    if not 1 <= int(month) <= 12 or not 1900 <= int(year) <= 2200:
        raise ValueError("Periode tidak valid.")

    try:
        df = pd.read_excel(
            io.BytesIO(file_bytes),
            sheet_name=sheet_name,
            header=None,
            dtype=object,
            nrows=MAX_ROWS + 1,
        )
    except Exception as exc:
        raise ValueError(f"Gagal membaca sheet Excel: {exc}") from exc

    if df.shape[0] > MAX_ROWS or df.shape[1] > MAX_COLUMNS:
        raise ValueError(
            f"Preview dibatasi hingga {MAX_ROWS:,} baris dan "
            f"{MAX_COLUMNS} kolom Excel."
        )

    rows = df.values.tolist()
    headers = _detect_header(rows)
    manual = code_column is not None or value_column is not None
    if manual:
        if code_column is None or value_column is None:
            raise ValueError("Kolom Sandi dan Jumlah harus dipilih bersama.")
        code_column, value_column = int(code_column), int(value_column)
        if (
            code_column < 0 or value_column < 0 or
            code_column >= df.shape[1] or value_column >= df.shape[1] or
            code_column == value_column
        ):
            raise ValueError("Pilihan kolom Sandi/Jumlah tidak valid.")
        current_pair = (code_column, value_column)
    else:
        if not headers:
            return {
                "status": "needs_mapping",
                "ready": False,
                "message": "Header Sandi/Jumlah belum terdeteksi. Pilih kolom secara manual.",
                "excel_columns": [
                    {"index": j, "label": f"Kolom {j+1} ({_letter(j)})"}
                    for j in range(df.shape[1])
                ],
                "header_candidates": [],
                "issues": [],
                "accounts": [],
                "wide_preview": None,
                "total_accounts": 0,
            }
        current_pair = (headers[0][1], headers[0][2])

    header_by_row = {index: (code, amount) for index, code, amount in headers}
    seen = {}
    issues = []
    skipped = 0
    numeric_code_count = 0
    empty_amount_count = 0
    first_header_row = min(header_by_row) if headers else -1

    for index, row in enumerate(rows):
        if index in header_by_row and not manual:
            current_pair = header_by_row[index]
            continue
        if index in header_by_row and manual:
            continue
        if not manual and index <= first_header_row:
            continue

        code_index, amount_index = current_pair
        if code_index >= len(row) or amount_index >= len(row):
            continue

        raw_code = row[code_index]
        code = _code(raw_code)
        if not code:
            if not _is_blank(raw_code) and re.match(r"^\d", str(raw_code).strip()):
                issues.append({
                    "row": index + 1,
                    "type": "invalid_sandi",
                    "message": f"Sandi '{str(raw_code)[:40]}' bukan kode numerik 4–18 digit.",
                })
            skipped += 1
            continue

        numeric_code_count += 1
        try:
            amount = _parse_amount(row[amount_index])
            if amount is None:
                empty_amount_count += 1
        except ValueError as exc:
            issues.append({
                "row": index + 1,
                "type": "invalid_amount",
                "code": code,
                "message": str(exc),
            })
            continue

        # Description is the nearest nonempty text to the left of Sandi.
        description = ""
        for candidate in reversed(row[:code_index]):
            if not _is_blank(candidate):
                description = str(candidate).strip()[:250]
                break

        if code in seen:
            issues.append({
                "row": index + 1,
                "type": "duplicate_sandi",
                "code": code,
                "message": f"Sandi {code} sudah ditemukan pada baris {seen[code]['source_row']}.",
            })
            continue

        seen[code] = {
            "code": code,
            "column_name": f"sandi_{code}",
            "description": description,
            "value": _json_number(amount),
            "value_is_missing": amount is None,
            "source_row": index + 1,
        }
        if len(seen) > MAX_ACCOUNTS:
            raise ValueError(
                f"Melebihi {MAX_ACCOUNTS} kode akun. Pivot seluruh akun "
                "ke kolom berisiko melewati batas PostgreSQL."
            )

    if not seen and not issues:
        issues.append({
            "row": None,
            "type": "no_data",
            "message": "Tidak ditemukan pasangan Sandi dan Jumlah yang dapat diproses.",
        })

    # NULL is a legitimate amount state for an existing Sandi, distinct
    # from zero. Its output column remains present for later periods.
    # PostgreSQL identifiers are limited to 63 bytes. All prefixed digit codes fit.
    accounts = list(seen.values())
    columns = ["bank_id", "bulan", "tahun"] + [a["column_name"] for a in accounts]
    safe = not issues and bool(accounts)

    preview_row = {"bank_id": str(bank_id), "bulan": int(month), "tahun": int(year)}
    for account in accounts:
        preview_row[account["column_name"]] = account["value"]

    return {
        "status": "success" if safe else "validation_error",
        "ready": safe,
        "save_enabled": False,
        "message": (
            "Preview valid. Penyimpanan Pivot belum diaktifkan pada tahap 7A.2.2.1."
            if safe else
            "Ditemukan masalah validasi. Koreksi data sumber sebelum proses penyimpanan diaktifkan."
        ),
        "bank_id": str(bank_id),
        "bank_name": str(bank_name),
        "bulan": int(month),
        "tahun": int(year),
        "sheet_name": sheet_name,
        "source_rows": len(rows),
        "total_accounts": len(accounts),
        "skipped_rows": skipped,
        "detected_account_rows": numeric_code_count,
        "empty_amount_accounts": sum(a["value_is_missing"] for a in accounts),
        "mapping_mode": "manual" if manual else "auto",
        "selected_columns": {
            "code_column": current_pair[0] if manual else None,
            "value_column": current_pair[1] if manual else None,
        },
        "header_candidates": [
            {"row": h + 1, "code_column": c, "value_column": v}
            for h, c, v in headers
        ],
        "excel_columns": [
            {"index": j, "label": f"Kolom {j+1} ({_letter(j)})"}
            for j in range(df.shape[1])
        ],
        "issues": issues[:100],
        "issue_count": len(issues),
        "output_columns": columns,
        "accounts": accounts,
        "wide_preview": preview_row,
    }


def _letter(index: int):
    value = index + 1
    result = ""
    while value:
        value, remainder = divmod(value - 1, 26)
        result = chr(65 + remainder) + result
    return result
