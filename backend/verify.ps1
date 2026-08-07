Write-Host "Running Ruff Linter..."
python -m ruff check .

Write-Host "Running MyPy Type Checker..."
python -m mypy .

Write-Host "Running Pytest..."
python -m pytest .
