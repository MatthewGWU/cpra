# CPRA / C3PA — Balance-Targeted Pipeline Explorer

A web app that explains how we rebuilt a CPRA (California Privacy Rights Act)
compliance-classification experiment on top of the C3PA dataset (Bin Musa et al.,
EMNLP 2024) and exported the resulting balanced train/validation/test splits as JSON.

> Live site: [https://matthewgwu.github.io/cpra/](https://matthewgwu.github.io/cpra/)

## What this project does

Real company privacy policies are annotated with expert labels describing CPRA
rights (Right to Know, Right to Delete, Right to Correct, Right to Opt Out,
Right to Limit Sensitive, and the Notice Requirement). The C3PA dataset provides
those annotations. Six of its labels map cleanly to CPRA, so we:

1. **Group** raw annotations into `(document, text)` spans.
2. **Deduplicate** boilerplate text shared across companies (~992 spans).
3. **Balance** by document — scarcity-first, a ~500-sample *floor* for the scarcest labels, not a cap (218 documents / 15,750 spans; abundant labels like the Notice Requirement keep surplus annotations).
4. **Split** by document 70 / 15 / 15 (152 / 32 / 34 docs).

The site lets you browse each split, explore the label distribution, compare
model results (LegalBERT vs. vanilla BERT-base vs. RoBERTa-large vs. Flan-T5-base),
and inspect SHAP / LIME word-level explanations.

## Repository ↔ website

This repository is the source for the static site. GitHub Pages serves the
`index.html` + `app.js` + `data/*.json` + `explainability/*` files directly —
there is no build step. JupyterLab notebooks contain the full training pipeline;
the JSON splits on the site are produced by `export_dataset.py`, which mirrors
the notebook's targeted-sampling + split logic exactly.

## Key files

| File | What it is |
| --- | --- |
| `index.html` | The single-page site (Bootstrap 5 + Chart.js, CDN). |
| `app.js` | Client-side logic: split browser, charts, explainability. |
| `data/train.json`, `data/val.json`, `data/test.json` | The balanced JSON splits (browser-facing). |
| `export_dataset.py` | Reproduces those JSON splits from the raw dataset. |
| `explainability/` | SHAP plot exports + LIME sample cards. |
| `CPRA_C3PA_Primary_30pct (6).ipynb` | Current notebook: sampling, re-split, training, explainability. |

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
  [BERT-base](https://huggingface.co/bert-base-uncased),
  [RoBERTa-large](https://huggingface.co/roberta-large),
  [Flan-T5-base](https://huggingface.co/google/flan-t5-base)

Numbering: the balance-targeted splits shown on the site were not yet run through
training in the notebook, so the model metrics reported there are from the earlier
30%-scale run (a separate random subsample of 119 docs / 7,167 spans, trained before
the balancing step was added).