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

1. **Group** raw annotations into `(document, text)` spans (45,121 rows → 26,740 spans).
2. **Deduplicate** boilerplate text shared across companies (992 spans removed → 25,748 across 399 documents).
3. **Subsample to 40%** of documents at random with seed 42 (159 documents / 9,640 spans) — a low-resource scale point.
4. **Split** by document 70 / 15 / 15 (111 / 23 / 25 docs; 6,328 / 1,592 / 1,720 spans).

The site lets you browse each split, explore the label distribution, compare model
results (LegalBERT vs. RoBERTa-large vs. Flan-T5-base, all trained on these splits),
and inspect SHAP / LIME word-level explanations.

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

- Dataset: [MaazBinMusa/C3PA_Dataset](https://github.com/MaazBinMusa/C3PA_Dataset)
- Paper: [C3PA — EMNLP 2024](https://aclanthology.org/2024.emnlp-main.217/)
- Models: [LegalBERT](https://huggingface.co/nlpaueb/legal-bert-base-uncased),
  [RoBERTa-large](https://huggingface.co/roberta-large),
  [Flan-T5-base](https://huggingface.co/google/flan-t5-base)

All three models were trained on the train split (6,328 spans) at the 40% scale,
with per-class thresholds tuned on validation (1,592 spans) and a single test pass
(1,720 spans). Best macro F1 on the test split: RoBERTa-large at 0.7777.