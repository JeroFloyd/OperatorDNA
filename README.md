# 🧬 OperatorDNA

> ### **Industrial Memory. Captured Forever.**

OperatorDNA is an AI platform that preserves the decision patterns of expert industrial operators. It learns directly from historical sensor data and control actions, so when experienced operators retire, their expertise stays in the control room.

🏆 **Built for the ET AI Hackathon 2026** under **Problem Statement #8: AI for Industrial Knowledge Intelligence.**

---

## 🚨 The Problem

Every industrial plant has a handful of operators everyone trusts.

People with **20–40 years of experience** who instinctively know what to do when something unusual happens:

- Pressure oscillations
- Unstable flow
- Temperature spikes
- Pump cavitation
- Unexpected alarms

They know:

- Which valve to close.
- Which pump **not** to touch.
- When to follow the SOP.
- When experience matters more than the manual.

The problem?

**That knowledge is never written down.**

When these operators retire...

> **Their expertise disappears forever.**

Existing industrial software captures:

- 📄 Documents
- 📋 Procedures
- 🛠️ Maintenance logs

It captures **explicit knowledge**.

It does **not** capture **how experts actually make decisions.**

**OperatorDNA was built to solve exactly that.**

---

# 🎯 What It Does

OperatorDNA learns the relationship between **plant state** and **operator action** directly from historical SCADA data.

When a new condition arises, it:

- Predicts what the best operator would do.
- Explains why.
- Retrieves similar historical situations.
- Shows supporting evidence.

Instead of asking:

> ❓ *"What is happening?"*

OperatorDNA asks:

> ✅ **"What would your best operator do?"**

---

# 🚀 Key Features

## 👻 Ghost Operator Engine

Predicts the most likely expert action given current plant conditions.

Each recommendation includes:

- Confidence score
- Reasoning chain
- Similar historical events

---

## 🧠 Memory Engine

Stores every incident, decision, and outcome as searchable organizational memory.

When a new condition matches history, the relevant expert experiences are surfaced automatically.

---

## 🔍 Discovery Engine

Finds undocumented workflows.

Identifies patterns experts consistently follow that never became official SOPs.

Surfaces:

- Silent saves
- Near misses
- Hidden operational expertise

---

## ✅ Validation Engine

Cross-references recommendations against existing SOPs.

Calculates:

- SOP agreement
- Deviations
- Compliance score

---

## ⚠️ Risk Engine

Measures organizational knowledge concentration.

Identifies:

- Retirement exposure
- Single points of expertise
- Knowledge gaps
- Critical skill concentration

---

## 🎓 Expert Replay

Training mode for junior operators.

Replay complete historical expert decision sequences including:

- Actions
- Context
- Timing
- Reasoning

---

## 🎯 Confidence Engine

OperatorDNA knows when it **doesn't know.**

If no historical precedent exists:

- Confidence decreases
- Human escalation is triggered
- The AI never guesses

---

# ⚙️ How It Works

## 👀 1. Observe

Years of:

- Sensor readings
- Alarm logs
- Control commands
- Operator actions

flow into the platform from SCADA historians and plant archives.

Everything is time-aligned and normalized.

---

## 🧠 2. Learn

A behavioral foundation model learns:

> Plant State → Expert Decision

Not **what failed**.

But:

> **What Rajesh did next.**

The model learns directly from historical state-action pairs.

---

## 🤖 3. Reason

When a new condition appears, OperatorDNA:

- Searches historical memory
- Finds similar expert responses
- Weighs relevance
- Generates a recommendation

---

## 🔎 4. Explain

Every recommendation includes:

- Historical evidence
- Confidence score
- SOP references
- Full reasoning chain

No black boxes.

---

## ♾️ 5. Preserve

Expert decision patterns become permanent organizational memory.

Retirement no longer means knowledge loss.

---

# 🏗️ Architecture

OperatorDNA consists of five core systems.

## 📥 Data Ingestion

Reads:

- SCADA historians
- Alarm logs
- Control systems

Normalizes all plant signals.

---

## 🧠 Behavior Learning

Transformer-based sequence model trained on historical state-action pairs.

No labels required.

Learns purely by observing expert behavior.

---

## 🌐 Memory Graph

Every:

- Incident
- Decision
- Outcome

becomes part of a searchable knowledge graph.

The graph grows with every operator and every shift.

---

## 🎯 Recommendation Engine

Runs live inference.

Outputs:

- Recommended action
- Confidence score
- Ranked historical evidence

---

## 🎬 Expert Replay

Complete historical recall.

Ask:

> "What happened before?"

Receive:

- Complete action sequence
- Reasoning
- Outcomes

---

# 🛠️ Tech Stack

## 💻 Frontend

- React 18
- Vite
- Recharts
- Pure CSS
- Custom Design System

No UI framework.

Every visual element is handcrafted.

---

## ⚙️ Backend

- Python
- FastAPI
- Pydantic
- Uvicorn

---

## 🧪 Simulation

Physics-based industrial plant simulator.

Models:

- Pressure
- Temperature
- Flow
- Pump dynamics

Includes:

- Expert Operator
- Average Operator
- Junior Operator

---

## 🤖 Agent Pipeline

Specialized AI agents:

- Perception
- Expert
- Knowledge
- Compliance
- Escalation

Each agent performs one stage of reasoning.

---

# 📂 Project Structure

```text
OperatorDNA
├── backend
│   ├── main.py
│   ├── agents
│   │   └── agent_system.py
│   ├── simulator
│   │   └── plant_simulator.py
│   └── rag
│       └── knowledge_base.py
├── frontend
│   ├── src
│   │   ├── components
│   │   │   └── Dashboard.jsx
│   │   ├── index.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
└── README.md
```

---

# 🚀 Getting Started

## Backend

```bash
cd backend
pip install fastapi uvicorn pydantic
python main.py --port 8000
```

Backend starts on **Port 8000**.

Available services:

- Health API
- Plant Simulator
- Agent Pipeline
- Knowledge Search

---

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend starts on:

```
http://localhost:5173
```

---

## Full Stack

Start the backend first.

Then start the frontend.

The navigation bar displays a 🟢 connected indicator once both services are running.

---

# 🔌 API Endpoints

## GET `/api/health`

Returns:

- Server status
- Model availability
- Knowledge base status

---

## GET `/api/plant/state`

Returns the current plant state.

---

## GET `/api/plant/scenario/{name}`

Loads predefined scenarios.

Supported:

- Normal
- Pressure Spike
- Novel
- Critical

---

## GET `/api/plant/step`

Advances simulation one timestep.

Returns:

- Perception
- Recommendation
- Knowledge retrieval
- Compliance check
- Escalation decision

---

## POST `/api/plant/action`

Applies operator actions.

Examples:

- Close Valve
- Reduce Pump
- Open Bypass

---

## POST `/api/plant/counterfactual`

Simulates two futures:

- Recommendation accepted
- Recommendation ignored

Compares resulting outcomes.

---

## GET `/api/knowledge/risk`

Returns:

- Knowledge Risk Index
- Retirement Exposure
- Discovery Results
- Organizational Health Metrics

---

## POST `/api/kb/search`

Searches the knowledge base for relevant SOPs.

---

# 🎮 Interactive Demo

The demo supports three scenarios.

---

## 🟢 Normal Operations

Everything operates normally.

- AI monitors
- No intervention
- Baseline confidence

---

## 🟡 Known Failure

Pressure spike detected.

The Memory Engine retrieves four similar historical incidents.

OperatorDNA recommends:

> **Close Valve 7B**

with **94% confidence.**

Supporting incidents:

- 2019
- 2021
- 2023
- 2024

---

## 🔴 Novel Condition

An unfamiliar operating condition appears.

No historical precedent exists.

OperatorDNA:

- Detects novelty
- Confidence drops to 37%
- Escalates to a senior operator

---

Each scenario includes a cinematic sequence:

1. Sensors activate
2. Reasoning pipeline animates
3. Memory retrieval occurs
4. Recommendation appears
5. Confidence ring completes
6. Supporting evidence is revealed

---

# 👥 Team

Built by solo team team **Jerovin Floyd** for the **ET AI Hackathon 2026**.

Designed, engineered, and shipped entirely during the hackathon period.

---

## ⭐ If you like this project

Give it a ⭐ on GitHub!
