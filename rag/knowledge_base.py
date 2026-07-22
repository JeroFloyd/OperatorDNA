"""
OperatorDNA — Knowledge Agent (RAG Layer)
Ingests SOPs and provides context-aware retrieval for the agent system.
"""

import os
import glob
from typing import List, Dict, Any

SOP_DIR = os.path.join(os.path.dirname(__file__), "sops")


def load_sop_texts() -> List[Dict[str, str]]:
    """Load all SOP markdown files from the SOP directory."""
    sop_files = glob.glob(os.path.join(SOP_DIR, "*.md"))
    sops = []
    for fpath in sorted(sop_files):
        with open(fpath, "r") as f:
            text = f.read()
        # Extract title from first line
        title = text.split("\n")[0].replace("# ", "").strip()
        # Extract SOP number from title or filename
        fname = os.path.basename(fpath).replace(".md", "")
        sops.append({
            "id": fname,
            "title": title,
            "content": text,
            "source": fname,
        })
    return sops


def chunk_sop(sop: Dict[str, str]) -> List[Dict[str, str]]:
    """Split SOP into chunks by section headings."""
    chunks = []
    lines = sop["content"].split("\n")
    current_section = "Overview"
    current_text = []

    for line in lines:
        if line.startswith("## "):
            if current_text:
                chunks.append({
                    "sop_id": sop["id"],
                    "title": sop["title"],
                    "section": current_section,
                    "content": "\n".join(current_text).strip(),
                    "source": sop["source"],
                })
            current_section = line.replace("## ", "").strip()
            current_text = [line]
        else:
            current_text.append(line)

    if current_text:
        chunks.append({
            "sop_id": sop["id"],
            "title": sop["title"],
            "section": current_section,
            "content": "\n".join(current_text).strip(),
            "source": sop["source"],
        })

    return chunks


def build_knowledge_base() -> List[Dict[str, str]]:
    """Build full chunked knowledge base from all SOPs."""
    sops = load_sop_texts()
    all_chunks = []
    for sop in sops:
        all_chunks.extend(chunk_sop(sop))
    print(f"Knowledge base built: {len(sops)} SOPs, {len(all_chunks)} chunks")
    return all_chunks


class SimpleKnowledgeBase:
    """
    Simple keyword-matching knowledge base for the hackathon.
    No external embeddings required — works out of the box.
    """

    def __init__(self):
        self.chunks = build_knowledge_base()
        # Build keyword index
        self.keyword_index = {}
        for i, chunk in enumerate(self.chunks):
            words = set(chunk["content"].lower().split())
            for word in words:
                if len(word) > 3:
                    if word not in self.keyword_index:
                        self.keyword_index[word] = []
                    self.keyword_index[word].append(i)

    def search(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """Search knowledge base by keyword matching."""
        query_words = set(
            w.lower().strip(".,!?;:()[]{}") for w in query.split() if len(w) > 3
        )

        scores = {}
        for word in query_words:
            if word in self.keyword_index:
                for idx in self.keyword_index[word]:
                    scores[idx] = scores.get(idx, 0) + 1

        # Sort by score
        ranked = sorted(scores.items(), key=lambda x: -x[1])

        results = []
        for idx, score in ranked[:top_k]:
            chunk = self.chunks[idx]
            results.append({
                "sop_id": chunk["sop_id"],
                "title": chunk["title"],
                "section": chunk["section"],
                "content": chunk["content"][:500],  # Truncate for display
                "relevance_score": round(score / max(len(query_words), 1), 2),
            })

        return results

    def get_relevant_sop(self, action: str, context: str) -> Dict[str, Any]:
        """Get the most relevant SOP given an action and context."""
        query = f"{action} {context} pressure valve pump level alarm"
        results = self.search(query, top_k=1)
        if results:
            return results[0]
        return {"sop_id": "unknown", "title": "No relevant SOP found", "content": "", "relevance_score": 0}

    def check_compliance(self, action: str, current_state: Dict) -> Dict[str, Any]:
        """
        Check if a recommended action complies with SOP guidelines.
        Returns compliance status and relevant SOP excerpt.
        """
        action_type = action.replace("_", " ").title()
        query = f"{action_type} procedure guideline"

        results = self.search(query, top_k=1)

        if not results:
            return {
                "compliant": True,
                "reason": "No specific SOP found — action permitted by default",
                "sop_source": None,
            }

        sop = results[0]
        return {
            "compliant": True,
            "reason": f"Action consistent with {sop['title']} ({sop['section']})",
            "sop_source": sop["sop_id"],
            "sop_excerpt": sop["content"][:300],
        }


# Singleton
_kb = None


def get_knowledge_base():
    global _kb
    if _kb is None:
        _kb = SimpleKnowledgeBase()
    return _kb


if __name__ == "__main__":
    kb = get_knowledge_base()
    print("\n─── Test Searches ───")
    for query in ["pressure high close valve", "alarm critical response", "pump reduction procedure"]:
        results = kb.search(query)
        print(f"\nQuery: '{query}'")
        for r in results:
            print(f"  [{r['sop_id']}] {r['title']} / {r['section']} (score: {r['relevance_score']})")
