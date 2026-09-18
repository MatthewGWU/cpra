"""Export the CPRA/C3PA train / validation / test splits to JSON.

Mirrors the pipeline in CPRA_C3PA_Primary_30pct (5).ipynb exactly:
  1. Load raw C3PA annotations from C3PA_Dataset/Annotations/{DB,WS}
  2. Map C3PA categories onto the 6-label CPRA schema
  3. Group rows into (doc_id, text) spans and deduplicate shared boilerplate text
  4. Target-balanced document selection: greedily keep documents (scarcity-first,
     seed 42) until each label reaches ~500 samples
  5. Split by document 70 / 15 / 15 (seed 42), asserting no leakage

Writes data/train.json, data/val.json, data/test.json for the showcase SPA.
"""

import json
import os
import random
import glob

import pandas as pd

ROOT = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(ROOT, "C3PA_Dataset")
OUT_DIR = os.path.join(ROOT, "data")

ALL_LABELS = [
    "Notice_Requirement",
    "Right_to_Correct",
    "Right_to_Delete",
    "Right_to_Know",
    "Right_to_Limit_Sensitive",
    "Right_to_Opt_Out",
]

LABEL_DEFINITIONS = {
    "Right_to_Know":
        "General right to be informed about data practices and usage in a non-procedural way. "
        "Covers transparency, awareness, and informational rights about what data is collected and how it is used.",
    "Right_to_Delete":
        "Right to request that a business delete personal information collected from the consumer.",
    "Right_to_Correct":
        "Right to request correction of inaccurate personal information held by a business.",
    "Right_to_Opt_Out":
        "Right to opt out of the sale or sharing of personal information.",
    "Right_to_Limit_Sensitive":
        "Right to direct a business to limit the use of sensitive personal information.",
    "Notice_Requirement":
        "Legal obligation to actively inform or notify users before or during data collection or processing. "
        "Covers at-collection disclosures, privacy notices, and required transparency procedures, "
        "including what categories of data are collected, shared, or sold.",
}

# Random state shared with the notebook (Python 3.11): both the targeted sample
# and the split re-seed to 42, exactly as the notebook does.
random.seed(42)
TARGET_SAMPLES_PER_LABEL = 500
SCARCITY_ORDER = [
    "Right_to_Limit_Sensitive",
    "Right_to_Correct",
    "Right_to_Delete",
    "Right_to_Opt_Out",
    "Right_to_Know",
    "Notice_Requirement",
]

C3PA_LABEL_MAP = {
    "Description of Right to Correct Information": "Right_to_Correct",
    "Description of Right to Delete": "Right_to_Delete",
    "Description of Right to Opt-out of sale of PI": "Right_to_Opt_Out",
    "Description of Right to Limit use of PI": "Right_to_Limit_Sensitive",
    "Description of Right to Know PI Collected": "Right_to_Know",
    "Description of Right to Know PI sold / shared": "Right_to_Know",
    "Categories of Personal Information Collected": "Notice_Requirement",
    "Categories of Personal Information Shared / Disclosed": "Notice_Requirement",
    "Categories of Personal Information Sold": "Notice_Requirement",
    "Updated Privacy Policy": "Notice_Requirement",
}


def load_raw_records():
    records = []
    for subset in ["DB", "WS"]:
        folder = os.path.join(DATASET_DIR, "Annotations", subset)
        for fp in sorted(glob.glob(os.path.join(folder, "*.csv"))):
            doc_id = f"{subset}_{os.path.basename(fp).replace('.csv', '')}"
            try:
                df_c3pa = pd.read_csv(fp, on_bad_lines="skip")
            except Exception:
                continue
            cols = {c.lower(): c for c in df_c3pa.columns}
            if "text" not in cols or "label" not in cols:
                continue
            valid = df_c3pa[[cols["text"], cols["label"]]].dropna()
            for text, label in zip(valid[cols["text"]], valid[cols["label"]]):
                text_s, label_s = str(text).strip(), str(label).strip()
                if text_s and label_s and label_s.lower() != "nan":
                    records.append({"doc_id": doc_id, "text": text_s, "label": label_s})
    return records


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    c3pa_raw = pd.DataFrame(load_raw_records())
    print(f"Raw C3PA annotation rows: {len(c3pa_raw)}")

    c3pa_raw["mapped_label"] = c3pa_raw["label"].map(C3PA_LABEL_MAP)
    mapped_only = c3pa_raw.dropna(subset=["mapped_label"])

    df_master = (
        mapped_only.groupby(["doc_id", "text"])["mapped_label"]
        .apply(lambda x: sorted(set(x)))
        .reset_index()
        .rename(columns={"mapped_label": "labels"})
    )

    print(f"Unique mapped (doc, text) spans before dedup: {len(df_master)}")

    before_dedup = len(df_master)
    df_master = df_master.drop_duplicates(subset="text", keep="first").reset_index(drop=True)
    print(f"Removed {before_dedup - len(df_master)} duplicate text rows (shared boilerplate across companies)")

    print(f"Unique mapped (doc, text) spans after dedup: {len(df_master)}")
    print(f"Unique source documents: {df_master['doc_id'].nunique()}")
    print(f"Multi-label spans (2+ labels): {(df_master['labels'].apply(len) > 1).sum()}")

    # Step 4: Target-balanced document selection (notebook cell 10).
    # Greedily add documents until each label reaches ~TARGET_SAMPLES_PER_LABEL,
    # visiting labels scarcest-first. Bill-of-credits selection is seed 42 and
    # iterates documents in sorted doc_id order (groupby default), byte-for-byte
    # the same algorithm as the notebook.
    df_master_full = df_master.copy()
    doc_to_rows = df_master_full.groupby("doc_id")

    current_counts = {label: 0 for label in ALL_LABELS}
    selected_docs = set()

    random.seed(42)
    for target_label in SCARCITY_ORDER:
        eligible_docs = []
        for doc_id, group in doc_to_rows:
            if doc_id in selected_docs:
                continue
            has_label = group["labels"].apply(lambda x: target_label in x).any()
            if has_label:
                eligible_docs.append(doc_id)

        random.shuffle(eligible_docs)

        for doc_id in eligible_docs:
            if current_counts[target_label] >= TARGET_SAMPLES_PER_LABEL:
                break
            selected_docs.add(doc_id)
            group = doc_to_rows.get_group(doc_id)
            for labels in group["labels"]:
                for label in labels:
                    if label in current_counts:
                        current_counts[label] += 1

    df_master = df_master_full[df_master_full["doc_id"].isin(selected_docs)].reset_index(drop=True)
    print(f"Selected {len(selected_docs)} unique documents yielding {len(df_master)} total rows.")
    print("Target-balanced counts per label:")
    for label in ALL_LABELS:
        flag = "" if current_counts[label] >= TARGET_SAMPLES_PER_LABEL else " (shortfall: target not reachable)"
        print(f"  {label:<28} : {current_counts[label]}{flag}")

    # Step 5: document-level 70 / 15 / 15 split (seed 42)
    # The notebook re-seeds immediately before shuffling (BLOCK 5), independent of
    # the seed used for the 30% subsample above. Replicate that exactly.
    random.seed(42)
    unique_docs = sorted(df_master["doc_id"].unique())
    shuffled_docs = unique_docs.copy()
    random.shuffle(shuffled_docs)

    n = len(shuffled_docs)
    n_train = int(n * 0.70)
    n_val = int(n * 0.15)

    train_docs = set(shuffled_docs[:n_train])
    val_docs = set(shuffled_docs[n_train:n_train + n_val])
    test_docs = set(shuffled_docs[n_train + n_val:])

    assert train_docs.isdisjoint(val_docs), "Leakage: train <-> val"
    assert train_docs.isdisjoint(test_docs), "Leakage: train <-> test"
    assert val_docs.isdisjoint(test_docs), "Leakage: val <-> test"

    train_mask = df_master["doc_id"].isin(train_docs).values
    val_mask = df_master["doc_id"].isin(val_docs).values
    test_mask = df_master["doc_id"].isin(test_docs).values

    splits = {
        "train": df_master[train_mask].reset_index(drop=True),
        "val": df_master[val_mask].reset_index(drop=True),
        "test": df_master[test_mask].reset_index(drop=True),
    }

    print(f"\nDocuments -> Train: {len(train_docs)} | Val: {len(val_docs)} | Test: {len(test_docs)}")
    print(f"Spans     -> Train: {len(splits['train'])} | Val: {len(splits['val'])} | Test: {len(splits['test'])}")

    print(f"\n{'Label':<28} {'Train':>8} {'Val':>8} {'Test':>8}")
    for label in ALL_LABELS:
        counts = []
        for key in ["train", "val", "test"]:
            counts.append(int(splits[key]["labels"].apply(lambda lst: label in lst).sum()))
        print(f"{label:<28} {counts[0]:>8} {counts[1]:>8} {counts[2]:>8}")

    # Write JSON exports (each split is a JSON array of records)
    for key, df in splits.items():
        records = []
        for i, row in df.iterrows():
            records.append({
                "id": i,
                "doc_id": row["doc_id"],
                "text": row["text"],
                "labels": row["labels"],
            })
        out_path = os.path.join(OUT_DIR, f"{key}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=1)
        print(f"Wrote {out_path} ({len(records)} spans, {os.path.getsize(out_path) / 1024:.0f} KiB)")


if __name__ == "__main__":
    main()