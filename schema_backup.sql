--
-- PostgreSQL database dump
--

\restrict hh9s5yorSqcC6G8xbpNsTraloTDxXO4e5gLEbsHzaMKEOJEfZYM15J3BvZ2MYJY

-- Dumped from database version 17.11 (Homebrew)
-- Dumped by pg_dump version 17.11 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: 0016; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public."0016" (
    bank_id text,
    id_pihak_lawan text,
    jenis_identitas text,
    nomor_identitas text,
    jenis_kelamin text,
    nama_lengkap_nama_badan_usaha text,
    npwp text,
    kewarganegaraan text,
    negara text,
    jenis_kegiatan_usaha text,
    hubungan_dengan_bank text,
    golongan_pihak_lawan text,
    lembaga_pemeringkat text,
    peringkat_pihak_lawan text,
    tanggal_lahir text,
    lokasi text,
    no_telp_no_hp text,
    alamat text,
    bulan bigint,
    tahun bigint
);


ALTER TABLE public."0016" OWNER TO awtronton;

--
-- Name: 0600; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public."0600" (
    bank_id text,
    sandi_kantor text,
    id_pihak_lawan text,
    no_identitas text,
    no_rekening text,
    jenis text,
    status_restrukturisasi text,
    jenis_penggunaan text,
    hubungan_dengan_bank text,
    sumber_dana_pelunasan text,
    periode_pembayaran_pokok text,
    periode_pembayaran_bunga text,
    tgl_mulai text,
    tgl_jatuh_tempo text,
    angsuran_pokok_pertama text,
    kualitas text,
    tanggal_mulai_macet text,
    jml_hari_tunggakan_pokok bigint,
    jml_hari_tunggakan_bunga bigint,
    nominal_tunggakan_pokok bigint,
    nominal_tunggakan_bunga bigint,
    jenis_debitur text,
    sektor_ekonomi text,
    kategori_usaha text,
    lokasi_penggunaan text,
    suku_bunga_persen text,
    suku_bunga_perhitungan text,
    gol_penjamin text,
    yang_dijamin bigint,
    agunan_untuk_ppap_likuid bigint,
    agunan_untuk_ppap_non_likuid bigint,
    kelonggaran_tarik double precision,
    plafon_awal bigint,
    plafon_efektif bigint,
    baki_debet double precision,
    provisi_belum_diamortisasi double precision,
    biaya_transaksi_belum_diamortisasi double precision,
    pendapatan_bunga_ditangguhkan_dalam_rangka_restrukturisasi double precision,
    cadangan_kerugian_restrukturisasi double precision,
    baki_debet_neto double precision,
    ckpn_terbentuk bigint,
    ckpn_kelebihan_restrukturisasi bigint,
    pendapatan_bunga_yang_akan_diterima double precision,
    pendapatan_bunga_dalam_penyelesaian double precision,
    status_bmpk text,
    sifat_kredit text,
    kredit_program_pemerintah text,
    sektor_kredit_usaha_rakyat text,
    tanggal_akad_awal text,
    tanggal_akad_akhir text,
    jenis_ckpn text,
    bulan bigint,
    tahun bigint
);


ALTER TABLE public."0600" OWNER TO awtronton;

--
-- Name: 1300; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public."1300" (
    bank_id text,
    sandi_kantor text,
    id_pihak_lawan text,
    no_rekening text,
    jenis_bank text,
    sandi_bank text,
    lokasi_bank text,
    jenis text,
    relasi_dengan_bank text,
    tgl_mulai text,
    tgl_jatuh_tempo text,
    suku_bunga double precision,
    nominal double precision,
    nominal_yang_diblokir_dijaminkan double precision,
    biaya_transaksi_belum_diamortisasi double precision,
    jumlah double precision,
    bulan bigint,
    tahun bigint
);


ALTER TABLE public."1300" OWNER TO awtronton;

--
-- Name: warehouse_column_profiles; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_column_profiles (
    id integer NOT NULL,
    table_name character varying(63) NOT NULL,
    column_name character varying(63) NOT NULL,
    data_type character varying(128) NOT NULL,
    type_family character varying(32) NOT NULL,
    profile_version integer NOT NULL,
    profile_mode character varying(32) NOT NULL,
    source_data_version bigint NOT NULL,
    row_count_estimate bigint,
    table_size_bytes bigint,
    sample_row_count bigint NOT NULL,
    sample_non_null_count bigint NOT NULL,
    sample_distinct_count bigint NOT NULL,
    null_ratio double precision,
    distinct_ratio double precision,
    avg_length double precision,
    value_fingerprint json,
    fingerprint_version character varying(32) NOT NULL,
    is_stale boolean NOT NULL,
    stale_reason character varying(255),
    last_profiled_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.warehouse_column_profiles OWNER TO awtronton;

--
-- Name: warehouse_column_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_column_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_column_profiles_id_seq OWNER TO awtronton;

--
-- Name: warehouse_column_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_column_profiles_id_seq OWNED BY public.warehouse_column_profiles.id;


--
-- Name: warehouse_column_settings; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_column_settings (
    id integer NOT NULL,
    table_name character varying(63) NOT NULL,
    column_name character varying(63) NOT NULL,
    is_masked boolean NOT NULL
);


ALTER TABLE public.warehouse_column_settings OWNER TO awtronton;

--
-- Name: warehouse_column_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_column_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_column_settings_id_seq OWNER TO awtronton;

--
-- Name: warehouse_column_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_column_settings_id_seq OWNED BY public.warehouse_column_settings.id;


--
-- Name: warehouse_profile_jobs; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_profile_jobs (
    id integer NOT NULL,
    table_name character varying(63) NOT NULL,
    status character varying(24) NOT NULL,
    requested_columns json,
    target_sample_rows integer NOT NULL,
    profile_strategy character varying(32) NOT NULL,
    source_data_version bigint,
    total_columns integer NOT NULL,
    processed_columns integer NOT NULL,
    worker_backend character varying(32) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    started_at timestamp without time zone,
    finished_at timestamp without time zone,
    error_message text,
    result_summary json
);


ALTER TABLE public.warehouse_profile_jobs OWNER TO awtronton;

--
-- Name: warehouse_profile_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_profile_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_profile_jobs_id_seq OWNER TO awtronton;

--
-- Name: warehouse_profile_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_profile_jobs_id_seq OWNED BY public.warehouse_profile_jobs.id;


--
-- Name: warehouse_relationship_candidate_jobs; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_relationship_candidate_jobs (
    id integer NOT NULL,
    status character varying(24) NOT NULL,
    scan_mode character varying(32) NOT NULL,
    source_tables json,
    target_tables json,
    min_discovery_score double precision NOT NULL,
    max_candidates integer NOT NULL,
    include_system_columns boolean NOT NULL,
    profile_columns_considered integer NOT NULL,
    pair_evaluations bigint NOT NULL,
    generated_count integer NOT NULL,
    skipped_existing_count integer NOT NULL,
    truncated boolean NOT NULL,
    worker_backend character varying(32) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    started_at timestamp without time zone,
    finished_at timestamp without time zone,
    error_message text,
    result_summary json
);


ALTER TABLE public.warehouse_relationship_candidate_jobs OWNER TO awtronton;

--
-- Name: warehouse_relationship_candidate_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_relationship_candidate_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_relationship_candidate_jobs_id_seq OWNER TO awtronton;

--
-- Name: warehouse_relationship_candidate_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_relationship_candidate_jobs_id_seq OWNED BY public.warehouse_relationship_candidate_jobs.id;


--
-- Name: warehouse_relationship_candidate_scores; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_relationship_candidate_scores (
    id integer NOT NULL,
    candidate_id integer NOT NULL,
    candidate_key character varying(64) NOT NULL,
    scoring_version character varying(48) NOT NULL,
    source_profile_version integer NOT NULL,
    target_profile_version integer NOT NULL,
    source_data_version bigint NOT NULL,
    target_data_version bigint NOT NULL,
    semantic_score double precision NOT NULL,
    datatype_score double precision NOT NULL,
    fingerprint_score double precision,
    profile_quality_score double precision NOT NULL,
    key_plausibility_score double precision NOT NULL,
    evidence_sufficiency_score double precision NOT NULL,
    penalty_score double precision NOT NULL,
    confidence_score double precision NOT NULL,
    confidence_level character varying(24) NOT NULL,
    component_scores json,
    quality_flags json,
    rationale json,
    is_stale boolean NOT NULL,
    stale_reason character varying(255),
    last_scored_job_id integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.warehouse_relationship_candidate_scores OWNER TO awtronton;

--
-- Name: warehouse_relationship_candidate_scores_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_relationship_candidate_scores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_relationship_candidate_scores_id_seq OWNER TO awtronton;

--
-- Name: warehouse_relationship_candidate_scores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_relationship_candidate_scores_id_seq OWNED BY public.warehouse_relationship_candidate_scores.id;


--
-- Name: warehouse_relationship_candidates; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_relationship_candidates (
    id integer NOT NULL,
    candidate_key character varying(64) NOT NULL,
    table_pair_key character varying(64) NOT NULL,
    source_table character varying(63) NOT NULL,
    source_column character varying(63) NOT NULL,
    target_table character varying(63) NOT NULL,
    target_column character varying(63) NOT NULL,
    source_profile_version integer NOT NULL,
    target_profile_version integer NOT NULL,
    source_data_version bigint NOT NULL,
    target_data_version bigint NOT NULL,
    source_type_family character varying(32) NOT NULL,
    target_type_family character varying(32) NOT NULL,
    name_similarity double precision NOT NULL,
    fingerprint_overlap double precision NOT NULL,
    discovery_score double precision NOT NULL,
    evidence json,
    detector_version character varying(48) NOT NULL,
    status character varying(24) NOT NULL,
    is_stale boolean NOT NULL,
    stale_reason character varying(255),
    last_seen_job_id integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.warehouse_relationship_candidates OWNER TO awtronton;

--
-- Name: warehouse_relationship_candidates_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_relationship_candidates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_relationship_candidates_id_seq OWNER TO awtronton;

--
-- Name: warehouse_relationship_candidates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_relationship_candidates_id_seq OWNED BY public.warehouse_relationship_candidates.id;


--
-- Name: warehouse_relationship_cardinality_estimates; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_relationship_cardinality_estimates (
    id integer NOT NULL,
    candidate_id integer NOT NULL,
    candidate_key character varying(64) NOT NULL,
    estimation_version character varying(48) NOT NULL,
    source_profile_version integer NOT NULL,
    target_profile_version integer NOT NULL,
    source_data_version bigint NOT NULL,
    target_data_version bigint NOT NULL,
    source_role character varying(24) NOT NULL,
    target_role character varying(24) NOT NULL,
    source_role_confidence double precision NOT NULL,
    target_role_confidence double precision NOT NULL,
    estimated_cardinality character varying(32) NOT NULL,
    cardinality_confidence double precision NOT NULL,
    evidence json,
    quality_flags json,
    requires_review boolean NOT NULL,
    is_stale boolean NOT NULL,
    stale_reason character varying(255),
    last_estimated_job_id integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.warehouse_relationship_cardinality_estimates OWNER TO awtronton;

--
-- Name: warehouse_relationship_cardinality_estimates_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_relationship_cardinality_estimates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_relationship_cardinality_estimates_id_seq OWNER TO awtronton;

--
-- Name: warehouse_relationship_cardinality_estimates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_relationship_cardinality_estimates_id_seq OWNED BY public.warehouse_relationship_cardinality_estimates.id;


--
-- Name: warehouse_relationship_cardinality_jobs; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_relationship_cardinality_jobs (
    id integer NOT NULL,
    status character varying(24) NOT NULL,
    source_tables json,
    target_tables json,
    candidate_status character varying(24),
    min_discovery_score double precision NOT NULL,
    min_quality_score double precision NOT NULL,
    max_candidates integer NOT NULL,
    candidate_count integer NOT NULL,
    estimated_count integer NOT NULL,
    skipped_count integer NOT NULL,
    worker_backend character varying(32) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    started_at timestamp without time zone,
    finished_at timestamp without time zone,
    error_message text,
    result_summary json
);


ALTER TABLE public.warehouse_relationship_cardinality_jobs OWNER TO awtronton;

--
-- Name: warehouse_relationship_cardinality_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_relationship_cardinality_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_relationship_cardinality_jobs_id_seq OWNER TO awtronton;

--
-- Name: warehouse_relationship_cardinality_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_relationship_cardinality_jobs_id_seq OWNED BY public.warehouse_relationship_cardinality_jobs.id;


--
-- Name: warehouse_relationship_columns; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_relationship_columns (
    id integer NOT NULL,
    relationship_id integer NOT NULL,
    source_column character varying(63) NOT NULL,
    target_column character varying(63) NOT NULL,
    ordinal integer NOT NULL
);


ALTER TABLE public.warehouse_relationship_columns OWNER TO awtronton;

--
-- Name: warehouse_relationship_columns_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_relationship_columns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_relationship_columns_id_seq OWNER TO awtronton;

--
-- Name: warehouse_relationship_columns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_relationship_columns_id_seq OWNED BY public.warehouse_relationship_columns.id;


--
-- Name: warehouse_relationship_review_candidates; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_relationship_review_candidates (
    id integer NOT NULL,
    review_id integer NOT NULL,
    candidate_id integer NOT NULL,
    material_signature character varying(64) NOT NULL
);


ALTER TABLE public.warehouse_relationship_review_candidates OWNER TO awtronton;

--
-- Name: warehouse_relationship_review_candidates_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_relationship_review_candidates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_relationship_review_candidates_id_seq OWNER TO awtronton;

--
-- Name: warehouse_relationship_review_candidates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_relationship_review_candidates_id_seq OWNED BY public.warehouse_relationship_review_candidates.id;


--
-- Name: warehouse_relationship_reviews; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_relationship_reviews (
    id integer NOT NULL,
    request_key character varying(64) NOT NULL,
    request_digest character varying(64) NOT NULL,
    reviewed_by character varying(180) NOT NULL,
    reviewer_source character varying(48) NOT NULL,
    reviewed_at timestamp without time zone DEFAULT now() NOT NULL,
    review_note text NOT NULL,
    decision character varying(24) NOT NULL,
    promoted_relationship_id integer,
    snapshot json NOT NULL,
    confirmation json NOT NULL,
    subject_relationship_id integer
);


ALTER TABLE public.warehouse_relationship_reviews OWNER TO awtronton;

--
-- Name: warehouse_relationship_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_relationship_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_relationship_reviews_id_seq OWNER TO awtronton;

--
-- Name: warehouse_relationship_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_relationship_reviews_id_seq OWNED BY public.warehouse_relationship_reviews.id;


--
-- Name: warehouse_relationship_scoring_jobs; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_relationship_scoring_jobs (
    id integer NOT NULL,
    status character varying(24) NOT NULL,
    source_tables json,
    target_tables json,
    candidate_status character varying(24),
    min_discovery_score double precision NOT NULL,
    max_candidates integer NOT NULL,
    candidate_count integer NOT NULL,
    scored_count integer NOT NULL,
    skipped_count integer NOT NULL,
    worker_backend character varying(32) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    started_at timestamp without time zone,
    finished_at timestamp without time zone,
    error_message text,
    result_summary json
);


ALTER TABLE public.warehouse_relationship_scoring_jobs OWNER TO awtronton;

--
-- Name: warehouse_relationship_scoring_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_relationship_scoring_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_relationship_scoring_jobs_id_seq OWNER TO awtronton;

--
-- Name: warehouse_relationship_scoring_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_relationship_scoring_jobs_id_seq OWNED BY public.warehouse_relationship_scoring_jobs.id;


--
-- Name: warehouse_schema_mapping; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_schema_mapping (
    id integer NOT NULL,
    table_name character varying(63) NOT NULL,
    source_ordinal integer NOT NULL,
    source_column character varying(255) NOT NULL,
    database_column character varying(63) NOT NULL
);


ALTER TABLE public.warehouse_schema_mapping OWNER TO awtronton;

--
-- Name: warehouse_schema_mapping_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_schema_mapping_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_schema_mapping_id_seq OWNER TO awtronton;

--
-- Name: warehouse_schema_mapping_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_schema_mapping_id_seq OWNED BY public.warehouse_schema_mapping.id;


--
-- Name: warehouse_table_relationships; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_table_relationships (
    id integer NOT NULL,
    relationship_name character varying(180) NOT NULL,
    source_table character varying(63) NOT NULL,
    source_column character varying(63) NOT NULL,
    target_table character varying(63) NOT NULL,
    target_column character varying(63) NOT NULL,
    cardinality character varying(32) NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    structure_revision integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.warehouse_table_relationships OWNER TO awtronton;

--
-- Name: warehouse_table_relationships_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_table_relationships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_table_relationships_id_seq OWNER TO awtronton;

--
-- Name: warehouse_table_relationships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_table_relationships_id_seq OWNED BY public.warehouse_table_relationships.id;


--
-- Name: warehouse_table_state; Type: TABLE; Schema: public; Owner: awtronton
--

CREATE TABLE public.warehouse_table_state (
    id integer NOT NULL,
    table_name character varying(63) NOT NULL,
    data_version bigint NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.warehouse_table_state OWNER TO awtronton;

--
-- Name: warehouse_table_state_id_seq; Type: SEQUENCE; Schema: public; Owner: awtronton
--

CREATE SEQUENCE public.warehouse_table_state_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.warehouse_table_state_id_seq OWNER TO awtronton;

--
-- Name: warehouse_table_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: awtronton
--

ALTER SEQUENCE public.warehouse_table_state_id_seq OWNED BY public.warehouse_table_state.id;


--
-- Name: warehouse_column_profiles id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_column_profiles ALTER COLUMN id SET DEFAULT nextval('public.warehouse_column_profiles_id_seq'::regclass);


--
-- Name: warehouse_column_settings id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_column_settings ALTER COLUMN id SET DEFAULT nextval('public.warehouse_column_settings_id_seq'::regclass);


--
-- Name: warehouse_profile_jobs id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_profile_jobs ALTER COLUMN id SET DEFAULT nextval('public.warehouse_profile_jobs_id_seq'::regclass);


--
-- Name: warehouse_relationship_candidate_jobs id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_candidate_jobs ALTER COLUMN id SET DEFAULT nextval('public.warehouse_relationship_candidate_jobs_id_seq'::regclass);


--
-- Name: warehouse_relationship_candidate_scores id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_candidate_scores ALTER COLUMN id SET DEFAULT nextval('public.warehouse_relationship_candidate_scores_id_seq'::regclass);


--
-- Name: warehouse_relationship_candidates id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_candidates ALTER COLUMN id SET DEFAULT nextval('public.warehouse_relationship_candidates_id_seq'::regclass);


--
-- Name: warehouse_relationship_cardinality_estimates id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_cardinality_estimates ALTER COLUMN id SET DEFAULT nextval('public.warehouse_relationship_cardinality_estimates_id_seq'::regclass);


--
-- Name: warehouse_relationship_cardinality_jobs id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_cardinality_jobs ALTER COLUMN id SET DEFAULT nextval('public.warehouse_relationship_cardinality_jobs_id_seq'::regclass);


--
-- Name: warehouse_relationship_columns id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_columns ALTER COLUMN id SET DEFAULT nextval('public.warehouse_relationship_columns_id_seq'::regclass);


--
-- Name: warehouse_relationship_review_candidates id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_review_candidates ALTER COLUMN id SET DEFAULT nextval('public.warehouse_relationship_review_candidates_id_seq'::regclass);


--
-- Name: warehouse_relationship_reviews id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_reviews ALTER COLUMN id SET DEFAULT nextval('public.warehouse_relationship_reviews_id_seq'::regclass);


--
-- Name: warehouse_relationship_scoring_jobs id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_scoring_jobs ALTER COLUMN id SET DEFAULT nextval('public.warehouse_relationship_scoring_jobs_id_seq'::regclass);


--
-- Name: warehouse_schema_mapping id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_schema_mapping ALTER COLUMN id SET DEFAULT nextval('public.warehouse_schema_mapping_id_seq'::regclass);


--
-- Name: warehouse_table_relationships id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_table_relationships ALTER COLUMN id SET DEFAULT nextval('public.warehouse_table_relationships_id_seq'::regclass);


--
-- Name: warehouse_table_state id; Type: DEFAULT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_table_state ALTER COLUMN id SET DEFAULT nextval('public.warehouse_table_state_id_seq'::regclass);


--
-- Name: warehouse_column_profiles uq_column_profiles_table_column; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_column_profiles
    ADD CONSTRAINT uq_column_profiles_table_column UNIQUE (table_name, column_name);


--
-- Name: warehouse_column_settings uq_column_settings_table_column; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_column_settings
    ADD CONSTRAINT uq_column_settings_table_column UNIQUE (table_name, column_name);


--
-- Name: warehouse_relationship_columns uq_relationship_columns_relationship_ordinal; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_columns
    ADD CONSTRAINT uq_relationship_columns_relationship_ordinal UNIQUE (relationship_id, ordinal);


--
-- Name: warehouse_relationship_review_candidates uq_review_candidate; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_review_candidates
    ADD CONSTRAINT uq_review_candidate UNIQUE (review_id, candidate_id);


--
-- Name: warehouse_schema_mapping uq_schema_mapping_table_ordinal; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_schema_mapping
    ADD CONSTRAINT uq_schema_mapping_table_ordinal UNIQUE (table_name, source_ordinal);


--
-- Name: warehouse_column_profiles warehouse_column_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_column_profiles
    ADD CONSTRAINT warehouse_column_profiles_pkey PRIMARY KEY (id);


--
-- Name: warehouse_column_settings warehouse_column_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_column_settings
    ADD CONSTRAINT warehouse_column_settings_pkey PRIMARY KEY (id);


--
-- Name: warehouse_profile_jobs warehouse_profile_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_profile_jobs
    ADD CONSTRAINT warehouse_profile_jobs_pkey PRIMARY KEY (id);


--
-- Name: warehouse_relationship_candidate_jobs warehouse_relationship_candidate_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_candidate_jobs
    ADD CONSTRAINT warehouse_relationship_candidate_jobs_pkey PRIMARY KEY (id);


--
-- Name: warehouse_relationship_candidate_scores warehouse_relationship_candidate_scores_candidate_id_key; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_candidate_scores
    ADD CONSTRAINT warehouse_relationship_candidate_scores_candidate_id_key UNIQUE (candidate_id);


--
-- Name: warehouse_relationship_candidate_scores warehouse_relationship_candidate_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_candidate_scores
    ADD CONSTRAINT warehouse_relationship_candidate_scores_pkey PRIMARY KEY (id);


--
-- Name: warehouse_relationship_candidates warehouse_relationship_candidates_candidate_key_key; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_candidates
    ADD CONSTRAINT warehouse_relationship_candidates_candidate_key_key UNIQUE (candidate_key);


--
-- Name: warehouse_relationship_candidates warehouse_relationship_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_candidates
    ADD CONSTRAINT warehouse_relationship_candidates_pkey PRIMARY KEY (id);


--
-- Name: warehouse_relationship_cardinality_estimates warehouse_relationship_cardinality_estimates_candidate_id_key; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_cardinality_estimates
    ADD CONSTRAINT warehouse_relationship_cardinality_estimates_candidate_id_key UNIQUE (candidate_id);


--
-- Name: warehouse_relationship_cardinality_estimates warehouse_relationship_cardinality_estimates_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_cardinality_estimates
    ADD CONSTRAINT warehouse_relationship_cardinality_estimates_pkey PRIMARY KEY (id);


--
-- Name: warehouse_relationship_cardinality_jobs warehouse_relationship_cardinality_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_cardinality_jobs
    ADD CONSTRAINT warehouse_relationship_cardinality_jobs_pkey PRIMARY KEY (id);


--
-- Name: warehouse_relationship_columns warehouse_relationship_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_columns
    ADD CONSTRAINT warehouse_relationship_columns_pkey PRIMARY KEY (id);


--
-- Name: warehouse_relationship_review_candidates warehouse_relationship_review_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_review_candidates
    ADD CONSTRAINT warehouse_relationship_review_candidates_pkey PRIMARY KEY (id);


--
-- Name: warehouse_relationship_reviews warehouse_relationship_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_reviews
    ADD CONSTRAINT warehouse_relationship_reviews_pkey PRIMARY KEY (id);


--
-- Name: warehouse_relationship_reviews warehouse_relationship_reviews_request_key_key; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_reviews
    ADD CONSTRAINT warehouse_relationship_reviews_request_key_key UNIQUE (request_key);


--
-- Name: warehouse_relationship_scoring_jobs warehouse_relationship_scoring_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_relationship_scoring_jobs
    ADD CONSTRAINT warehouse_relationship_scoring_jobs_pkey PRIMARY KEY (id);


--
-- Name: warehouse_schema_mapping warehouse_schema_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_schema_mapping
    ADD CONSTRAINT warehouse_schema_mapping_pkey PRIMARY KEY (id);


--
-- Name: warehouse_table_relationships warehouse_table_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_table_relationships
    ADD CONSTRAINT warehouse_table_relationships_pkey PRIMARY KEY (id);


--
-- Name: warehouse_table_state warehouse_table_state_pkey; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_table_state
    ADD CONSTRAINT warehouse_table_state_pkey PRIMARY KEY (id);


--
-- Name: warehouse_table_state warehouse_table_state_table_name_key; Type: CONSTRAINT; Schema: public; Owner: awtronton
--

ALTER TABLE ONLY public.warehouse_table_state
    ADD CONSTRAINT warehouse_table_state_table_name_key UNIQUE (table_name);


--
-- Name: ix_column_profiles_table_stale; Type: INDEX; Schema: public; Owner: awtronton
--

CREATE INDEX ix_column_profiles_table_stale ON public.warehouse_column_profiles USING btree (table_name, is_stale);


--
-- Name: ix_profile_jobs_table_status; Type: INDEX; Schema: public; Owner: awtronton
--

CREATE INDEX ix_profile_jobs_table_status ON public.warehouse_profile_jobs USING btree (table_name, status);


--
-- Name: ix_relationship_candidate_jobs_status; Type: INDEX; Schema: public; Owner: awtronton
--

CREATE INDEX ix_relationship_candidate_jobs_status ON public.warehouse_relationship_candidate_jobs USING btree (status, id);


--
-- Name: ix_relationship_candidate_scores_confidence; Type: INDEX; Schema: public; Owner: awtronton
--

CREATE INDEX ix_relationship_candidate_scores_confidence ON public.warehouse_relationship_candidate_scores USING btree (is_stale, confidence_score);


--
-- Name: ix_relationship_candidates_status_score; Type: INDEX; Schema: public; Owner: awtronton
--

CREATE INDEX ix_relationship_candidates_status_score ON public.warehouse_relationship_candidates USING btree (status, is_stale, discovery_score);


--
-- Name: ix_relationship_candidates_table_pair; Type: INDEX; Schema: public; Owner: awtronton
--

CREATE INDEX ix_relationship_candidates_table_pair ON public.warehouse_relationship_candidates USING btree (source_table, target_table);


--
-- Name: ix_relationship_cardinality_estimates_cardinality; Type: INDEX; Schema: public; Owner: awtronton
--

CREATE INDEX ix_relationship_cardinality_estimates_cardinality ON public.warehouse_relationship_cardinality_estimates USING btree (is_stale, estimated_cardinality, cardinality_confidence);


--
-- Name: ix_relationship_cardinality_jobs_status; Type: INDEX; Schema: public; Owner: awtronton
--

CREATE INDEX ix_relationship_cardinality_jobs_status ON public.warehouse_relationship_cardinality_jobs USING btree (status, id);


--
-- Name: ix_relationship_reviews_promoted; Type: INDEX; Schema: public; Owner: awtronton
--

CREATE INDEX ix_relationship_reviews_promoted ON public.warehouse_relationship_reviews USING btree (promoted_relationship_id, decision);


--
-- Name: ix_relationship_reviews_subject; Type: INDEX; Schema: public; Owner: awtronton
--

CREATE INDEX ix_relationship_reviews_subject ON public.warehouse_relationship_reviews USING btree (subject_relationship_id, id);


--
-- Name: ix_relationship_scoring_jobs_status; Type: INDEX; Schema: public; Owner: awtronton
--

CREATE INDEX ix_relationship_scoring_jobs_status ON public.warehouse_relationship_scoring_jobs USING btree (status, id);


--
-- Name: ix_review_candidates_history; Type: INDEX; Schema: public; Owner: awtronton
--

CREATE INDEX ix_review_candidates_history ON public.warehouse_relationship_review_candidates USING btree (candidate_id, review_id);


--
-- PostgreSQL database dump complete
--

\unrestrict hh9s5yorSqcC6G8xbpNsTraloTDxXO4e5gLEbsHzaMKEOJEfZYM15J3BvZ2MYJY

