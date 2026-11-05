"""Bank OPS foundation: persistent profile and bank-scoped warehouse coverage.

7A.1 deliberately does NOT infer financial statement figures from arbitrary
warehouse columns. Financial metric mapping is reserved for 7A.2.
"""

from datetime import date, datetime

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    MetaData,
    String,
    Table,
    Text,
    func,
    inspect,
    insert,
    select,
    update,
)

from database.connection import engine
from database.table_service import get_all_tables
from master_data.banks import get_all_banks


OPS_BANK_PROFILE_TABLE_NAME = "warehouse_bank_profiles"

profile_metadata = MetaData()

bank_profiles_table = Table(
    OPS_BANK_PROFILE_TABLE_NAME,
    profile_metadata,
    Column("bank_id", String(32), primary_key=True),
    Column("legal_name", String(200), nullable=True),
    Column("address", Text, nullable=True),
    Column("city", String(120), nullable=True),
    Column("province", String(120), nullable=True),
    Column("website", String(255), nullable=True),
    Column("email", String(255), nullable=True),
    Column("phone", String(80), nullable=True),
    Column("status_pengawasan", String(120), nullable=True),
    Column("status_date", Date, nullable=True),
    Column("updated_at", DateTime(timezone=True), nullable=False,
           server_default=func.now()),
)

PROFILE_FIELDS = (
    "legal_name",
    "address",
    "city",
    "province",
    "website",
    "email",
    "phone",
    "status_pengawasan",
    "status_date",
)


def get_master_bank(bank_id: str) -> dict:
    """Resolve an ID only against the active BPR master, never by display name."""
    identifier = str(bank_id or "").strip()
    for bank in get_all_banks():
        if str(bank.get("bank_id")) == identifier:
            return dict(bank)
    raise ValueError(f"Bank dengan ID '{identifier}' tidak terdaftar.")


def ensure_bank_profiles_table() -> None:
    profile_metadata.create_all(engine, tables=[bank_profiles_table], checkfirst=True)


def _serialize_profile(row, bank_id: str) -> dict:
    result = {"bank_id": str(bank_id)}
    mapping = row._mapping if row is not None else {}
    for field in PROFILE_FIELDS:
        value = mapping.get(field)
        result[field] = value.isoformat() if isinstance(value, date) else value
    updated = mapping.get("updated_at")
    result["updated_at"] = (
        updated.isoformat() if isinstance(updated, datetime) else None
    )
    return result


def get_bank_profile(bank_id: str) -> dict:
    get_master_bank(bank_id)
    ensure_bank_profiles_table()
    with engine.connect() as connection:
        row = connection.execute(
            select(bank_profiles_table).where(
                bank_profiles_table.c.bank_id == str(bank_id)
            )
        ).first()
    return _serialize_profile(row, bank_id)


def save_bank_profile(bank_id: str, payload: dict) -> dict:
    get_master_bank(bank_id)
    ensure_bank_profiles_table()

    values = {}
    for field in PROFILE_FIELDS:
        raw = payload.get(field)
        if field == "status_date":
            if isinstance(raw, str):
                raw = date.fromisoformat(raw) if raw.strip() else None
            values[field] = raw
        else:
            values[field] = str(raw).strip() or None if raw is not None else None

    with engine.begin() as connection:
        exists = connection.execute(
            select(bank_profiles_table.c.bank_id).where(
                bank_profiles_table.c.bank_id == str(bank_id)
            )
        ).first()
        if exists:
            connection.execute(
                update(bank_profiles_table)
                .where(bank_profiles_table.c.bank_id == str(bank_id))
                .values(**values, updated_at=func.now())
            )
        else:
            connection.execute(
                insert(bank_profiles_table).values(bank_id=str(bank_id), **values)
            )

    return get_bank_profile(bank_id)


def _valid_period(year, month):
    try:
        year = int(year)
        month = int(month)
    except (TypeError, ValueError):
        return None
    if not (2000 <= year <= 2100 and 1 <= month <= 12):
        return None
    return f"{year:04d}-{month:02d}"


def get_bank_warehouse_coverage(bank_id: str) -> dict:
    """Read-only coverage: rows and periods, never unmasked cell values.

    Scans only catalog-visible tables containing all three system columns.
    A per-table read error does not make the bank profile unusable.
    """
    get_master_bank(bank_id)
    inspector = inspect(engine)
    tables = []
    period_totals = {}
    failed_tables = []

    for table_name in get_all_tables():
        try:
            column_names = {
                column["name"] for column in inspector.get_columns(table_name)
            }
            if not {"bank_id", "bulan", "tahun"}.issubset(column_names):
                continue

            table = Table(table_name, MetaData(), autoload_with=engine)
            statement = (
                select(
                    table.c.tahun.label("year"),
                    table.c.bulan.label("month"),
                    func.count().label("row_count"),
                )
                .where(table.c.bank_id == str(bank_id))
                .group_by(table.c.tahun, table.c.bulan)
            )
            with engine.connect() as connection:
                rows = connection.execute(statement).all()

            if not rows:
                continue

            row_count = 0
            periods = []
            for year, month, count in rows:
                count = int(count or 0)
                row_count += count
                period = _valid_period(year, month)
                if not period:
                    continue
                periods.append({"period": period, "row_count": count})
                if period not in period_totals:
                    period_totals[period] = {"row_count": 0, "table_names": set()}
                period_totals[period]["row_count"] += count
                period_totals[period]["table_names"].add(table_name)

            periods.sort(key=lambda item: item["period"], reverse=True)
            tables.append({
                "table_name": table_name,
                "row_count": row_count,
                "period_count": len(periods),
                "latest_period": periods[0]["period"] if periods else None,
                "periods": periods,
            })
        except Exception:
            # Keep the OPS usable if an individual warehouse table is inaccessible.
            # Do not include SQL/driver exception details in the API response.
            failed_tables.append(table_name)

    tables.sort(key=lambda item: (-item["row_count"], item["table_name"]))
    available_periods = [
        {
            "period": period,
            "row_count": item["row_count"],
            "table_count": len(item["table_names"]),
        }
        for period, item in sorted(period_totals.items(), reverse=True)
    ]

    return {
        "tables_with_data": len(tables),
        "rows_for_bank": sum(item["row_count"] for item in tables),
        "period_count": len(available_periods),
        "latest_period": (
            available_periods[0]["period"] if available_periods else None
        ),
        "available_periods": available_periods,
        "tables": tables,
        "failed_tables": failed_tables,
        "coverage_only": True,
        "financial_mapping_ready": False,
    }


def get_bank_ops_overview(bank_id: str) -> dict:
    bank = get_master_bank(bank_id)
    return {
        "bank": bank,
        "profile": get_bank_profile(bank_id),
        "coverage": get_bank_warehouse_coverage(bank_id),
        "ops_stage": "7A.1",
    }
