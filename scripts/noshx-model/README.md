# The NOSHX model

NOSHX answers in two layers:

1. **NOSHX Core** (`src/lib/noshx/core/`) is NOSHASHI's own engine and the
   default. It uses no language model. It reads the question, runs the
   app's read-only ledger readers, searches NOSHASHI's pages, and writes
   the answer from what it read. It is built into the app.
2. **The NOSHX model** is optional. It is a language model trained on
   NOSHASHI's own content. When it is installed, it phrases and reasons
   over what NOSHX Core read, instead of Core's plain sentences.

This folder trains the NOSHX model for free.

| File | What it is |
|---|---|
| `noshx-train.jsonl` | The training data: one conversation per line, all of it NOSHASHI's own content. |
| `train_noshx.ipynb` | The Google Colab notebook that trains and exports the model on a free T4 GPU. |
| `Modelfile` | Turns the exported weights into the `noshx` model in Ollama (Granite base, the default). |
| `Modelfile.phi4-mini` | The same for the larger Phi-4-mini base. The notebook saves it as `Modelfile` when you choose that base. |

## Train it

1. Open the notebook in Colab:
   <https://colab.research.google.com/github/Ignosha/noshashi/blob/main/scripts/noshx-model/train_noshx.ipynb>
2. Choose **Runtime → Change runtime type → T4 GPU**.
3. Choose **Runtime → Run all**. Training takes about 10–20 minutes, and the export takes about 10 more.
4. Download `noshx-q4_k_m.gguf` (about 1 GB) and `Modelfile`.

Kaggle Notebooks also give free GPUs (30 hours a week) if Colab is busy. Upload the notebook there and choose a T4 or P100 accelerator.

## Install it

With Ollama installed (ollama.com/download), put both files in one folder and run:

```
ollama create noshx -f Modelfile
```

Then open NOSHX in NOSHASHI, change the runtime to **Ollama**, and pick **noshx**.

## Where it comes from

The base model is IBM's Granite 4.0 1B: Apache 2.0 licence, built for devices with little memory, and small enough that the 4-bit file is about 1 GB and answers quickly on a laptop's CPU. The Apache 2.0 licence lets the trained model be named, shipped and sold as NOSHX. Keep IBM's licence and notices with any copy of the weights you distribute.

For better writing at the cost of speed and memory, set `BASE = "phi4-mini"` in the notebook. That trains from Microsoft's Phi-4-mini-instruct (3.8B, MIT licence) and exports about 2.5 GB. Keep Microsoft's copyright notice with any copy of those weights.

Either way, NOSHX Core, which needs no model at all, stays the default and answers in milliseconds.

Training does not build a model from nothing: reasoning ability takes thousands of GPUs to create. Fine-tuning teaches an existing model NOSHASHI's facts, voice and rules. The model does not learn live ledger data. Those facts come from NOSHX Core's readers each time a question is asked, and the model is trained to answer from them.

## Retrain after the product changes

The data is generated from the pages and in-app sources, so it goes stale when they change. Regenerate it, commit it, and run the notebook again:

```
UPDATE_NOSHX_DATASET=1 npx vitest run src/lib/noshx/__tests__/dataset.test.ts
```

The same test runs on every CI build without the variable. It checks the data can still be built and is well formed.
