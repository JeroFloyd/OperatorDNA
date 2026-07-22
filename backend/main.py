"""
OperatorDNA — FastAPI Backend
Serves plant simulation, agent pipeline, and RAG endpoints.
"""

import sys
import os
import json
import asyncio
from typing import List, Dict, Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from simulator.plant_simulator import (
    TankPlant, simulate_episode, encode_window,
    ExpertOperator, AverageOperator, JuniorOperator,
)
from agents.agent_system import run_agent_pipeline, perception_agent, expert_agent
from rag.knowledge_base import get_knowledge_base

# ─── App Setup ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="OperatorDNA API",
    description="Industrial Knowledge Intelligence Platform — ET AI Hackathon 2026",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Plant simulators (one per operator type for comparison)
_sims = {}
_kb = None


def get_sim(key="default"):
    if key not in _sims:
        plant = TankPlant()
        _sims[key] = plant
        return plant
    return _sims[key]


def get_kb():
    global _kb
    if _kb is None:
        _kb = get_knowledge_base()
    return _kb


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class PlantState(BaseModel):
    timestamp: float
    pressure: float
    temperature: float
    level: float
    flow_in: float
    flow_out: float
    pump_rpm: int
    valve_position: int
    alarm_state: int
    pressure_trend: int
    disturbance_active: int


class ActionRequest(BaseModel):
    action_type: str
    value: float | None = None


class CounterfactualRequest(BaseModel):
    action_type: str
    value: float | None = None
    steps: int = 20


class AgentTrace(BaseModel):
    perception: Dict[str, Any]
    expert: Dict[str, Any]
    knowledge: Dict[str, Any]
    compliance: Dict[str, Any]
    escalation: Dict[str, Any]
    final: Dict[str, Any]


class SOPQuery(BaseModel):
    query: str
    top_k: int = 3


# ─── Knowledge Risk Data (synthesized from operator personas) ──────────────

KNOWLEDGE_RISK_DATA = {
    "knowledge_risk_index": 78.4,
    "risk_level": "high",
    "retiring_experts_count": 3,
    "critical_workflows_at_risk": 17,
    "expert_discovery": [
        {"specialty": "Pressure spikes & valve isolation", "best_operator": "Rajesh", "success_rate": 94, "pattern": "Reduces pump before isolating valve — minimizes oscillation", "years_experience": 26},
        {"specialty": "Cooling system failures", "best_operator": "Priya", "success_rate": 91, "pattern": "Ramps down gradually instead of abrupt cuts", "years_experience": 5},
        {"specialty": "Pump cavitation recovery", "best_operator": "Rajesh", "success_rate": 88, "pattern": "Acknowledges alarm first, then reduces load in 3 stages", "years_experience": 26},
        {"specialty": "Feed pump restart sequences", "best_operator": "Suresh", "success_rate": 85, "pattern": "Purges line before restart — prevents water hammer", "years_experience": 18},
        {"specialty": "Compressor surge events", "best_operator": "Priya", "success_rate": 82, "pattern": "Opens recycle valve before reducing speed", "years_experience": 5},
    ],
    "undocumented_workflows": [
        {
            "sop_id": "sop_14_2_pressure_management",
            "official_action": "Close isolation valve → Reduce pump speed",
            "expert_sequence": "Reduce pump speed 30% → Wait 3s → Close valve → Then reduce pump further",
            "evidence": "92% of experts deviate from SOP sequence. The expert sequence reduces pressure oscillation by 62% versus the documented order.",
            "operators_using": ["Rajesh", "Priya", "Suresh"],
            "adoption_rate": 78,
        },
        {
            "sop_id": "sop_08_5_alarm_response",
            "official_action": "Acknowledge alarm → Assess → Act",
            "expert_sequence": "Begin corrective action first, acknowledge alarm after (saves 4-7s in critical scenarios)",
            "evidence": "In timed drills, acting-first operators resolved failures 34% faster with 12% fewer secondary alarms.",
            "operators_using": ["Rajesh", "Priya"],
            "adoption_rate": 45,
        },
        {
            "sop_id": "sop_12_7_pump_protocol",
            "official_action": "Reduce pump by 100 RPM every 10 seconds",
            "expert_sequence": "Reduce by 300 RPM immediately, observe 5s, then fine-tune",
            "evidence": "Aggressive initial reduction prevents overspeed-related cavitation in 89% of cases.",
            "operators_using": ["Rajesh", "Suresh"],
            "adoption_rate": 34,
        },
    ],
    "knowledge_health": {
        "documented_coverage": 63,
        "tacit_knowledge_risk": 82,
        "successor_readiness": 24,
        "workflows_documented": 84,
        "workflows_undocumented": 17,
        "avg_expertise_years_remaining": 4.2,
    },
}

# ─── API Endpoints ───────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "service": "OperatorDNA",
        "version": "1.0.0",
        "status": "running",
        "agents": ["perception", "expert", "knowledge", "compliance", "escalation"],
    }


@app.get("/api/plant/state")
def get_plant_state():
    """Get current plant state, advancing simulation by one step."""
    plant = get_sim()
    state = plant.step()
    return state


@app.get("/api/plant/reset")
def reset_plant():
    """Reset the plant simulation."""
    _sims.clear()
    return {"status": "reset"}


@app.get("/api/plant/scenario/{name}")
def set_scenario(name: str):
    """Reset plant and inject a specific disturbance scenario."""
    _sims.clear()
    plant = TankPlant()
    _sims["default"] = plant

    if name == "pressure_spike":
        # Known failure: high pressure from high level + max pump + strong disturbance
        plant.level2 = 95.0
        plant.pump_rpm = 2000
        plant.disturbance_active = True
        plant.disturbance_type = "pressure_spike"
        plant.disturbance_intensity = 1.5
        plant.disturbance_timer = 40.0
        # Step once to compute initial pressure from physics + disturbance
        plant.step()
    elif name == "novel":
        # Novel condition: high temp + disturbance, pressure normal — triggers novelty detector
        plant.temperature = 68.0
        plant.disturbance_active = True
        plant.disturbance_type = "temp_rise"
        plant.disturbance_intensity = 1.0
        plant.disturbance_timer = 30.0
        plant.step()
    elif name == "critical":
        # Critical: extreme level + pump + max intensity disturbance
        plant.level2 = 95.0
        plant.pump_rpm = 2000
        plant.disturbance_active = True
        plant.disturbance_type = "pressure_spike"
        plant.disturbance_intensity = 2.0
        plant.disturbance_timer = 40.0
        plant.step()
    # 'normal' — no disturbance, steady state

    state = plant.get_state()
    return {"status": f"scenario_{name}", "state": state}


@app.post("/api/plant/action")
def apply_action(req: ActionRequest):
    """Apply an operator action to the plant."""
    plant = get_sim()
    state = plant.apply_action(req.action_type, req.value)
    return state


@app.get("/api/plant/step")
def plant_step():
    """
    Advance plant one timestep and return:
    - current state
    - state sequence for ML model
    - full agent trace
    """
    plant = get_sim()
    state = plant.step()

    # Build state history from memory
    if not hasattr(plant, "_history"):
        plant._history = []
    plant._history.append(state)

    # Keep last 20 states
    if len(plant._history) > 20:
        plant._history = plant._history[-20:]

    # Build state sequence for ML model
    def to_vector(s):
        return [
            s["pressure"], s["temperature"], s["level"],
            s["pump_rpm"] / 2000.0, s["valve_position"] / 100.0,
            s["alarm_state"] / 2.0, s["pressure_trend"],
            int(s["disturbance_active"]),
        ]

    state_seq = [to_vector(s) for s in plant._history]
    # Pad if not enough history
    while len(state_seq) < 10:
        state_seq = [state_seq[0]] + state_seq if state_seq else [to_vector(state)]

    # Use last 10
    state_seq = state_seq[-10:]

    # Run agent pipeline
    trace = run_agent_pipeline(state, state_seq)

    return {
        "state": state,
        "trace": trace,
        "history": plant._history,
    }


@app.get("/api/plant/history")
def get_history():
    """Get the complete state history."""
    plant = get_sim()
    if not hasattr(plant, "_history"):
        return {"history": []}
    return {"history": plant._history}


@app.post("/api/kb/search")
def kb_search(req: SOPQuery):
    """Search the knowledge base."""
    kb = get_kb()
    results = kb.search(req.query, req.top_k)
    return {"results": results}


@app.get("/api/kb/sops")
def list_sops():
    """List all available SOPs in the knowledge base."""
    return {"sops": [s["id"] for s in get_kb().chunks]}


@app.get("/api/demo/scenario/{name}")
def demo_scenario(name: str):
    """
    Run a specific demo scenario.
    Scenarios: normal, pressure_spike, leak, novel, critical
    """
    plant = TankPlant()
    scenario_steps = []

    # Configure initial conditions based on scenario
    if name == "normal":
        pass  # Default initial conditions
    elif name == "pressure_spike":
        plant.disturbance_active = True
        plant.disturbance_type = "pressure_spike"
        plant.disturbance_intensity = 0.8
        plant.disturbance_timer = 15.0
    elif name == "leak":
        plant.disturbance_active = True
        plant.disturbance_type = "leak"
        plant.disturbance_intensity = 0.6
        plant.disturbance_timer = 20.0
    elif name == "novel":
        # Unusual combination: high temp + low pressure + disturbance
        plant.temperature = 70.0
        plant.disturbance_active = True
        plant.disturbance_type = "temp_rise"
        plant.disturbance_intensity = 1.0
        plant.disturbance_timer = 25.0
    elif name == "critical":
        plant.disturbance_active = True
        plant.disturbance_type = "pressure_spike"
        plant.disturbance_intensity = 1.0
        plant.disturbance_timer = 20.0
        plant.pressure = 2.8
        plant.alarm_state = 2

    # Run simulation with expert operator for ground truth
    expert = ExpertOperator()
    history = []

    for step in range(100):
        state = plant.step()
        history.append(state)

        action_type, action_val, conf, reason = expert.decide(state)
        adj_val = abs(action_val) if action_val else 30
        plant.apply_action(action_type, adj_val)

        # After 20 steps, collect agent trace
        if step == 20:
            state_seq = []
            for s in history[-10:]:
                state_seq.append([
                    s["pressure"], s["temperature"], s["level"],
                    s["pump_rpm"] / 2000.0, s["valve_position"] / 100.0,
                    s["alarm_state"] / 2.0, s["pressure_trend"],
                    int(s["disturbance_active"]),
                ])
            agent_trace = run_agent_pipeline(state, state_seq)

    return {
        "scenario": name,
        "duration_steps": 100,
        "agent_trace": agent_trace,
        "expert_actions_taken": history[-1],
        "state_history": history,
        "plant_config": {
            "description": {
                "normal": "Normal steady-state operations",
                "pressure_spike": "Sudden pressure spike requiring valve isolation",
                "leak": "Process leak causing level drop",
                "novel": "Unfamiliar combined condition — low confidence expected",
                "critical": "Critical pressure exceeding emergency threshold",
            }.get(name, ""),
        },
    }


@app.post("/api/plant/counterfactual")
def counterfactual_simulation(req: CounterfactualRequest):
    """
    Simulate two futures: accept the recommendation vs do nothing.
    Runs both simulations from the current plant state.
    """
    plant = get_sim()
    current_state = plant.get_state()

    # Accept branch: apply recommended action
    accept_plant = TankPlant()
    accept_plant.restore_state(current_state)
    applied_val = req.value or (60 if req.action_type == "close_valve" else 400)
    accept_plant.apply_action(req.action_type, applied_val)
    accept_traj = []
    for _ in range(req.steps):
        accept_traj.append(accept_plant.step())

    # Ignore branch: do nothing
    ignore_plant = TankPlant()
    ignore_plant.restore_state(current_state)
    ignore_traj = []
    for _ in range(req.steps):
        ignore_traj.append(ignore_plant.step())

    # Determine outcomes
    accept_final = accept_traj[-1]
    ignore_final = ignore_traj[-1]

    accept_ok = accept_final["pressure"] < 2.0 and accept_final["alarm_state"] == 0
    ignore_critical = ignore_final["pressure"] > 2.8 or ignore_final["alarm_state"] >= 2

    # Loss estimate
    loss_estimate = ""
    if ignore_critical:
        peak_p = max(s["pressure"] for s in ignore_traj)
        if peak_p > 3.0:
            loss_estimate = "$420,000 — estimated extended shutdown"
        elif peak_p > 2.8:
            loss_estimate = "$180,000 — estimated production loss"
        else:
            loss_estimate = "$85,000 — estimated partial loss"

    return {
        "accept_trajectory": accept_traj,
        "ignore_trajectory": ignore_traj,
        "accept_outcome": "Plant stabilized — pressure within normal range" if accept_ok else "Monitoring required — pressure elevated but controlled",
        "ignore_outcome": "Pressure critical — emergency shutdown likely" if ignore_critical else "Self-stabilized — no intervention needed",
        "loss_estimate": loss_estimate,
        "accept_final_pressure": accept_final["pressure"],
        "ignore_final_pressure": ignore_final["pressure"],
        "steps_simulated": req.steps,
    }


@app.get("/api/knowledge/risk")
def knowledge_risk():
    """
    Return organizational knowledge health data:
    - Knowledge Risk Index
    - Expert discovery (who's best at what)
    - Undocumented workflows
    - Knowledge health metrics
    """
    # Update risk index based on active scenario if plant is in a critical state
    plant = get_sim()
    state = plant.get_state()

    risk = dict(KNOWLEDGE_RISK_DATA)

    # Slightly adjust risk based on current plant state
    if state["alarm_state"] >= 2:
        risk["knowledge_risk_index"] = min(95, risk["knowledge_risk_index"] + 5)
        risk["risk_level"] = "critical"
    elif state["alarm_state"] >= 1:
        risk["knowledge_risk_index"] = min(90, risk["knowledge_risk_index"] + 2)

    risk["current_scenario"] = "active_alarm" if state["alarm_state"] > 0 else "normal"

    return risk


@app.get("/api/health")
def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "model_loaded": os.path.exists(
            os.path.join(os.path.dirname(__file__), "../models/ghost_operator.pth")
        ),
        "docs_loaded": len(get_kb().chunks) > 0,
    }


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    port = args.port
    print(f"Starting OperatorDNA API on port {port}...")
    print(f"Model available: {os.path.exists(os.path.join(os.path.dirname(__file__), '../models/ghost_operator.pth'))}")
    uvicorn.run(app, host="0.0.0.0", port=port)
