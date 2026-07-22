# SOP 14.2 — Pressure Management & Valve Control

**Revision:** 4.2
**Effective Date:** 2024-03-15
**Applicable To:** All process operators, shift supervisors

## Purpose

Establish standard procedure for managing abnormal pressure conditions in process vessels and piping systems.

## Trigger Conditions

- Pressure exceeds 2.0 bar (warning threshold)
- Pressure exceeds 2.5 bar (critical threshold)
- Pressure trend positive for 3+ consecutive readings

## Procedure

### Step 1: Assess
1. Check current pressure reading on DCS
2. Verify pressure trend over last 10 seconds
3. Identify potential cause:
   - Blocked downstream valve
   - Pump overspeed
   - Feed disturbance
   - Temperature excursion

### Step 2: Immediate Response (Pressure > 2.2 bar)
1. **Close downstream isolation valve** — reduce by 30-50% initially
2. **Reduce pump speed** — decrease by 200-400 RPM
3. **Monitor pressure trend** — wait 5 seconds for response
4. If pressure continues rising, repeat steps 1-2

### Step 3: Critical Response (Pressure > 2.8 bar)
1. **Emergency isolation** — close downstream valve fully
2. **Pump minimum** — reduce pump to minimum safe speed (500 RPM)
3. **Sound alarm** — notify shift supervisor
4. **Prepare for emergency shutdown** if pressure exceeds 3.5 bar

### Step 4: Recovery
1. Once pressure falls below 1.8 bar, gradually restore:
   - Open valve to 40% position
   - Increase pump to 1200 RPM
2. Monitor for 30 seconds before leaving panel

### Step 5: Documentation
1. Log all actions in shift log
2. Note pressure peak and duration
3. Report to next shift supervisor

## Warnings

- Never open both isolation valves simultaneously during pressure event
- Do not increase pump speed while pressure > 2.0 bar
- If pressure exceeds 3.5 bar, execute Emergency Shutdown procedure (SOP 14.7)
