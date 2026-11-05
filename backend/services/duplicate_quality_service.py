from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import text

from database.connection import engine
from database.table_service import (
    MASK_VALUE,
    claim_duplicate_job,
    create_duplicate_job_record,
    get_duplicate_job,
    get_duplicate_jobs,
    get_masked_columns,
    get_recoverable_duplicate_jobs,
    get_table_columns,
    get_table_data_version,
    get_table_duplicate_overview,
    register_duplicate_snapshot,
    table_exists,
    update_duplicate_job_record,
    validate_column_name,
    validate_table_name,
)


_DUPLICATE_EXECUTOR = ThreadPoolExecutor(
    max_workers=1,
    thread_name_prefix="warehouse-duplicate-detector",
)

DEFAULT_MAX_GROUPS = 100


def _quoted_identifier(name: str) -> str:
    return engine.dialect.identifier_preparer.quote(str(name))


def _temp_table_name(job_id: int) -> str:
    return f"dq_duplicate_groups_{int(job_id)}"


def _normalize_preview_value(value):
    if value is None:
        return "(null)"
    text_value = str(value)
    if not text_value.strip():
        return "(blank)"
    if len(text_value) > 120:
        return text_value[:117] + "..."
    return text_value


def _prepare_exact_row_groups(connection, *, job_id: int, table_name: str):
    quoted_table = _quoted_identifier(table_name)
    temp_name = _temp_table_name(job_id)
    quoted_temp = _quoted_identifier(temp_name)

    connection.execute(text(f"DROP TABLE IF EXISTS {quoted_temp}"))
    connection.execute(
        text(
            f"""
            CREATE TEMP TABLE {quoted_temp}
            ON COMMIT DROP
            AS
            SELECT
                md5(row_signature) AS group_hash,
                COUNT(*)::bigint AS row_count
            FROM (
                SELECT row_to_json(t)::text AS row_signature
                FROM {quoted_table} AS t
            ) AS source_rows
            GROUP BY row_signature
            HAVING COUNT(*) > 1
            """
        )
    )
    return temp_name


def _selected_key_expressions(key_columns: list[str]):
    select_parts = []
    aliases = []
    eligibility_parts = []

    for index, column in enumerate(key_columns):
        validate_column_name(column)
        quoted = _quoted_identifier(column)
        alias = f"key_{index}"
        quoted_alias = _quoted_identifier(alias)
        select_parts.append(f"CAST({quoted} AS TEXT) AS {quoted_alias}")
        aliases.append(quoted_alias)
        eligibility_parts.append(
            f"NULLIF(BTRIM(CAST({quoted} AS TEXT)), '') IS NOT NULL"
        )

    return {
        "select_sql": ", ".join(select_parts),
        "aliases": aliases,
        "eligibility_sql": " AND ".join(eligibility_parts),
    }


def _prepare_selected_key_groups(
    connection,
    *,
    job_id: int,
    table_name: str,
    key_columns: list[str],
    include_incomplete_keys: bool,
):
    quoted_table = _quoted_identifier(table_name)
    temp_name = _temp_table_name(job_id)
    quoted_temp = _quoted_identifier(temp_name)
    expressions = _selected_key_expressions(key_columns)
    aliases = expressions["aliases"]
    select_sql = expressions["select_sql"]
    eligibility_sql = expressions["eligibility_sql"]
    where_sql = "" if include_incomplete_keys else "WHERE " + eligibility_sql
    group_sql = ", ".join(aliases)
    json_args = ", ".join(aliases)

    connection.execute(text(f"DROP TABLE IF EXISTS {quoted_temp}"))
    connection.execute(
        text(
            f"""
            CREATE TEMP TABLE {quoted_temp}
            ON COMMIT DROP
            AS
            SELECT
                md5(json_build_array({json_args})::text) AS group_hash,
                {group_sql},
                COUNT(*)::bigint AS row_count
            FROM (
                SELECT {select_sql}
                FROM {quoted_table}
                {where_sql}
            ) AS eligible_rows
            GROUP BY {group_sql}
            HAVING COUNT(*) > 1
            """
        )
    )
    return {
        "temp_name": temp_name,
        "aliases": aliases,
        "eligibility_sql": eligibility_sql,
    }


def _read_group_summary(connection, *, temp_name: str):
    quoted_temp = _quoted_identifier(temp_name)
    row = connection.execute(
        text(
            f"""
            SELECT
                COUNT(*)::bigint AS duplicate_group_count,
                COALESCE(SUM(row_count), 0)::bigint AS duplicate_row_count,
                COALESCE(SUM(row_count - 1), 0)::bigint AS redundant_row_count
            FROM {quoted_temp}
            """
        )
    ).mappings().one()
    return {
        "duplicate_group_count": int(row["duplicate_group_count"] or 0),
        "duplicate_row_count": int(row["duplicate_row_count"] or 0),
        "redundant_row_count": int(row["redundant_row_count"] or 0),
    }


def _read_exact_top_groups(connection, *, temp_name: str, limit: int):
    quoted_temp = _quoted_identifier(temp_name)
    rows = connection.execute(
        text(
            f"""
            SELECT group_hash, row_count
            FROM {quoted_temp}
            ORDER BY row_count DESC, group_hash
            LIMIT :limit
            """
        ),
        {"limit": int(limit)},
    ).mappings().all()

    groups = []
    for index, row in enumerate(rows, start=1):
        row_count = int(row["row_count"] or 0)
        group_hash = str(row["group_hash"] or "")
        groups.append(
            {
                "rank": index,
                "group_hash": group_hash,
                "preview": {"Row fingerprint": group_hash[:12]},
                "row_count": row_count,
                "redundant_row_count": max(0, row_count - 1),
            }
        )
    return groups


def _read_selected_key_top_groups(
    connection,
    *,
    temp_name: str,
    aliases: list[str],
    key_columns: list[str],
    masked_columns: set[str],
    limit: int,
):
    quoted_temp = _quoted_identifier(temp_name)
    selected = ", ".join(aliases)
    rows = connection.execute(
        text(
            f"""
            SELECT group_hash, {selected}, row_count
            FROM {quoted_temp}
            ORDER BY row_count DESC, group_hash
            LIMIT :limit
            """
        ),
        {"limit": int(limit)},
    ).mappings().all()

    groups = []
    for index, row in enumerate(rows, start=1):
        row_count = int(row["row_count"] or 0)
        preview = {}
        for position, column in enumerate(key_columns):
            alias = f"key_{position}"
            preview[column] = (
                MASK_VALUE
                if column in masked_columns
                else _normalize_preview_value(row[alias])
            )
        groups.append(
            {
                "rank": index,
                "group_hash": str(row["group_hash"] or ""),
                "preview": preview,
                "row_count": row_count,
                "redundant_row_count": max(0, row_count - 1),
            }
        )
    return groups


def run_duplicate_job(job_id: int):
    job_id = int(job_id)
    try:
        job = claim_duplicate_job(job_id)
        if job is None:
            return None

        table_name = validate_table_name(job["table_name"])
        if not table_exists(table_name):
            raise ValueError(f"Tabel '{table_name}' tidak ditemukan.")

        all_columns = get_table_columns(table_name)
        if not all_columns:
            raise ValueError("Tabel tidak memiliki kolom yang dapat dianalisis.")

        mode = job["mode"]
        key_columns = list(job.get("key_columns") or [])
        if mode == "selected_key":
            for column in key_columns:
                validate_column_name(column)
                if column not in all_columns:
                    raise ValueError(f"Kolom '{column}' tidak ditemukan.")

        source_data_version = get_table_data_version(table_name)
        update_duplicate_job_record(
            job_id,
            status="running",
            source_data_version=source_data_version,
        )

        quoted_table = _quoted_identifier(table_name)
        masked_columns = get_masked_columns(table_name)

        with engine.connect() as connection:
            if engine.dialect.name == "postgresql":
                connection.execute(text("SET LOCAL statement_timeout = '15min'"))
                connection.execute(text("SET LOCAL lock_timeout = '30s'"))

            row_count = int(
                connection.execute(
                    text(f"SELECT COUNT(*)::bigint FROM {quoted_table}")
                ).scalar_one()
                or 0
            )

            if mode == "exact_row":
                eligible_row_count = row_count
                ignored_incomplete_rows = 0
                temp_name = _prepare_exact_row_groups(
                    connection,
                    job_id=job_id,
                    table_name=table_name,
                )
                aliases = []
            else:
                expressions = _selected_key_expressions(key_columns)
                if job["include_incomplete_keys"]:
                    eligible_row_count = row_count
                    ignored_incomplete_rows = 0
                else:
                    eligible_row_count = int(
                        connection.execute(
                            text(
                                f"""
                                SELECT COUNT(*)::bigint
                                FROM {quoted_table}
                                WHERE {expressions['eligibility_sql']}
                                """
                            )
                        ).scalar_one()
                        or 0
                    )
                    ignored_incomplete_rows = max(
                        0, row_count - eligible_row_count
                    )

                prepared = _prepare_selected_key_groups(
                    connection,
                    job_id=job_id,
                    table_name=table_name,
                    key_columns=key_columns,
                    include_incomplete_keys=job["include_incomplete_keys"],
                )
                temp_name = prepared["temp_name"]
                aliases = prepared["aliases"]

            summary = _read_group_summary(connection, temp_name=temp_name)
            if mode == "exact_row":
                groups = _read_exact_top_groups(
                    connection,
                    temp_name=temp_name,
                    limit=job["max_groups"],
                )
            else:
                groups = _read_selected_key_top_groups(
                    connection,
                    temp_name=temp_name,
                    aliases=aliases,
                    key_columns=key_columns,
                    masked_columns=masked_columns,
                    limit=job["max_groups"],
                )

        current_data_version = get_table_data_version(table_name)
        snapshot = register_duplicate_snapshot(
            table_name=table_name,
            job_id=job_id,
            mode=mode,
            key_columns=key_columns,
            include_incomplete_keys=job["include_incomplete_keys"],
            source_data_version=source_data_version,
            row_count=row_count,
            eligible_row_count=eligible_row_count,
            ignored_incomplete_rows=ignored_incomplete_rows,
            duplicate_group_count=summary["duplicate_group_count"],
            duplicate_row_count=summary["duplicate_row_count"],
            redundant_row_count=summary["redundant_row_count"],
            groups=groups,
        )

        result_summary = {
            "snapshot_id": snapshot["id"],
            "table_name": table_name,
            "mode": mode,
            "key_columns": key_columns,
            "source_data_version": source_data_version,
            "current_data_version": current_data_version,
            "stale_on_completion": int(current_data_version) != int(source_data_version),
            "row_count": row_count,
            "eligible_row_count": eligible_row_count,
            "ignored_incomplete_rows": ignored_incomplete_rows,
            "duplicate_group_count": snapshot["duplicate_group_count"],
            "duplicate_row_count": snapshot["duplicate_row_count"],
            "redundant_row_count": snapshot["redundant_row_count"],
            "duplicate_rate_pct": snapshot["duplicate_rate_pct"],
            "uniqueness_score": snapshot["uniqueness_score"],
            "severity": snapshot["severity"],
        }
        return update_duplicate_job_record(
            job_id,
            status="completed",
            source_data_version=source_data_version,
            result_summary=result_summary,
        )

    except Exception as error:
        try:
            update_duplicate_job_record(
                job_id,
                status="failed",
                error_message=str(error),
            )
        except Exception:
            pass
        print("ERROR duplicate detection job", job_id, repr(error))
        return None


def _submit_duplicate_job(job_id: int):
    _DUPLICATE_EXECUTOR.submit(run_duplicate_job, int(job_id))


def queue_duplicate_job(
    *,
    table_name: str,
    mode: str = "exact_row",
    key_columns: list[str] | None = None,
    include_incomplete_keys: bool = False,
    max_groups: int = DEFAULT_MAX_GROUPS,
):
    job, created = create_duplicate_job_record(
        table_name=table_name,
        mode=mode,
        key_columns=key_columns,
        include_incomplete_keys=include_incomplete_keys,
        max_groups=max_groups,
    )
    if created:
        _submit_duplicate_job(job["id"])
    return {
        "job": job,
        "created": created,
        "message": (
            "Duplicate detection job masuk antrean."
            if created
            else "Tabel tersebut sudah memiliki duplicate detection job yang queued/running."
        ),
    }


def recover_duplicate_queue():
    job_ids = get_recoverable_duplicate_jobs()
    for job_id in job_ids:
        _submit_duplicate_job(job_id)
    return len(job_ids)


def get_duplicate_job_status(job_id: int):
    return get_duplicate_job(job_id)


def list_duplicate_jobs(*, table_name: str | None = None, limit: int = 50):
    return get_duplicate_jobs(table_name=table_name, limit=limit)


def get_duplicate_overview(table_name: str):
    return get_table_duplicate_overview(table_name, history_limit=12)
