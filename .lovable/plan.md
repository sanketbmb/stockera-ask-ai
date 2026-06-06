Approve Wave 5f revised plan with all three amendments incorporated.

Sequencing locked:

- Problem 1 first

- Verify TATAMOTORS, tata motors (with space), and INFY falsification cases live before starting Problem 2

- Problem 2 second

- Verify ICICIBANK, SBIN, TMPV cluster, INFY, HDFCBANK falsification cases live before closing wave

One acknowledgement, not a blocker:

The two-pass placement (heuristic first-pass, measurement-based second-pass via useLayoutEffect) may briefly hop on first paint during hydration on slow devices. This is acceptable. Do not over-engineer to eliminate it; the measurement-based reflow is the correct trade-off.

Confirmed guardrails:

- No scoring weight changes

- No new pillars

- No RLS changes

- No stock-picker work

- No bundling between Problem 1 and Problem 2

- seed-stock-master EQUITY filter NOT widened

- No auto-redirect on single-successor cases — one-click suggestion only

- ai_report row NOT written when verdict_reason = UNSUPPORTED_SYMBOL

- audit_events row IS written for unsupported_symbol_returned so analytics can track real-world ticker miss frequency

Build sequencing rules:

- Problem 1 build must include all 11 downstream-consumer touches in the same build, not split across builds

- Problem 2 build must include both the measurement-based reflow AND the table-mode escape hatch in the same build, not split

After Problem 1 build report lands:

- Founder will visually verify TATAMOTORS → friendly panel with TMPV/TMCV links

- Founder will verify INFY still renders as a normal report

- Founder will verify no row is written to ai_report for the TATAMOTORS query

- THEN approve Problem 2 build separately

STOP after Problem 1 build report. Do not auto-start Problem 2.

Do not start Stock Picker.

Approved. Begin Problem 1 build.

&nbsp;