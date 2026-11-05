"""
Master data bank untuk Caffeine Theory.

Catatan:
- bank_id merupakan identifier internal Caffeine Theory.
- bank_id pada file ini bukan sandi bank resmi OJK.
- ID baru menggunakan rentang 7130001-7130010 agar tidak menimpa
  identifier dummy lama yang mungkin sudah tersimpan pada warehouse.
"""

BANKS = [
    {
        "bank_id": "7130001",
        "bank_name": "BPR MAL",
        "bank_type": "bpr",
    },
    {
        "bank_id": "7130002",
        "bank_name": "BPR MM",
        "bank_type": "bpr",
    },
    {
        "bank_id": "7130003",
        "bank_name": "BPR ME",
        "bank_type": "bpr",
    },
    {
        "bank_id": "7130004",
        "bank_name": "BPR P",
        "bank_type": "bpr",
    },
    {
        "bank_id": "7130005",
        "bank_name": "BPR CM",
        "bank_type": "bpr",
    },
    {
        "bank_id": "7130006",
        "bank_name": "BPR SS",
        "bank_type": "bpr",
    },
    {
        "bank_id": "7130007",
        "bank_name": "BPR B",
        "bank_type": "bpr",
    },
    {
        "bank_id": "7130008",
        "bank_name": "BPR BS",
        "bank_type": "bpr",
    },
    {
        "bank_id": "7130009",
        "bank_name": "BPR SB",
        "bank_type": "bpr",
    },
    {
        "bank_id": "7130010",
        "bank_name": "BPR S",
        "bank_type": "bpr",
    },
]

_BANKS_BY_NAME = {
    item["bank_name"].strip().casefold(): item
    for item in BANKS
}


def get_all_banks():
    """Mengembalikan daftar 10 BPR aktif untuk dropdown aplikasi."""
    return [item.copy() for item in BANKS]


def get_bank_by_name(bank_name: str):
    """Mengambil master bank berdasarkan nama, tanpa membedakan kapitalisasi."""
    key = str(bank_name or "").strip().casefold()

    if not key:
        raise ValueError("Nama bank wajib dipilih.")

    bank = _BANKS_BY_NAME.get(key)

    if not bank:
        raise ValueError(
            f"Nama bank '{bank_name}' tidak terdaftar pada master bank."
        )

    return bank.copy()
