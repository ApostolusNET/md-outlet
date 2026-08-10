# XML field dictionaries

Optional YAML files that map XML tag names to Japanese (or other) labels when browsing `.xml` in the UI.

| Path | Purpose |
|------|---------|
| `example.yaml` | Bundled demo (safe to ship) |
| `local/` | **Your** dictionaries — create this folder yourself. Not tracked by git, not packed into Release zip |

Example:

```text
dicts/local/my-fields.yaml
```

Restart the UI after adding files. Auto-pick chooses the dict with the most tag hits.
