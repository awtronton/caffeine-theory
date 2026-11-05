import json
from datetime import date
from io import BytesIO

import pandas as pd
from pydantic import BaseModel, Field
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from database.table_service import (
    append_existing_table,
    count_period_rows,
    create_new_table,
    create_table_relationship,
    create_saved_query,
    drop_warehouse_table,
    delete_saved_query,
    delete_table_relationship,
    get_all_tables,
    get_all_table_summaries,
    get_schema_mapping,
    get_table_column_details,
    get_table_explorer_options,
    get_table_relationships,
    get_table_summary,
    get_table_lineage,
    get_table_lineage_graph,
    get_saved_query,
    list_saved_queries,
    explore_table_data,
    rename_table_column,
    set_column_masking,
    update_saved_query,
    update_table_relationship,
    replace_period_data,
    require_schema_mapping,
)
from master_data.banks import (
    get_all_banks,
    get_bank_by_name,
)
from services.bank_ops_service import (
    get_bank_ops_overview,
    save_bank_profile,
)
from services.ops_reconciliation_service import reconcile_warehouse_columns
from services.ops_financial_service import (
    get_source_catalog, list_financial_mappings, save_financial_mapping,
    delete_financial_mapping, get_financial_performance, preview_financial_formula,
)
from services.manual_table_service import create_empty_warehouse_table
from services.manual_column_service import add_manual_column
from services.calculated_column_service import (
    preview_calculated_column, create_calculated_column,
    list_calculated_columns, refresh_calculated_column, refresh_stale_calculated_columns,
)
from services.smart_pivot_service import preview_pivot_excel
from services.pivot_storage_service import store_pivot_excel, PivotPeriodExists
from services.excel_processor import (
    get_excel_sheets,
    process_excel,
)
from services.profiling_service import (
    get_profile_job_status,
    get_table_profile_snapshot,
    list_profile_jobs,
    queue_profile_job,
    recover_profile_queue,
)
from services.duplicate_quality_service import (
    get_duplicate_job_status,
    get_duplicate_overview,
    list_duplicate_jobs,
    queue_duplicate_job,
    recover_duplicate_queue,
)
from services.relationship_scoring_service import (
    get_relationship_scoring_job_status,
    list_relationship_scoring_jobs,
    queue_relationship_scoring_job,
    recover_relationship_scoring_queue,
)
from services.relationship_intelligence_service import (
    get_relationship_candidate_job_status,
    list_relationship_candidate_jobs,
    list_relationship_candidates,
    queue_relationship_candidate_job,
    recover_relationship_candidate_queue,
)
from services.query_preflight_service import (
    run_query_preflight,
)
from services.query_execution_service import (
    execute_query_materialization,
    execute_query_preview,
)


app = FastAPI(
    title="OJK Data Warehouse API",
    version="1.23.0",
)


# =====================================================
# CORS
# =====================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================
# HELPERS
# =====================================================

SYSTEM_COLUMNS = {"bank_id", "bulan", "tahun"}


class BankOpsProfileRequest(BaseModel):
    legal_name: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=5000)
    city: str | None = Field(default=None, max_length=120)
    province: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=80)
    status_pengawasan: str | None = Field(default=None, max_length=120)
    status_date: date | None = None


class RenameColumnRequest(BaseModel):
    old_name: str
    new_name: str


class ColumnMaskingRequest(BaseModel):
    column_name: str
    masked: bool



class RelationshipColumnPairRequest(BaseModel):
    source_column: str
    target_column: str


class RelationshipCreateRequest(BaseModel):
    relationship_name: str | None = None
    source_table: str
    source_column: str | None = None
    target_table: str
    target_column: str | None = None
    column_pairs: list[RelationshipColumnPairRequest] | None = None
    cardinality: str


class RelationshipUpdateRequest(BaseModel):
    relationship_name: str | None = None
    cardinality: str | None = None
    is_active: bool | None = None


class ProfilingJobCreateRequest(BaseModel):
    table_name: str
    columns: list[str] | None = None
    target_sample_rows: int = 50000
    profile_strategy: str = "adaptive"


class OpsFinancialMappingRequest(BaseModel):
    mode: str = "direct"
    table_name: str | None = None
    value_column: str | None = None
    account_column: str | None = None
    account_value: str | None = None
    aggregation: str = "sum"
    multiplier: float = 1
    expression: str | None = None
    components: list[dict] | None = None


class OpsFormulaPreviewRequest(BaseModel):
    bank_id: str
    period: str
    metric_key: str
    expression: str
    components: list[dict] = []


class DuplicateDetectionJobCreateRequest(BaseModel):
    table_name: str
    mode: str = "exact_row"
    key_columns: list[str] | None = None
    include_incomplete_keys: bool = False
    max_groups: int = Field(default=100, ge=10, le=250)


class RelationshipCandidateJobCreateRequest(BaseModel):
    scan_mode: str = "selected"
    source_tables: list[str] | None = None
    target_tables: list[str] | None = None
    min_discovery_score: float = 0.45
    max_candidates: int = 1000
    include_system_columns: bool = True


class RelationshipScoringJobCreateRequest(BaseModel):
    source_tables: list[str] | None = None
    target_tables: list[str] | None = None
    candidate_status: str = "pending"
    min_discovery_score: float = 0.45
    max_candidates: int = 5000


class QueryPreflightJoinRequest(BaseModel):
    relationship_id: int
    join_type: str


class QueryPreflightColumnRequest(BaseModel):
    table_name: str
    column_name: str


class QueryFilterRequest(BaseModel):
    table_name: str
    column_name: str
    operator: str
    value: str | int | float | bool | None = None


class QuerySortRequest(BaseModel):
    table_name: str
    column_name: str
    direction: str = "asc"


class QueryPreflightRequest(BaseModel):
    base_table: str
    joins: list[QueryPreflightJoinRequest] = Field(default_factory=list)
    selected_columns: list[QueryPreflightColumnRequest] = Field(default_factory=list)
    filters: list[QueryFilterRequest] = Field(default_factory=list)
    sort_by: QuerySortRequest | None = None


class QueryPreviewRequest(QueryPreflightRequest):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=100, ge=1, le=200)
    unmask_columns: list[QueryPreflightColumnRequest] = Field(default_factory=list)


class SavedQueryRequest(BaseModel):
    query_name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    query: QueryPreflightRequest


class QueryMaterializeRequest(QueryPreflightRequest):
    output_table_name: str = Field(min_length=1, max_length=63)
    description: str | None = Field(default=None, max_length=500)
    source_saved_query_id: int | None = None


def validate_saved_query_definition(
    query: QueryPreflightRequest,
):
    definition = query.model_dump()

    result = run_query_preflight(
        base_table=query.base_table,
        joins=[
            item.model_dump()
            for item in query.joins
        ],
        selected_columns=[
            item.model_dump()
            for item in query.selected_columns
        ],
        filters=[
            item.model_dump()
            for item in query.filters
        ],
        sort_by=(
            query.sort_by.model_dump()
            if query.sort_by
            else None
        ),
    )

    if not result.get("can_execute"):
        blocking = next(
            (
                issue
                for issue in result.get("issues", [])
                if issue.get("severity") == "error"
            ),
            None,
        )

        message = (
            blocking.get("message")
            if blocking
            else "Query belum valid dan belum dapat disimpan."
        )

        raise ValueError(
            f"Query belum dapat disimpan. {message}"
        )

    return definition, result


def dataframe_to_records(df):
    return json.loads(
        df.to_json(
            orient="records",
            date_format="iso",
        )
    )


def parse_json_list(value: str, field_name: str):
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError(
            f"Format {field_name} tidak valid."
        ) from error

    if not isinstance(parsed, list):
        raise ValueError(
            f"{field_name} harus berupa array JSON."
        )

    return parsed


def parse_json_dict(value: str, field_name: str):
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError(
            f"Format {field_name} tidak valid."
        ) from error

    if not isinstance(parsed, dict):
        raise ValueError(
            f"{field_name} harus berupa object JSON."
        )

    return parsed


def clean_existing_value(value):
    if pd.isna(value):
        return None

    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")

    if isinstance(value, float) and value.is_integer():
        return int(value)

    if isinstance(value, str):
        value = value.strip()
        return value if value else None

    return value


def attach_bank_id(df, bank_name: str):
    bank = get_bank_by_name(bank_name)

    if "bank_id" in df.columns:
        raise ValueError(
            "File sumber sudah memiliki kolom 'bank_id'. "
            "Nama tersebut dicadangkan sebagai kolom sistem."
        )

    df = df.copy()
    df.insert(0, "bank_id", bank["bank_id"])

    return df, bank


def process_existing_excel(
    *,
    file_bytes: bytes,
    table_name: str,
    sheet_name: str,
    first_data_row: int,
    month: int,
    year: int,
):
    """
    Existing table:
    - tidak membaca header dari file;
    - data dimulai dari first_data_row;
    - nama kolom mengikuti schema mapping tabel existing;
    - mapping dilakukan berdasarkan ordinal/urutan kolom.
    """
    if not first_data_row or int(first_data_row) < 1:
        raise ValueError(
            "Baris pertama data minimal bernilai 1."
        )

    mapping = require_schema_mapping(table_name)

    expected_columns = [
        item["database_column"]
        for item in mapping
    ]

    df = pd.read_excel(
        BytesIO(file_bytes),
        sheet_name=sheet_name,
        header=None,
        skiprows=int(first_data_row) - 1,
        dtype=object,
    )

    # Existing-table uploads are positional: every expected column is part of
    # the schema even when it has no values in this reporting period.
    # Delete only genuinely empty rows. A numeric zero remains non-empty.
    def is_empty_cell(value):
        if value is None:
            return True
        try:
            if bool(pd.isna(value)):
                return True
        except (ValueError, TypeError):
            pass
        return isinstance(value, str) and not value.strip()

    df = df.loc[
        ~df.apply(
            lambda row: all(is_empty_cell(value) for value in row),
            axis=1,
        )
    ].copy().reset_index(drop=True)

    expected_column_count = len(expected_columns)
    actual_column_count = len(df.columns)

    # Pandas/Excel can truncate physically blank trailing columns. Restore
    # those positions from the existing destination schema rather than
    # shifting other columns left or rejecting a structurally valid period.
    if actual_column_count < expected_column_count:
        df = df.reindex(columns=range(expected_column_count))
    elif actual_column_count > expected_column_count:
        extra_columns = list(df.columns[expected_column_count:])
        if all(df[column].map(is_empty_cell).all() for column in extra_columns):
            df = df.iloc[:, :expected_column_count].copy()
        else:
            raise ValueError(
                f"File memiliki {actual_column_count} kolom, tetapi tabel "
                f"'{table_name}' membutuhkan {expected_column_count}. "
                "Terdapat data pada kolom di luar schema existing."
            )

    actual_column_count = len(df.columns)

    if actual_column_count != expected_column_count:
        raise ValueError(
            "Struktur file tidak sesuai dengan schema tabel "
            f"'{table_name}'. Tabel membutuhkan "
            f"{expected_column_count} kolom data, sedangkan file "
            f"menghasilkan {actual_column_count} kolom setelah "
            "kolom kosong dibersihkan. Periksa Baris Pertama Data "
            "atau perubahan format file."
        )

    # Header preview dan save mengikuti database, bukan header XLS.
    df.columns = expected_columns

    for column in df.columns:
        df[column] = df[column].map(
            clean_existing_value
        )

    df["bulan"] = int(month)
    df["tahun"] = int(year)

    return df


def process_upload_by_mode(
    *,
    file_bytes: bytes,
    table_mode: str,
    table_name: str,
    sheet_name: str,
    header_row: int | None,
    first_data_row: int | None,
    month: int,
    year: int,
):
    if table_mode == "new":
        if not header_row or int(header_row) < 1:
            raise ValueError(
                "Baris Header wajib diisi untuk tabel baru."
            )

        return process_excel(
            file_bytes=file_bytes,
            sheet_name=sheet_name,
            header_row=int(header_row),
            month=month,
            year=year,
        )

    if table_mode == "existing":
        return process_existing_excel(
            file_bytes=file_bytes,
            table_name=table_name,
            sheet_name=sheet_name,
            first_data_row=int(
                first_data_row or 0
            ),
            month=month,
            year=year,
        )

    raise ValueError(
        "table_mode harus bernilai 'new' atau 'existing'."
    )


# =====================================================
# PROFILING RUNTIME
# =====================================================

@app.on_event("startup")
def recover_warehouse_profiling_queue():
    try:
        recovered = recover_profile_queue()
        if recovered:
            print(
                f"Recovered {recovered} profiling job(s)."
            )
    except Exception as error:
        print(
            "WARNING profiling queue recovery:",
            repr(error),
        )


@app.on_event("startup")
def recover_duplicate_detection_queue():
    try:
        recovered = recover_duplicate_queue()
        if recovered:
            print(
                f"Recovered {recovered} duplicate detection job(s)."
            )
    except Exception as error:
        print(
            "WARNING duplicate detection queue recovery:",
            repr(error),
        )


@app.on_event("startup")
def recover_relationship_intelligence_queue():
    try:
        recovered = recover_relationship_candidate_queue()
        if recovered:
            print(
                f"Recovered {recovered} relationship candidate job(s)."
            )
    except Exception as error:
        print(
            "WARNING relationship candidate queue recovery:",
            repr(error),
        )


@app.on_event("startup")
def recover_relationship_scoring_runtime():
    try:
        recovered = recover_relationship_scoring_queue()
        if recovered:
            print(f"Recovered {recovered} relationship scoring job(s).")
    except Exception as error:
        print("WARNING relationship scoring queue recovery:", repr(error))


# =====================================================
# HEALTH CHECK
# =====================================================

@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "OJK Data Warehouse API running",
    }


# =====================================================
# DATABASE TABLES
# =====================================================

class ManualColumnDefinition(BaseModel):
    name: str = Field(min_length=1, max_length=63)
    data_type: str
    nullable: bool = True


class CreateEmptyTableRequest(BaseModel):
    table_name: str = Field(min_length=1, max_length=63)
    include_period: bool = True
    columns: list[ManualColumnDefinition] = Field(min_length=1, max_length=100)


@app.post("/tables/manual", status_code=201)
def create_empty_manual_table(payload: CreateEmptyTableRequest):
    try:
        return create_empty_warehouse_table(
            payload.table_name,
            [col.model_dump() for col in payload.columns],
            payload.include_period,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        print("ERROR POST /tables/manual:", repr(error))
        raise HTTPException(status_code=500, detail="Gagal membuat tabel manual.")


class AddManualColumnRequest(BaseModel):
    column_name: str = Field(min_length=1, max_length=63)
    data_type: str
    nullable: bool = True
    default_value: str | None = Field(default=None, max_length=1000)


@app.post("/tables/{table_name}/columns/manual", status_code=201)
def create_manual_column(table_name: str, payload: AddManualColumnRequest):
    try:
        return add_manual_column(
            table_name=table_name,
            column_name=payload.column_name,
            data_type=payload.data_type,
            nullable=payload.nullable,
            default_value=payload.default_value,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        print("ERROR POST /tables/{table_name}/columns/manual:", repr(error))
        raise HTTPException(status_code=500, detail="Gagal menambahkan kolom manual.")


class CalculatedColumnPreviewRequest(BaseModel):
    formula: str = Field(min_length=1, max_length=600)


class CalculatedColumnCreateRequest(CalculatedColumnPreviewRequest):
    column_name: str = Field(min_length=1, max_length=63)


@app.post("/tables/{table_name}/columns/calculated/preview")
def preview_warehouse_calculation(table_name: str, payload: CalculatedColumnPreviewRequest):
    try:
        return preview_calculated_column(table_name=table_name, formula=payload.formula)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        print("ERROR calculated column preview:", repr(error))
        raise HTTPException(status_code=500, detail="Gagal membuat preview formula.")


@app.post("/tables/{table_name}/columns/calculated", status_code=201)
def create_warehouse_calculation(table_name: str, payload: CalculatedColumnCreateRequest):
    try:
        return create_calculated_column(
            table_name=table_name, column_name=payload.column_name, formula=payload.formula,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        print("ERROR calculated column create:", repr(error))
        raise HTTPException(status_code=500, detail="Gagal membuat calculated column.")


@app.post("/tables/{table_name}/columns/calculated/refresh-stale")
def refresh_all_stale_warehouse_calculations(table_name: str):
    try:
        return refresh_stale_calculated_columns(table_name=table_name)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        print('ERROR refresh stale calculated columns:', repr(error))
        raise HTTPException(status_code=500, detail='Gagal menghitung ulang kolom yang stale.')


@app.get("/tables/{table_name}/columns/calculated")
def get_warehouse_calculations(table_name: str):
    try:
        return list_calculated_columns(table_name)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        print("ERROR calculated column list:", repr(error))
        raise HTTPException(status_code=500, detail="Gagal membaca calculated column.")


@app.post("/tables/{table_name}/columns/calculated/{column_name}/refresh")
def refresh_warehouse_calculation(table_name: str, column_name: str):
    try:
        return refresh_calculated_column(table_name=table_name, column_name=column_name)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        print("ERROR calculated column refresh:", repr(error))
        raise HTTPException(status_code=500, detail="Gagal menghitung ulang calculated column.")


@app.get("/tables")
def list_tables():
    try:
        tables = get_all_tables()

        return {
            "status": "success",
            "count": len(tables),
            "tables": tables,
        }

    except Exception as error:
        print(
            "ERROR /tables:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.get("/tables-summary")
def table_summaries():
    try:
        summaries = get_all_table_summaries()

        return {
            "status": "success",
            "count": len(summaries),
            "tables": summaries,
        }

    except Exception as error:
        print(
            "ERROR /tables-summary:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.get("/tables/{table_name}/detail")
def table_detail(table_name: str):
    try:
        summary = get_table_summary(table_name)
        columns = get_table_column_details(table_name)

        return {
            "status": "success",
            "summary": summary,
            "columns": columns,
        }

    except Exception as error:
        print(
            "ERROR /tables/{table_name}/detail:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.get("/tables/{table_name}/lineage")
def table_lineage(table_name: str):
    try:
        lineage = get_table_lineage(
            table_name
        )

        return {
            "status": "success",
            "lineage": lineage,
        }

    except Exception as error:
        print(
            "ERROR /tables/{table_name}/lineage:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.get("/tables/{table_name}/lineage/graph")
def table_lineage_graph(
    table_name: str,
    max_depth: int = Query(
        8,
        ge=1,
        le=20,
    ),
):
    try:
        graph = get_table_lineage_graph(
            table_name,
            max_depth=max_depth,
        )

        return {
            "status": "success",
            "graph": graph,
        }

    except Exception as error:
        print(
            "ERROR /tables/{table_name}/lineage/graph:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.delete("/tables/{table_name}")
def delete_table(table_name: str):
    try:
        result = drop_warehouse_table(table_name)

        return {
            "status": "success",
            "message": "Tabel dan metadata terkait berhasil dihapus.",
            **result,
        }

    except Exception as error:
        print(
            "ERROR DELETE /tables/{table_name}:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.patch("/tables/{table_name}/column")
def rename_column(
    table_name: str,
    payload: RenameColumnRequest,
):
    try:
        result = rename_table_column(
            table_name=table_name,
            old_name=payload.old_name,
            new_name=payload.new_name,
        )

        return {
            "status": "success",
            "message": "Nama kolom berhasil diperbarui.",
            **result,
        }

    except Exception as error:
        print(
            "ERROR PATCH /tables/{table_name}/column:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.patch("/tables/{table_name}/column-masking")
def update_column_masking(
    table_name: str,
    payload: ColumnMaskingRequest,
):
    try:
        result = set_column_masking(
            table_name=table_name,
            column_name=payload.column_name,
            masked=payload.masked,
        )

        return {
            "status": "success",
            "message": (
                "Masking kolom berhasil diperbarui."
            ),
            **result,
        }

    except Exception as error:
        print(
            "ERROR PATCH /tables/{table_name}/column-masking:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


# =====================================================
# COLUMN PROFILING
# =====================================================

@app.post("/profiling/jobs")
def create_profiling_job(
    payload: ProfilingJobCreateRequest,
):
    try:
        result = queue_profile_job(
            table_name=payload.table_name,
            columns=payload.columns,
            target_sample_rows=(
                payload.target_sample_rows
            ),
            profile_strategy=(
                payload.profile_strategy
            ),
        )

        return {
            "status": "success",
            **result,
        }

    except Exception as error:
        print(
            "ERROR POST /profiling/jobs:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.get("/profiling/jobs")
def profiling_jobs(
    table_name: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    try:
        rows = list_profile_jobs(
            table_name=table_name,
            limit=limit,
        )
        return {
            "status": "success",
            "count": len(rows),
            "jobs": rows,
        }
    except Exception as error:
        print(
            "ERROR GET /profiling/jobs:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.get("/profiling/jobs/{job_id}")
def profiling_job(job_id: int):
    try:
        job = get_profile_job_status(job_id)
        return {
            "status": "success",
            "job": job,
        }
    except Exception as error:
        print(
            "ERROR GET /profiling/jobs/{job_id}:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.get("/profiling/tables/{table_name}")
def table_profile(table_name: str):
    try:
        snapshot = get_table_profile_snapshot(
            table_name
        )
        return {
            "status": "success",
            **snapshot,
        }
    except Exception as error:
        print(
            "ERROR GET /profiling/tables/{table_name}:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )



# =====================================================
# 6G.2 DATA QUALITY — DUPLICATE DETECTION
# =====================================================

@app.post("/data-quality/duplicates/jobs")
def create_duplicate_detection_job(
    payload: DuplicateDetectionJobCreateRequest,
):
    try:
        result = queue_duplicate_job(
            table_name=payload.table_name,
            mode=payload.mode,
            key_columns=payload.key_columns,
            include_incomplete_keys=payload.include_incomplete_keys,
            max_groups=payload.max_groups,
        )
        return {"status": "success", **result}
    except Exception as error:
        print("ERROR POST /data-quality/duplicates/jobs:", repr(error))
        raise HTTPException(status_code=400, detail=str(error))


@app.get("/data-quality/duplicates/jobs")
def duplicate_detection_jobs(
    table_name: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    try:
        rows = list_duplicate_jobs(table_name=table_name, limit=limit)
        return {"status": "success", "count": len(rows), "jobs": rows}
    except Exception as error:
        print("ERROR GET /data-quality/duplicates/jobs:", repr(error))
        raise HTTPException(status_code=400, detail=str(error))


@app.get("/data-quality/duplicates/jobs/{job_id}")
def duplicate_detection_job(job_id: int):
    try:
        job = get_duplicate_job_status(job_id)
        return {"status": "success", "job": job}
    except Exception as error:
        print("ERROR GET /data-quality/duplicates/jobs/{job_id}:", repr(error))
        raise HTTPException(status_code=400, detail=str(error))


@app.get("/data-quality/duplicates/tables/{table_name}")
def table_duplicate_detection(table_name: str):
    try:
        overview = get_duplicate_overview(table_name)
        return {"status": "success", "duplicates": overview}
    except Exception as error:
        print(
            "ERROR GET /data-quality/duplicates/tables/{table_name}:",
            repr(error),
        )
        raise HTTPException(status_code=400, detail=str(error))


# =====================================================
# RELATIONSHIP INTELLIGENCE — CANDIDATE GENERATOR
# =====================================================

@app.post("/relationship-intelligence/candidate-jobs")
def create_relationship_candidate_job(
    payload: RelationshipCandidateJobCreateRequest,
):
    try:
        result = queue_relationship_candidate_job(
            scan_mode=payload.scan_mode,
            source_tables=payload.source_tables,
            target_tables=payload.target_tables,
            min_discovery_score=payload.min_discovery_score,
            max_candidates=payload.max_candidates,
            include_system_columns=payload.include_system_columns,
        )
        return {
            "status": "success",
            **result,
        }
    except Exception as error:
        print(
            "ERROR POST /relationship-intelligence/candidate-jobs:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.get("/relationship-intelligence/candidate-jobs")
def relationship_candidate_jobs(
    limit: int = Query(50, ge=1, le=200),
):
    try:
        rows = list_relationship_candidate_jobs(limit=limit)
        return {
            "status": "success",
            "count": len(rows),
            "jobs": rows,
        }
    except Exception as error:
        print(
            "ERROR GET /relationship-intelligence/candidate-jobs:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.get("/relationship-intelligence/candidate-jobs/{job_id}")
def relationship_candidate_job(job_id: int):
    try:
        job = get_relationship_candidate_job_status(job_id)
        return {
            "status": "success",
            "job": job,
        }
    except Exception as error:
        print(
            "ERROR GET /relationship-intelligence/candidate-jobs/{job_id}:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.get("/relationship-intelligence/candidates")
def relationship_candidates(
    source_table: str | None = Query(None),
    target_table: str | None = Query(None),
    candidate_status: str | None = Query(None, alias="status"),
    include_stale: bool = Query(False),
    min_discovery_score: float = Query(0.0, ge=0.0, le=1.0),
    limit: int = Query(200, ge=1, le=2000),
):
    try:
        rows = list_relationship_candidates(
            source_table=source_table,
            target_table=target_table,
            status=candidate_status,
            include_stale=include_stale,
            min_discovery_score=min_discovery_score,
            limit=limit,
        )
        return {
            "status": "success",
            "count": len(rows),
            "candidates": rows,
        }
    except Exception as error:
        print(
            "ERROR GET /relationship-intelligence/candidates:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )



# =====================================================
# RELATIONSHIP INTELLIGENCE — QUALITY SCORING
# =====================================================

@app.post("/relationship-intelligence/scoring-jobs")
def create_relationship_scoring_job(payload: RelationshipScoringJobCreateRequest):
    try:
        result = queue_relationship_scoring_job(
            source_tables=payload.source_tables, target_tables=payload.target_tables,
            candidate_status=payload.candidate_status, min_discovery_score=payload.min_discovery_score,
            max_candidates=payload.max_candidates,
        )
        return {"status":"success", **result}
    except Exception as error:
        print("ERROR POST /relationship-intelligence/scoring-jobs:", repr(error))
        raise HTTPException(status_code=400, detail=str(error))

@app.get("/relationship-intelligence/scoring-jobs")
def relationship_scoring_jobs(limit: int = Query(50, ge=1, le=200)):
    try:
        rows=list_relationship_scoring_jobs(limit=limit)
        return {"status":"success","count":len(rows),"jobs":rows}
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error))

@app.get("/relationship-intelligence/scoring-jobs/{job_id}")
def relationship_scoring_job(job_id: int):
    try:
        return {"status":"success","job":get_relationship_scoring_job_status(job_id)}
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error))


# =====================================================
# SAVED QUERIES
# =====================================================

@app.get("/saved-queries")
def saved_queries():
    try:
        rows = list_saved_queries()

        return {
            "status": "success",
            "count": len(rows),
            "saved_queries": rows,
        }

    except Exception as error:
        print(
            "ERROR GET /saved-queries:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.get("/saved-queries/{query_id}")
def saved_query_detail(query_id: int):
    try:
        return {
            "status": "success",
            "saved_query": get_saved_query(
                query_id
            ),
        }

    except Exception as error:
        print(
            "ERROR GET /saved-queries/{query_id}:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.post("/saved-queries")
def save_query(payload: SavedQueryRequest):
    try:
        definition, preflight = (
            validate_saved_query_definition(
                payload.query
            )
        )

        saved_query = create_saved_query(
            query_name=payload.query_name,
            description=payload.description,
            query_definition=definition,
        )

        return {
            "status": "success",
            "saved_query": saved_query,
            "preflight": preflight,
        }

    except Exception as error:
        print(
            "ERROR POST /saved-queries:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.patch("/saved-queries/{query_id}")
def save_query_changes(
    query_id: int,
    payload: SavedQueryRequest,
):
    try:
        definition, preflight = (
            validate_saved_query_definition(
                payload.query
            )
        )

        saved_query = update_saved_query(
            query_id,
            query_name=payload.query_name,
            description=payload.description,
            query_definition=definition,
        )

        return {
            "status": "success",
            "saved_query": saved_query,
            "preflight": preflight,
        }

    except Exception as error:
        print(
            "ERROR PATCH /saved-queries/{query_id}:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.delete("/saved-queries/{query_id}")
def remove_saved_query(query_id: int):
    try:
        deleted = delete_saved_query(
            query_id
        )

        return {
            "status": "success",
            "message": (
                f"Saved query '{deleted['query_name']}' berhasil dihapus."
            ),
            "deleted": deleted,
        }

    except Exception as error:
        print(
            "ERROR DELETE /saved-queries/{query_id}:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


# =====================================================
# QUERY PREFLIGHT
# =====================================================

@app.post("/query/preflight")
def query_preflight(payload: QueryPreflightRequest):
    try:
        result = run_query_preflight(
            base_table=payload.base_table,
            joins=[item.model_dump() for item in payload.joins],
            selected_columns=[
                item.model_dump()
                for item in payload.selected_columns
            ],
            filters=[
                item.model_dump()
                for item in payload.filters
            ],
            sort_by=(
                payload.sort_by.model_dump()
                if payload.sort_by
                else None
            ),
        )

        return {
            "status": "success",
            "preflight": result,
        }

    except Exception as error:
        print(
            "ERROR POST /query/preflight:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.post("/query/preview")
def query_preview(payload: QueryPreviewRequest):
    try:
        result = execute_query_preview(
            base_table=payload.base_table,
            joins=[
                item.model_dump()
                for item in payload.joins
            ],
            selected_columns=[
                item.model_dump()
                for item in payload.selected_columns
            ],
            filters=[
                item.model_dump()
                for item in payload.filters
            ],
            sort_by=(
                payload.sort_by.model_dump()
                if payload.sort_by
                else None
            ),
            page=payload.page,
            page_size=payload.page_size,
            unmask_columns=[
                item.model_dump()
                for item in payload.unmask_columns
            ],
        )

        return {
            "status": "success",
            "preview": result,
        }

    except Exception as error:
        print(
            "ERROR POST /query/preview:",
            repr(error),
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


# =====================================================
# QUERY MATERIALIZATION
# =====================================================

@app.post("/query/materialize")
def materialize_query(payload: QueryMaterializeRequest):
    try:
        result = execute_query_materialization(
            output_table_name=payload.output_table_name,
            description=payload.description,
            base_table=payload.base_table,
            joins=[item.model_dump() for item in payload.joins],
            selected_columns=[item.model_dump() for item in payload.selected_columns],
            filters=[item.model_dump() for item in payload.filters],
            sort_by=(payload.sort_by.model_dump() if payload.sort_by else None),
            source_saved_query_id=payload.source_saved_query_id,
        )
        return {
            "status": "success",
            "message": f"Output table '{result['output_table']}' berhasil dibuat.",
            **result,
        }
    except Exception as error:
        print("ERROR POST /query/materialize:", repr(error))
        raise HTTPException(status_code=400, detail=str(error))


# =====================================================
# TABLE RELATIONSHIPS
# =====================================================

@app.get("/relationships")
def relationships(
    table_name: str | None = Query(None),
):
    try:
        rows = get_table_relationships(
            table_name=table_name
        )

        return {
            "status": "success",
            "count": len(rows),
            "relationships": rows,
        }

    except Exception as error:
        print(
            "ERROR GET /relationships:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.post("/relationships")
def create_relationship(
    payload: RelationshipCreateRequest,
):
    try:
        result = create_table_relationship(
            relationship_name=(
                payload.relationship_name
            ),
            source_table=payload.source_table,
            source_column=payload.source_column,
            target_table=payload.target_table,
            target_column=payload.target_column,
            column_pairs=[
                {
                    "source_column":
                        pair.source_column,
                    "target_column":
                        pair.target_column,
                }
                for pair in (
                    payload.column_pairs or []
                )
            ] or None,
            cardinality=payload.cardinality,
        )

        return {
            "status": "success",
            "message": (
                "Relationship berhasil dibuat."
            ),
            "relationship": result,
        }

    except Exception as error:
        print(
            "ERROR POST /relationships:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.patch("/relationships/{relationship_id}")
def update_relationship(
    relationship_id: int,
    payload: RelationshipUpdateRequest,
):
    try:
        result = update_table_relationship(
            relationship_id,
            relationship_name=(
                payload.relationship_name
            ),
            cardinality=(
                payload.cardinality
            ),
            is_active=payload.is_active,
        )

        return {
            "status": "success",
            "message": (
                "Relationship berhasil diperbarui."
            ),
            "relationship": result,
        }

    except Exception as error:
        print(
            "ERROR PATCH /relationships/{relationship_id}:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.delete("/relationships/{relationship_id}")
def delete_relationship(
    relationship_id: int,
):
    try:
        result = delete_table_relationship(
            relationship_id
        )

        return {
            "status": "success",
            "message": (
                "Relationship berhasil dihapus."
            ),
            **result,
        }

    except Exception as error:
        print(
            "ERROR DELETE /relationships/{relationship_id}:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.get("/tables/{table_name}/explorer/options")
def table_explorer_options(table_name: str):
    try:
        result = get_table_explorer_options(
            table_name
        )

        return {
            "status": "success",
            **result,
        }

    except Exception as error:
        print(
            "ERROR /tables/{table_name}/explorer/options:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.get("/tables/{table_name}/explorer")
def table_explorer(
    table_name: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(
        20,
        ge=1,
        le=200,
    ),
    search: str | None = Query(None),
    bank_id: str | None = Query(None),
    month: int | None = Query(
        None,
        ge=1,
        le=12,
    ),
    year: int | None = Query(
        None,
        ge=1900,
        le=2200,
    ),
    sort_column: str | None = Query(None),
    sort_direction: str = Query("asc"),
):
    try:
        result = explore_table_data(
            table_name,
            page=page,
            page_size=page_size,
            search=search,
            bank_id=bank_id,
            month=month,
            year=year,
            sort_column=sort_column,
            sort_direction=sort_direction,
        )

        return {
            "status": "success",
            **result,
        }

    except Exception as error:
        print(
            "ERROR /tables/{table_name}/explorer:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@app.get("/tables/{table_name}/schema-mapping")
def table_schema_mapping(table_name: str):
    try:
        mapping = get_schema_mapping(
            table_name
        )

        return {
            "status": "success",
            "table_name": table_name,
            "count": len(mapping),
            "mapping": mapping,
        }

    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


# =====================================================
# MASTER BANKS
# =====================================================

@app.get("/banks")
def list_banks():
    try:
        banks = get_all_banks()

        return {
            "status": "success",
            "count": len(banks),
            "banks": banks,
        }

    except Exception as error:
        print(
            "ERROR /banks:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


# =====================================================
# BANK INTELLIGENCE / OPS 7A.1
# =====================================================

@app.get("/banks/{bank_id}/ops")
def bank_ops_overview(bank_id: str):
    try:
        return {
            "status": "success",
            **get_bank_ops_overview(bank_id),
        }
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        print("ERROR GET /banks/{bank_id}/ops:", repr(error))
        raise HTTPException(
            status_code=500,
            detail="Gagal membaca OPS bank.",
        ) from error


@app.put("/banks/{bank_id}/profile")
def update_bank_ops_profile(bank_id: str, payload: BankOpsProfileRequest):
    try:
        return {
            "status": "success",
            "profile": save_bank_profile(bank_id, payload.model_dump()),
        }
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        print("ERROR PUT /banks/{bank_id}/profile:", repr(error))
        raise HTTPException(
            status_code=500,
            detail="Gagal menyimpan profil bank.",
        ) from error


# =====================================================
# OPS 7A.2: FINANCIAL SOURCE MAPPING
# =====================================================

@app.get("/ops/financial/sources")
def ops_financial_sources():
    return {"status": "success", "tables": get_source_catalog()}


@app.get("/ops/financial/mappings")
def ops_financial_mappings():
    return {"status": "success", "metrics": list_financial_mappings()}


@app.put("/ops/financial/mappings/{metric_key}")
def ops_save_financial_mapping(metric_key: str, payload: OpsFinancialMappingRequest):
    try:
        return {"status": "success", "metric": save_financial_mapping(metric_key, payload.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/ops/financial/formulas/preview")
def ops_preview_financial_formula(payload: OpsFormulaPreviewRequest):
    try:
        result = preview_financial_formula(
            payload.bank_id, payload.period, payload.metric_key, payload.model_dump()
        )
        return {"status": "success", **result}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/ops/financial/mappings/{metric_key}")
def ops_delete_financial_mapping(metric_key: str):
    try:
        return {"status": "success", **delete_financial_mapping(metric_key)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/banks/{bank_id}/ops/reconciliation")
def ops_bank_reconciliation(
    bank_id: str,
    period: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    table_name: str = Query(...),
    assets_column: str = Query(...),
    liabilities_column: str = Query(...),
    equity_column: str = Query(...),
    derived_column: str | None = Query(None),
):
    try:
        return reconcile_warehouse_columns(
            bank_id, period, table_name, assets_column,
            liabilities_column, equity_column, derived_column,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        print("ERROR OPS reconciliation:", repr(exc))
        raise HTTPException(status_code=500, detail="Gagal membaca data rekonsiliasi.")


@app.get("/banks/{bank_id}/ops/financial")
def ops_bank_financial(bank_id: str, period: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$")):
    try:
        return {"status": "success", **get_financial_performance(bank_id, period)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# =====================================================
# EXCEL SHEETS
# =====================================================

@app.post("/excel/sheets")
async def detect_sheets(
    file: UploadFile = File(...),
):
    try:
        file_bytes = await file.read()

        sheets = get_excel_sheets(
            file_bytes
        )

        return {
            "filename": file.filename,
            "sheets": sheets,
        }

    except Exception as error:
        print(
            "ERROR /excel/sheets:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


# =====================================================
# 7A.2.2.1 SMART PIVOT PREVIEW (READ-ONLY)
# =====================================================

@app.post("/excel/pivot-preview")
async def pivot_excel_preview(
    file: UploadFile = File(...),
    sheet_name: str = Form(...),
    bank_name: str = Form(...),
    month: int = Form(...),
    year: int = Form(...),
    code_column: int | None = Form(None),
    value_column: int | None = Form(None),
):
    try:
        bank = get_bank_by_name(bank_name)
        file_bytes = await file.read()
        result = preview_pivot_excel(
            file_bytes=file_bytes,
            sheet_name=sheet_name,
            bank_id=bank["bank_id"],
            bank_name=bank["bank_name"],
            month=month,
            year=year,
            code_column=code_column,
            value_column=value_column,
        )
        return result
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        print("ERROR POST /excel/pivot-preview:", repr(error))
        raise HTTPException(
            status_code=400,
            detail="Gagal memproses Smart Pivot Preview.",
        )


# =====================================================
# 7A.2.2.2 PIVOT WAREHOUSE STORAGE
# =====================================================

@app.post("/excel/pivot-save")
async def pivot_excel_save(
    file: UploadFile = File(...),
    sheet_name: str = Form(...),
    bank_name: str = Form(...),
    month: int = Form(...),
    year: int = Form(...),
    table_name: str = Form(...),
    table_mode: str = Form("new"),
    duplicate_action: str = Form("block"),
    code_column: int | None = Form(None),
    value_column: int | None = Form(None),
):
    try:
        bank = get_bank_by_name(bank_name)
        data = await file.read()
        return store_pivot_excel(
            file_bytes=data, sheet_name=sheet_name,
            bank_id=bank["bank_id"], bank_name=bank["bank_name"],
            month=month, year=year, table_name=table_name,
            action=duplicate_action, table_mode=table_mode,
            filename=file.filename,
            code_column=code_column, value_column=value_column,
        )
    except PivotPeriodExists as error:
        raise HTTPException(status_code=409, detail=error.detail)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        print("ERROR /excel/pivot-save:", repr(error))
        raise HTTPException(status_code=500, detail="Gagal menyimpan Pivot Warehouse.")


# =====================================================
# PREVIEW EXCEL
# =====================================================

@app.post("/excel/preview")
async def preview_excel(
    file: UploadFile = File(...),
    table_mode: str = Form(...),
    table_name: str = Form(...),
    bank_name: str = Form(...),
    month: int = Form(...),
    year: int = Form(...),
    sheet_name: str = Form(...),
    header_row: int | None = Form(None),
    first_data_row: int | None = Form(None),
):
    try:
        table_mode = table_mode.strip().lower()

        file_bytes = await file.read()

        df = process_upload_by_mode(
            file_bytes=file_bytes,
            table_mode=table_mode,
            table_name=table_name,
            sheet_name=sheet_name,
            header_row=header_row,
            first_data_row=first_data_row,
            month=month,
            year=year,
        )

        df, bank = attach_bank_id(
            df,
            bank_name,
        )

        df = df.reset_index(drop=True)
        df.insert(
            0,
            "__row_id",
            range(1, len(df) + 1),
        )

        preview = dataframe_to_records(df)

        database_columns = [
            str(column)
            for column in df.columns
            if column != "__row_id"
        ]

        return {
            "status": "success",
            "filename": file.filename,
            "table_mode": table_mode,
            "table_name": table_name,
            "bank_name": bank["bank_name"],
            "bank_id": bank["bank_id"],
            "month": month,
            "year": year,
            "sheet_name": sheet_name,
            "header_row": (
                header_row
                if table_mode == "new"
                else None
            ),
            "first_data_row": (
                first_data_row
                if table_mode == "existing"
                else None
            ),
            "row_count": len(df),
            "column_count": len(
                database_columns
            ),
            "columns": database_columns,
            "preview": preview,
        }

    except Exception as error:
        print(
            "ERROR /excel/preview:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


# =====================================================
# CHECK EXISTING PERIOD
# =====================================================

@app.post("/excel/check-period")
async def check_excel_period(
    table_name: str = Form(...),
    bank_name: str = Form(...),
    month: int = Form(...),
    year: int = Form(...),
):
    try:
        bank = get_bank_by_name(
            bank_name
        )

        row_count = count_period_rows(
            table_name=table_name,
            bank_id=bank["bank_id"],
            month=month,
            year=year,
        )

        return {
            "status": "success",
            "table_name": table_name,
            "bank_name": bank["bank_name"],
            "bank_id": bank["bank_id"],
            "month": month,
            "year": year,
            "exists": row_count > 0,
            "row_count": row_count,
        }

    except Exception as error:
        print(
            "ERROR /excel/check-period:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


# =====================================================
# SAVE EXCEL TO DATABASE
# =====================================================

@app.post("/excel/save")
async def save_excel(
    file: UploadFile = File(...),
    table_mode: str = Form(...),
    table_name: str = Form(...),
    bank_name: str = Form(...),
    month: int = Form(...),
    year: int = Form(...),
    sheet_name: str = Form(...),
    header_row: int | None = Form(None),
    first_data_row: int | None = Form(None),
    deleted_rows: str = Form("[]"),
    column_mapping: str = Form("{}"),
    duplicate_action: str = Form("block"),
):
    try:
        table_mode = table_mode.strip().lower()

        if table_mode not in {
            "new",
            "existing",
        }:
            raise ValueError(
                "table_mode harus bernilai 'new' atau 'existing'."
            )

        duplicate_action = duplicate_action.strip().lower()

        if duplicate_action not in {
            "block",
            "replace",
            "append",
        }:
            raise ValueError(
                "duplicate_action harus bernilai "
                "'block', 'replace', atau 'append'."
            )

        deleted_row_ids = parse_json_list(
            deleted_rows,
            "deleted_rows",
        )

        column_map = parse_json_dict(
            column_mapping,
            "column_mapping",
        )

        file_bytes = await file.read()

        df = process_upload_by_mode(
            file_bytes=file_bytes,
            table_mode=table_mode,
            table_name=table_name,
            sheet_name=sheet_name,
            header_row=header_row,
            first_data_row=first_data_row,
            month=month,
            year=year,
        )

        df, bank = attach_bank_id(
            df,
            bank_name,
        )

        original_rows = len(df)

        df = df.reset_index(drop=True)
        df.insert(
            0,
            "__row_id",
            range(1, len(df) + 1),
        )

        normalized_deleted_rows = []

        for row_id in deleted_row_ids:
            try:
                parsed_row_id = int(row_id)
            except (TypeError, ValueError) as error:
                raise ValueError(
                    f"Row ID '{row_id}' tidak valid."
                ) from error

            if parsed_row_id < 1:
                raise ValueError(
                    "Row ID harus lebih besar dari 0."
                )

            if (
                parsed_row_id
                not in normalized_deleted_rows
            ):
                normalized_deleted_rows.append(
                    parsed_row_id
                )

        valid_row_ids = set(
            df["__row_id"].tolist()
        )

        invalid_row_ids = [
            row_id
            for row_id in normalized_deleted_rows
            if row_id not in valid_row_ids
        ]

        if invalid_row_ids:
            raise ValueError(
                "Terdapat row ID yang tidak valid: "
                + ", ".join(
                    map(str, invalid_row_ids)
                )
            )

        if normalized_deleted_rows:
            df = df[
                ~df["__row_id"].isin(
                    normalized_deleted_rows
                )
            ]

        df = df.drop(
            columns=["__row_id"]
        ).reset_index(drop=True)

        if df.empty:
            raise ValueError(
                "Tidak ada data yang dapat disimpan "
                "setelah penghapusan row."
            )

        previous_period_rows = 0

        # -----------------------------------------
        # NEW TABLE
        # -----------------------------------------
        if table_mode == "new":
            protected_columns = SYSTEM_COLUMNS

            for old_name, new_name in column_map.items():
                old_name = str(old_name)
                new_name = str(
                    new_name
                ).strip()

                if old_name in protected_columns:
                    raise ValueError(
                        f"Kolom sistem '{old_name}' "
                        "tidak dapat diubah."
                    )

                if old_name not in df.columns:
                    raise ValueError(
                        f"Kolom '{old_name}' "
                        "tidak ditemukan."
                    )

                if not new_name:
                    raise ValueError(
                        f"Nama baru untuk kolom "
                        f"'{old_name}' tidak boleh kosong."
                    )

            source_business_columns = [
                str(column)
                for column in df.columns
                if str(column) not in SYSTEM_COLUMNS
            ]

            schema_mapping = []

            for ordinal, source_column in enumerate(
                source_business_columns,
                start=1,
            ):
                final_column = str(
                    column_map.get(
                        source_column,
                        source_column,
                    )
                ).strip()

                schema_mapping.append(
                    {
                        "source_ordinal": ordinal,
                        "source_column": source_column,
                        "database_column": final_column,
                    }
                )

            if column_map:
                df = df.rename(
                    columns=column_map
                )

            result = create_new_table(
                table_name=table_name,
                df=df,
                schema_mapping=schema_mapping,
            )

        # -----------------------------------------
        # EXISTING TABLE
        # -----------------------------------------
        else:
            if column_map:
                raise ValueError(
                    "Nama kolom tidak dapat diubah "
                    "saat upload ke tabel existing."
                )

            previous_period_rows = count_period_rows(
                table_name=table_name,
                bank_id=bank["bank_id"],
                month=month,
                year=year,
            )

            if previous_period_rows > 0:
                if duplicate_action == "block":
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "code": "DUPLICATE_PERIOD",
                            "message": (
                                f"Data {bank['bank_name']} periode "
                                f"{month}/{year} sudah tersedia."
                            ),
                            "table_name": table_name,
                            "bank_name": bank["bank_name"],
                            "bank_id": bank["bank_id"],
                            "month": month,
                            "year": year,
                            "row_count": previous_period_rows,
                        },
                    )

                if duplicate_action == "replace":
                    result = replace_period_data(
                        table_name=table_name,
                        df=df,
                        bank_id=bank["bank_id"],
                        month=month,
                        year=year,
                    )

                else:
                    result = append_existing_table(
                        table_name=table_name,
                        df=df,
                    )

            else:
                result = append_existing_table(
                    table_name=table_name,
                    df=df,
                )

        return {
            "status": "success",
            "message": "Data berhasil disimpan ke database.",
            "table_name": result["table_name"],
            "table_mode": result["mode"],
            "bank_name": bank["bank_name"],
            "bank_id": bank["bank_id"],
            "month": month,
            "year": year,
            "original_rows": original_rows,
            "deleted_rows": len(
                normalized_deleted_rows
            ),
            "duplicate_action": (
                result.get("duplicate_action")
                if table_mode == "existing"
                else None
            ),
            "previous_period_rows": (
                previous_period_rows
                if table_mode == "existing"
                else 0
            ),
            "replaced_rows": result.get(
                "replaced_rows",
                0,
            ),
            "inserted_rows": result[
                "inserted_rows"
            ],
        }

    except HTTPException:
        raise

    except Exception as error:
        print(
            "ERROR /excel/save:",
            repr(error),
        )

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )
