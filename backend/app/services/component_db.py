"""Component knowledge database service.

Loads `data/components.json` once at startup. Adding a component = adding a JSON
entry. No application code changes required. All lookups return plain dicts.
"""
import json
import re
from pathlib import Path
from typing import Dict, List, Optional

from ..config import settings
from ..logging import get_logger

log = get_logger("components")

_DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "components.json"


class ComponentDB:
    def __init__(self, data_file: Path = _DATA_FILE) -> None:
        self._by_id: Dict[str, dict] = {}
        self._by_name: Dict[str, dict] = {}
        self._categories: Dict[str, List[dict]] = {}
        self.load(data_file)

    def load(self, data_file: Path) -> None:
        with open(data_file, encoding="utf-8") as fh:
            raw = json.load(fh)
        for comp in raw.get("components", []):
            self._by_id[comp["id"]] = comp
            self._by_name[comp["name"].lower()] = comp
            cat = comp.get("category", "other")
            self._categories.setdefault(cat, []).append(comp)
            for alias in comp.get("aliases", []):
                self._by_name[alias.lower()] = comp
        log.info("Loaded %d components from %s", len(self._by_id), data_file.name)

    def all(self) -> List[dict]:
        return list(self._by_id.values())

    def get(self, component_id: str) -> Optional[dict]:
        return self._by_id.get(component_id)

    def by_name(self, name: str) -> Optional[dict]:
        return self._by_name.get(name.strip().lower())

    def categories(self) -> Dict[str, List[dict]]:
        return self._categories

    def search(self, query: str) -> List[dict]:
        q = query.strip().lower()
        if not q:
            return self.all()
        results = []
        for comp in self.all():
            haystack = " ".join(
                [
                    comp["id"],
                    comp["name"],
                    *comp.get("aliases", []),
                    comp.get("category", ""),
                ]
            ).lower()
            if q in haystack or re.search(rf"\b{re.escape(q)}\b", haystack):
                results.append(comp)
        return results

    def resolve(self, token: str) -> Optional[dict]:
        """Resolve an id, name or alias to a component."""
        if not token:
            return None
        comp = self._by_id.get(token.strip().lower())
        if not comp:
            comp = self.by_name(token.strip())
        return comp


_db: Optional[ComponentDB] = None


def get_db() -> ComponentDB:
    global _db
    if _db is None:
        _db = ComponentDB()
    return _db