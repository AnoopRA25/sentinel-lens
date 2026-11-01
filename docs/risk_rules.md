# Hazard Precaution Advisor v2: Risk Rules Reference

> Auditable documentation generated from `data/risk_rules.json`.  
> In accordance with Rule R4 and Rule R5, risk assessment in Hazard Precaution Advisor v2 is strictly a deterministic, auditable rule engine, never a black-box predictive or trained probabilistic model. All risk outputs return traceable rule IDs.

---

## 1. Mathematical Formulation & Ordinal Scale

### 1.1 Score Formula
For any hazard $h$ belonging to taxonomy category $C \in \{H01 \dots H15\}$, evaluated for person category $P \in \{\text{baby}, \text{child}, \text{adult}, \text{elderly}\}$:

$$\text{score} = \operatorname{clamp}(\text{base\_severity}(C) + \text{person\_modifier}(C, P) + \text{combo\_modifier}(h, \text{context}), 1, 5)$$

### 1.2 Ordinal Risk Level Mapping

| Clamped Score | Ordinal Level | Label | Meaning & Actionability |
|---|---|---|---|
| **1 – 2** | `low` | Low | Minor physical injury unlikely or easily avoided. Routine awareness. |
| **3** | `medium` | Medium | Noticeable injury potential requiring precaution. Implement precautions during daily routine. |
| **4 – 5** | `high` | High | Substantial risk of severe injury requiring urgent physical mitigation. |
| *(Gated)* | `uncertain` | Uncertain | Assigned when status is `possible` or evidence strength is `weak`. Potential level indicates hypothetical confirmed severity. |

---

## 2. Base Severities (`R-BASE-*`)

Each of the 15 hazard categories defined in `data/taxonomy.json` carries a fixed base severity score:

| Rule ID | Category | Title | Base Score | Rationale |
|---|---|---|:---:|---|
| `R-BASE-H01` | H01 | Slip & Wet Floor | **2** | Loss of traction from moisture or loose rugs presents moderate slip risk. |
| `R-BASE-H02` | H02 | Trip & Walkway Clutter | **2** | Obstacles and trailing cables in walkways pose stumbling hazards. |
| `R-BASE-H03` | H03 | Electrical Hazard | **3** | Exposed voltage, overloaded adapters, or damp sockets pose direct electric shock hazards. |
| `R-BASE-H04` | H04 | Fire & Heat Hazard | **3** | Active burners, boiling liquids, and space heaters pose acute burn and ignition hazards. |
| `R-BASE-H05` | H05 | Sharp Objects & Glass | **2** | Exposed knives, razor blades, and glass shards can cause severe lacerations. |
| `R-BASE-H06` | H06 | Fall from Height | **3** | Unguarded staircases, balconies, and steep drops carry high fall injury potential. |
| `R-BASE-H07` | H07 | Unstable & Falling Objects | **2** | Unanchored furniture and falling heavy items can cause blunt crush trauma. |
| `R-BASE-H08` | H08 | Chemical & Poison Hazard | **2** | Domestic cleaning agents, unsealed medicines, and solvents carry toxic chemical risks. |
| `R-BASE-H09` | H09 | Choking & Small Objects | **1** | Small objects pose baseline choking risks primarily for infants and toddlers. |
| `R-BASE-H10` | H10 | Water & Drowning Hazard | **2** | Standing domestic water containers present submersion and drowning hazards. |
| `R-BASE-H11` | H11 | Strangulation & Entrapment | **2** | Dangling cords and entrapment loops pose acute constriction hazards. |
| `R-BASE-H12` | H12 | Structural Damage | **2** | Cracked ceilings, loose railings, or sagging masonry can fail under load. |
| `R-BASE-H13` | H13 | Poor Visibility & Glare | **2** | Inadequate lighting and harsh glare obscure existing physical obstacles. |
| `R-BASE-H14` | H14 | Outdoor Traffic & Terrain | **2** | Potholes, broken sidewalks, and vehicle thoroughfares cause outdoor trauma. |
| `R-BASE-H15` | H15 | Other Observable Hazard | **2** | Unclassified observable physical hazards assigned moderate baseline. |

---

## 3. Combination Rules (`R-COMBO-*`)

When visual evidence detects co-occurring hazards, environment interactions, or high-risk human postures, combination rules apply an explicit additive modifier:

| Rule ID | Category | Modifier | Trigger Conditions | Rationale |
|---|---|:---:|---|---|
| `R-COMBO-WATER-ELEC` | H03 | **+2** | Electrical equipment/power strip in proximity to water (sink, tub, basin, puddle, or co-occurring H01/H10). | Water near electrical conductors dramatically escalates electric shock and electrocution danger. |
| `R-COMBO-FLAME-FLAMMABLE` | H04 | **+2** | Open flame or heating appliance near combustibles (paper, curtains, cloth, grease, aerosol, gas cylinder). | Open flame or high thermal output near flammables creates severe rapid fire ignition risk. |
| `R-COMBO-TALL-FURNITURE-CHILD` | H07 | **+1** | Tall unanchored furniture (bookcase, dresser, TV stand) with person category `baby` or `child`. | Young children frequently climb furniture or open drawers, dramatically increasing fatal tip-over crush danger. |
| `R-COMBO-DARK-STAIRS` | H06 | **+2** | Stairs or steps co-occurring with darkness, poor lighting, or category H13. | Inadequate lighting on stairs severely impairs depth perception and tread edge recognition, multiplying fall severity. |
| `R-COMBO-SLIP-STAIRS` | H01 | **+2** | Wet surfaces, puddles, or loose mats located on stair treads or landings (co-occurring H06). | Moisture or loose mats on stairs causes sudden downward falls with severe kinetic impact. |
| `R-COMBO-BALCONY-CLIMB` | H06 | **+2** | Climbable furniture positioned next to balcony railing or window with `baby` or `child`. | Furniture positioned near railings or low windows provides stepping platforms for children, bypassing fall barriers. |
| `R-COMBO-CORD-CRIB` | H11 | **+2** | Dangling cords (blind cords, baby monitor cords) or plastic packaging in bedroom near crib or bed. | Cords or plastic packaging in infant sleeping areas present catastrophic strangulation and suffocation hazards. |
| `R-COMBO-MEDICINE-CHILD` | H08 | **+1** | Unsealed medicines or household chemicals on low surfaces within reach of `baby` or `child`. | Accessible pharmaceutical or chemical containers invite exploratory ingestion by young children. |

---

## 4. Evidence Gating & Potential Levels (`R-GATE-EVIDENCE`, `R-POTENTIAL-LEVEL`)

### 4.1 Gating Rule (`R-GATE-EVIDENCE`)
Per Rule R4 and Rule R2:
- If a hazard has `status == "possible"` OR `evidence_strength == "weak"`, its active `level` is clamped to **`uncertain`**.
- This guarantees that unconfirmed hypotheses are never presented to users as confirmed `Low`, `Medium`, or `High` hazards.

### 4.2 Potential Level Rule (`R-POTENTIAL-LEVEL`)
- When a hazard's active level is gated to `uncertain`, the engine calculates `potential_level` using the un-gated score formula.
- The user interface renders this as:  
  **"Check this — could be {potential_level}"**

---

## 5. Overall Risk Aggregation (`R-OVERALL-MAX`)

The overall scene risk rating is determined deterministically:
1. `overall_risk` equals the maximum risk level among all verified hazards with status `observed` or `likely`.
2. If all detected candidate hazards have status `possible`, `overall_risk` is set to `uncertain`.
3. If no hazards are detected and perception succeeded with adequate coverage, `overall_risk` is `low` and outcome is `none_observed`.
4. If image quality is unassessable or significant coverage gaps obscure key areas with zero detected hazards, the outcome is `inconclusive`.

---

## 6. Immediate Action Rules (`R-ACTION-*`)

Critical situations triggering an immediate evacuation or emergency alert banner:

| Rule ID | Pattern | Action / User Directive |
|---|---|---|
| `R-ACTION-FIRE` | Visible fire, open uncontrolled flame, or heavy smoke. | Set `immediate_action = true`. Display urgent banner: *"Possible fire or heavy smoke observed. Evacuate people immediately and contact local emergency services."* |
| `R-ACTION-LIVE-WIRE-WATER` | Exposed bare electrical conductor or broken appliance cord in standing water. | Set `immediate_action = true`. Display urgent banner: *"Exposed electrical conductor touching water observed. Keep everyone away and shut off power at main breaker immediately."* |

---

## 7. Verification & Idempotence Guarantee

The Risk Assessor agent evaluates `data/risk_rules.json` as a pure mathematical function of its inputs. Re-running Agent 4 with the same hazards and person context produces strictly identical risk levels, rationales, and rule IDs. Agent 6 (Verification Critic) uses this idempotence invariant (Check V3) to recompute and verify that stored risk matches recalculated risk.
