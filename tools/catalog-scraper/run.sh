#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
fi

source .venv/bin/activate
python -m pip install --disable-pip-version-check -r requirements.txt
python -m src.main "$@"
