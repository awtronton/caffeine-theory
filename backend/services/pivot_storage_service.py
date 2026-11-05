"""7A.2.2.2: transactional, metadata-driven wide-format pivot warehouse storage.

Only tables registered as Smart Pivot tables accept pivot uploads. Unrelated
warehouse tables are never modified by this service.
"""
from __future__ import annotations

import hashlib
from decimal import Decimal, InvalidOperation

from sqlalchemy import Column, Integer, MetaData, Numeric, String, Table, UniqueConstraint, delete, func, inspect, select, text
from sqlalchemy.exc import IntegrityError

from database import table_service as warehouse
from services.smart_pivot_service import preview_pivot_excel, MAX_ACCOUNTS

SYSTEM = ("bank_id", "bulan", "tahun")


def _advisory_lock(connection, table_name):
    # Serialize concurrent pivot imports and DDL on the same table in PostgreSQL.
    if connection.dialect.name == "postgresql":
        connection.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
            {"key": "caffeine_pivot:" + table_name},
        )


def _pivot_result_to_row(preview):
    row = {
        "bank_id": str(preview["bank_id"]),
        "bulan": int(preview["bulan"]),
        "tahun": int(preview["tahun"]),
    }
    for account in preview["accounts"]:
        raw = account["value"]
        if raw is None:
            row[account["column_name"]] = None
        else:
            try:
                value = Decimal(str(raw))
            except InvalidOperation as exc:
                raise ValueError(f"Nilai {account['code']} tidak numerik.") from exc
            if not value.is_finite() or len(value.as_tuple().digits) > 30:
                raise ValueError(f"Nilai sandi {account['code']} melebihi presisi penyimpanan.")
            if value.as_tuple().exponent < -8:
                raise ValueError(f"Nilai sandi {account['code']} memiliki lebih dari 8 desimal.")
            row[account["column_name"]] = value
    return row


def store_pivot_excel(*, file_bytes, sheet_name, bank_id, bank_name, month, year,
                      table_name, action="block", table_mode="new", filename=None,
                      code_column=None, value_column=None):
    """Validate then create/append/replace exactly one bank-period row.

    DDL, data write, schema-mapping updates, and audit metadata are atomic.
    """
    table_name = warehouse.validate_table_name(table_name)
    action = str(action).strip().lower()
    table_mode = str(table_mode).strip().lower()
    if table_mode not in {"new", "existing"}:
        raise ValueError("Mode tabel harus 'new' atau 'existing'.")
    if action not in {"block", "replace"}:
        raise ValueError("Aksi harus 'block' atau 'replace'.")

    preview = preview_pivot_excel(
        file_bytes=file_bytes, sheet_name=sheet_name,
        bank_id=bank_id, bank_name=bank_name,
        month=month, year=year,
        code_column=code_column, value_column=value_column,
    )
    if not preview.get("ready"):
        raise ValueError(
            "Preview belum valid; perbaiki duplikasi Sandi, kode atau jumlah. "
            + str(preview.get("message", ""))
        )
    row = _pivot_result_to_row(preview)
    incoming = [a["column_name"] for a in preview["accounts"]]
    new_columns = []
    previous_rows = 0
    created = False
    sha256 = hashlib.sha256(file_bytes).hexdigest()

    warehouse.ensure_internal_tables()
    try:
        with warehouse.engine.begin() as conn:
            _advisory_lock(conn, table_name)
            registered = conn.execute(
                select(warehouse.pivot_tables_table.c.table_name).where(
                    warehouse.pivot_tables_table.c.table_name == table_name
                )
            ).scalar_one_or_none()
            exists = inspect(conn).has_table(table_name)

            if table_mode == "new" and exists:
                raise ValueError(
                    f"Tabel '{table_name}' sudah ada. "
                    "Pilih mode tabel existing untuk menambah periode."
                )
            if table_mode == "existing" and not exists:
                raise ValueError(
                    f"Tabel '{table_name}' belum tersedia. "
                    "Pilih mode buat tabel baru."
                )
            if exists and registered is None:
                raise ValueError(
                    f"Tabel '{table_name}' sudah ada tetapi bukan hasil Smart Pivot. "
                    "Gunakan tabel lain agar data existing tidak diubah."
                )
            if registered is not None and not exists:
                raise ValueError(
                    "Metadata pivot ditemukan namun tabel fisik tidak ada; "
                    "hubungi administrator untuk pemeriksaan metadata."
                )

            if not exists:
                created = True
                schema = MetaData()
                t = Table(
                    table_name, schema,
                    Column("bank_id", String(64), nullable=False),
                    Column("bulan", Integer, nullable=False),
                    Column("tahun", Integer, nullable=False),
                    *[Column(name, Numeric(30, 8), nullable=True) for name in incoming],
                    UniqueConstraint("bank_id", "bulan", "tahun", name="uq_pivot_bank_period"),
                )
                t.create(conn)
                conn.execute(warehouse.pivot_tables_table.insert().values(table_name=table_name))
                new_columns = incoming[:]
                warehouse._insert_schema_mapping(
                    conn, table_name,
                    [{"source_ordinal": n, "source_column": col,
                      "database_column": col}
                     for n, col in enumerate(incoming, 1)],
                )
                warehouse._ensure_table_state_connection(conn, table_name)
            else:
                actual = inspect(conn).get_columns(table_name)
                actual_by_name = {x["name"]: x for x in actual}
                if not set(SYSTEM).issubset(actual_by_name):
                    raise ValueError("Schema pivot tidak memiliki semua kolom identitas.")
                # Do not grow beyond PostgreSQL's 1600-column limit.
                new_columns = [name for name in incoming if name not in actual_by_name]
                if len(actual) + len(new_columns) > 1500:
                    raise ValueError("Schema pivot melebihi batas aman 1500 kolom.")
                for name in new_columns:
                    warehouse.validate_column_name(name)
                    # Identifiers are whitelisted as [A-Za-z_][A-Za-z0-9_]*.
                    conn.execute(text(f'ALTER TABLE "{table_name}" '
                                      f'ADD COLUMN "{name}" NUMERIC(30,8)'))
                if new_columns:
                    existing_ord = conn.execute(
                        select(func.coalesce(func.max(
                            warehouse.schema_mapping_table.c.source_ordinal), 0
                        )).where(warehouse.schema_mapping_table.c.table_name == table_name)
                    ).scalar_one()
                    conn.execute(warehouse.schema_mapping_table.insert(), [
                        {"table_name": table_name, "source_ordinal": existing_ord + i,
                         "source_column": name, "database_column": name}
                        for i, name in enumerate(new_columns, 1)
                    ])
                t = Table(table_name, MetaData(), autoload_with=conn)
                # Validate data columns are NUMERIC and not e.g. TEXT after a manual edit.
                for name in incoming:
                    if not isinstance(t.c[name].type, Numeric):
                        raise ValueError(f"Kolom {name} bukan tipe NUMERIC.")

            t = Table(table_name, MetaData(), autoload_with=conn) if created else t
            previous_rows = int(conn.execute(
                select(func.count()).select_from(t).where(
                    t.c.bank_id == row["bank_id"],
                    t.c.bulan == row["bulan"],
                    t.c.tahun == row["tahun"],
                )
            ).scalar_one())
            if previous_rows:
                if action == "block":
                    raise PivotPeriodExists(table_name, bank_name, month, year, previous_rows)
                if previous_rows != 1:
                    raise ValueError("Periode memiliki lebih dari satu baris; replace dibatalkan.")
                conn.execute(delete(t).where(
                    t.c.bank_id == row["bank_id"],
                    t.c.bulan == row["bulan"],
                    t.c.tahun == row["tahun"],
                ))

            conn.execute(t.insert().values(**row))
            for account in preview["accounts"]:
                existing = conn.execute(select(
                    warehouse.pivot_columns_table.c.id,
                    warehouse.pivot_columns_table.c.description,
                ).where(
                    warehouse.pivot_columns_table.c.table_name == table_name,
                    warehouse.pivot_columns_table.c.column_name == account["column_name"],
                )).mappings().first()
                description = account.get("description") or None
                if existing:
                    # Keep first nonblank description unless it was blank.
                    if description and not existing["description"]:
                        conn.execute(warehouse.pivot_columns_table.update().where(
                            warehouse.pivot_columns_table.c.id == existing["id"]
                        ).values(description=description, source_sheet=sheet_name,
                                 source_row=account.get("source_row")))
                else:
                    conn.execute(warehouse.pivot_columns_table.insert().values(
                        table_name=table_name,
                        column_name=account["column_name"],
                        account_code=account["code"],
                        description=description,
                        source_sheet=sheet_name,
                        source_row=account.get("source_row"),
                    ))

            conn.execute(warehouse.pivot_upload_log_table.insert().values(
                table_name=table_name, bank_id=row["bank_id"],
                bulan=row["bulan"], tahun=row["tahun"],
                filename=str(filename or "")[:255], sheet_name=str(sheet_name)[:255],
                file_sha256=sha256, action="replace" if previous_rows else "insert",
                account_count=len(incoming), previous_rows=previous_rows,
            ))
            if not created:
                warehouse._bump_table_data_version_connection(conn, table_name)
    except IntegrityError as exc:
        raise ValueError("Data bank-periode sudah tersedia atau metadata duplikat.") from exc

    # Noncritical profiling cache invalidation must not roll back successful save.
    try:
        warehouse._mark_table_profile_stale_best_effort(
            table_name, "pivot_period_replaced" if previous_rows else "pivot_rows_inserted"
        )
    except Exception:
        pass

    return {
        "status": "success", "table_name": table_name,
        "mode": "new" if created else "existing",
        "bank_name": bank_name, "bank_id": row["bank_id"],
        "bulan": row["bulan"], "tahun": row["tahun"],
        "inserted_rows": 1, "replaced_rows": previous_rows,
        "new_columns": new_columns, "new_column_count": len(new_columns),
        "total_accounts": len(incoming), "total_columns": len(t.c),
        "file_sha256": sha256,
    }


class PivotPeriodExists(Exception):
    def __init__(self, table_name, bank_name, month, year, row_count):
        self.detail = {
            "code": "PIVOT_PERIOD_EXISTS",
            "message": f"Data {bank_name} periode {month}/{year} sudah tersedia.",
            "table_name": table_name,
            "bank_name": bank_name,
            "month": month, "year": year,
            "row_count": row_count,
        }
        super().__init__(self.detail["message"])
