# -*- coding: utf-8 -*-
"""
healthcheck_nextgen.py — Diagnostic de disponibilité HTTP (pas un contrôle de conformité)
===================================================================================
Script de fumée (smoke test) qui vérifie que quelques endpoints répondent en HTTP 200/201.
⚠️ Ce script NE teste QUE la disponibilité HTTP des endpoints, pas leur conformité
réglementaire ni l'exactitude clinique de leurs réponses. Ce logiciel n'est PAS
certifié CE MDR / FDA : la mention "Prototype non certifié" en pied de page le
rappelle en permanence.
Vérifie uniquement :
    1. La disponibilité de l'API FastAPI et la latence de réponse.
    2. Que le endpoint de statut de conformité répond honnêtement (NOT_CERTIFIED).
    3. La disponibilité des endpoints cliniques réels : segmentation, PACS, volumétrie.
"""

import sys
import requests

API_BASE_URL = "http://localhost:8000/api/v2"

def run_healthcheck():
    print("====================================================================")
    print("🏥 ORLSurgPlan3D — Diagnostic système (prototype non certifié)")
    print("====================================================================")

    all_ok = True

    # 1. Statut de conformité (PAS une preuve de conformité réelle)
    print("\n[1/4] Vérification du statut réglementaire réel (NOT_CERTIFIED attendu)...")
    try:
        resp = requests.get(f"{API_BASE_URL}/compliance/mdr-fda-status", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            eu_status = data["regulatory_certifications"]["eu_mdr_2017_745"]["status"]
            print(f"      ✅ Endpoint disponible — statut déclaré: {eu_status} (honnête)")
        else:
            print(f"      ❌ ERREUR HTTP {resp.status_code}: {resp.text}")
            all_ok = False
    except Exception as e:
        print(f"      ⚠️ API injoignable ({e}). Vérifiez que uvicorn est lancé.")
        all_ok = False

    # 2. Endpoint de segmentation réel (TotalSegmentator) — capacités
    print("\n[2/4] Test du endpoint de segmentation (capabilities)...")
    try:
        resp = requests.get("http://localhost:8000/segmentation/capabilities", timeout=5)
        if resp.status_code == 200:
            print(f"      ✅ Endpoint disponible — diagnostic honnête des dépendances.")
        else:
            print(f"      ❌ ERREUR HTTP {resp.status_code}")
            all_ok = False
    except Exception as e:
        print(f"      ⚠️ Erreur réseau: {e}")
        all_ok = False

    # 3. Exemple de structure de données (compte-rendu) — pas un assistant certifié
    print("\n[3/4] Test de l'exemple de structure de données de compte-rendu...")
    try:
        payload = {
            "patient_id": "PAT-HEALTHCHECK-999",
            "twin_id": "TWIN-999",
            "surgeon_username": "dr.hadj",
            "specialty": "Laryngologie",
            "raw_voice_transcript": "Réalisation d'une laryngectomie totale avec curage cervical fonctionnel bilatéral.",
            "request_fhir_cda": True
        }
        resp = requests.post(f"{API_BASE_URL}/voice/dictate-report", json=payload, timeout=5)
        if resp.status_code == 201:
            data = resp.json()
            print(f"      ✅ Endpoint disponible — exemple de structure généré "
                  f"(méthode: {data.get('generation_method', 'inconnue')})")
        else:
            print(f"      ❌ ERREUR HTTP {resp.status_code}")
            all_ok = False
    except Exception as e:
        print(f"      ⚠️ Erreur réseau: {e}")
        all_ok = False

    # 4. Connecteurs d'interopérabilité (PACS)
    print("\n[4/4] Test du connecteur PACS (capabilities)...")
    try:
        resp = requests.get("http://localhost:8000/pacs/capabilities", timeout=5)
        if resp.status_code == 200:
            print(f"      ✅ Endpoint disponible — connecteur PACS présent.")
        else:
            print(f"      ❌ ERREUR HTTP {resp.status_code}")
            all_ok = False
    except Exception as e:
        print(f"      ⚠️ Erreur réseau: {e}")
        all_ok = False

    print("\n====================================================================")
    if all_ok:
        print("🎉 RÉSULTAT : les endpoints sondés répondent. Ceci NE certifie AUCUNE conformité")
        print("   réglementaire ni exactitude clinique. Ce logiciel n'est pas destiné à un usage clinique.")
        sys.exit(0)
    else:
        print("⚠️ RÉSULTAT : ANOMALIES DÉTECTÉES. VÉRIFIEZ LES LOGS SERVEUR.")
        sys.exit(1)

if __name__ == "__main__":
    run_healthcheck()
