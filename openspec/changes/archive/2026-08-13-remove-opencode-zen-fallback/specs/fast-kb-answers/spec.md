## REMOVED Requirements

### Requirement: Configurable faster model for the knowledge fast path
**Reason**: The `FAST_MODEL` override is removed; the knowledge fast path now uses the single resolved model (`AGENT_MODEL` or the provider default) like every other LLM call.
**Migration**: Remove any `FAST_MODEL` env setting; the fast-path LLM call resolves its model through `lib/llm.js` (`AGENT_MODEL` > Gemini default). The once-retry resilience on fast-path failure remains unchanged (retried with the same model).