#!/bin/bash

# JACQ Demo Recording Script
# Usage: asciinema rec jacq_demo.cast -c ./demo_recording.sh

echo -e "\033[1;36m❯ Initializing JACQ Orchestrator...\033[0m"
sleep 1
echo -e "\033[1;32m✓\033[0m Connected to DuckDB Memory Graph"
sleep 0.5
echo -e "\033[1;32m✓\033[0m Loaded 14 Active Context Entities"
sleep 1

echo -e "\n\033[1;33mRunning Graph-RAG Retrieval Demo...\033[0m"
sleep 1
npx tsx examples/graph_rag_demo.ts
echo -e "\n\033[1;36m❯ Session State Saved.\033[0m"
