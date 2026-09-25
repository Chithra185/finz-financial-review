# Finz — AI-Native Financial Review

A working financial review application for the Finz Software Engineering Internship challenge.

## What it demonstrates

- Ingests CSV/XLSX bank transaction files.
- Deterministically categorizes transactions with confidence scores.
- Lets users correct classifications.
- Calculates monthly P&L from underlying transaction data.
- Separates P&L items from items needing different accounting treatment.
- Detects material period-over-period variances.
- Links variances/review items to transaction-level evidence.
- Provides an AI financial analyst using the OpenAI Responses API when `OPENAI_API_KEY` is configured.
- Falls back to deterministic answers when an API key is unavailable.

## Run locally

Requirements: Node.js 18+

```bash
npm install
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:5000

For AI answers, copy `.env.example` to `.env` and set `OPENAI_API_KEY`. You can also set `OPENAI_MODEL`.

## Build

```bash
npm run build
npm start
```

The Express server serves the built Vite client.

## Accounting model

Revenue: food sales, beverage sales, catering, delivery marketplace payouts.

Contra-revenue: refunds and discounts.

COGS: food/beverage inventory and to-go packaging.

Payroll: hourly kitchen/FOH wages, payroll taxes/benefits, manager salary.

Operating expenses: rent, software, insurance, accounting, telecom, utilities, cleaning, marketing, repairs, admin, delivery commissions.

Excluded from P&L in this simplified model: gift-card sales, sales-tax remittance, equipment purchase/capex, loan principal repayment.

The LLM never computes the authoritative P&L. The backend computes it from transactions; the AI layer receives the structured results and evidence to explain or investigate them.

## Submission walkthrough

1. Upload the supplied transaction file.
2. Open Transactions and show categories + confidence.
3. Correct a classification and show the P&L updates.
4. Open P&L and explain the deterministic calculation.
5. Open Variances and drill into evidence.
6. Ask two analyst questions and show transaction evidence.
7. Explain where deterministic logic is used vs. where AI is used.
