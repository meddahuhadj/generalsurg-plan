# -*- coding: utf-8 -*-
"""
tests/load_test.py — Test de charge réel contre une instance du backend
===========================================================================
Contrairement à test_resilience.py (mocké, sans réseau), ce script tape pour
de vrai en HTTP sur un backend démarré (par défaut http://127.0.0.1:8000).
Il mesure ce qui compte en pratique pour un bloc opératoire : combien de
chirurgiens/postes peuvent consulter le dossier patient — et lancer les
endpoints de segmentation/volumétrie — en même temps sans dégradation notable.

Usage :
    uvicorn main:app --host 0.0.0.0 --port 8000 &
    python3 tests/load_test.py --base-url http://127.0.0.1:8000 --concurrency 20 --requests 200

Limite assumée : ceci simule de la charge sur CE backend (auth, patients,
audit, PACS/capabilities, segmentation/volumétrie) — pas sur des services
tiers externes (Gemini/Groq/PACS réel), injoignables depuis ce sandbox et non
pertinents pour un test de charge de toute façon (leur latence dépend d'eux,
pas de nous).

Ce que ce script NE mesure PAS (et ne peut pas mesurer depuis un sandbox) :
  - Le job de segmentation IA réelle lui-même (TotalSegmentator, potentiellement
    plusieurs minutes de calcul, souvent GPU) : /segmentation/auto ne fait que
    democratiquement accepter le job et retourner un job_id (202) en tâche de
    fond ; on charge donc /segmentation/capabilities (ce que le frontend
    interroge avant CHAQUE tentative) et /segmentation/status/{id} — pas
    l'exécution du pipeline nnU-Net elle-même, qui nécessite un GPU réel.
  - Le comportement sous charge GPU réelle (ce sandbox n'a pas de GPU).
  - Le comportement sur un réseau hospitalier dégradé/à latence variable (WAN) :
    ce script tape en localhost ou sur une URL fournie, sans simuler de perte
    de paquets, de jitter ou de bande passante limitée. Pour ça, il faudrait
    un outil dédié (tc/netem, Toxiproxy, ou un test depuis un poste distant sur
    le vrai réseau cible) — hors de portée d'un simple script HTTP.
Ces limites sont documentées ici plutôt que masquées : les chiffres produits
par ce script restent des ordres de grandeur pour valider le comportement du
backend lui-même (pooling DB, middlewares, sérialisation), pas un SLA de
production ni une validation de l'infrastructure de calcul IA.
"""
from __future__ import annotations

import argparse
import asyncio
import statistics
import time
from dataclasses import dataclass, field
from typing import List

import httpx


@dataclass
class EndpointResult:
    name: str
    latencies_ms: List[float] = field(default_factory=list)
    errors: int = 0

    def summary(self) -> str:
        if not self.latencies_ms:
            return f"{self.name}: aucune requête réussie ({self.errors} erreur(s))"
        s = sorted(self.latencies_ms)
        n = len(s)
        p50 = s[int(n * 0.50)]
        p95 = s[min(n - 1, int(n * 0.95))]
        p99 = s[min(n - 1, int(n * 0.99))]
        return (f"{self.name}: n={n} erreurs={self.errors} "
                f"| p50={p50:.0f}ms p95={p95:.0f}ms p99={p99:.0f}ms max={max(s):.0f}ms")


async def login(client: httpx.AsyncClient, username: str, password: str) -> str:
    r = await client.post("/auth/token", data={"username": username, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


async def timed_get(client: httpx.AsyncClient, path: str, headers: dict, result: EndpointResult):
    t0 = time.perf_counter()
    try:
        r = await client.get(path, headers=headers)
        dt = (time.perf_counter() - t0) * 1000
        if r.status_code >= 400:
            result.errors += 1
        else:
            result.latencies_ms.append(dt)
    except Exception:
        result.errors += 1


async def ensure_load_test_patient(client: httpx.AsyncClient, headers: dict) -> str:
    """Crée (ou réutilise) un patient dédié au test de charge, pour pouvoir
    taper sur /patients/{id}/volumetrie et /patients/{id}/segments — les
    endpoints réellement sollicités par le planning chirurgical, pas juste la
    liste générique. Idempotent : réutilise le même id à chaque run plutôt que
    d'accumuler des patients de charge à chaque exécution du script."""
    patient_id = "LOADTEST-0001"
    r = await client.get(f"/patients/{patient_id}", headers=headers)
    if r.status_code == 200:
        return patient_id
    payload = {
        "id": patient_id, "nom": "Load Test Patient", "age": 50, "sexe": "M",
        "poids_kg": 75, "taille_cm": 175, "diagnostic": "Patient synthétique pour test de charge",
        "chirurgien": "Load Test", "urgence": "vert",
    }
    r = await client.post("/patients", json=payload, headers=headers)
    r.raise_for_status()
    return patient_id


async def run_load_test(base_url: str, concurrency: int, total_requests: int,
                         username: str, password: str):
    async with httpx.AsyncClient(base_url=base_url, timeout=10) as client:
        print(f"[1/4] Authentification ({username})...")
        token = await login(client, username, password)
        headers = {"Authorization": f"Bearer {token}"}

        print(f"[2/4] Vérification de la disponibilité (/health)...")
        r = await client.get("/health", headers=headers)
        r.raise_for_status()
        print("      backend accessible:", r.json())

        print(f"[3/4] Préparation d'un patient de test (volumétrie/segments)...")
        patient_id = await ensure_load_test_patient(client, headers)
        print(f"      patient prêt : {patient_id}")

        print(f"[4/4] Charge : {total_requests} requêtes, concurrence={concurrency}")
        endpoints = {
            "/health": EndpointResult("/health"),
            "/patients": EndpointResult("/patients"),
            "/pacs/capabilities": EndpointResult("/pacs/capabilities"),
            # Interrogé par le frontend avant CHAQUE tentative de segmentation
            # réelle (voir runRealSegmentation() côté client) — c'est le chemin
            # chaud, pas /segmentation/auto lui-même (job async, potentiellement
            # plusieurs minutes de calcul GPU, pas mesurable en charge concurrente
            # synchrone ici — voir la limite documentée en tête de fichier).
            "/segmentation/capabilities": EndpointResult("/segmentation/capabilities"),
            f"/patients/{patient_id}/volumetrie": EndpointResult("/patients/{id}/volumetrie"),
            f"/patients/{patient_id}/segments": EndpointResult("/patients/{id}/segments"),
        }
        semaphore = asyncio.Semaphore(concurrency)

        async def one_request(path: str, result: EndpointResult):
            async with semaphore:
                await timed_get(client, path, headers, result)

        t_start = time.perf_counter()
        tasks = []
        paths = list(endpoints.keys())
        for i in range(total_requests):
            path = paths[i % len(paths)]
            tasks.append(one_request(path, endpoints[path]))
        await asyncio.gather(*tasks)
        wall_time = time.perf_counter() - t_start

        print()
        print("=" * 70)
        print(f"Durée totale : {wall_time:.2f}s pour {total_requests} requêtes "
              f"({total_requests / wall_time:.1f} req/s, concurrence={concurrency})")
        for ep in endpoints.values():
            print(" -", ep.summary())
        total_errors = sum(ep.errors for ep in endpoints.values())
        error_rate = total_errors / total_requests * 100
        print(f"Taux d'erreur global : {error_rate:.1f}% ({total_errors}/{total_requests})")
        print("=" * 70)
        return error_rate


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--concurrency", type=int, default=20)
    parser.add_argument("--requests", type=int, default=200)
    parser.add_argument("--username", default="dr.hadj")
    parser.add_argument("--password", default="changeme")
    args = parser.parse_args()
    asyncio.run(run_load_test(args.base_url, args.concurrency, args.requests, args.username, args.password))
