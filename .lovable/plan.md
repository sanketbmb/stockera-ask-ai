## Summary of Changes
We will update the `AnalyticsEventName` union type in `src/lib/analytics.ts` to match the exact list of 18 events requested by the user.

## Proposed Plan
1. **Modify `src/lib/analytics.ts`**: Replace the current `AnalyticsEventName` union type with the updated 18 string-literal union values.

```typescript
export type AnalyticsEventName =
  | "page_view"
  | "cta_click"
  | "signup_started"
  | "signup_completed"
  | "login_started"
  | "login_completed"
  | "query_submitted"
  | "query_completed"
  | "topup_initiated"
  | "topup_tier_selected"
  | "topup_abandoned"
  | "topup_completed"
  | "wallet_viewed"
  | "pricing_viewed"
  | "plan_selected"
  | "paywall_hit"
  | "video_request_submitted"
  | "live_session_booked";
```

2. **Verification**: Confirm that the code compiles successfully with the updated types.
