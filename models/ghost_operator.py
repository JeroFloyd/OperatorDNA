"""
OperatorDNA — Behavior Cloning Model
LSTM that learns expert operator decision patterns from state→action sequences.
"""

import numpy as np
import pandas as pd
import json
import os
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from collections import Counter

os.makedirs(os.path.join(os.path.dirname(__file__)), exist_ok=True)

# ─── Configuration ──────────────────────────────────────────────────────────

ACTION_VALUES = {
    "no_action": 0, "close_valve": 1, "open_valve": 2,
    "reduce_pump": 3, "increase_pump": 4,
    "acknowledge_alarm": 6, "emergency_shutdown": 7,
}
IDX_TO_ACTION = {v: k for k, v in ACTION_VALUES.items()}

SEQ_LEN = 10         # timesteps of history
N_FEATURES = 8       # pressure, temperature, level, pump_rpm, valve_position, alarm_state, pressure_trend, disturbance_active
N_ACTIONS = len(ACTION_VALUES)
HIDDEN_SIZE = 64
NUM_LAYERS = 2
BATCH_SIZE = 64
EPOCHS = 30
LEARNING_RATE = 0.001
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

print(f"Using device: {DEVICE}")


# ─── Dataset ─────────────────────────────────────────────────────────────────

class OperatorDataset(Dataset):
    def __init__(self, csv_path, seq_len=SEQ_LEN):
        df = pd.read_csv(csv_path)
        self.seq_len = seq_len
        self.samples = []

        for _, row in df.iterrows():
            state_seq = json.loads(row["state_seq"])
            action_code = int(row["action_code"])
            if len(state_seq) == seq_len and len(state_seq[0]) == N_FEATURES:
                self.samples.append((np.array(state_seq, dtype=np.float32), action_code))

        print(f"Loaded {len(self.samples)} training samples")
        # Print action distribution
        actions = [s[1] for s in self.samples]
        dist = Counter(actions)
        for k, v in sorted(dist.items()):
            print(f"  {IDX_TO_ACTION.get(k, k)}: {v} ({v/len(self.samples)*100:.1f}%)")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        state_seq, action = self.samples[idx]
        return torch.FloatTensor(state_seq), torch.LongTensor([action])[0]


# ─── Model ───────────────────────────────────────────────────────────────────

class GhostOperatorModel(nn.Module):
    """LSTM-based behavior cloning model."""

    def __init__(self, n_features=N_FEATURES, hidden_size=HIDDEN_SIZE,
                 num_layers=NUM_LAYERS, n_actions=N_ACTIONS):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=n_features,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.2 if num_layers > 1 else 0,
        )
        self.fc1 = nn.Linear(hidden_size, 32)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.3)
        self.fc2 = nn.Linear(32, n_actions)

    def forward(self, x):
        # x shape: (batch, seq_len, n_features)
        lstm_out, (hn, cn) = self.lstm(x)
        # Use the last hidden state
        last_out = lstm_out[:, -1, :]
        out = self.relu(self.fc1(last_out))
        out = self.dropout(out)
        logits = self.fc2(out)
        return logits


# ─── Training ────────────────────────────────────────────────────────────────

def train_model(csv_path, model_path=None):
    if model_path is None:
        model_path = os.path.join(os.path.dirname(__file__), "ghost_operator.pth")
    print(f"\nLoading data from {csv_path}...")
    dataset = OperatorDataset(csv_path)
    dataloader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)

    model = GhostOperatorModel().to(DEVICE)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=3, factor=0.5)

    print(f"\nTraining on {DEVICE}...")
    print(f"Model params: {sum(p.numel() for p in model.parameters()):,}")

    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0
        correct = 0
        total = 0

        for batch_idx, (states, actions) in enumerate(dataloader):
            states = states.to(DEVICE)
            actions = actions.to(DEVICE)

            optimizer.zero_grad()
            outputs = model(states)
            loss = criterion(outputs, actions)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            total_loss += loss.item()
            _, predicted = torch.max(outputs, 1)
            total += actions.size(0)
            correct += (predicted == actions).sum().item()

        avg_loss = total_loss / len(dataloader)
        accuracy = 100.0 * correct / total
        scheduler.step(avg_loss)
        lr = optimizer.param_groups[0]['lr']

        if (epoch + 1) % 3 == 0 or epoch == 0:
            print(f"Epoch {epoch+1:2d}/{EPOCHS} — Loss: {avg_loss:.4f} — Acc: {accuracy:.2f}% — LR: {lr:.6f}")

    # Save
    torch.save({
        'model_state_dict': model.state_dict(),
        'n_features': N_FEATURES,
        'hidden_size': HIDDEN_SIZE,
        'num_layers': NUM_LAYERS,
        'n_actions': N_ACTIONS,
        'accuracy': accuracy,
        'loss': avg_loss,
    }, model_path)
    print(f"\nModel saved to {model_path} (accuracy: {accuracy:.2f}%)")
    return model


def load_model(model_path=None):
    if model_path is None:
        model_path = os.path.join(os.path.dirname(__file__), "ghost_operator.pth")
    checkpoint = torch.load(model_path, map_location=DEVICE)
    model = GhostOperatorModel(
        n_features=checkpoint['n_features'],
        hidden_size=checkpoint['hidden_size'],
        num_layers=checkpoint['num_layers'],
        n_actions=checkpoint['n_actions'],
    ).to(DEVICE)
    model.load_state_dict(checkpoint['model_state_dict'])
    model.eval()
    print(f"Model loaded from {model_path} (saved accuracy: {checkpoint.get('accuracy', 'N/A'):.1f}%)")
    return model


def predict(model, state_seq):
    """Predict action from a sequence of state vectors."""
    model.eval()
    with torch.no_grad():
        tensor = torch.FloatTensor(state_seq).unsqueeze(0).to(DEVICE)  # (1, seq_len, 8)
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1)
        confidence, predicted = torch.max(probs, 1)

        action_idx = int(predicted.item())
        action_name = str(IDX_TO_ACTION.get(action_idx, "unknown"))
        conf = float(confidence.item())

        # Novelty score: how spread out are the probabilities?
        entropy = float(-torch.sum(probs * torch.log(probs + 1e-8), dim=1).item())
        max_entropy = float(np.log(N_ACTIONS))
        novelty = float(entropy / max_entropy)  # 0 = very certain, 1 = completely uncertain

        return {
            "action": action_name,
            "confidence": round(conf, 3),
            "novelty": round(novelty, 3),
            "action_code": action_idx,
            "all_probs": {str(IDX_TO_ACTION.get(i, f"unknown_{i}")): float(round(p.item(), 3))
                         for i, p in enumerate(probs[0])}
        }


def test_prediction(model):
    """Run a quick test prediction with synthetic data."""
    print("\n─── Test Predictions ───")
    test_cases = [
        # Normal operation
        [[1.5, 35, 50, 0.75, 0.5, 0, 0, 0]] * SEQ_LEN,
        # High pressure
        [[2.5, 38, 55, 0.80, 0.6, 1, 1, 0]] * SEQ_LEN,
        # Critical pressure
        [[3.2, 40, 60, 0.85, 0.5, 2, 1, 0]] * SEQ_LEN,
        # Low level
        [[1.3, 32, 10, 0.50, 0.3, 0, -1, 0]] * SEQ_LEN,
        # Disturbance
        [[2.0, 50, 50, 0.75, 0.5, 1, 1, 1]] * SEQ_LEN,
    ]
    labels = ["Normal", "High Pressure", "Critical Pressure", "Low Level", "Disturbance"]

    for state_seq, label in zip(test_cases, labels):
        result = predict(model, state_seq)
        print(f"  {label:20s} → {result['action']:15s} (conf: {result['confidence']:.3f}, novelty: {result['novelty']:.3f})")


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    # Try expert data first, fall back to all data
    expert_csv = "../data/expert_training_pairs.csv"
    all_csv = "../data/training_pairs.csv"

    if os.path.exists(expert_csv):
        csv_path = expert_csv
    elif os.path.exists(all_csv):
        csv_path = all_csv
    else:
        print("No training data found. Run simulator first.")
        sys.exit(1)

    model = train_model(csv_path)
    test_prediction(model)

    print("\nDone! Model saved.")
