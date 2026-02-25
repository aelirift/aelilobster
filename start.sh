#!/bin/bash
cd /app
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 51164
