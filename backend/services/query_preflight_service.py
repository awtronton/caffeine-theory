from __future__ import annotations

from database.table_service import (
    get_table_column_details,
    get_table_relationships,
    table_exists,
)


ALLOWED_JOIN_TYPES = {
    "INNER JOIN",
    "LEFT JOIN",
    "RIGHT JOIN",
    "FULL OUTER JOIN",
    "LEFT ANTI JOIN",
    "RIGHT ANTI JOIN",
    "FULL ANTI JOIN",
}


FILTER_OPERATORS = {
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "starts_with",
    "ends_with",
    "gt",
    "gte",
    "lt",
    "lte",
    "is_empty",
    "is_not_empty",
}

FILTER_VALUE_REQUIRED = FILTER_OPERATORS - {
    "is_empty",
    "is_not_empty",
}


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


def _issue(
    severity: str,
    code: str,
    title: str,
    message: str,
    *,
    context: dict | None = None,
):
    return {
        "severity": severity,
        "code": code,
        "title": title,
        "message": message,
        "context": context or {},
    }


def _relationship_pairs(relationship: dict):
    pairs = relationship.get("column_pairs") or []
    if pairs:
        return pairs

    return [
        {
            "source_column": relationship.get("source_column"),
            "target_column": relationship.get("target_column"),
            "compatible": relationship.get("compatible", True),
        }
    ]


def run_query_preflight(
    *,
    base_table: str,
    joins: list[dict] | None = None,
    selected_columns: list[dict] | None = None,
    filters: list[dict] | None = None,
    sort_by: dict | None = None,
):
    """Validate a Visual SQL Builder plan before execution.

    The service validates the structured query plan instead of accepting raw SQL.
    This keeps the preflight deterministic and prevents the validation endpoint from
    becoming a generic SQL execution surface.
    """

    base_table = str(base_table or "").strip()
    joins = list(joins or [])
    selected_columns = list(selected_columns or [])
    filters = list(filters or [])
    sort_by = dict(sort_by or {}) if sort_by else None

    issues: list[dict] = []
    included_tables: list[str] = []
    included_set: set[str] = set()

    if not base_table:
        issues.append(
            _issue(
                "error",
                "base_table_required",
                "Pilih base table",
                "Pilih tabel utama untuk memulai query.",
            )
        )
    elif not table_exists(base_table):
        issues.append(
            _issue(
                "error",
                "base_table_missing",
                "Base table tidak ditemukan",
                f"Tabel '{base_table}' sudah tidak tersedia di Data Warehouse.",
                context={"table_name": base_table},
            )
        )
    else:
        included_tables.append(base_table)
        included_set.add(base_table)

    relationships = {
        int(item["id"]): item
        for item in get_table_relationships()
        if item.get("is_active")
    }

    validated_join_count = 0

    if included_set:
        for index, join in enumerate(joins, start=1):
            raw_relationship_id = join.get("relationship_id")
            join_type = str(join.get("join_type") or "").strip().upper()

            try:
                relationship_id = int(raw_relationship_id)
            except (TypeError, ValueError):
                relationship_id = None

            if relationship_id is None or relationship_id not in relationships:
                issues.append(
                    _issue(
                        "error",
                        "relationship_missing",
                        "Relationship tidak tersedia",
                        f"Join ke-{index} menggunakan relationship yang sudah tidak aktif atau tidak ditemukan.",
                        context={"join_index": index},
                    )
                )
                continue

            if join_type not in ALLOWED_JOIN_TYPES:
                issues.append(
                    _issue(
                        "error",
                        "join_type_invalid",
                        "Join type tidak didukung",
                        f"Join ke-{index} menggunakan tipe join yang tidak dikenali.",
                        context={
                            "join_index": index,
                            "join_type": join_type,
                        },
                    )
                )
                continue

            relationship = relationships[relationship_id]
            source_table = relationship["source_table"]
            target_table = relationship["target_table"]
            source_included = source_table in included_set
            target_included = target_table in included_set

            if source_included == target_included:
                issues.append(
                    _issue(
                        "error",
                        "join_path_invalid",
                        "Urutan join perlu diperbaiki",
                        "Relationship harus menghubungkan satu tabel yang sudah ada di query dengan satu tabel baru.",
                        context={
                            "join_index": index,
                            "relationship_id": relationship_id,
                        },
                    )
                )
                continue

            new_table = target_table if source_included else source_table

            if not table_exists(new_table):
                issues.append(
                    _issue(
                        "error",
                        "join_table_missing",
                        "Tabel join tidak ditemukan",
                        f"Tabel '{new_table}' sudah tidak tersedia di Data Warehouse.",
                        context={
                            "join_index": index,
                            "table_name": new_table,
                        },
                    )
                )
                continue

            pair_incompatible = [
                pair
                for pair in _relationship_pairs(relationship)
                if pair.get("compatible") is False
            ]

            if pair_incompatible or relationship.get("compatible") is False:
                issues.append(
                    _issue(
                        "error",
                        "join_datatype_incompatible",
                        "Kolom relationship tidak kompatibel",
                        "Datatype pada relationship ini berbeda. Sesuaikan relationship atau datatype sebelum query dijalankan.",
                        context={
                            "join_index": index,
                            "relationship_id": relationship_id,
                            "table_name": new_table,
                        },
                    )
                )

            cardinality = str(relationship.get("cardinality") or "")
            if cardinality == "many_to_many":
                issues.append(
                    _issue(
                        "warning",
                        "many_to_many_join",
                        "Join dapat memperbanyak baris",
                        f"Relationship menuju '{new_table}' bertipe many-to-many. Hasil query dapat memiliki lebih banyak baris dari tabel asal.",
                        context={
                            "join_index": index,
                            "relationship_id": relationship_id,
                            "table_name": new_table,
                            "cardinality": cardinality,
                        },
                    )
                )

            included_set.add(new_table)
            included_tables.append(new_table)
            validated_join_count += 1

    column_details_by_table: dict[str, dict[str, dict]] = {}

    for table_name in included_tables:
        try:
            column_details_by_table[table_name] = {
                item["column_name"]: item
                for item in get_table_column_details(table_name)
            }
        except ValueError:
            column_details_by_table[table_name] = {}

    if not selected_columns:
        issues.append(
            _issue(
                "error",
                "output_column_required",
                "Pilih output column",
                "Pilih minimal satu kolom yang akan ditampilkan pada hasil query.",
            )
        )

    selected_keys: set[tuple[str, str]] = set()
    valid_selected_count = 0

    for position, selected in enumerate(selected_columns, start=1):
        table_name = str(selected.get("table_name") or "").strip()
        column_name = str(selected.get("column_name") or "").strip()
        key = (table_name, column_name)

        if key in selected_keys:
            continue
        selected_keys.add(key)

        if table_name not in included_set:
            issues.append(
                _issue(
                    "error",
                    "output_table_not_in_query",
                    "Output column tidak valid",
                    f"Kolom '{column_name}' berasal dari tabel yang tidak termasuk dalam query.",
                    context={
                        "position": position,
                        "table_name": table_name,
                        "column_name": column_name,
                    },
                )
            )
            continue

        column = column_details_by_table.get(table_name, {}).get(column_name)
        if column is None:
            issues.append(
                _issue(
                    "error",
                    "output_column_missing",
                    "Kolom tidak ditemukan",
                    f"Kolom '{column_name}' sudah tidak tersedia pada tabel '{table_name}'.",
                    context={
                        "position": position,
                        "table_name": table_name,
                        "column_name": column_name,
                    },
                )
            )
            continue

        if column.get("masked"):
            issues.append(
                _issue(
                    "info",
                    "masked_output_column",
                    "Output akan dimasking",
                    (
                        f"Kolom '{column_name}' pada tabel '{table_name}' "
                        "dapat digunakan sebagai output. Nilai akan ditampilkan "
                        "dalam kondisi masked secara default pada hasil query dan "
                        "dapat di-unmask dari output table sesuai kontrol akses."
                    ),
                    context={
                        "position": position,
                        "table_name": table_name,
                        "column_name": column_name,
                        "masked": True,
                    },
                )
            )

        valid_selected_count += 1

    valid_filter_count = 0

    for position, filter_item in enumerate(filters, start=1):
        table_name = str(filter_item.get("table_name") or "").strip()
        column_name = str(filter_item.get("column_name") or "").strip()
        operator = str(filter_item.get("operator") or "").strip().lower()
        value = filter_item.get("value")

        if table_name not in included_set:
            issues.append(
                _issue(
                    "error",
                    "filter_table_not_in_query",
                    "Filter tidak valid",
                    f"Filter ke-{position} menggunakan tabel yang tidak termasuk dalam query.",
                    context={
                        "position": position,
                        "table_name": table_name,
                        "column_name": column_name,
                    },
                )
            )
            continue

        column = column_details_by_table.get(table_name, {}).get(column_name)
        if column is None:
            issues.append(
                _issue(
                    "error",
                    "filter_column_missing",
                    "Kolom filter tidak ditemukan",
                    f"Kolom '{column_name}' sudah tidak tersedia pada tabel '{table_name}'.",
                    context={
                        "position": position,
                        "table_name": table_name,
                        "column_name": column_name,
                    },
                )
            )
            continue

        if operator not in FILTER_OPERATORS:
            issues.append(
                _issue(
                    "error",
                    "filter_operator_invalid",
                    "Operator filter tidak didukung",
                    f"Filter ke-{position} menggunakan operator yang tidak dikenali.",
                    context={
                        "position": position,
                        "operator": operator,
                    },
                )
            )
            continue

        if operator in FILTER_VALUE_REQUIRED:
            if value is None or str(value).strip() == "":
                issues.append(
                    _issue(
                        "error",
                        "filter_value_required",
                        "Isi nilai filter",
                        f"Filter '{table_name}.{column_name}' memerlukan nilai.",
                        context={
                            "position": position,
                            "table_name": table_name,
                            "column_name": column_name,
                            "operator": operator,
                        },
                    )
                )
                continue

        type_family = _data_type_family(column.get("data_type"))

        if operator in {"gt", "gte", "lt", "lte"} and type_family == "boolean":
            issues.append(
                _issue(
                    "error",
                    "filter_operator_type_mismatch",
                    "Operator tidak sesuai datatype",
                    f"Kolom '{table_name}.{column_name}' bertipe boolean dan tidak mendukung perbandingan lebih besar/kecil.",
                    context={
                        "position": position,
                        "table_name": table_name,
                        "column_name": column_name,
                        "operator": operator,
                        "type_family": type_family,
                    },
                )
            )
            continue

        valid_filter_count += 1


    valid_sort_count = 0

    if sort_by:
        sort_table = str(sort_by.get("table_name") or "").strip()
        sort_column = str(sort_by.get("column_name") or "").strip()
        sort_direction = str(sort_by.get("direction") or "asc").strip().lower()

        if sort_table not in included_set:
            issues.append(
                _issue(
                    "error",
                    "sort_table_not_in_query",
                    "Sort tidak valid",
                    "Kolom pengurutan berasal dari tabel yang tidak termasuk dalam query.",
                    context={
                        "table_name": sort_table,
                        "column_name": sort_column,
                    },
                )
            )
        else:
            column = column_details_by_table.get(sort_table, {}).get(sort_column)

            if column is None:
                issues.append(
                    _issue(
                        "error",
                        "sort_column_missing",
                        "Kolom sort tidak ditemukan",
                        f"Kolom '{sort_column}' sudah tidak tersedia pada tabel '{sort_table}'.",
                        context={
                            "table_name": sort_table,
                            "column_name": sort_column,
                        },
                    )
                )
            elif sort_direction not in {"asc", "desc"}:
                issues.append(
                    _issue(
                        "error",
                        "sort_direction_invalid",
                        "Arah sort tidak valid",
                        "Arah pengurutan harus ascending atau descending.",
                        context={
                            "direction": sort_direction,
                        },
                    )
                )
            else:
                valid_sort_count = 1

                if column.get("masked"):
                    issues.append(
                        _issue(
                            "info",
                            "masked_sort_column",
                            "Sort menggunakan masked column",
                            (
                                f"Kolom '{sort_column}' digunakan untuk pengurutan. "
                                "Pengurutan dilakukan pada nilai di database tanpa "
                                "membuka nilai masked pada output."
                            ),
                            context={
                                "table_name": sort_table,
                                "column_name": sort_column,
                                "masked": True,
                            },
                        )
                    )

    error_count = sum(1 for item in issues if item["severity"] == "error")
    warning_count = sum(1 for item in issues if item["severity"] == "warning")
    info_count = sum(1 for item in issues if item["severity"] == "info")

    if error_count:
        status = "blocked"
        headline = "Query perlu diperbaiki"
        message = "Ada bagian query yang belum valid. Periksa petunjuk di bawah sebelum melanjutkan."
    elif warning_count:
        status = "warning"
        headline = "Query siap dengan perhatian"
        message = "Struktur query valid, tetapi ada kondisi yang dapat memengaruhi jumlah atau bentuk hasil."
    else:
        status = "ready"
        headline = "Query ready"
        message = "Struktur query valid dan siap untuk tahap berikutnya."

    return {
        "status": status,
        "can_execute": error_count == 0,
        "headline": headline,
        "message": message,
        "issues": issues,
        "summary": {
            "table_count": len(included_tables),
            "join_count": validated_join_count,
            "selected_column_count": valid_selected_count,
            "filter_count": valid_filter_count,
            "sort_count": valid_sort_count,
            "error_count": error_count,
            "warning_count": warning_count,
            "info_count": info_count,
        },
        "tables": included_tables,
    }
