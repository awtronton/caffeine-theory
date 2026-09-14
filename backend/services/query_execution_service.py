from __future__ import annotations

import hashlib
import time
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import inspect, text

from database.connection import engine
from database.table_service import (
    MASK_VALUE,
    ensure_internal_tables,
    get_masked_columns,
    get_saved_query,
    get_table_column_details,
    get_table_relationships,
    register_materialized_output_metadata,
    validate_column_name,
    validate_table_name,
)
from services.query_preflight_service import (
    FILTER_OPERATORS,
    FILTER_VALUE_REQUIRED,
    run_query_preflight,
)


MAX_PREVIEW_ROWS = 200
DEFAULT_PREVIEW_ROWS = 100


def _quote_identifier(value: str) -> str:
    return '"' + str(value).replace('"', '""') + '"'


def _relationship_pairs(relationship: dict):
    pairs = relationship.get("column_pairs") or []
    if pairs:
        return pairs

    return [
        {
            "source_column": relationship["source_column"],
            "target_column": relationship["target_column"],
        }
    ]


def _column_key(table_name: str, column_name: str) -> str:
    return f"{table_name}::{column_name}"


def _output_alias(table_name: str, column_name: str) -> str:
    raw = f"{table_name}__{column_name}"
    if len(raw) <= 63:
        return raw
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:8]
    return f"{raw[:54]}_{digest}"


def _data_type_family(data_type: str | None):
    value = str(data_type or "").upper()

    if any(token in value for token in ("SMALLINT", "BIGINT", "INTEGER", "INT")):
        return "integer"

    if any(
        token in value
        for token in (
            "NUMERIC",
            "DECIMAL",
            "DOUBLE",
            "REAL",
            "FLOAT",
        )
    ):
        return "number"

    if "BOOLEAN" in value or value == "BOOL":
        return "boolean"

    if "TIMESTAMP" in value or "DATETIME" in value:
        return "datetime"

    if value == "DATE" or value.startswith("DATE"):
        return "date"

    return "text"


def _coerce_filter_value(data_type: str | None, value):
    family = _data_type_family(data_type)

    if value is None:
        return None

    if family == "integer":
        try:
            return int(str(value).strip())
        except (TypeError, ValueError) as error:
            raise ValueError(
                f"Nilai filter '{value}' harus berupa bilangan bulat."
            ) from error

    if family == "number":
        try:
            return Decimal(str(value).strip())
        except (InvalidOperation, TypeError, ValueError) as error:
            raise ValueError(
                f"Nilai filter '{value}' harus berupa angka."
            ) from error

    if family == "boolean":
        normalized = str(value).strip().lower()

        if normalized in {"true", "1", "yes", "ya"}:
            return True

        if normalized in {"false", "0", "no", "tidak"}:
            return False

        raise ValueError(
            f"Nilai filter '{value}' harus berupa true/false."
        )

    if family == "date":
        try:
            return date.fromisoformat(str(value).strip())
        except ValueError as error:
            raise ValueError(
                f"Nilai filter '{value}' harus menggunakan format tanggal YYYY-MM-DD."
            ) from error

    if family == "datetime":
        try:
            return datetime.fromisoformat(str(value).strip())
        except ValueError as error:
            raise ValueError(
                f"Nilai filter '{value}' harus menggunakan format tanggal/waktu ISO."
            ) from error

    return str(value)


def _build_user_filter_conditions(
    *,
    filters: list[dict],
    alias_by_table: dict[str, str],
    included_set: set[str],
):
    if not filters:
        return [], {}

    details_by_table = {
        table_name: {
            item["column_name"]: item
            for item in get_table_column_details(table_name)
        }
        for table_name in included_set
    }

    conditions: list[str] = []
    params: dict = {}

    for index, filter_item in enumerate(filters, start=1):
        table_name = validate_table_name(filter_item["table_name"])
        column_name = validate_column_name(filter_item["column_name"])
        operator = str(filter_item.get("operator") or "").strip().lower()
        value = filter_item.get("value")

        if table_name not in included_set:
            raise ValueError(
                f"Filter '{table_name}.{column_name}' menggunakan tabel yang tidak termasuk query."
            )

        column = details_by_table.get(table_name, {}).get(column_name)

        if column is None:
            raise ValueError(
                f"Kolom filter '{table_name}.{column_name}' tidak ditemukan."
            )

        if operator not in FILTER_OPERATORS:
            raise ValueError("Operator filter tidak didukung.")

        if operator in FILTER_VALUE_REQUIRED and (
            value is None or str(value).strip() == ""
        ):
            raise ValueError(
                f"Filter '{table_name}.{column_name}' memerlukan nilai."
            )

        alias = alias_by_table[table_name]
        expression = f"{alias}.{_quote_identifier(column_name)}"
        param_name = f"filter_{index}"

        if operator == "is_empty":
            conditions.append(
                f"({expression} IS NULL OR BTRIM(CAST({expression} AS TEXT)) = '')"
            )
            continue

        if operator == "is_not_empty":
            conditions.append(
                f"({expression} IS NOT NULL AND BTRIM(CAST({expression} AS TEXT)) <> '')"
            )
            continue

        if operator in {
            "contains",
            "not_contains",
            "starts_with",
            "ends_with",
        }:
            raw_text = str(value)

            if operator in {"contains", "not_contains"}:
                params[param_name] = f"%{raw_text}%"
            elif operator == "starts_with":
                params[param_name] = f"{raw_text}%"
            else:
                params[param_name] = f"%{raw_text}"

            comparator = "NOT ILIKE" if operator == "not_contains" else "ILIKE"
            conditions.append(
                f"CAST({expression} AS TEXT) {comparator} :{param_name}"
            )
            continue

        coerced_value = _coerce_filter_value(
            column.get("data_type"),
            value,
        )
        params[param_name] = coerced_value

        comparator_by_operator = {
            "equals": "=",
            "not_equals": "<>",
            "gt": ">",
            "gte": ">=",
            "lt": "<",
            "lte": "<=",
        }

        comparator = comparator_by_operator[operator]
        conditions.append(
            f"{expression} {comparator} :{param_name}"
        )

    return conditions, params


def _build_query_sql(
    *,
    base_table: str,
    joins: list[dict],
    selected_columns: list[dict],
    filters: list[dict],
    sort_by: dict | None,
    paginate: bool = True,
):
    base_table = validate_table_name(base_table)

    relationships = {
        int(item["id"]): item
        for item in get_table_relationships()
        if item.get("is_active")
    }

    included_tables = [base_table]
    included_set = {base_table}
    alias_by_table = {base_table: "t1"}
    join_steps = []

    for index, join in enumerate(joins, start=1):
        relationship_id = int(join["relationship_id"])
        relationship = relationships[relationship_id]

        source_table = relationship["source_table"]
        target_table = relationship["target_table"]

        source_included = source_table in included_set
        target_included = target_table in included_set

        if source_included == target_included:
            raise ValueError(
                f"Join ke-{index} tidak dapat dibentuk karena urutan relationship tidak valid."
            )

        existing_table = source_table if source_included else target_table
        new_table = target_table if source_included else source_table

        included_set.add(new_table)
        included_tables.append(new_table)
        alias_by_table[new_table] = f"t{len(included_tables)}"

        join_steps.append(
            {
                "relationship": relationship,
                "existing_table": existing_table,
                "new_table": new_table,
                "join_type": str(join["join_type"]).strip().upper(),
            }
        )

    output_columns = []
    used_aliases = set()

    for selected in selected_columns:
        table_name = validate_table_name(selected["table_name"])
        column_name = validate_column_name(selected["column_name"])

        if table_name not in included_set:
            raise ValueError(
                f"Kolom '{table_name}.{column_name}' tidak termasuk dalam query."
            )

        alias = _output_alias(table_name, column_name)
        if alias in used_aliases:
            raise ValueError("Nama output column bentrok setelah normalisasi identifier.")
        used_aliases.add(alias)

        output_columns.append(
            {
                "key": alias,
                "table_name": table_name,
                "column_name": column_name,
                "sql_alias": alias,
                "output_column": alias,
            }
        )

    if not output_columns:
        raise ValueError("Pilih minimal satu output column.")

    select_sql = ",\n".join(
        (
            f"    {alias_by_table[item['table_name']]}"
            f".{_quote_identifier(item['column_name'])} "
            f"AS {_quote_identifier(item['sql_alias'])}"
        )
        for item in output_columns
    )

    lines = [
        "SELECT",
        select_sql,
        (
            f"FROM {_quote_identifier(base_table)} "
            f"AS {alias_by_table[base_table]}"
        ),
    ]

    anti_filters: list[str] = []

    for step in join_steps:
        relationship = step["relationship"]
        new_table = step["new_table"]
        existing_table = step["existing_table"]
        join_type = step["join_type"]

        source_alias = alias_by_table[relationship["source_table"]]
        target_alias = alias_by_table[relationship["target_table"]]
        new_alias = alias_by_table[new_table]

        is_left_anti = join_type == "LEFT ANTI JOIN"
        is_right_anti = join_type == "RIGHT ANTI JOIN"
        is_full_anti = join_type == "FULL ANTI JOIN"

        sql_join_type = (
            "LEFT JOIN"
            if is_left_anti
            else "RIGHT JOIN"
            if is_right_anti
            else "FULL OUTER JOIN"
            if is_full_anti
            else join_type
        )

        lines.append(
            f"{sql_join_type} {_quote_identifier(new_table)} AS {new_alias}"
        )

        pairs = _relationship_pairs(relationship)
        join_conditions = [
            (
                f"{source_alias}.{_quote_identifier(pair['source_column'])} "
                f"= "
                f"{target_alias}.{_quote_identifier(pair['target_column'])}"
            )
            for pair in pairs
        ]

        lines.append(f"    ON {join_conditions[0]}")

        for condition in join_conditions[1:]:
            lines.append(f"    AND {condition}")

        primary_pair = pairs[0]

        if is_left_anti:
            new_column = (
                primary_pair["source_column"]
                if relationship["source_table"] == new_table
                else primary_pair["target_column"]
            )
            anti_filters.append(
                f"{new_alias}.{_quote_identifier(new_column)} IS NULL"
            )

        if is_right_anti:
            existing_alias = alias_by_table[existing_table]
            existing_column = (
                primary_pair["source_column"]
                if relationship["source_table"] == existing_table
                else primary_pair["target_column"]
            )
            anti_filters.append(
                f"{existing_alias}.{_quote_identifier(existing_column)} IS NULL"
            )

        if is_full_anti:
            anti_filters.append(
                "("
                f"{source_alias}.{_quote_identifier(primary_pair['source_column'])} "
                "IS NULL OR "
                f"{target_alias}.{_quote_identifier(primary_pair['target_column'])} "
                "IS NULL"
                ")"
            )

    user_filter_conditions, filter_params = (
        _build_user_filter_conditions(
            filters=filters,
            alias_by_table=alias_by_table,
            included_set=included_set,
        )
    )

    where_conditions = [
        *anti_filters,
        *user_filter_conditions,
    ]

    if where_conditions:
        lines.append("WHERE")
        lines.append(
            "\n".join(
                (
                    f"    {condition}"
                    if index == 0
                    else f"    AND {condition}"
                )
                for index, condition in enumerate(where_conditions)
            )
        )

    if sort_by:
        sort_table = validate_table_name(sort_by["table_name"])
        sort_column = validate_column_name(sort_by["column_name"])
        sort_direction = str(sort_by.get("direction") or "asc").strip().lower()

        if sort_table not in included_set:
            raise ValueError("Kolom sort berasal dari tabel yang tidak termasuk query.")

        if sort_direction not in {"asc", "desc"}:
            raise ValueError("Arah sort tidak valid.")

        lines.append(
            "ORDER BY "
            f"{alias_by_table[sort_table]}.{_quote_identifier(sort_column)} "
            f"{sort_direction.upper()} NULLS LAST"
        )

    if paginate:
        lines.append("LIMIT :preview_limit")
        lines.append("OFFSET :preview_offset")

    return "\n".join(lines), output_columns, filter_params


def execute_query_preview(
    *,
    base_table: str,
    joins: list[dict] | None = None,
    selected_columns: list[dict] | None = None,
    filters: list[dict] | None = None,
    sort_by: dict | None = None,
    page: int = 1,
    page_size: int = DEFAULT_PREVIEW_ROWS,
    unmask_columns: list[dict] | None = None,
):
    joins = list(joins or [])
    selected_columns = list(selected_columns or [])
    filters = list(filters or [])
    sort_by = dict(sort_by or {}) if sort_by else None
    unmask_columns = list(unmask_columns or [])

    preflight = run_query_preflight(
        base_table=base_table,
        joins=joins,
        selected_columns=selected_columns,
        filters=filters,
        sort_by=sort_by,
    )

    if not preflight["can_execute"]:
        raise ValueError(
            "Query belum valid. Perbaiki query berdasarkan hasil preflight sebelum menjalankan preview."
        )

    page = max(1, int(page or 1))
    page_size = max(
        1,
        min(
            int(page_size or DEFAULT_PREVIEW_ROWS),
            MAX_PREVIEW_ROWS,
        ),
    )
    preview_offset = (page - 1) * page_size

    sql, output_columns, filter_params = _build_query_sql(
        base_table=base_table,
        joins=joins,
        selected_columns=selected_columns,
        filters=filters,
        sort_by=sort_by,
        paginate=True,
    )

    selected_keys = {
        _column_key(item["table_name"], item["column_name"])
        for item in output_columns
    }

    unmask_keys = set()

    for item in unmask_columns:
        table_name = validate_table_name(item["table_name"])
        column_name = validate_column_name(item["column_name"])
        key = _column_key(table_name, column_name)

        if key not in selected_keys:
            raise ValueError(
                f"Kolom '{table_name}.{column_name}' tidak termasuk output query."
            )

        unmask_keys.add(key)

    masked_by_table = {
        table_name: get_masked_columns(table_name)
        for table_name in preflight["tables"]
    }

    column_metadata = []

    for item in output_columns:
        key = _column_key(item["table_name"], item["column_name"])
        masked = (
            item["column_name"]
            in masked_by_table.get(item["table_name"], set())
        )

        column_metadata.append(
            {
                "key": item["key"],
                "table_name": item["table_name"],
                "column_name": item["column_name"],
                "masked": masked,
                "unmasked": masked and key in unmask_keys,
            }
        )

    started = time.perf_counter()

    # Fetch one extra row only to determine whether a next page exists.
    execution_limit = page_size + 1

    with engine.begin() as connection:
        # Defense in depth: even though SQL is generated only as SELECT,
        # keep the database transaction read-only and bounded.
        connection.execute(text("SET TRANSACTION READ ONLY"))
        connection.execute(text("SET LOCAL statement_timeout = '8000ms'"))

        raw_rows = (
            connection.execute(
                text(sql),
                {
                    **filter_params,
                    "preview_limit": execution_limit,
                    "preview_offset": preview_offset,
                },
            )
            .mappings()
            .all()
        )

    elapsed_ms = round(
        (time.perf_counter() - started) * 1000,
        2,
    )

    has_more = len(raw_rows) > page_size
    raw_rows = raw_rows[:page_size]

    metadata_by_key = {
        item["key"]: item
        for item in column_metadata
    }

    rows = []

    for raw_row in raw_rows:
        serialized = {}

        for key, value in dict(raw_row).items():
            metadata = metadata_by_key[key]

            if (
                metadata["masked"]
                and not metadata["unmasked"]
                and value is not None
            ):
                serialized[key] = MASK_VALUE
            else:
                serialized[key] = value

        rows.append(serialized)

    returned_rows = len(rows)
    page_start = (
        preview_offset + 1
        if returned_rows > 0
        else 0
    )
    page_end = (
        preview_offset + returned_rows
        if returned_rows > 0
        else 0
    )

    return {
        "rows": rows,
        "columns": column_metadata,
        "returned_rows": returned_rows,
        "limit": page_size,
        "page": page,
        "page_size": page_size,
        "page_start": page_start,
        "page_end": page_end,
        "has_previous": page > 1,
        "has_more": has_more,
        "filter_count": len(filters),
        "sort_by": sort_by,
        "elapsed_ms": elapsed_ms,
        "read_only": True,
        "preflight": preflight,
    }


def execute_query_materialization(
    *,
    output_table_name: str,
    description: str | None,
    base_table: str,
    joins: list[dict] | None = None,
    selected_columns: list[dict] | None = None,
    filters: list[dict] | None = None,
    sort_by: dict | None = None,
    source_saved_query_id: int | None = None,
):
    joins = list(joins or [])
    selected_columns = list(selected_columns or [])
    filters = list(filters or [])
    sort_by = dict(sort_by or {}) if sort_by else None
    output_table_name = validate_table_name(output_table_name)
    ensure_internal_tables()
    if inspect(engine).has_table(output_table_name):
        raise ValueError(f"Tabel '{output_table_name}' sudah tersedia. Gunakan nama output table yang berbeda.")

    preflight = run_query_preflight(
        base_table=base_table, joins=joins, selected_columns=selected_columns, filters=filters, sort_by=sort_by
    )
    if not preflight["can_execute"]:
        raise ValueError("Query belum valid. Perbaiki query berdasarkan hasil preflight sebelum membuat output table.")

    query_definition = {
        "base_table": base_table,
        "joins": joins,
        "selected_columns": selected_columns,
        "filters": filters,
        "sort_by": sort_by,
    }
    if source_saved_query_id is not None:
        saved_query = get_saved_query(int(source_saved_query_id))
        if saved_query.get("query_definition") != query_definition:
            raise ValueError("Query saat ini berbeda dari Saved Query yang dipilih. Simpan perubahan terlebih dahulu atau buat output table tanpa referensi Saved Query.")

    sql, output_columns, filter_params = _build_query_sql(
        base_table=base_table, joins=joins, selected_columns=selected_columns, filters=filters, sort_by=sort_by, paginate=False
    )
    masked_by_table = {name: get_masked_columns(name) for name in preflight["tables"]}
    materialized_columns = []
    masked_output_columns = []
    for item in output_columns:
        masked = item["column_name"] in masked_by_table.get(item["table_name"], set())
        materialized_columns.append({
            "table_name": item["table_name"],
            "column_name": item["column_name"],
            "output_column": item["output_column"],
            "masked": masked,
        })
        if masked:
            masked_output_columns.append(item["output_column"])

    create_sql = f"CREATE TABLE {_quote_identifier(output_table_name)} AS\n{sql}"
    started = time.perf_counter()
    with engine.begin() as connection:
        connection.execute(text("SET LOCAL statement_timeout = '120000ms'"))
        connection.execute(text("SET LOCAL lock_timeout = '5000ms'"))
        result = connection.execute(text(create_sql), filter_params)
        row_count = int(result.rowcount) if result.rowcount is not None and result.rowcount >= 0 else None
        lineage = register_materialized_output_metadata(
            connection=connection,
            output_table=output_table_name,
            description=description,
            base_table=base_table,
            source_tables=preflight["tables"],
            query_definition=query_definition,
            output_columns=materialized_columns,
            masked_output_columns=masked_output_columns,
            source_saved_query_id=source_saved_query_id,
            row_count=row_count,
        )
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    return {
        "output_table": output_table_name,
        "description": str(description).strip() if description else None,
        "row_count": lineage["row_count"],
        "column_count": len(materialized_columns),
        "source_tables": preflight["tables"],
        "output_columns": materialized_columns,
        "masked_output_columns": masked_output_columns,
        "source_saved_query_id": source_saved_query_id,
        "lineage_id": lineage["lineage_id"],
        "elapsed_ms": elapsed_ms,
        "preflight": preflight,
    }
