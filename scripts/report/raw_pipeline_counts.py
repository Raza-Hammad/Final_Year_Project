"""Throwaway report-data script (Section 2.1). Runs the REAL loader functions
(app.data.loader.safe_read_csv, clean_dataframe, find_csv_files) against the
actual raw CIC-IDS2017 CSVs to capture exact per-file row counts and cleaning
drop reasons, by capturing the loader module's own logger output plus direct
len() measurements. Does not modify any application code -- only imports and
calls the existing functions. Output: scripts/report/out_raw_pipeline_counts.json
"""
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.config import settings
from app.data.loader import find_csv_files, safe_read_csv, clean_dataframe

# Capture every log record emitted by the loader module during the run
captured_logs = []

class ListHandler(logging.Handler):
    def emit(self, record):
        captured_logs.append(self.format(record))

handler = ListHandler()
handler.setFormatter(logging.Formatter("%(message)s"))
loader_logger = logging.getLogger("app.data.loader")
loader_logger.addHandler(handler)
loader_logger.setLevel(logging.INFO)
loader_logger.propagate = True

raw_dir = Path(settings.DATA_RAW_DIR)
csv_paths = find_csv_files(raw_dir)

per_file = []
combined_rows_after_clean = 0
for path in sorted(csv_paths, key=lambda p: p.name):
    raw_df = safe_read_csv(path)
    raw_rows = len(raw_df)
    raw_cols = len(raw_df.columns)
    cleaned_df = clean_dataframe(raw_df.copy(), file_name=path.name)
    cleaned_rows = len(cleaned_df)
    per_file.append({
        "file": path.name,
        "raw_rows": raw_rows,
        "raw_columns": raw_cols,
        "cleaned_rows": cleaned_rows,
        "rows_dropped_this_file": raw_rows - cleaned_rows,
    })
    combined_rows_after_clean += cleaned_rows
    print(f"{path.name}: raw={raw_rows:,} cleaned={cleaned_rows:,} dropped={raw_rows-cleaned_rows:,}")

total_raw = sum(f["raw_rows"] for f in per_file)
result = {
    "csv_files_found": [p.name for p in sorted(csv_paths, key=lambda p: p.name)],
    "per_file": per_file,
    "total_raw_rows_all_files": total_raw,
    "total_cleaned_rows_all_files_before_concat_dedup": combined_rows_after_clean,
    "captured_logs": captured_logs,
}

out_path = Path(__file__).resolve().parent / "out_raw_pipeline_counts.json"
with open(out_path, "w") as f:
    json.dump(result, f, indent=2)

print(f"\nTOTAL RAW: {total_raw:,}")
print(f"TOTAL CLEANED (sum of per-file cleaned): {combined_rows_after_clean:,}")
print(f"Wrote {out_path}")
