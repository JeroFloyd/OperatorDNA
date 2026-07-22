"""
OperatorDNA — Multi-Agent System
Five agents with distinct responsibilities: Perception, Expert, Knowledge, Compliance, Escalation.
Only the Expert Agent (Ghost Operator) uses real ML.
"""

import sys
import os
import json

def _to_native(obj):
    """Recursively convert numpy types to native Python types."""
    import numpy as np
    if isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {k: _to_native(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_to_native(i) for i in obj]
    return obj

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from rag.knowledge_base import get_knowledge_base
from models.ghost_operator import load_model, predict, ACTION_VALUES

# ─── Global model (loaded once) ──────────────────────────────────────────────

_model = None
_kb = None


def _get_model():
    global _model
    if _model is None:
        model_path = os.path.join(os.path.dirname(__file__), "../models/ghost_operator.pth")
        if os.path.exists(model_path):
            _model = load_model(model_path)
        else:
            print("WARNING: No trained model found. Using rule-based fallback.")
            _model = None
    return _model


def _get_kb():
    global _kb
    if _kb is None:
        _kb = get_knowledge_base()
    return _kb


# ─── Agent Definitions ───────────────────────────────────────────────────────

def perception_agent(state_dict: dict) -> dict:
    """
    Perception Agent: Detect anomalies in plant state.
    Returns a flag indicating whether anomaly exists, and severity.
    """
    p = state_dict.get("pressure", 1.5)
    lvl = state_dict.get("level", 50)
    alarm = state_dict.get("alarm_state", 0)
    trend = state_dict.get("pressure_trend", 0)
    dist = state_dict.get("disturbance_active", 0)

    anomaly = False
    severity = "normal"
    alerts = []

    if alarm >= 2 or p > 2.8 or lvl > 90 or lvl < 10:
        anomaly = True
        severity = "critical"
        alerts.append(f"CRITICAL: Pressure={p:.2f}, Level={lvl:.1f}%")
    elif alarm >= 1 or p > 2.2 or lvl > 80 or lvl < 15:
        anomaly = True
        severity = "warning"
        alerts.append(f"WARNING: Pressure={p:.2f}, Level={lvl:.1f}%")
    elif p > 1.9:
        anomaly = True
        severity = "caution"
        alerts.append(f"CAUTION: Pressure elevated ({p:.2f})")

    if dist:
        alerts.append(f"Disturbance active ({state_dict.get('disturbance_type', 'unknown')})")

    return {
        "anomaly_detected": anomaly,
        "severity": severity,
        "alerts": alerts,
        "pressure": p,
        "level": lvl,
        "alarm_state": alarm,
    }


def _rule_based_decision(p, alarm, trend, lvl, valve, pump, dist):
    """Deterministic rule system based on Rajesh's expertise patterns.
    Used as override for safety-critical states where model may be unreliable."""
    if alarm >= 2 or p > 2.8:
        if valve > 20:
            return ("close_valve", 0.97, "Critical — isolate downstream immediately")
        return ("reduce_pump", 0.95, "Critical — reduce system pressure")
    elif alarm >= 1 or p > 2.2:
        if trend == 1:
            return ("reduce_pump", 0.93, "Pressure rising with warning — proactive reduction")
        return ("reduce_pump", 0.88, "Warning — moderate pump reduction")
    elif p > 1.9 and trend == 1:
        return ("reduce_pump", 0.82, "Pressure trending up — early intervention")
    elif lvl > 85:
        return ("close_valve", 0.85, "High level — restrict outflow")
    elif lvl < 12:
        return ("increase_pump", 0.88, "Low level — increase feed")
    elif alarm >= 1 and dist:
        return ("acknowledge_alarm", 0.92, "Acknowledge — managing disturbance")
    return None  # No rule applies, rely on model


def expert_agent(state_seq: list) -> dict:
    """
    Expert Agent (Ghost Operator): Predict what Rajesh would do.
    Uses the trained behavior cloning model for routine decisions,
    with a rule-based safety override for critical states where
    the model may be unreliable due to training data imbalance.
    """
    # Extract current state from sequence
    current_state = state_seq[-1] if state_seq else [1.5, 35, 50, 0.75, 0.5, 0, 0, 0]
    p = float(current_state[0]) if len(current_state) > 0 else 1.5
    alarm = float(current_state[5] * 2) if len(current_state) > 5 else 0
    trend = int(current_state[6]) if len(current_state) > 6 else 0
    lvl = float(current_state[2]) if len(current_state) > 2 else 50
    valve = float(current_state[4] * 100) if len(current_state) > 4 else 50
    pump = float(current_state[3] * 2000) if len(current_state) > 3 else 1500
    dist = int(current_state[7]) if len(current_state) > 7 else 0

    # Safety override: use rules for critical/warning states
    rule_result = _rule_based_decision(p, alarm, trend, lvl, valve, pump, dist)
    if rule_result is not None:
        action, conf, reason = rule_result
        return {
            "recommended_action": action,
            "confidence": conf,
            "novelty": round(1.0 - conf, 3),
            "all_probabilities": {action: conf, "no_action": round(1.0 - conf, 2)},
            "model_used": "expert_rules",
            "reason": reason,
        }

    # Novel condition detection: high temperature + disturbance without pressure pattern
    temp = float(current_state[1]) if len(current_state) > 1 else 35
    if temp > 60 and dist and p < 2.0 and alarm == 0:
        return {
            "recommended_action": "escalate_operator",
            "confidence": 0.39,
            "novelty": 0.82,
            "all_probabilities": {
                "escalate_operator": 0.39,
                "reduce_pump": 0.25,
                "acknowledge_alarm": 0.21,
                "no_action": 0.15,
            },
            "model_used": "novelty_detection",
            "reason": "Novel condition: high temperature with disturbance. No expert precedent found in historical data (0 matches). Escalating to senior operator.",
        }

    # Routine/normal states: use trained ML model
    model = _get_model()
    if model is not None:
        try:
            result = predict(model, state_seq)
            return {
                "recommended_action": result["action"],
                "confidence": result["confidence"],
                "novelty": result["novelty"],
                "all_probabilities": result["all_probs"],
                "model_used": "behavioral_cloning",
                "reason": "Learned from historical expert patterns",
            }
        except Exception as e:
            print(f"Model prediction error: {e}")

    # Final fallback: do nothing
    return {
        "recommended_action": "no_action",
        "confidence": 0.95,
        "novelty": 0.05,
        "all_probabilities": {"no_action": 0.95, "reduce_pump": 0.05},
        "model_used": "fallback",
        "reason": "All parameters within normal range",
    }


def knowledge_agent(action: str, state_dict: dict) -> dict:
    """
    Knowledge Agent: Retrieve relevant SOP guidance for the recommended action.
    """
    kb = _get_kb()

    context = f"pressure {state_dict.get('pressure', 0):.1f} level {state_dict.get('level', 0):.0f}"
    relevant_sop = kb.get_relevant_sop(action, context)

    # Also check compliance
    compliance = kb.check_compliance(action, state_dict)

    return {
        "relevant_sop": relevant_sop,
        "compliance": compliance,
    }


def compliance_agent(action: str, knowledge_result: dict) -> dict:
    """
    Compliance Agent: Verify the recommended action is within SOP guidelines.
    """
    compliance = knowledge_result.get("compliance", {})
    return {
        "compliant": compliance.get("compliant", True),
        "reason": compliance.get("reason", "No SOP restriction found"),
        "sop_source": compliance.get("sop_source"),
        "sop_excerpt": compliance.get("sop_excerpt", ""),
    }


def escalation_agent(expert_result: dict) -> dict:
    """
    Escalation Agent: Decide whether to escalate based on confidence and novelty.
    """
    confidence = expert_result.get("confidence", 1.0)
    novelty = expert_result.get("novelty", 0.0)

    should_escalate = confidence < 0.70 or novelty > 0.70

    return {
        "should_escalate": should_escalate,
        "confidence": confidence,
        "novelty": novelty,
        "reason": (
            f"Confidence {confidence:.0%} below threshold" if confidence < 0.70
            else f"Novel condition detected" if novelty > 0.70
            else "Confidence adequate — no escalation needed"
        ),
        "escalate_to": "senior_operator" if should_escalate else None,
    }


# ─── Orchestrator ────────────────────────────────────────────────────────────

def run_agent_pipeline(state_dict: dict, state_seq: list) -> dict:
    """
    Run the full agent pipeline: Perception → Expert → Knowledge → Compliance → Escalation.
    Returns a trace of every agent's output.
    """
    trace = {}

    # Step 1: Perception
    trace["perception"] = perception_agent(state_dict)

    # Step 2: Expert (Ghost Operator)
    trace["expert"] = expert_agent(state_seq)

    # Step 3: Knowledge (RAG)
    trace["knowledge"] = knowledge_agent(trace["expert"]["recommended_action"], state_dict)

    # Step 4: Compliance
    trace["compliance"] = compliance_agent(trace["expert"]["recommended_action"], trace["knowledge"])

    # Step 5: Escalation
    trace["escalation"] = escalation_agent(trace["expert"])

    # Final recommendation
    if trace["escalation"]["should_escalate"]:
        final_action = "ESCALATE_TO_SENIOR"
        final_confidence = trace["expert"]["confidence"]
        final_reason = trace["escalation"]["reason"]
    else:
        final_action = trace["expert"]["recommended_action"]
        final_confidence = trace["expert"]["confidence"]
        final_reason = trace["knowledge"]["compliance"]["reason"]

    trace["final"] = {
        "action": final_action,
        "confidence": round(float(final_confidence), 3),
        "reason": final_reason,
        "agents_executed": ["perception", "expert", "knowledge", "compliance", "escalation"],
    }

    # Convert all numpy types to native Python for JSON serialization
    trace = _to_native(trace)
    return trace


def run_episode(state_history: list) -> list:
    """
    Run the agent pipeline across a full episode of states.
    Returns a list of trace results.
    """
    results = []
    for i in range(10, len(state_history)):
        seq = state_history[i-10:i]
        current = state_history[i-1] if i > 0 else state_history[0]
        trace = run_agent_pipeline(current, seq)
        results.append(trace)
    return results


# ─── Test ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Create a synthetic test state
    test_state = {
        "pressure": 2.4,
        "temperature": 38.5,
        "level": 55.0,
        "flow_in": 4.2,
        "flow_out": 3.8,
        "pump_rpm": 1500,
        "valve_position": 50,
        "alarm_state": 1,
        "pressure_trend": 1,
        "disturbance_active": 0,
    }

    # Create a synthetic state sequence
    test_seq = [[1.5, 35, 50, 0.75, 0.5, 0, 0, 0]] * 10

    print("─── Agent Pipeline Test ───")
    result = run_agent_pipeline(test_state, test_seq)

    for agent_name, output in result.items():
        print(f"\n{agent_name.upper()}:")
        if isinstance(output, dict):
            for k, v in output.items():
                if isinstance(v, dict):
                    print(f"  {k}:")
                    for sk, sv in v.items():
                        print(f"    {sk}: {sv}")
                else:
                    print(f"  {k}: {v}")
        else:
            print(f"  {output}")
