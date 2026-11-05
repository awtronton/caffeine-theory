import io
import re
import pandas as pd


def clean_column_name(column):
    """
    Membersihkan nama kolom agar SQL-ready.
    """

    column = str(column).strip().lower()

    column = column.replace("\n", " ")

    column = re.sub(r"\s+", "_", column)

    column = column.replace(".", "")
    column = column.replace("/", "_")
    column = column.replace("-", "_")
    column = column.replace("(", "")
    column = column.replace(")", "")
    column = column.replace("%", "persen")

    column = re.sub(
        r"[^a-zA-Z0-9_]",
        "",
        column
    )

    column = re.sub(
        r"_+",
        "_",
        column
    )

    column = column.strip("_")

    if not column:
        column = "unnamed"

    return column


def make_unique_columns(columns):
    """
    Menghindari duplicate column name.
    """

    result = []
    counter = {}

    for column in columns:

        if column not in counter:
            counter[column] = 1
            result.append(column)

        else:
            counter[column] += 1

            result.append(
                f"{column}_{counter[column]}"
            )

    return result


def clean_value(value):
    """
    Membersihkan isi cell.
    """

    if pd.isna(value):
        return None

    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")

    if isinstance(value, float):
        if value.is_integer():
            return int(value)

    if isinstance(value, str):
        value = value.strip()

        if value == "":
            return None

        return value

    return value


def _empty_cell(value):
    """Empty means NULL/NaN or whitespace, never numeric zero."""
    if value is None:
        return True
    try:
        if bool(pd.isna(value)):
            return True
    except (ValueError, TypeError):
        pass
    return isinstance(value, str) and not value.strip()


def _generated_empty_header(value):
    """Pandas assigns 'Unnamed: N' to physically blank Excel headers."""
    if _empty_cell(value):
        return True
    return bool(re.fullmatch(r"Unnamed: \d+(?:_level_\d+)?", str(value)))


def clean_dataframe(df, month, year):
    """Keep declared header columns even when their values are all empty.

    Remove a row only when all *data* cells are genuinely empty. Remove a
    column only when its Excel header is missing AND all data cells are empty.
    Numeric 0 is always a valid data value.
    """
    df = df.copy()

    # Header-only columns have schema meaning even when all values are NULL.
    # Do not use df.dropna(axis=1, how='all') here.
    drop_columns = [
        col for col in df.columns
        if _generated_empty_header(col)
        and df[col].map(_empty_cell).all()
    ]
    if drop_columns:
        df = df.drop(columns=drop_columns)

    # A completely empty row has no data; rows with any 0 are preserved.
    keep_rows = ~df.apply(lambda row: all(_empty_cell(v) for v in row), axis=1)
    df = df.loc[keep_rows].copy().reset_index(drop=True)

    columns = [clean_column_name(column) for column in df.columns]
    df.columns = make_unique_columns(columns)

    for column in df.columns:
        df[column] = df[column].map(clean_value)

    df['bulan'] = int(month)
    df['tahun'] = int(year)
    return df


def get_excel_sheets(file_bytes):
    """
    Mendapatkan daftar sheet Excel.
    """

    excel_file = pd.ExcelFile(
        io.BytesIO(file_bytes)
    )

    return excel_file.sheet_names


def process_excel(
    file_bytes,
    sheet_name,
    header_row,
    month,
    year
):
    """
    Membaca dan membersihkan Excel.
    """

    df = pd.read_excel(
        io.BytesIO(file_bytes),
        sheet_name=sheet_name,
        header=header_row - 1,
        dtype=object
    )

    df = clean_dataframe(
        df,
        month,
        year
    )

    return df