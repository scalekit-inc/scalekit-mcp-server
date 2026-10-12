# Glama tool-description quality

Glama scores each MCP tool with the Tool Definition Quality Score (TDQS): six dimensions from 1 to 5, weighted 25/20/20/15/10/10, then a server rollup that is 70% tool quality (60% mean + 40% worst tool) and 30% tool-set coherence.

Source of the numbers: the TDQS specification at commit [`b9881b0`](https://github.com/glama-ai/tool-definition-quality-score/commit/b9881b0cfec88969e42672c92544487ca191a992) (2026-09-04), file [`README.md`](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md). That file is the rubric, the prompts, and the formulas. The repo does not ship a separate scorer program. [`CHANGELOG.md`](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/CHANGELOG.md) records rubric versions through v1.3 (2026-09-03).

## Rubric

Each tool definition is what `tools/list` returns. The scored inputs are `name`, `title`, `description`, `inputSchema`, `outputSchema`, `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), and sibling tool names. `description` is the primary target. ([TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))

One LLM call scores six dimensions. Each score is an integer from 1 to 5. TDQS is the weighted sum, rounded half-up to one decimal with integer arithmetic. ([TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))

| Dimension | Weight | What it measures |
| --- | --- | --- |
| Purpose Clarity | 25% | Does the description state what the tool does? 5 = specific verb + resource, and it distinguishes this tool from siblings. 4 = clear, but no sibling split. 3 = vague purpose. 2 = tautology (it restates the name or title). 1 = missing or misleading. |
| Usage Guidelines | 20% | Does it say when to use this tool versus alternatives? 5 = explicit when, when-not, and named alternatives. 4 = clear context, no exclusions. 3 = implied usage. 2 = no guidance. 1 = misleading. |
| Behavioral Transparency | 20% | Does the description disclose behavior beyond what annotations already declare? With annotations, the bar is lower. Credit is for facts annotations cannot carry: what gets destroyed, auth requirements, rate limits. With no annotations, the description carries the full burden. A description that contradicts its annotations scores 1 and raises `Annotation Contradiction`. |
| Parameter Semantics | 15% | Does the description add meaning beyond the input schema? If schema description coverage is above 80%, the baseline is 3 even when the description says nothing about parameters. If coverage is below 50%, the description must compensate. A tool with zero parameters has baseline 4. |
| Conciseness & Structure | 10% | Is the text the right size, and is the key information first? Every sentence must earn its place. Too little text is not conciseness. |
| Contextual Completeness | 10% | Given the tool's complexity and the structured fields, is the description complete enough? The output schema is passed in full. A return shape with described fields relieves the description of explaining return values. A bare `{"type": "object"}` relieves nothing. |

Weights and anchors: [TDQS spec, stage 3](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md). The same anchors are in Appendix A, the verbatim scoring prompt.

Schema description coverage is `round(paramsWithDescriptions / paramCount × 100)`. A parameter counts when its `description` is non-empty. Coverage is 100 when the tool has zero parameters. ([TDQS spec, stage 1](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))

Letter tiers, used for the tool score and every server score: A at 3.5 or above, B at 3.0 or above, C at 2.0 or above, D at 1.0 or above, F below 1.0. B and above is passing. Dimension scores cannot go below 1, so the composite cannot go below 1.0. F is only a guard. ([TDQS spec, tiers](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))

Hard gates, before or after the model call:

- A `null` or whitespace-only description skips the model. Every dimension is 1. TDQS is 1.0. Tier is D. Flag is `No Description`. ([TDQS spec, stage 2](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- If the lowercased, trimmed description is exactly the tool name or the title, flag `Tautological Description`. Code sets Purpose Clarity to `min(model score, 2)`. ([TDQS spec, stages 2 and 4](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))

A dimension below 3 is a smell. Flags do not change the arithmetic, except the tautology cap and the missing-description short circuit. The prompt tells the model to score 1 on an annotation contradiction. Post-processing records the flag. The spec does not say code overwrites that dimension after the model returns. ([TDQS spec, stages 3 and 4](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))

Server scores, still on the 1–5 scale:

- Tool definition quality is 70% of the overall score. Formula: `round1(0.6 × mean(TDQS) + 0.4 × min(TDQS))`. The aggregate is computed only after at least 80% of the server's tools are scored. ([TDQS spec, server-level scores](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- Coherence is 30%. Four dimensions, equal weight, each 1–5: Disambiguation, Naming Consistency, Tool Count Appropriateness, Completeness. Score is their mean, rounded half-up to one decimal. ([TDQS spec, coherence](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- Overall: `round1(0.7 × descriptionQualityScore + 0.3 × coherenceScore)`. ([TDQS spec, overall](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))

Coherence anchors ([TDQS spec, Appendix B](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md)):

- Disambiguation: 5 = every tool has a distinct purpose. 1 = several tools appear to do the same thing.
- Naming Consistency: 5 = one pattern, such as `verb_noun`, all the way through. 1 = chaotic. The convention matters less than consistency. All camelCase is fine. Mixed styles are not.
- Tool Count Appropriateness: 5 = each tool earns its place, typically 3–15 tools. 3 = borderline (1–2 feels thin, 16–25 feels heavy). 2 = 26 or more, or exactly one tool for the apparent scope. 1 = extreme mismatch (50 or more, or one trivial tool).
- Completeness: 5 = full CRUD or lifecycle coverage, no dead ends. 3 = notable gaps, such as create and get with no update or delete. 1 = severely incomplete.

`Shadowing Risk` is a flag, not a score term. A pair is a candidate when the dearer tool costs at least twice the cheaper one and the absolute gap is at least 4. The coherence model must still confirm that the purposes overlap. The flag does not change TDQS, description quality, or coherence. ([TDQS spec, shadowed tools](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))

Glama's methodology page names the same six dimensions and does not publish the weights. ([methodology, section 1.6](https://glama.ai/mcp/methodology))

## Patterns that raise the score

These are the patterns the spec and the calibration examples treat as high scores. The checklist lists them in weight order. ([TDQS spec, Improving your score and Appendix A](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))

- One specific sentence: verb, resource, and scope. The high example is "List ALL calls in date range – no user/workspace filtering." That scores Purpose Clarity 5. ([TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- Say how this tool differs from a sibling, and name the other tool. The same example adds "To filter by user/workspace, use search_calls_extensive instead." That is Purpose Clarity 5 and Usage Guidelines 5. A boundary sentence still earns Usage Guidelines. An ordering command does not. ([TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- State when to use the tool and when not to use it. Score 5 on Usage Guidelines requires the when, the when-not, and a named alternative. ([TDQS spec, Appendix A](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- Set the four MCP annotation hints. They lower the disclosure burden. Then use the description for what the hints cannot say: what is destroyed, auth prerequisites, rate limits. The high example has `readOnlyHint: true` and `destructiveHint: false` and scores Behavioral Transparency 3, not 5, because it adds only the date-range scope. ([TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- Document every parameter in the schema or in the description. Either channel counts. Non-empty per-property `description`s and `enum`s raise coverage. Coverage above 80% sets the Parameter Semantics baseline to 3 even if the tool description is silent on parameters. ([TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- Put a documented output schema on the tool, with described return fields. The model reads that schema. The description then does not have to explain return values. ([TDQS spec, v1.3](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md), [changelog v1.3](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/CHANGELOG.md))
- Keep the text short and front-loaded. The two-sentence high example scores Conciseness 5 ("zero waste"). A single efficient sentence scores 4. Add nothing that repeats the schema or the annotations. The spec gives no credit for that repeat. ([TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- On the server, use one naming pattern, keep purposes distinct, and cover the lifecycle. A consistent `verb_noun` set scores Naming Consistency 5. Distinct resource-plus-action tools score Disambiguation 5. A count around 3–15 scores Tool Count Appropriateness 5. ([TDQS spec, Appendix B](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))

## Patterns that lower the score

- No description, or only whitespace. Every dimension is 1. TDQS is 1.0. Tier D. Flag `No Description`. ([TDQS spec, stage 2](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- The description is exactly the name or the title after lowercasing and trimming. Purpose Clarity is capped at 2. Flag `Tautological Description`. The calibration tool named `process` with description "Process" scores Purpose Clarity 1. ([TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- A vague purpose, with no verb and no resource, scores Purpose Clarity 3. A misleading purpose scores 1. ([TDQS spec, Appendix A](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- No when-to-use text and no prerequisites. The mid example, "Update shared drive settings including name, color, and restrictions," scores Usage Guidelines 2. Implied usage is 3. Misleading guidance is 1. ([TDQS spec, Appendix A](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- A write tool with no annotations and no disclosure of permissions, reversibility, or untouched fields. That mid example scores Behavioral Transparency 2. No disclosure at all, and no annotations, scores 1. ([TDQS spec, Appendix A](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- The description contradicts the annotations. Example: annotations say `readOnlyHint: true` and the description says "Creates a new record." Behavioral Transparency is 1. Flag `Annotation Contradiction`. ([TDQS spec, Appendix A](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- Repeating the schema or the annotations. The description gets no credit for that text. The spec calls this the main calibration rule. It rewards density, not length. ([TDQS spec, design principles](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- A very short description that leaves out the task. That is under-specification, not conciseness. "Process" scores Conciseness 2, not 5. Bloat also costs Conciseness. The spec publishes no character limit and no word limit. ([TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- Schema description coverage below 50%, and the tool description does not fill the gap. Three parameters at 0% coverage score Parameter Semantics 1. At 50% coverage, a description that names only some fields scored 3 in the mid example and was called incomplete compensation. ([TDQS spec, Appendix A](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- A bare output schema, `{"type": "object"}`. It does not remove the duty to explain return values. Checklist item 5 says it earns nothing. ([TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md), [changelog v1.3](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/CHANGELOG.md))
- Sentences that try to force call order, such as "always call this first" or "do not compute this yourself." The spec says that does not fix a tool-set overlap. Name a sibling to draw a boundary, or make the purposes disjoint, or delete one tool. ([TDQS spec, Improving your score](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- Overlapping tool purposes on one server. Disambiguation falls. Several tools that look the same score 1. Mixed name styles score Naming Consistency down. A 26+ tool surface scores Tool Count Appropriateness 2. A 50+ surface scores 1. One bad tool pulls the server tool-quality score, because the worst tool keeps 40% of that component. ([TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))

## MCP `description` sentences

The TDQS spec does not quote an MCP sentence about the tool `description` field.

Its only MCP link is for annotation hints, not for `description`: [MCP tool annotations](https://modelcontextprotocol.io/docs/concepts/tools#tool-annotations). The spec says that link is the semantics of `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint`. ([TDQS spec, References](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))

The scorer still implements the field as an optional string (`string | null`). The current MCP schema defines that field with these sentences, in `Tool`:

> A human-readable description of the tool.
>
> This can be used by clients to improve the LLM's understanding of available tools. It can be thought of like a "hint" to the model.

The property is `description?: string`. Source: [`schema/2026-07-28/schema.ts`](https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2026-07-28/schema.ts). The same two sentences appear on the 2025-06-18 schema. ([2025-06-18 `schema.ts`](https://github.com/modelcontextprotocol/specification/blob/main/schema/2025-06-18/schema.ts))

The Tools page that Glama's annotation link opens also has one description bullet, and no quality rubric:

> `description`: Human-readable description of functionality

Source: [Tools](https://modelcontextprotocol.io/docs/concepts/tools). The same bullet is in [the 2026-07-28 tools page](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/tools.mdx).

TDQS does not copy those sentences into the prompt. A missing description is allowed by the schema. TDQS treats that absence as a score floor of 1.0. ([TDQS spec, stage 2](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))

## What you could not verify

- No published character count, word count, or token cap for Conciseness. The judgment is in the prompt. ([TDQS spec, Appendix A](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- No published Parameter Semantics baseline for coverage from 50% through 80%. The spec states above 80%, below 50%, and zero parameters. ([TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- The methodology page also names "server cohesiveness" (stated purpose versus exposed capabilities). That term is not a weight in the TDQS formula. ([methodology, section 1.6](https://glama.ai/mcp/methodology))
- The methodology paraphrases the six questions. It does not match the spec anchors word for word, and it publishes no weights. The spec is the numeric source. ([methodology](https://glama.ai/mcp/methodology))
- Corpus figures in the spec are "as of June 2026." v1.3 (2026-09-03) says the output-schema prompt change re-scores the registry. No later corpus table was fetched. ([TDQS spec](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md), [changelog](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/CHANGELOG.md))
- Appendix A still says the calibration examples have no output schema. The changelog says the documented-versus-bare output rule shipped without a worked example. ([changelog v1.3](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/CHANGELOG.md))
- The system prompt's opening line lists name, title, description, input schema, annotations, context signals, and sibling names. It does not list the output schema. The user-message template does pass `<output-schema>`. ([TDQS spec, Appendix A](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))
- The April 2026 announcement post was not used as the rubric. The spec calls itself the complete specification and links that post as the original rationale: [blog](https://glama.ai/blog/2026-04-03-tool-definition-quality-score-tdqs).
- The annotation anchor on the Tools page was not read past the Tool field list. This note does not quote annotation sentences.
- `definitionBytes` is stored and is not in the score. The spec says it is there to test, later, whether TDQS rises with definition size. It does not price length today. ([TDQS spec, stage 1](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md))

## Source list

- [TDQS README at `b9881b0`](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/README.md) — owns the rubric, weights, gates, prompts, checklist, and server formulas.
- [Commit `b9881b0`](https://github.com/glama-ai/tool-definition-quality-score/commit/b9881b0cfec88969e42672c92544487ca191a992) — "pass outputSchema into the scoring prompt; completeness discount must be earned" (2026-09-04).
- [CHANGELOG.md at the same commit](https://github.com/glama-ai/tool-definition-quality-score/blob/b9881b0cfec88969e42672c92544487ca191a992/CHANGELOG.md) — owns v1.0 through v1.3: what changed, and what re-scores.
- [How Glama indexes the MCP ecosystem](https://glama.ai/mcp/methodology) — owns the registry pipeline statement that every captured tool schema is scored with TDQS. It does not own the weights.
- [MCP Tools concept page](https://modelcontextprotocol.io/docs/concepts/tools) — owns the bullet "`description`: Human-readable description of functionality." Glama's citation is the `#tool-annotations` anchor on this page, for hint names, not for this bullet.
- [MCP schema `2026-07-28` `schema.ts`](https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2026-07-28/schema.ts) — owns the `Tool.description` sentences: human-readable description, a hint to the model, optional.
- [MCP schema `2025-06-18` `schema.ts`](https://github.com/modelcontextprotocol/specification/blob/main/schema/2025-06-18/schema.ts) — same `description` sentences on an older schema revision.
- [2026-07-28 tools specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/tools.mdx) — repeats the short description bullet in the spec prose.
