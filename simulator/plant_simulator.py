"""
OperatorDNA — Plant Simulator
Physics-based simulation of an industrial process with tank/pump/valve.
Generates synthetic SCADA historian data with 3 operator personas.
"""

import numpy as np
import pandas as pd
import os, json, warnings
warnings.filterwarnings('ignore')

# ─── Plant Physics ───────────────────────────────────────────────────────────

ACTION_VALUES = {
    "close_valve": 1, "open_valve": 2, "reduce_pump": 3, "increase_pump": 4,
    "acknowledge_alarm": 6, "emergency_shutdown": 7, "no_action": 0,
}

def _to_native(obj):
    """Convert numpy types to native Python types."""
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


class TankPlant:
    """Two-tank industrial process with pump, valve, and disturbances."""

    def __init__(self, dt=0.5):
        self.dt = dt
        self.t = 0.0

        # Tank 1 (source) and Tank 2 (process)
        self.level1 = 60.0
        self.level2 = 50.0
        self.pressure = 1.5
        self.temperature = 35.0
        self.flow_in = 4.5
        self.flow_out = 3.8
        self.pump_rpm = 1500
        self.valve_position = 50
        self.alarm_state = 0
        self.pressure_trend = 0

        self.disturbance_active = False
        self.disturbance_type = None
        self.disturbance_intensity = 0.0
        self.disturbance_timer = 0.0
        self.step_counter = 0

    def step(self):
        self.t += self.dt
        self.step_counter += 1
        self._apply_disturbance()

        # Tank 1: refills slowly (infinite reservoir model)
        self.level1 += (self.flow_in - 4.5) * self.dt * 0.5
        self.level1 = np.clip(self.level1, 10, 100)

        # Pump increases with RPM
        pump_out = self.pump_rpm / 2000.0 * 5.0

        # Valve restricts outflow
        valve_factor = self.valve_position / 100.0
        valve_out = valve_factor * 3.0 * np.sqrt(max(0.1, self.pressure - 1.0))

        # Tank 2 level
        dlevel = (pump_out - valve_out) * self.dt / 10.0
        self.level2 += dlevel
        self.level2 = np.clip(self.level2, 5, 95)

        # Pressure depends on Tank2 level + pump
        base_p = 1.0 + 0.6 * (self.level2 / 100.0)
        pump_p = 0.4 * (self.pump_rpm / 2000.0)
        self.pressure = base_p + pump_p + np.random.normal(0, 0.015)

        # Temperature drift
        self.temperature += 0.008 * (self.pump_rpm / 2000.0) - 0.003 + np.random.normal(0, 0.03)
        self.temperature = np.clip(self.temperature, 20, 80)

        # Flow tracking
        self.flow_in = pump_out
        self.flow_out = valve_out

        # Trend detection
        old_trend = self.pressure_trend
        if self.pressure > 2.2:
            self.pressure_trend = 1
        elif self.pressure < 1.3:
            self.pressure_trend = -1
        elif self.pressure > 1.8:
            self.pressure_trend = 1 if np.random.random() < 0.3 else 0
        else:
            self.pressure_trend = 0

        # Alarm state
        if self.pressure > 2.8 or self.level2 > 90 or self.level2 < 8:
            self.alarm_state = 2
        elif self.pressure > 2.2 or self.level2 > 80 or self.level2 < 15:
            self.alarm_state = 1
        else:
            self.alarm_state = 0

        # Random disturbances (~3% per step)
        if not self.disturbance_active and np.random.random() < 0.03:
            self._start_disturbance()

        return self.get_state()

    def _start_disturbance(self):
        self.disturbance_active = True
        self.disturbance_type = np.random.choice(
            ["pressure_spike", "flow_drop", "temp_rise", "leak"]
        )
        self.disturbance_intensity = np.random.uniform(0.4, 1.0)
        self.disturbance_timer = np.random.uniform(8, 25)

        if self.disturbance_type == "pressure_spike":
            self.pressure += self.disturbance_intensity * 1.8
        elif self.disturbance_type == "flow_drop":
            self.flow_in *= (1.0 - self.disturbance_intensity * 0.4)
        elif self.disturbance_type == "temp_rise":
            self.temperature += self.disturbance_intensity * 20
        elif self.disturbance_type == "leak":
            self.level2 -= self.disturbance_intensity * 5.0

    def _apply_disturbance(self):
        if not self.disturbance_active:
            return
        self.disturbance_timer -= self.dt
        if self.disturbance_timer <= 0:
            self.disturbance_active = False
            self.disturbance_type = None
            self.flow_in = min(self.flow_in + 0.1, 5.0)
        else:
            decay = np.exp(-0.08 * (25 - self.disturbance_timer))
            if self.disturbance_type == "pressure_spike":
                self.pressure += self.disturbance_intensity * 0.6 * decay
            elif self.disturbance_type == "flow_drop":
                self.flow_in *= 0.97
            elif self.disturbance_type == "temp_rise":
                self.temperature += 0.3
            elif self.disturbance_type == "leak":
                self.level2 -= 0.2

    def apply_action(self, action_type, value=None):
        if action_type == "close_valve":
            self.valve_position = max(0, self.valve_position - (value or 40))
        elif action_type == "open_valve":
            self.valve_position = min(100, self.valve_position + (value or 40))
        elif action_type == "reduce_pump":
            self.pump_rpm = max(500, self.pump_rpm - (value or 400))
        elif action_type == "increase_pump":
            self.pump_rpm = min(2000, self.pump_rpm + (value or 400))
        elif action_type == "acknowledge_alarm":
            self.alarm_state = max(0, self.alarm_state - 1)
        elif action_type == "emergency_shutdown":
            self.pump_rpm = 0
            self.valve_position = 0
        elif action_type == "no_action":
            pass
        self.pump_rpm = int(np.clip(self.pump_rpm, 0, 2000))
        self.valve_position = int(np.clip(self.valve_position, 0, 100))
        return self.get_state()

    def restore_state(self, state_dict):
        """Restore plant state from a dictionary returned by get_state()."""
        self.t = state_dict.get("timestamp", self.t)
        self.level1 = state_dict.get("level1", self.level1)
        self.level2 = state_dict.get("level", self.level2)
        self.pressure = state_dict.get("pressure", self.pressure)
        self.temperature = state_dict.get("temperature", self.temperature)
        self.flow_in = state_dict.get("flow_in", self.flow_in)
        self.flow_out = state_dict.get("flow_out", self.flow_out)
        self.pump_rpm = state_dict.get("pump_rpm", self.pump_rpm)
        self.valve_position = state_dict.get("valve_position", self.valve_position)
        self.alarm_state = state_dict.get("alarm_state", self.alarm_state)
        self.pressure_trend = state_dict.get("pressure_trend", self.pressure_trend)
        self.disturbance_active = bool(state_dict.get("disturbance_active", self.disturbance_active))
        self.disturbance_type = state_dict.get("disturbance_type", self.disturbance_type)
        self.disturbance_intensity = state_dict.get("disturbance_intensity", self.disturbance_intensity)
        self.disturbance_timer = state_dict.get("disturbance_timer", self.disturbance_timer)
        self.step_counter = state_dict.get("step_counter", self.step_counter)
        return self

    def get_state(self):
        return _to_native({
            "timestamp": round(self.t, 1),
            "pressure": round(self.pressure, 3),
            "temperature": round(self.temperature, 1),
            "level": round(self.level2, 1),
            "level1": round(self.level1, 1),
            "flow_in": round(self.flow_in, 2),
            "flow_out": round(self.flow_out, 2),
            "pump_rpm": int(self.pump_rpm),
            "valve_position": int(self.valve_position),
            "alarm_state": int(self.alarm_state),
            "pressure_trend": int(self.pressure_trend),
            "disturbance_active": int(self.disturbance_active),
            "disturbance_type": self.disturbance_type,
            "disturbance_intensity": float(self.disturbance_intensity),
            "disturbance_timer": float(self.disturbance_timer),
            "step_counter": int(self.step_counter),
        })


# ─── Operator Personas ───────────────────────────────────────────────────────

class ExpertOperator:
    """Rajesh — 25yr experience. Correct action, correct timing."""

    def __init__(self):
        self.name = "Rajesh"
        self.expertise = 0.95

    def decide(self, state, history=[]):
        p = state["pressure"]
        lvl = state["level"]
        alarm = state["alarm_state"]
        trend = state["pressure_trend"]
        valve = state["valve_position"]
        pump = state["pump_rpm"]
        dist = state["disturbance_active"]
        dtype = state.get("disturbance_type", "")

        # Critical
        if alarm >= 2 or p > 2.8:
            if valve > 20:
                return ("close_valve", 60, 0.97, "Critical pressure — isolate downstream immediately")
            return ("reduce_pump", 600, 0.95, "Max pump reduction — lower system pressure fast")
        elif alarm >= 1 or p > 2.2:
            if trend == 1:
                return ("reduce_pump", 400, 0.93, "Pressure rising with alarm — proactive reduction")
            if valve > 60:
                return ("close_valve", 30, 0.90, "Throttle valve — pressure above threshold")
            return ("reduce_pump", 300, 0.91, "Moderate alarm — reduce pump pressure")
        elif p > 1.9:
            if trend == 1:
                return ("reduce_pump", 200, 0.86, "Pressure trending up — early intervention")
            return ("reduce_pump", 100, 0.82, "Slightly elevated — minor adjustment")
        elif lvl > 85:
            return ("close_valve", 20, 0.88, "High level — restrict outflow")
        elif lvl < 12:
            return ("increase_pump", 300, 0.90, "Low level — increase feed")
        elif p < 1.2 and pump > 500:
            return ("increase_pump", 200, 0.85, "Pressure low — moderate increase")
        elif alarm == 1 and dist:
            return ("acknowledge_alarm", None, 0.94, "Acknowledge — actively managing disturbance")
        elif not dist and valve < 30 and pump > 1500:
            return ("open_valve", 20, 0.80, "Restore normal valve position")
        elif not dist and pump < 800 and p < 1.4:
            return ("increase_pump", 200, 0.78, "Restore baseline pump speed")
        else:
            return ("no_action", None, 0.99, "All parameters within normal range")


class JuniorOperator:
    """Arjun — 1yr experience. Often wrong sequence, delayed responses."""

    def __init__(self):
        self.name = "Arjun"
        self.expertise = 0.30

    def decide(self, state, history=[]):
        p = state["pressure"]
        lvl = state["level"]
        alarm = state["alarm_state"]
        trend = state["pressure_trend"]

        # Often does wrong thing or hesitates too long
        if alarm >= 2 or p > 2.8:
            r = np.random.random()
            if r < 0.4:
                return ("increase_pump", 300, 0.55, "Trying to increase flow — PANIC")
            elif r < 0.6:
                return ("no_action", None, 0.35, "Freezing — unsure what to do")
            return ("reduce_pump", 300, 0.50, "Reduce pump — hoping it helps")
        elif alarm >= 1 or p > 2.2:
            r = np.random.random()
            if r < 0.35:
                return ("no_action", None, 0.40, "Monitoring — waiting for instructions")
            return ("reduce_pump", 200, 0.52, "Reduce pump speed")
        elif p > 1.8:
            r = np.random.random()
            if r < 0.5:
                return ("no_action", None, 0.42, "Not sure if this is serious")
            return ("reduce_pump", 100, 0.48, "Small reduction")
        elif lvl < 15:
            return ("increase_pump", 400, 0.58, "Level low — increase pump")
        else:
            return ("no_action", None, 0.65, "Normal operations")


class AverageOperator:
    """Priya — 5yr experience. Correct sequence but slightly delayed."""

    def __init__(self):
        self.name = "Priya"
        self.expertise = 0.60

    def decide(self, state, history=[]):
        p = state["pressure"]
        lvl = state["level"]
        alarm = state["alarm_state"]
        trend = state["pressure_trend"]
        valve = state["valve_position"]

        if alarm >= 2 or p > 2.8:
            if valve > 20:
                return ("close_valve", 45, 0.83, "Close valve — critical pressure")
            return ("reduce_pump", 500, 0.80, "Reduce pump fast")
        elif alarm >= 1 or p > 2.2:
            r = np.random.random()
            if r < 0.15:
                return ("no_action", None, 0.55, "Taking a moment to assess")
            return ("reduce_pump", 300, 0.77, "Pressure high — reduce pump")
        elif p > 1.9:
            r = np.random.random()
            if r < 0.2:
                return ("no_action", None, 0.52, "Watching trend")
            return ("reduce_pump", 150, 0.72, "Slight reduction")
        elif lvl > 85:
            return ("close_valve", 15, 0.78, "High level — throttle")
        elif lvl < 15:
            return ("increase_pump", 250, 0.80, "Low level — increase feed")
        else:
            return ("no_action", None, 0.88, "Normal operations")


OPERATOR_MAP = {
    "expert": ExpertOperator, "junior": JuniorOperator, "average": AverageOperator
}


# ─── Simulation Runner ───────────────────────────────────────────────────────

def simulate_episode(operator_type, steps=600, seed=None):
    if seed is not None:
        np.random.seed(seed)

    plant = TankPlant()
    operator = OPERATOR_MAP[operator_type]()
    records = []

    for _ in range(steps):
        state = plant.step()
        action_type, action_val, conf, reason = operator.decide(state)

        adj_val = abs(action_val) if action_val else 30
        if action_type in ("close_valve", "open_valve"):
            adj_val = abs(action_val or 40)
        elif action_type in ("reduce_pump", "increase_pump"):
            adj_val = abs(action_val or 400)

        plant.apply_action(action_type, adj_val)

        records.append({
            "timestamp": state["timestamp"],
            "pressure": state["pressure"],
            "temperature": state["temperature"],
            "level": state["level"],
            "flow_in": state["flow_in"],
            "flow_out": state["flow_out"],
            "pump_rpm": state["pump_rpm"],
            "valve_position": state["valve_position"],
            "alarm_state": state["alarm_state"],
            "pressure_trend": state["pressure_trend"],
            "disturbance_active": state["disturbance_active"],
            "operator_name": operator.name,
            "expertise_level": operator.expertise,
            "action_taken": action_type,
            "action_confidence": conf,
            "action_reason": reason,
        })

    return pd.DataFrame(records)


def encode_window(window_df):
    """Convert a window of state rows to a feature vector."""
    rows = []
    for _, row in window_df.iterrows():
        rows.append([
            row["pressure"], row["temperature"], row["level"],
            row["pump_rpm"] / 2000.0, row["valve_position"] / 100.0,
            row["alarm_state"] / 2.0, row["pressure_trend"],
            int(row["disturbance_active"])
        ])
    return rows


def generate_dataset(output_dir="data", episodes=100, window=10):
    os.makedirs(output_dir, exist_ok=True)

    all_records = []
    for ep in range(episodes):
        op_type = np.random.choice(["expert", "average", "junior"], p=[0.6, 0.25, 0.15])
        df = simulate_episode(op_type, seed=ep * 42)
        df["episode"] = ep
        all_records.append(df)

    full_df = pd.concat(all_records, ignore_index=True)
    full_df.to_csv(os.path.join(output_dir, "historian_raw.csv"), index=False)

    # Build training pairs: window of history → next action
    training = []
    for ep in range(episodes):
        ep_df = full_df[full_df["episode"] == ep].reset_index(drop=True)
        for i in range(window, len(ep_df)):
            win = ep_df.iloc[i - window:i]
            row = ep_df.iloc[i]
            training.append({
                "state_seq": json.dumps(encode_window(win)),
                "action": row["action_taken"],
                "action_code": ACTION_VALUES.get(row["action_taken"], 0),
                "expertise": row["expertise_level"],
                "episode": ep,
            })

    train_df = pd.DataFrame(training)
    train_df.to_csv(os.path.join(output_dir, "training_pairs.csv"), index=False)

    # Also export some expert-only data for model training
    expert_df = full_df[full_df["operator_name"] == "Rajesh"].copy()
    expert_pairs = []
    for ep in range(episodes):
        ep_df = expert_df[expert_df["episode"] == ep].reset_index(drop=True)
        for i in range(window, len(ep_df)):
            win = ep_df.iloc[i - window:i]
            row = ep_df.iloc[i]
            expert_pairs.append({
                "state_seq": json.dumps(encode_window(win)),
                "action": row["action_taken"],
                "action_code": ACTION_VALUES.get(row["action_taken"], 0),
                "episode": ep,
            })
    expert_train = pd.DataFrame(expert_pairs)
    expert_train.to_csv(os.path.join(output_dir, "expert_training_pairs.csv"), index=False)

    print(f"Total records: {len(full_df)}")
    print(f"Training pairs: {len(train_df)}")
    print(f"Expert-only pairs: {len(expert_train)}")
    print(f"Action distribution:\n{full_df['action_taken'].value_counts()}")
    return full_df, train_df, expert_train


if __name__ == "__main__":
    print("Generating dataset...")
    generate_dataset("../data", episodes=80)
    print("\nDone! Data saved to ../data/")
