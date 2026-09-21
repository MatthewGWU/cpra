# CPRA / C3PA — 40%-Scale Pipeline Explorer

A web app that shows how we rebuilt a CPRA (California Privacy Rights Act)
compliance-classification experiment on top of the C3PA dataset (Bin Musa et al.,
EMNLP 2024), trained three models at a 40% document-scale point, and exported the
resulting train/validation/test splits as JSON.

> Live site: [https://matthewgwu.github.io/cpra/](https://matthewgwu.github.io/cpra/)

## What this project does

Real company privacy policies are annotated with expert labels describing CPRA
rights (Right to Know, Right to Delete, Right to Correct, Right to Opt Out,
Right to Limit Sensitive, and the Notice Requirement). The C3PA dataset provides
those annotations. Six of its labels map cleanly to CPRA, so we:

1. **Group** raw annotations into `(document, text)` spans (45,121 rows → 26,740 spans). The raw CSVs
   record who annotated each span (`RANumb` — six annotators, RA1–RA6); spans can be single-label,
   multi-label, or null-label (policy text with no annotation). Agreement across annotators is a
   confidence signal.
2. **Deduplicate** so each sentence appears at most once: shared boilerplate text (992 identical spans)
   is removed → 25,748 across 399 documents. Repeated text risks leakage.
3. **Subsample to 40%** of documents at random with seed 42 (159 documents / 9,640 spans) — a low-resource scale point.
4. **Split** by document 70 / 15 / 15 (111 / 23 / 25 docs; 6,328 / 1,592 / 1,720 spans) — seed-pinned so the
   partitioning is reproducible. Train gets the largest share (standard ML practice; the model learns from
   examples), validation tunes the hyperparameter "knobs," and test is graded exactly once.

The site lets you browse each split, explore the label distribution, compare model
results (LegalBERT vs. RoBERTa-large vs. Flan-T5-base, all trained on these splits),
and inspect SHAP / LIME word-level explanations.

### Design choices worth defending

- **We keep the real-world imbalance.** The policies are quoted close to verbatim, so Notice vastly
  outnumbers rarer rights like Limit-Sensitive; that is reality, not a sampling artifact, and the test
  split reflects it. We counteract the imbalance at *learning* time (per-class `pos_weight` + focal loss)
  and at *scoring* time (macro F1 treats every right equally) — never by down-sampling the documents.
- **Macro F1, not micro/weighted.** Easy, common labels get little credit; getting the rarer, harder labels
  right is what moves the score. The nontrivial baselines (always-Notice 0.102, always-everything 0.224)
  sit far below the trained models' 0.763–0.778.
- **Currency.** C3PA was released in 2024 (EMNLP 2024), under the CPRA/CCPA framework that has been in
  effect since January 1, 2023 — the annotations reflect the law as it stands today.

## Repository ↔ website

This repository is the source for the static site. GitHub Pages serves the
`index.html` + `app.js` + `data/*.json` + `explainability/*` files directly —
there is no build step. JupyterLab notebooks contain the full training pipeline;
the JSON splits on the site are produced by `export_dataset.py`, which mirrors
the notebook's subsampling + split logic exactly (both document- and text-level
disjointness are asserted).

## Key files

| File | What it is |
| --- | --- |
| `index.html` | The single-page site (Bootstrap 5 + Chart.js, CDN). |
| `app.js` | Client-side logic: split browser, charts, explainability. |
| `data/train.json`, `data/val.json`, `data/test.json` | The 40%-scale JSON splits (browser-facing). |
| `export_dataset.py` | Reproduces those JSON splits from the raw dataset. |
| `explainability/` | SHAP plot exports + LIME sample cards with real per-label weights. |
| `CPRA_40pct_CLEAN (1).ipynb` | The current notebook: subsampling, split, training, explainability. |

## Run locally

```bash
python -m http.server 8000
# open http://localhost:8000/
```

Regenerate the splits:

```bash
python export_dataset.py   # expects the C3PA_Dataset clone in ./C3PA_Dataset
```

## Dataset & models

- Dataset: [MaazBinMusa/C3PA_Dataset](https://github.com/MaazBinMusa/C3PA_Dataset) (released 2024)
- Paper: [C3PA — EMNLP 2024](https://aclanthology.org/2024.emnlp-main.217/)
- Models: [LegalBERT](https://huggingface.co/nlpaueb/legal-bert-base-uncased),
  [RoBERTa-large](https://huggingface.co/roberta-large),
  [Flan-T5-base](https://huggingface.co/google/flan-t5-base)

All three models were trained on the train split (6,328 spans) at the 40% scale,
with per-class thresholds tuned on validation (1,592 spans) and a single test pass
(1,720 spans). Best macro F1 on the test split: RoBERTa-large at 0.7777.