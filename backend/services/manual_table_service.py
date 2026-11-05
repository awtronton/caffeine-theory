"""7A.2.2.3: transactional creation of empty warehouse tables."""
import re
from sqlalchemy import (
    Column, MetaData, Table, String, Integer, BigInteger, Numeric,
    Date, DateTime, Boolean, Text, inspect,
)
from database.connection import engine
from database.table_service import (
    validate_table_name, validate_column_name, ensure_internal_tables,
    schema_mapping_table, _ensure_table_state_connection, SYSTEM_COLUMNS,
)

TYPES = {
    'TEXT': Text, 'VARCHAR(255)': lambda: String(255),
    'INTEGER': Integer, 'BIGINT': BigInteger,
    'NUMERIC': lambda: Numeric(28, 8), 'DATE': Date,
    'TIMESTAMP': DateTime, 'BOOLEAN': Boolean,
}


def create_empty_warehouse_table(table_name, columns, include_period=True):
    table_name = validate_table_name(table_name)
    if not re.fullmatch(r'[a-z][a-z0-9_]{0,62}', table_name):
        raise ValueError('Nama tabel harus diawali huruf kecil dan hanya memakai a-z, 0-9, underscore.')
    if not isinstance(columns, list) or not 1 <= len(columns) <= 100:
        raise ValueError('Tentukan antara 1 sampai 100 kolom manual.')
    if not isinstance(include_period, bool):
        raise ValueError('Pilihan kolom sistem tidak valid.')

    user_columns, seen = [], set()
    for item in columns:
        if not isinstance(item, dict):
            raise ValueError('Definisi kolom tidak valid.')
        name = validate_column_name(item.get('name', ''))
        if not re.fullmatch(r'[a-z][a-z0-9_]*', name):
            raise ValueError(f"Kolom '{name}' harus huruf kecil dan diawali huruf.")
        if name in SYSTEM_COLUMNS:
            raise ValueError(f"Kolom '{name}' dicadangkan untuk kolom bank/periode.")
        if name in seen:
            raise ValueError(f"Kolom '{name}' terduplikasi.")
        seen.add(name)
        dtype = str(item.get('data_type', '')).strip().upper()
        if dtype not in TYPES:
            raise ValueError(f"Tipe data '{dtype}' tidak didukung.")
        nullable = item.get('nullable', True)
        if not isinstance(nullable, bool):
            raise ValueError(f"Nullable untuk '{name}' harus boolean.")
        user_columns.append(Column(name, TYPES[dtype](), nullable=nullable))

    system_columns = (
        [Column('bank_id', String(64)), Column('bulan', Integer()), Column('tahun', Integer())]
        if include_period else []
    )
    all_columns = system_columns + user_columns
    ensure_internal_tables()
    new_table = Table(table_name, MetaData(), *all_columns)
    with engine.begin() as connection:
        if inspect(connection).has_table(table_name):
            raise ValueError(f"Tabel '{table_name}' sudah tersedia.")
        new_table.create(bind=connection, checkfirst=False)
        for ordinal, col in enumerate(user_columns, 1):
            connection.execute(schema_mapping_table.insert().values(
                table_name=table_name,
                source_ordinal=ordinal,
                source_column=col.name,
                database_column=col.name,
            ))
        _ensure_table_state_connection(connection, table_name)
    return {
        'status': 'success', 'table_name': table_name,
        'row_count': 0, 'column_count': len(all_columns),
        'columns': [column.name for column in all_columns],
        'mode': 'manual_empty',
    }
