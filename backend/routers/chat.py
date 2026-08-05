# -*- coding: utf-8 -*-
"""
routers/chat.py — IA conversationnelle : chat REST, proxy Gemini, streaming WebSocket.

Endpoints exposés :
    POST      /chat
    POST      /api/ai/gemini
    WEBSOCKET /ws/chat-stream
"""

import asyncio
import json
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket
import httpx

import models
import resilience
from ai_config import GEMINI_KEY, GEMINI_MODEL, GROQ_KEY, GROQ_MODEL
from deps import get_current_user
from schemas import AIProxyRequest, ChatRequest, ChatResponse
from specialties import SPECIALTY_LABELS

router = APIRouter(tags=["chat"])
logger = logging.getLogger("ophtalmosurg.chat")


# Instructions de commandes d'action pour l'interface — miroir exact de
# voiceCommandInstructions() côté frontend (assets/app-part*.js).
# Utilisé uniquement par /chat (REST) : /ws/chat-stream reçoit son propre
# system prompt du frontend (déjà enrichi côté client), donc pas besoin de
# dupliquer ici pour ce chemin.
ACTION_COMMAND_INSTRUCTIONS = (
    "\n\nCOMMANDES D'ACTION — EXÉCUTION DANS L'INTERFACE :\n"
    "Quand l'utilisateur demande explicitement une action sur l'interface (pas une question clinique), "
    "réponds en commençant par [ACTION:nom_action] puis poursuis normalement. N'utilise ces commandes "
    "QUE si l'intention est claire et explicite.\n"
    "Actions disponibles : vue_3d, vue_mpr, zoom_avant, zoom_arriere, mode_clair, mode_sombre, "
    "bloc_operatoire_on, bloc_operatoire_off, mode_tactile_on, mode_tactile_off, "
    "mode_lecture_seule_on, mode_lecture_seule_off, open_analyse, open_ia, open_plan, open_implants, "
    "open_patients, open_settings, close_modal, recalc_analysis, export_plan, "
    "switch_cataracte, switch_glaucome, switch_retine."
)


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request, current: models.User = Depends(get_current_user)):
    # Rate limiting : protège contre les abus sur l'appel IA (coûteux en tokens).
    client_ip = request.client.host if request.client else "unknown"
    resilience.CHAT_RATE_LIMITER.check(client_ip)

    label = SPECIALTY_LABELS.get(req.specialty, "chirurgie générale")
    system_prompt = (
        f"Tu es OphtalmoSurg Plan IA, assistant chirurgical expert en {label}. "
        f"Utilisateur: {current.full_name}. Réponds UNIQUEMENT en français, de façon concise et "
        "cliniquement pertinente. Précise que la décision finale reste au chirurgien."
    ) + ACTION_COMMAND_INSTRUCTIONS
    errors: List[str] = []

    if GEMINI_KEY:
        async def _call_gemini():
            body = {
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"role": "user", "parts": [{"text": req.message}]}],
                "generationConfig": {"maxOutputTokens": 512, "temperature": 0.4},
            }
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_KEY}"
            async with httpx.AsyncClient(timeout=45) as client:
                r = await client.post(url, json=body)
                r.raise_for_status()
                return r.json()
        try:
            data = await resilience.call_with_resilience(_call_gemini, resilience.GEMINI_BREAKER, max_attempts=1)
            text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "Réponse non disponible.")
            return {"reply": text, "source": "gemini", "user": current.full_name}
        except resilience.CircuitOpenError as e:
            errors.append(f"Gemini: {e}")
        except Exception as e:  # noqa: BLE001 — on bascule sur Groq, on ne plante pas ici
            errors.append(f"Gemini indisponible ({type(e).__name__}: {e})")

    if GROQ_KEY:
        async def _call_groq():
            body = {"model": GROQ_MODEL, "messages": [{"role": "system", "content": system_prompt},
                                                        {"role": "user", "content": req.message}],
                    "max_tokens": 512, "temperature": 0.4}
            headers = {"Authorization": f"Bearer {GROQ_KEY}"}
            async with httpx.AsyncClient(timeout=45) as client:
                r = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=body)
                r.raise_for_status()
                return r.json()
        try:
            data = await resilience.call_with_resilience(_call_groq, resilience.GROQ_BREAKER, max_attempts=1)
            text = data.get("choices", [{}])[0].get("message", {}).get("content", "Réponse non disponible.")
            return {"reply": text, "source": "groq", "user": current.full_name,
                    "fallback_from": "gemini" if errors else None}
        except resilience.CircuitOpenError as e:
            errors.append(f"Groq: {e}")
        except Exception as e:  # noqa: BLE001
            errors.append(f"Groq indisponible ({type(e).__name__}: {e})")

    if not GEMINI_KEY and not GROQ_KEY:
        raise HTTPException(503, "Aucune clé IA configurée côté serveur (GEMINI_KEY / GROQ_KEY).")

    logger.warning("Tous les fournisseurs IA ont échoué pour /chat: %s", " | ".join(errors))
    raise HTTPException(503, "Les assistants IA (Gemini et Groq) sont temporairement indisponibles. "
                              "La planification reste utilisable sans IA ; réessayez dans quelques instants.")


@router.post("/api/ai/gemini")
async def proxy_gemini(req: AIProxyRequest, current: models.User = Depends(get_current_user)):
    if not GEMINI_KEY:
        raise HTTPException(503, "Clé Gemini non configurée.")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{req.model}:generateContent?key={GEMINI_KEY}"
    async with httpx.AsyncClient(timeout=45) as client:
        r = await client.post(url, json=req.body)
        r.raise_for_status()
        return r.json()


@router.websocket("/ws/chat-stream")
async def ws_chat_stream(ws: WebSocket):
    await ws.accept()
    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=30)
        data = json.loads(raw)
    except (asyncio.TimeoutError, json.JSONDecodeError) as e:
        await ws.send_text(json.dumps({"error": "Message invalide: " + str(e)}))
        await ws.close()
        return

    user_msg = data.get("message", "")
    context = data.get("context", "")
    specialty = data.get("specialty", "cataracte")
    label = SPECIALTY_LABELS.get(specialty, "chirurgie générale")
    system = data.get("system", f"Tu es un assistant chirurgical expert en {label}.")

    if not user_msg:
        await ws.send_text(json.dumps({"error": "Message vide"}))
        await ws.close()
        return

    full_prompt = f"{system}\n\n{context}\n\nMessage du chirurgien: {user_msg}"

    if GEMINI_KEY and resilience.GEMINI_BREAKER.state != "open":
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:streamGenerateContent?key={GEMINI_KEY}&alt=sse"
            payload = {"contents": [{"parts": [{"text": full_prompt}]}],
                       "generationConfig": {"maxOutputTokens": 800, "temperature": 0.45}}
            got_any_chunk = False
            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code == 200:
                        async for line in response.aiter_lines():
                            if line.startswith("data:"):
                                chunk_str = line[5:].strip()
                                if not chunk_str or chunk_str == "[DONE]":
                                    continue
                                try:
                                    chunk = json.loads(chunk_str)
                                    text = chunk.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                                    if text:
                                        got_any_chunk = True
                                        await ws.send_text(json.dumps({"delta": text}))
                                except (json.JSONDecodeError, IndexError, KeyError):
                                    continue
                        await ws.send_text(json.dumps({"done": True}))
                        resilience.GEMINI_BREAKER.on_success()
                        return
                    else:
                        response.raise_for_status()
        except Exception as e:
            resilience.GEMINI_BREAKER.on_failure()
            logger.warning("Gemini streaming erreur: %s, fallback Groq (disjoncteur: %s)",
                           e, resilience.GEMINI_BREAKER.status())
    elif GEMINI_KEY:
        logger.info("Gemini ignoré (disjoncteur ouvert) — %s", resilience.GEMINI_BREAKER.status())

    if GROQ_KEY and resilience.GROQ_BREAKER.state != "open":
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"},
                    json={"model": GROQ_MODEL, "messages": [{"role": "system", "content": system},
                                                             {"role": "user", "content": context + "\n\n" + user_msg}],
                          "max_tokens": 700, "temperature": 0.45})
                if r.status_code == 200:
                    reply = r.json()["choices"][0]["message"]["content"]
                    resilience.GROQ_BREAKER.on_success()
                    for i in range(0, len(reply), 30):
                        await ws.send_text(json.dumps({"delta": reply[i:i + 30]}))
                        await asyncio.sleep(0.02)
                    await ws.send_text(json.dumps({"done": True}))
                    return
                r.raise_for_status()
        except Exception as e:
            resilience.GROQ_BREAKER.on_failure()
            logger.warning("Groq fallback erreur: %s (disjoncteur: %s)",
                           e, resilience.GROQ_BREAKER.status())
    elif GROQ_KEY:
        logger.info("Groq ignoré (disjoncteur ouvert) — %s", resilience.GROQ_BREAKER.status())

    await ws.send_text(json.dumps({
        "error": "IA indisponible (Gemini et Groq injoignables ou en cooldown après échecs répétés). "
                 "La planification reste utilisable sans IA."
    }))
    await ws.close()
