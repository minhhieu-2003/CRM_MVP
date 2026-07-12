# Prompt Review Gate

Evaluate this prompt before it is allowed into the internal prompt library.

Input:
- title: ${title}
- source: ${source}
- license: ${license}
- prompt: ${prompt}

Check:
1. Is it actually an instruction for an AI model?
2. Is it clear enough to run without hidden context?
3. Does it ask for secrets, credential exposure, bypass, unsafe action, or destructive command?
4. Does it need allowed_files / forbidden_files before use in a coding agent?
5. Does it define expected output format?
6. Does it need human approval before file edits or production actions?
7. Is it suitable for dev, ops, product, security, documentation, or creative use?

Return JSON:

```json
{
  "approved": true,
  "risk_level": "low|medium|high",
  "category": "coding|security|ops|product|writing|education|creative|other",
  "required_edits": [],
  "safe_internal_version": "...",
  "test_cases": []
}
```
