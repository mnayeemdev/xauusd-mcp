# V8_GIT_EVIDENCE

| Item | Value |
|---|---|
| Base | 48eb31d (SILVER N2 + DOM forward observation) |
| V8 commit | 0d15538526124f91bf2b345b3e10a929420fdccf on master, pushed to the remote `nayeem` |
| Files | 71 files, +24,112 / −3: research/core_pattern_audit_v8/ (pre-registration, scripts, patches, configs, reports, results JSON), tests/core_pattern_audit_v8.test.js, package.json (test lists only) |
| Production files changed | none (`git status` clean under src/) |
| Not committed (regenerable, gitignored) | research/core_pattern_audit_v8/engines/ (variant engine copies; hashes in configs/engines.sha256) and results/rows/ (per-bar replay rows, about 370 MB; per-variant metadata included in this handoff) |
| Patch check | `git apply --check patches/ALL_V8_CORRECTIONS.patch` clean against 48eb31d (check only; nothing applied) |

## Secret scan (this handoff folder)
Patterns: password, passwd, api key, secret key, bearer, private-key blocks, GitHub / OpenAI / Slack token shapes, arming tokens, the MT5 account login number, the owner e-mail.
- No credential, token, private key or e-mail is present.
- The only match is a unit-test name containing the word "password" ("no login/password switch").
- The MT5 login number in one test name was redacted in the saved suite output.
- Excluded: node_modules, caches, memory dumps, .env files, state stores, the per-bar replay rows and the engine copies.
