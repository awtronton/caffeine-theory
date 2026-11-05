"""7A.2.2.4 — Transactional, validated ADD COLUMN for warehouse tables.

Static optional backfill only. Calculated expressions are NOT accepted in this API.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import inspect, text, func, select

from database.connection import engine
from database.table_service import (
    SYSTEM_COLUMNS, ensure_internal_tables, schema_mapping_table,
    validate_table_name, validate_column_name, _ensure_table_state_connection,
)
from services.manual_table_service import TYPES

NAME_RE = re.compile(r"[a-z][a-z0-9_]{0,62}\Z")
COLUMN_LIMIT = 1500  # Reserve PostgreSQL room for future schema evolution.


def _parse_default(raw, dtype):
    """Typed scalar, not SQL. No expressions or functions are permitted."""
    if raw is None:
        return None
    if not isinstance(raw, str) or len(raw) > 1000:
        raise ValueError("Nilai default harus berupa teks pendek (maks. 1000 karakter).")
    val = raw.strip()
    if dtype in {"TEXT", "VARCHAR(255)"}:
        if dtype == "VARCHAR(255)" and len(raw) > 255:
            raise ValueError("Default VARCHAR melebihi 255 karakter.")
        return raw
    if dtype in {"INTEGER", "BIGINT"}:
        if not re.fullmatch(r"[+-]?\d+", val):
            raise ValueError("Default INTEGER/BIGINT harus bilangan bulat.")
        number = int(val)
        bound = 2**31 if dtype == "INTEGER" else 2**63
        if not -bound <= number < bound:
            raise ValueError("Default melebihi rentang integer.")
        return number
    if dtype == "NUMERIC":
        try:
            num = Decimal(val)
        except InvalidOperation as error:
            raise ValueError("Default NUMERIC bukan angka yang valid.") from error
        if not num.is_finite() or len(num.as_tuple().digits) > 28 or -num.as_tuple().exponent > 8:
            raise ValueError("Default NUMERIC di luar NUMERIC(28,8).")
        return num
    if dtype == "BOOLEAN":
        if val.lower() not in {"true", "false", "1", "0"}:
            raise ValueError("Default BOOLEAN hanya menerima true/false atau 1/0.")
        return val.lower() in {"true", "1"}
    if dtype == "DATE":
        try:
            return date.fromisoformat(val)
        except ValueError as error:
            raise ValueError("Default DATE harus YYYY-MM-DD.") from error
    if dtype == "TIMESTAMP":
        try:
            parsed = datetime.fromisoformat(val)
            if parsed.tzinfo is not None:
                raise ValueError("Default TIMESTAMP tidak menerima zona waktu.")
            return parsed
        except ValueError as error:
            raise ValueError("Default TIMESTAMP harus YYYY-MM-DD HH:MM:SS.") from error
    raise ValueError("Tipe data tidak didukung.")


def add_manual_column(*, table_name, column_name, data_type, nullable=True,
                      default_value=None):
    table_name = validate_table_name(table_name)
    column_name = validate_column_name(column_name)
    if not NAME_RE.fullmatch(column_name):
        raise ValueError("Nama kolom harus diawali huruf kecil dan hanya a-z, 0-9, underscore.")
    if column_name in SYSTEM_COLUMNS:
        raise ValueError("Kolom bank_id, bulan, dan tahun adalah kolom sistem.")
    if not isinstance(nullable, bool):
        raise ValueError("nullable harus boolean.")
    data_type = str(data_type).upper().strip()
    if data_type not in TYPES:
        raise ValueError("Tipe data tidak didukung.")
    parsed_default = _parse_default(default_value, data_type)

    ensure_internal_tables()
    with engine.begin() as connection:
        inspector = inspect(connection)
        if not inspector.has_table(table_name):
            raise ValueError(f"Tabel '{table_name}' tidak ditemukan.")
        existing = {col['name'].lower() for col in inspector.get_columns(table_name)}
        if column_name.lower() in existing:
            raise ValueError(f"Kolom '{column_name}' sudah ada di tabel '{table_name}'.")
        if len(existing) >= COLUMN_LIMIT:
            raise ValueError("Jumlah kolom sudah mencapai batas aman 1500.")

        prep = connection.dialect.identifier_preparer
        quoted_table = prep.quote(table_name)
        quoted_column = prep.quote(column_name)
        dtype_sql = TYPES[data_type]().compile(dialect=connection.dialect)

        # Column addition, optional data backfill, and metadata must succeed together.
        connection.execute(text(f'ALTER TABLE {quoted_table} ADD COLUMN {quoted_column} {dtype_sql}'))
        if parsed_default is not None:
            connection.execute(
                text(f'UPDATE {quoted_table} SET {quoted_column} = :value'),
                {'value': parsed_default},
            )
        elif not nullable:
            count = connection.execute(text(f'SELECT EXISTS (SELECT 1 FROM {quoted_table} LIMIT 1)')).scalar()
            if count:
                raise ValueError("Kolom NOT NULL pada tabel berisi data memerlukan nilai default untuk backfill.")

        if not nullable:
            if connection.dialect.name == 'postgresql':
                connection.execute(text(f'ALTER TABLE {quoted_table} ALTER COLUMN {quoted_column} SET NOT NULL'))
            elif connection.dialect.name != 'sqlite':
                raise ValueError("Pengaturan NOT NULL belum didukung untuk database ini.")
            else:
                # SQLite unit tests use nullable columns. Fail closed for NOT NULL.
                raise ValueError("Pengaturan NOT NULL memerlukan PostgreSQL.")

        last_ordinal = connection.execute(
            select(func.max(schema_mapping_table.c.source_ordinal)).where(
                schema_mapping_table.c.table_name == table_name
            )
        ).scalar()
        connection.execute(schema_mapping_table.insert().values(
            table_name=table_name,
            source_ordinal=int(last_ordinal or 0) + 1,
            source_column=column_name,
            database_column=column_name,
        ))
        _ensure_table_state_connection(connection, table_name)

    return {
        'status': 'success', 'table_name': table_name,
        'column_name': column_name, 'data_type': data_type,
        'nullable': nullable, 'backfilled': parsed_default is not None,
        'mode': 'manual_column',
    }
